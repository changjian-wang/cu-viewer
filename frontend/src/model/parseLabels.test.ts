import { describe, expect, it } from "vitest";
import { parseLabels } from "./parseLabels";
import { fieldRegions } from "../interaction/interaction";
import { appearance, defaultReviewSettings, isTableValue, labelSummary } from "../interaction/reviewFields";
import { sourceOutlines } from "../source/sourceOverlays";

const source = { kind: "pdf" as const, pages: [{ pageNumber: 1, width: 816, height: 1056 }] };
const region = "D(1,1,2,2,0.5)";
const labels = {
    fieldLabels: {
        Name: { type: "string", valueString: "Saved label", confidence: 0.1, source: `${region};D(1,3,2,1,0.5)` },
        Period: { type: "object", valueObject: { Start: { type: "date", valueDate: "2026-01-02", source: region } } },
        Items: { type: "array", valueArray: [{ type: "object", valueObject: {
            Amount: { type: "number", valueNumber: 0, source: region },
            Approved: { type: "boolean", valueBoolean: false },
        } }] },
        Missing: { type: "string" },
    },
};

describe("local label input", () => {
    it("reads typed nested values and maps all source regions using the PDF page dimensions", () => {
        const original = JSON.stringify(labels);
        const model = parseLabels(labels, source);
        expect(model.original).toBe(labels);
        expect(model.content.pages).toEqual([{ pageNumber: 1, width: 8.5, height: 11 }]);
        const [name, period, items, missing] = model.content.fields;
        expect(name?.regions).toEqual([
            { pageNumber: 1, polygon: [{ x: 1, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 2.5 }, { x: 1, y: 2.5 }] },
            { pageNumber: 1, polygon: [{ x: 3, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 2.5 }, { x: 3, y: 2.5 }] },
        ]);
        expect(period?.children[0]?.value).toBe("2026-01-02");
        expect(fieldRegions(period!)).toHaveLength(1);
        expect(items?.children[0]?.children.map(field => field.value)).toEqual([0, false]);
        expect(missing?.hasValue).toBe(false);
        expect(missing?.regions).toEqual([]);
        expect(model.issues).toEqual([]);
        expect(JSON.stringify(labels)).toBe(original);
    });

    it("uses reference colors independently of missing or low confidence and summarizes group values", () => {
        const [name, period, items] = parseLabels(labels, source).content.fields;
        const amount = items!.children[0]!.children[0]!;
        expect(appearance(name!, false, defaultReviewSettings, true)).toMatchObject({
            low: false, unavailable: false, background: "#E8F5E9",
        });
        expect(appearance(amount, isTableValue(amount), defaultReviewSettings, true)).toMatchObject({
            low: false, unavailable: false, background: "#E8F1FF",
        });
        expect(appearance(name!, false, defaultReviewSettings).low).toBe(true);
        expect(labelSummary(period!)).toBe("Start: 2026-01-02");
        expect(labelSummary(items!)).toBe("Item 1 / Amount: 0; Item 1 / Approved: false");
    });

    it("keeps authored object sources as well as descendant regions", () => {
        const model = parseLabels({ fieldLabels: { Group: {
            type: "object", source: "D(1,1,1,2,2)",
            valueObject: { Name: { type: "string", valueString: "Child", source: "D(1,4,4,1,1)" } },
        } } }, source);
        const group = model.content.fields[0]!;
        expect(fieldRegions(group).map(region => region.polygon[0])).toEqual([{ x: 1, y: 1 }, { x: 4, y: 4 }]);
        expect(sourceOutlines(model.content, "label", 1, false).map(outline => outline.field.id))
            .toEqual([group.id, group.children[0]!.id]);
    });

    it.each([null, {}, { fieldLabels: [] }, { fieldLabels: null }])("rejects malformed label roots: %j", value => {
        expect(() => parseLabels(value, source)).toThrow("fieldLabels object");
    });

    it("rejects mismatched typed values at their original label path", () => {
        expect(() => parseLabels({ fieldLabels: { Number: { type: "number", valueString: "wrong" } } }, source))
            .toThrow("conflicting or mismatched typed value keys");
    });

    it("retains values without guessing geometry for unavailable or invalid sources", () => {
        const unavailable = parseLabels(labels, null);
        expect(unavailable.content.fields[0]?.value).toBe("Saved label");
        expect(unavailable.content.fields[0]?.regions).toEqual([]);
        expect(unavailable.issues.map(issue => issue.code)).toEqual(["unavailable-label-source"]);
        const invalid = parseLabels({ fieldLabels: { Name: { type: "string", valueString: "Kept", source: "D(2,1,2,1,1)" } } }, source);
        expect(invalid.content.fields[0]?.regions).toEqual([]);
        expect(invalid.issues[0]?.path).toBe("/fieldLabels/Name/source");
        expect(() => parseLabels(labels, { ...source, kind: "image" })).toThrow("local PDF");
    });
});
