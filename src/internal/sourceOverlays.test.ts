import { describe, expect, it } from "vitest";
import { parseCuResult } from "./parseCuResult";
import { popoverPosition, sourceOutlines, sourceWordOutlines, WORD_LAYER_COLOR } from "./sourceOverlays";
import { fieldColor } from "./interaction";

function fixture() {
    const original = {
        apiVersion: "2025-11-01", contents: [{
            kind: "document", unit: "pixel",
            pages: [{ pageNumber: 1, width: 100, height: 100 }, { pageNumber: 2, width: 100, height: 100 }],
            markdown: "Saved markdown",
            fields: {
                Name: { type: "string", valueString: "First", source: "D(1,1,2,10,5)" },
                Group: { type: "object", valueObject: {
                    Value: { type: "string", valueString: "Nested", source: "D(1,20,20,10,5);D(2,30,30,10,5)" },
                } },
                Missing: { type: "string", source: "D(1,40,40,10,5)" },
            },
            paragraphs: [{ content: "First paragraph", source: "D(1,1,2,60,10)" }, { content: "Second page", source: "D(2,1,2,60,10)" }],
            tables: [{ rowCount: 1, columnCount: 1, source: "D(1,10,50,60,30)", cells: [
                { rowIndex: 0, columnIndex: 0, content: "Cell", source: "D(1,10,50,10,10)" },
            ] }, { rowCount: 1, columnCount: 1, cells: [] }],
        }],
    };
    const content = parseCuResult(original).contents[0];
    if (!content) throw new Error("Expected overlay content.");
    return { content, original };
}

describe("Studio view-specific source outlines", () => {
    it("renders actual field regions including collapsed descendants in original root colors", () => {
        const { content, original } = fixture();
        const before = JSON.stringify(original);
        const outlines = sourceOutlines(content, "fields", 1, true);
        expect(outlines.map(item => item.field.name)).toEqual(["Name", "Value"]);
        expect(outlines.map(item => item.color)).toEqual(content.fields.slice(0, 2).map(field => fieldColor(field, content.fields)));
        expect(sourceOutlines(content, "fields", 2, true).map(item => item.field.name)).toEqual(["Value"]);
        expect(JSON.stringify(original)).toBe(before);
    });

    it("keeps missing-field filtering in sync with the result pane", () => {
        const { content } = fixture();
        expect(sourceOutlines(content, "fields", 1, false).map(item => item.field.name)).toEqual(["Name", "Value", "Missing"]);
        const group = content.fields[1];
        if (!group) throw new Error("Expected a structured field.");
        group.hasValue = false;
        expect(sourceOutlines(content, "fields", 1, true).map(item => item.field.name)).toEqual(["Name"]);
    });

    it("switches to paragraph and whole-table sources rather than field or cell bounds", () => {
        const { content } = fixture();
        const paragraphs = sourceOutlines(content, "paragraphs", 1, true);
        expect(paragraphs.map(item => item.field.id)).toEqual(["/contents/0/paragraphs/0"]);
        expect(paragraphs[0]?.color).toBe("#0078d4");
        const tables = sourceOutlines(content, "tables", 1, true);
        expect(tables.map(item => item.field.id)).toEqual(["/contents/0/tables/0"]);
        expect(tables[0]?.region.polygon[2]).toEqual({ x: 70, y: 80 });
        expect(tables[0]?.region).not.toEqual(content.tables?.[0]?.cells[0]?.field.regions[0]);
    });

    it.each(["markdown", "result", "metadata"] as const)("does not retain another tab's outlines in %s", view => {
        expect(sourceOutlines(fixture().content, view, 1, true)).toEqual([]);
    });

    it("does not invent sources for ungrounded or malformed tables", () => {
        const input = { apiVersion: "2025-11-01", contents: [{ kind: "document", unit: "pixel",
            pages: [{ pageNumber: 1, width: 100, height: 100 }],
            tables: [{ rowCount: 1, columnCount: 1, source: "bad", cells: [] }] }] };
        const model = parseCuResult(input);
        expect(sourceOutlines(model.contents[0], "tables", 1, true)).toEqual([]);
        expect(model.issues).toContainEqual(expect.objectContaining({ code: "invalid-source", path: "/contents/0/tables/0/source" }));
        expect(model.original).toBe(input);
    });
});

describe("source-anchored preview placement", () => {
    const viewport = { width: 600, height: 400 }, popup = { width: 330, height: 100 };
    it("prefers above the region without covering it", () => {
        expect(popoverPosition({ x: 50, y: 200, width: 100, height: 20 }, viewport, popup)).toEqual({ x: 50, y: 90 });
    });

    describe("persistent OCR word layer", () => {
        it("uses the color verified in Studio code independently of field colors or selected tabs", () => {
            expect(WORD_LAYER_COLOR).toBe("#FAFF7F40");
            const content = fixture().content;
            const page = content.pages[0];
            if (!page) throw new Error("Expected the first page.");
            page.words = [{ id: "/contents/0/pages/0/words/0", content: "Not a field",
                region: { pageNumber: 1, polygon: [{ x: 1, y: 2 }, { x: 11, y: 2 }, { x: 11, y: 7 }, { x: 1, y: 7 }] } }];
            const before = sourceWordOutlines(page);
            content.fields = [];
            expect(sourceOutlines(content, "fields", 1, true)).toEqual([]);
            expect(sourceOutlines(content, "markdown", 1, false)).toEqual([]);
            expect(sourceWordOutlines(page)).toEqual(before);
            expect(sourceWordOutlines(content.pages[1])).toEqual([]);
        });
    });
    it("flips below at the top edge and clamps to the viewport", () => {
        expect(popoverPosition({ x: 500, y: 0, width: 50, height: 20 }, viewport, popup)).toEqual({ x: 262, y: 30 });
    });
    it("uses free space beside a tall target", () => {
        expect(popoverPosition({ x: 0, y: 0, width: 100, height: 400 }, viewport, popup)).toEqual({ x: 110, y: 8 });
    });
    it("does not display a preview anchored entirely outside the visible viewport", () => {
        expect(popoverPosition({ x: -200, y: 20, width: 100, height: 20 }, viewport, popup)).toBeNull();
    });
    it("rejects invalid layout instead of returning a successful position", () => {
        expect(() => popoverPosition({ x: NaN, y: 0, width: 10, height: 10 }, viewport, popup)).toThrow("finite");
        expect(() => popoverPosition({ x: 0, y: 0, width: 10, height: 10 }, { width: 0, height: 100 }, popup)).toThrow("finite");
    });
});
