import { describe, expect, it } from "vitest";
import { availableResultTabs } from "./resultViews";
import { parseCuResult } from "./parseCuResult";
import type { CuContent } from "./types";

function content(overrides: Partial<CuContent> = {}): CuContent {
    return { id: "/contents/0", kind: "document", pages: [], fields: [], ...overrides };
}

describe("Studio result tab availability", () => {
    it("derives all known tabs in Studio order without adding tabs for unknown properties", () => {
        const raw = {
            apiVersion: "2026-06-01-preview",
            analyzerId: "root-analyzer",
            contents: [{
                kind: "document",
                fields: { Zero: { type: "integer", valueInteger: 0 } },
                markdown: "# Saved",
                paragraphs: [{ content: "Saved" }],
                tables: [{ rowCount: 1, columnCount: 1, cells: [] }],
                figures: [{ id: "figure" }],
                signatures: [{ id: "signature" }],
                metadata: { Author: "Contoso" },
                futureProperty: [0, false],
            }],
        };
        const model = parseCuResult(raw);
        expect(availableResultTabs(model.contents[0], raw, model.apiVersion).map(tab => tab.label))
            .toEqual(["Fields", "Markdown", "Paragraphs", "Figures", "Signatures", "Metadata", "Result"]);
    });

    it("hides absent and empty values while keeping provided raw JSON inspectable", () => {
        const value = content({
            markdown: " \n", paragraphs: [], tables: [], figures: [], signatures: [], metadata: { Empty: " " },
        });
        expect(availableResultTabs(value, {}, "2026-06-01-preview").map(tab => tab.id)).toEqual(["result"]);
        expect(availableResultTabs(undefined, undefined)).toEqual([]);
        expect(availableResultTabs(undefined, null).map(tab => tab.id)).toEqual(["result"]);
    });

    it("keeps zero, false, null and missing field values inspectable through Fields", () => {
        const raw = {
            apiVersion: "2025-11-01",
            contents: [{
                kind: "document",
                fields: {
                    Zero: { type: "integer", valueInteger: 0 },
                    False: { type: "boolean", valueBoolean: false },
                    Null: { type: "string", valueString: null },
                    Missing: { type: "string" },
                },
            }],
        };
        const model = parseCuResult(raw);
        expect(availableResultTabs(model.contents[0], raw, model.apiVersion).map(tab => tab.id)).toEqual(["fields", "result"]);
    });

    it("requires mapped preview properties for Signatures and Metadata", () => {
        const value = parseCuResult({
            apiVersion: "2026-06-01-preview",
            contents: [{ kind: "document", signatures: [{ id: "signature" }], metadata: { Author: "Contoso" } }],
        }).contents[0];
        expect(availableResultTabs(value, {}, "2025-11-01").map(tab => tab.id)).toEqual(["result"]);
        expect(availableResultTabs(value, {}, "2026-06-01-preview").map(tab => tab.id))
            .toEqual(["signatures", "metadata", "result"]);
    });

    it("does not add a Code tab even when the result includes analyzer context", () => {
        expect(availableResultTabs(content({ analyzerId: "child" }), { analyzerId: "root" }, "2026-06-01-preview")
            .map(tab => tab.id)).toEqual(["result"]);
    });
    it("keeps Fields available for table-only results without exposing a Tables tab or changing raw data", () => {
        const raw = { apiVersion: "2025-11-01", contents: [{ kind: "document",
            tables: [{ rowCount: 1, columnCount: 2, cells: [{ rowIndex: 0, columnIndex: 0, columnSpan: 2, content: "Raw native table" }] }],
        }] };
        const before = JSON.stringify(raw), model = parseCuResult(raw);
        expect(availableResultTabs(model.contents[0], raw, model.apiVersion).map(tab => tab.id)).toEqual(["fields", "result"]);
        expect(model.contents[0]!.fields).toEqual([]);
        expect(model.original).toBe(raw);
        expect(JSON.stringify(raw)).toBe(before);
    });
});
