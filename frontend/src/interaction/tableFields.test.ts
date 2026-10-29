import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCuResult } from "../model/parseCuResult";
import type { CuContent, CuRegion } from "../model/types";
import { matchTableFields, tableFieldIds } from "./tableFields";

const text = (value: string, source?: string) => ({ type: "string", valueString: value, source });
function fixture(fields: Record<string, unknown>, sources = ["D(1,10,10,50,40)"]): CuContent {
    return parseCuResult({ apiVersion: "2025-11-01", contents: [{
        kind: "document", unit: "pixel", pages: [1, 2].map(pageNumber => ({ pageNumber, width: 100, height: 100 })),
        fields, tables: sources.map(source => ({ rowCount: 1, columnCount: 1, source,
            cells: [{ rowIndex: 0, columnIndex: 0, content: "Raw native cell" }] })),
    }] }).contents[0]!;
}
const match = (content: CuContent, index = 0) => matchTableFields(content, content.tables![index]!.field);

describe("conservative native table to existing Fields association", () => {
    it("locates a real array as a whole without choosing its first value or renaming data", () => {
        const content = fixture({ ArbitraryRows: { type: "array", valueArray: [0, 1].map(index => ({
            type: "object", valueObject: { Label: text(`Row ${index}`, `D(1,20,${20 + index * 10},10,5)`),
                NoGrounding: text("Unknown source") },
        })) }, Outside: text("Elsewhere", "D(1,80,80,10,5)") });
        const before = JSON.stringify(content);
        const result = match(content);
        expect(result.targets).toEqual([content.fields[0]]);
        expect(result.fields).toHaveLength(2);
        expect(result.ambiguous).toBe(0);
        const scope = tableFieldIds(result);
        expect(scope.has(content.fields[0]!.id)).toBe(true);
        expect(scope.has(content.fields[0]!.children[0]!.children[1]!.id)).toBe(true);
        expect(scope.has(content.fields[1]!.id)).toBe(false);
        expect(JSON.stringify(content)).toBe(before);
    });

    it("locates every related scalar/group instead of selecting the first field", () => {
        const content = fixture({ Total: { type: "object", valueObject: {
            Amount: { type: "number", valueNumber: 12, source: "D(1,20,20,10,5)" }, Currency: text("USD"),
        } }, Reference: text("R", "D(1,20,30,10,5)"), Outside: text("X", "D(1,80,80,10,5)") });
        expect(match(content).targets).toEqual(content.fields.slice(0, 2));
        expect(match(content).fields.map(field => field.name)).toEqual(["Amount", "Reference"]);
    });

    it("does not promote a partially grounded array to the whole array", () => {
        const content = fixture({ Rows: { type: "array", valueArray: [
            text("Inside", "D(1,20,20,10,5)"), text("Outside", "D(2,20,20,10,5)"),
        ] } });
        expect(match(content).targets).toEqual([content.fields[0]!.children[0]]);
        expect([...tableFieldIds(match(content))]).toEqual([content.fields[0]!.children[0]!.id]);
    });
    it("locates visible cells, not hidden row objects, when only one object-array row belongs to the table", () => {
        const content = fixture({ Rows: { type: "array", valueArray: [1, 2].map(page => ({
            type: "object", valueObject: { Label: text("Row label", `D(${page},20,20,10,5)`) },
        })) } });
        expect(match(content).targets).toEqual([content.fields[0]!.children[0]!.children[0]]);
    });

    it("uses the same page and full polygon containment, including exact edges", () => {
        const content = fixture({
            Edge: text("On the edge", "D(1,10,10,50,40)"),
            DifferentPage: text("Page two", "D(2,20,20,10,5)"),
            BarelyIntersecting: text("Straddles the boundary", "D(1,55,20,20,10)"),
            NoSource: text("Ungrounded"),
        });
        expect(match(content).targets.map(field => field.name)).toEqual(["Edge"]);
    });

    it("does not guess between overlapping native tables even when values or names match", () => {
        const content = fixture({ LineItems: text("Raw native cell", "D(1,20,20,10,5)") },
            ["D(1,10,10,50,40)", "D(1,15,15,50,40)"]);
        expect(match(content)).toEqual({ targets: [], fields: [], ambiguous: 1 });
    });

    it("uses every native table fragment but does not borrow grounding from another content", () => {
        const content = fixture({ Rows: { type: "array", valueArray: [
            text("First page", "D(1,20,20,10,5)"), text("Second page", "D(2,20,20,10,5)"),
        ] } }, ["D(1,10,10,50,40);D(2,10,10,50,40)"]);
        expect(match(content).targets).toEqual([content.fields[0]]);
        expect(() => matchTableFields(content, fixture({}).tables![0]!.field)).toThrow("current content");
    });

    it("uses truthful parent-only grounding only when no descendant has its own regions", () => {
        const content = fixture({ Group: { type: "object", source: "D(1,20,20,10,5)", valueObject: {
            Unknown: text("No source"),
        } } });
        expect(match(content).targets).toEqual([content.fields[0]]);
        content.fields[0]!.children[0]!.regions = [{ pageNumber: 1, polygon: [
            { x: 80, y: 80 }, { x: 90, y: 80 }, { x: 90, y: 90 }, { x: 80, y: 90 },
        ] }];
        expect(match(content).targets).toEqual([]);
    });

    it("does not use a bounding rectangle for a rotated table", () => {
        const content = fixture({ Center: text("Inside", "D(1,29,29,2,2)"), Corner: text("Outside", "D(1,11,11,2,2)") });
        const table = content.tables![0]!.field;
        const region: CuRegion = { pageNumber: 1, polygon: [
            { x: 30, y: 10 }, { x: 50, y: 30 }, { x: 30, y: 50 }, { x: 10, y: 30 },
        ] };
        table.regions = [region];
        expect(match(content).targets.map(field => field.name)).toEqual(["Center"]);
    });

    it("reports no correspondence without manufacturing table data inside Fields", () => {
        expect(match(fixture({}))).toEqual({ targets: [], fields: [], ambiguous: 0 });
        expect(match(fixture({ Missing: { type: "string", source: "D(1,20,20,10,5)" } })).targets).toEqual([]);
    });

    it("associates the actual invoice tables by source geometry, not table names or indices", () => {
        const raw: unknown = JSON.parse(readFileSync(resolve("tests", "fixtures", "mixed-financial-docs.cu.json"), "utf8"));
        const content = parseCuResult(raw).contents[0]!;
        expect(match(content, 0).targets.map(field => field.name)).toEqual(["PONumber"]);
        expect(match(content, 1).targets.map(field => field.name)).toContain("LineItems");
        const totals = match(content, 2).targets.map(field => field.name);
        expect(totals).toContain("AmountDue");
        expect(totals.length).toBeGreaterThan(1);
        expect(match(content, 3).targets).toEqual([]);
    });
});
