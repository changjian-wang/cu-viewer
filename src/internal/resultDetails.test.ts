import { describe, expect, it } from "vitest";
import { parseCuResult } from "./parseCuResult";
import { selectableFields } from "./interaction";
import { MAX_JSON_VALUES } from "./resultLimits";

function detailResult(details: Record<string, unknown>) {
    return {
        apiVersion: "2026-06-01-preview",
        contents: [{
            kind: "document", unit: "pixel",
            pages: [{ pageNumber: 1, width: 100, height: 100 }, { pageNumber: 2, width: 100, height: 100 }],
            fields: { Name: { type: "string", valueString: "original field" } },
            ...details,
        }],
    };
}

describe("typed result details", () => {
    it("preserves raw details while deriving stable source-linked selection objects", () => {
        const input = detailResult({
            paragraphs: [null, { content: "Returned paragraph", role: "title", source: "D(1,10,20,20,10);D(2,30,40,10,20)" }],
            tables: [{
                rowCount: 2, columnCount: 2, source: "D(1,5,10,50,40)",
                cells: [
                    { rowIndex: 0, columnIndex: 0, columnSpan: 2, kind: "columnHeader", content: "Heading" },
                    { rowIndex: 1, columnIndex: 0, content: "Left", source: "D(1,10,20,20,10)" },
                    { rowIndex: 1, columnIndex: 1, content: "Right" },
                ],
                caption: { content: "Returned caption" }, footnotes: [{ content: "Returned footnote" }],
            }],
            figures: [{ id: "figure-service-id", kind: "chart", role: "logo", caption: { content: "Figure caption" },
                description: "Figure description", footnotes: [{ content: "Figure footnote" }], source: "D(1,10,20,20,10)" }],
            signatures: [{ id: "signature-service-id", role: "signature", source: "D(2,30,40,10,20)" }],
        });
        const before = JSON.stringify(input);
        const model = parseCuResult({ status: "Succeeded", result: input });
        const content = model.contents[0];
        if (!content) throw new Error("Expected content.");
        const paragraph = content.paragraphs?.[0];
        expect(paragraph?.field).toMatchObject({
            id: "/contents/0/paragraphs/1", path: "/result/contents/0/paragraphs/1", detailView: "paragraphs", value: "Returned paragraph",
        });
        expect(paragraph?.field.regions.map(region => region.pageNumber)).toEqual([1, 2]);
        const table = content.tables?.[0];
        expect(table?.field).toMatchObject({ id: "/contents/0/tables/0", detailView: "tables", source: "D(1,5,10,50,40)" });
        expect(table?.field.regions[0]?.polygon).toEqual([{ x: 5, y: 10 }, { x: 55, y: 10 }, { x: 55, y: 50 }, { x: 5, y: 50 }]);
        expect(table?.rows[0]?.[0]?.columnSpan).toBe(2);
        expect(table?.rows[0]?.[1]).toBeUndefined();
        expect(table?.rows[1]?.map(cell => cell?.content)).toEqual(["Left", "Right"]);
        expect(table?.caption).toBe("Returned caption");
        expect(table?.footnotes).toEqual(["Returned footnote"]);
        expect(content.figures?.[0]).toMatchObject({ figureId: "figure-service-id", caption: "Figure caption", description: "Figure description" });
        expect(content.signatures?.[0]).toMatchObject({ signatureId: "signature-service-id", role: "signature" });
        expect(selectableFields(content)).toHaveLength(8);
        expect(model.issues.map(issue => issue.path)).toEqual(["/result/contents/0/paragraphs/0"]);
        expect(JSON.stringify(input)).toBe(before);
    });

    it("reports invalid and overlapping table cells without synthesizing a grid", () => {
        const model = parseCuResult(detailResult({
            tables: [
                { rowCount: 1, columnCount: 2, cells: [
                    { rowIndex: 0, columnIndex: 0, columnSpan: 2, content: "Merged" },
                    { rowIndex: 0, columnIndex: 1, content: "Overlap" },
                ] },
                { rowCount: 1, columnCount: 1, cells: [{ rowIndex: 0, columnIndex: 0, rowSpan: 0, content: "Invalid" }] },
                { rowCount: 1, columnCount: 1, cells: [{ rowIndex: 0, columnIndex: 0, rowSpan: null, content: "Invalid null" }] },
            ],
        }));
        expect(model.contents[0]?.tables?.every(table => Boolean(table.layoutError) && table.rows.length === 0)).toBe(true);
        expect(model.issues.some(issue => issue.message.includes("overlap"))).toBe(true);
        expect(model.original).toBeTruthy();
    });

    it("bounds sparse table dimensions using the existing result-value ceiling", () => {
        const content = parseCuResult(detailResult({ tables: [{ rowCount: MAX_JSON_VALUES + 1, columnCount: 1, cells: [] }] })).contents[0];
        expect(content?.tables?.[0]?.rows).toEqual([]);
        expect(content?.tables?.[0]?.layoutError).toContain("20,000-position");
    });

    it("keeps detail text when grounding is malformed and preserves the original invalid source", () => {
        const input = detailResult({ paragraphs: [{ content: "Keep this", source: "bad" }] });
        const model = parseCuResult(input);
        expect(model.contents[0]?.paragraphs?.[0]?.field).toMatchObject({ value: "Keep this", source: "bad", regions: [] });
        expect(model.issues).toEqual([expect.objectContaining({ code: "invalid-source", path: "/contents/0/paragraphs/0/source" })]);
        expect(model.original).toBe(input);
    });

    it("does not turn invalid captions or nonstring metadata into successful content", () => {
        const model = parseCuResult(detailResult({
            figures: [{ id: "figure", caption: "not a caption object", footnotes: [false] }],
            metadata: { Author: "Returned", Invalid: 0 },
        }));
        expect(model.contents[0]?.figures?.[0]?.caption).toBeUndefined();
        expect(model.contents[0]?.figures?.[0]?.footnotes).toEqual([]);
        expect(model.contents[0]?.metadata).toEqual({ Author: "Returned" });
        expect(model.issues).toHaveLength(3);
    });
});
