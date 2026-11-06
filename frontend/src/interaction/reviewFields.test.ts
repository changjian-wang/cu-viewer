import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseCuResult } from "../model/parseCuResult";
import { fieldRegions, interaction, initialInteraction } from "./interaction";
import { appearance, collapsedValue, confidenceDescription, copyValue, defaultReviewSettings, fieldEntries, formatScore, leafFields,
    formatThreshold, initialExpandedFields, inlineArrayProjection, matchingLeaves, moveField, orderedFields, orderedLeafFields, parseThreshold, schemaIdentity,
    validateFieldOrder, validateOrderParents } from "./reviewFields";

function content(fields: Record<string, unknown>, analyzerId = "test") {
    return parseCuResult({ apiVersion: "2025-11-01", analyzerId, contents: [{
        kind: "document", unit: "pixel", pages: [{ pageNumber: 1, width: 100, height: 100 },
            { pageNumber: 2, width: 100, height: 100 }], fields,
    }] }).contents[0]!;
}
const text = (value: string, confidence?: number) => ({ type: "string", valueString: value, confidence });

describe("approved review semantics", () => {
    it.each(["", " ", "NaN", "Infinity", "-0.1", "1.01"])("rejects invalid threshold %j", value => {
        expect(() => parseThreshold(value)).toThrow();
    });
    it.each(["0", "1", "0.675"])("keeps the exact valid threshold %s", value => {
        expect(parseThreshold(value)).toBe(Number(value));
    });
    it.each([[0, "0.00"], [1, "1.00"], [0.7, "0.70"], [0.699, "0.699"], [1e-7, "1e-7"]] as const)(
        "formats threshold %s without losing its actual precision", (value, label) => {
            expect(formatThreshold(value)).toBe(label);
        });
    it.each([NaN, Infinity, -0.01, 1.01])("rejects an invalid formatted threshold %s", value => {
        expect(() => formatThreshold(value)).toThrow(RangeError);
    });
    it("uses the exact palette, own confidence and category precedence", () => {
        expect(appearance({ confidence: 0.7 }, false, defaultReviewSettings).background).toBe("#E8F5E9");
        expect(appearance({ confidence: 0 }, false, defaultReviewSettings).background).toBe("#FCE8E6");
        expect(appearance({ confidence: 0.699 }, true, defaultReviewSettings).background).toBe("#F6C5CC");
        expect(appearance({}, true, defaultReviewSettings).background).toBe("#F1F3F5");
        expect(appearance({ confidence: 0 }, true, { ...defaultReviewSettings, highlightLow: false }).background).toBe("#E8F1FF");
        expect(appearance({ confidence: 0 }, false, { ...defaultReviewSettings, showFields: false }).enabled).toBe(false);
    });
    it("keeps semantic low-confidence colors independent of source visibility", () => {
        for (const table of [false, true]) {
            const style = appearance({ confidence: 0 }, table, { ...defaultReviewSettings, showFields: false, showTables: false });
            expect(style.enabled).toBe(false);
            expect(style.low).toBe(true);
            expect(style.background).toBe(table ? "#F6C5CC" : "#FCE8E6");
        }
        expect(confidenceDescription({ confidence: 0.698 }, 0.699)).toBe("Confidence 0.698, below threshold 0.699");
    });
    it.each([false, true])("uses only the field/table master for scored and unscored source visibility, table=%s", table => {
        const settings = { ...defaultReviewSettings, [table ? "showTables" : "showFields"]: false };
        for (const confidence of [0, 0.9, undefined]) {
            const field = confidence === undefined ? {} : { confidence };
            const style = appearance(field, table, settings);
            expect(style.enabled).toBe(false);
            expect(style.background).toBe(appearance(field, table, defaultReviewSettings).background);
            expect(appearance(field, !table, settings).enabled).toBe(true);
        }
    });
    it("keeps unavailable scores distinct from real zero and preserves threshold/emphasis precedence", () => {
        expect(appearance({}, false, defaultReviewSettings).background).toBe("#F1F3F5");
        expect(appearance({ confidence: 0 }, false, defaultReviewSettings).background).toBe("#FCE8E6");
        expect(appearance({ confidence: 0 }, false, { ...defaultReviewSettings, threshold: 0 }).background).toBe("#E8F5E9");
        expect(appearance({ confidence: 0 }, false, { ...defaultReviewSettings, highlightLow: false }).background).toBe("#E8F5E9");
        expect(appearance({}, false, { ...defaultReviewSettings, showFields: false }).enabled).toBe(false);
    });
    it("retains boundary precision without percentage/threshold contradictions", () => {
        expect(formatScore(0.699)).toBe("0.699");
        expect(formatScore(0)).toBe("0.00");
        expect(confidenceDescription({ confidence: 0.699 }, 0.7)).toBe("Confidence 0.699, below threshold 0.70");
        expect(confidenceDescription({}, 0.7)).toBe("Confidence unavailable");
    });
    it("shares visible parent-name matches, per-leaf low filtering and counts without hidden object summaries", () => {
        const value = content({ Group: { type: "object", valueObject: { A: text("first", 0), B: text("second", 0.9) } } });
        expect(matchingLeaves(value.fields, "Group", false, false, 0.7).size).toBe(2);
        expect(matchingLeaves(value.fields, "Group", true, false, 0.7).size).toBe(1);
        expect(matchingLeaves(value.fields, "2 properties", false, false, 0.7).size).toBe(0);
        expect(leafFields(value.fields)).toHaveLength(2);
    });
    it("never moves the source on preview, and prefers the current page on selection", () => {
        const value = content({ A: { ...text("A"), source: "D(1,1,1,2,2);D(2,1,1,2,2)" } }).fields[0]!;
        const preview = interaction({ ...initialInteraction, pageNumber: 2 }, { type: "hover", field: value, pageAvailable: true });
        expect(preview.pageNumber).toBe(2);
        expect(interaction(preview, { type: "select", field: value, pageAvailable: true }).selectedRegionIndex).toBe(1);
    });
    it("keeps all real descendant sources, with only truthful parent-only fallback", () => {
        const group = content({ Group: { type: "object", source: "D(1,1,1,40,40)", valueObject: {
            A: { ...text("A"), source: "D(1,2,2,2,2)" }, B: { ...text("B"), source: "D(2,5,5,2,2)" }, Missing: { type: "string" },
        } } }).fields[0]!;
        expect(fieldRegions(group).map(region => region.pageNumber)).toEqual([1, 2]);
        group.children.forEach(child => { child.regions = []; });
        expect(fieldRegions(group)).toEqual(group.regions);
    });
    it("preserves copying falsy/null/empty/missing semantics", () => {
        const field = content({ A: text("") }).fields[0]!;
        expect(copyValue(field)).toBe("");
        expect(copyValue({ ...field, value: 0 })).toBe("0");
        expect(copyValue({ ...field, value: false })).toBe("false");
        expect(copyValue({ ...field, value: null })).toBe("null");
        expect(() => copyValue({ ...field, hasValue: false })).toThrow("not returned");
    });
    it("uses only genuinely returned layout-cell confidence, without table inheritance", () => {
        const original = { apiVersion: "2025-11-01", contents: [{ kind: "document", tables: [{
            rowCount: 1, columnCount: 3, confidence: 0.99, cells: [
                { rowIndex: 0, columnIndex: 0, content: "zero", confidence: 0 },
                { rowIndex: 0, columnIndex: 1, content: "unknown" },
                { rowIndex: 0, columnIndex: 2, content: "invalid", confidence: 2 },
            ],
        }] }] };
        const model = parseCuResult(original);
        const cells = model.contents[0]!.tables![0]!.cells;
        expect(cells[0]?.field.confidence).toBe(0);
        expect(cells[1]?.field.confidence).toBeUndefined();
        expect(cells[2]?.field.confidence).toBeUndefined();
        expect(model.issues).toContainEqual(expect.objectContaining({ code: "invalid-confidence" }));
        expect(model.original).toBe(original);
    });
});

describe("ordered field navigation", () => {
    it("uses current root and nested display orders without changing source fields", () => {
        const value = content({
            Alpha: text("alpha"), "Group/~": { type: "object", valueObject: { A: text("a"), B: text("b") } },
            Last: text("last"),
        });
        const before = JSON.stringify(value.fields);
        const included = new Set(leafFields(value.fields).map(field => field.id));
        expect(orderedLeafFields(value.fields, {}, included).map(field => field.value)).toEqual(["alpha", "a", "b", "last"]);
        const order = { $root: ["/Group~1~0", "/Last"], "/Group~1~0": ["/Group~1~0/B"] };
        expect(orderedLeafFields(value.fields, order, included).map(field => field.value)).toEqual(["b", "a", "last", "alpha"]);
        expect(JSON.stringify(value.fields)).toBe(before);
    });

    it("recalculates selected positions after sibling/group moves and Reset order", () => {
        const value = content({
            Alpha: text("alpha"), Group: { type: "object", valueObject: { A: text("a"), B: text("b") } },
            Last: text("last"),
        });
        const entries = fieldEntries(value.fields), included = new Set(leafFields(value.fields).map(field => field.id));
        const group = value.fields[1]!, selected = group.children[1]!;
        const before = JSON.stringify(value.fields);
        const moved = moveField(entries, {}, group.id, value.fields[0]!.id, "before");
        const nested = moveField(entries, moved, selected.id, group.children[0]!.id, "before");
        const position = (order: Parameters<typeof orderedLeafFields>[1]) =>
            orderedLeafFields(value.fields, order, included).findIndex(field => field === selected) + 1;
        expect(position({})).toBe(3);
        expect(position(moved)).toBe(2);
        expect(position(nested)).toBe(1);
        expect(position({})).toBe(3);
        expect(JSON.stringify(value.fields)).toBe(before);
    });

    it("uses the displayed array column order for every business row", () => {
        const value = content({ Rows: { type: "array", valueArray: [
            { type: "object", valueObject: { B: text("row1-b"), A: text("row1-a") } },
            { type: "object", valueObject: { A: text("row2-a"), B: text("row2-b"), C: text("row2-c") } },
        ] } });
        const included = new Set(leafFields(value.fields).map(field => field.id));
        expect(orderedLeafFields(value.fields, {}, included).map(field => field.value))
            .toEqual(["row1-b", "row1-a", "row2-b", "row2-a", "row2-c"]);
        const filtered = new Set([value.fields[0]!.children[1]!.children[0]!.id]);
        expect(orderedLeafFields(value.fields, {}, filtered).map(field => field.value)).toEqual(["row2-a"]);
        expect(orderedLeafFields(value.fields, {}, new Set())).toEqual([]);
    });

    it("retains scalar arrays and nested-array tree order without numbering containers", () => {
        const value = content({
            Values: { type: "array", valueArray: [text("first"), text("second")] },
            Nested: { type: "array", valueArray: [
                { type: "object", valueObject: { Inner: { type: "array", valueArray: [text("nested1"), text("nested2")] } } },
            ] },
            Missing: { type: "string" },
        });
        const leaves = leafFields(value.fields), included = new Set(leaves.map(field => field.id));
        const navigation = orderedLeafFields(value.fields, {}, included);
        expect(navigation).toHaveLength(leaves.length);
        expect(navigation.map(field => field.value)).toEqual(leaves.map(field => field.value));
        expect(navigation.every(field => field.children.length === 0)).toBe(true);
    });
});

describe("real collapsed field values", () => {
    it("summarizes arbitrary object values without depending on business names or changing raw copy data", () => {
        const fields = content({ ArbitraryTotal: { type: "object", valueObject: {
            Number: { type: "number", valueNumber: 610, confidence: 0.2 }, Code: text("USD", 0.9),
        } } }).fields;
        const field = fields[0]!;
        const before = JSON.stringify(field.value);
        expect(collapsedValue(field)).toBe("610 USD");
        expect(copyValue(field)).toBe(JSON.stringify(field.value, null, 2));
        expect(JSON.stringify(field.value)).toBe(before);
        expect(field.confidence).toBeUndefined();
    });

    it("keeps falsy/null/empty values, nested values and actual array counts without missing placeholders", () => {
        const field = content({ Group: { type: "object", valueObject: {
            Zero: { type: "integer", valueInteger: 0 }, False: { type: "boolean", valueBoolean: false },
            Null: { type: "string", valueString: null }, Empty: text(""), Missing: { type: "string" },
            Nested: { type: "object", valueObject: { Label: text("nested") } },
            Rows: { type: "array", valueArray: [text("one"), text("two")] },
        } } }).fields[0]!;
        expect(collapsedValue(field)).toBe('0 false null "" (empty string) nested 2 items');
    });

    it("distinguishes empty, missing, null and unreturned-child objects", () => {
        const fields = content({
            Empty: { type: "object", valueObject: {} },
            Missing: { type: "object" },
            Null: { type: "object", valueObject: null },
            MissingChildren: { type: "object", valueObject: { Child: { type: "string" } } },
        }).fields;
        expect(fields.map(field => collapsedValue(field))).toEqual(["{}", "Not returned", "null", "Not returned"]);
    });

    it("retains complete long values instead of adding data-level ellipses", () => {
        const value = `${"long-value ".repeat(1000)}THE END`;
        const field = content({ Group: { type: "object", valueObject: { Description: text(value) } } }).fields[0]!;
        expect(collapsedValue(field)).toBe(value);
        expect(copyValue(field)).toContain(value);
    });

    it("handles deeply nested model fields without recursive summary calls", () => {
        let field = content({ Leaf: text("deep value") }).fields[0]!;
        for (let depth = 0; depth < 10000; depth++) field = {
            ...field, id: `/group/${depth}`, name: "Group", type: "object", value: {}, children: [field],
        };
        expect(collapsedValue(field)).toBe("deep value");
    });

    it("searches visible real summaries through the existing parent-match rule with own-score filtering", () => {
        const fields = content({ Group: { type: "object", valueObject: {
            Number: { type: "number", valueNumber: 610, confidence: 0.2 }, Code: text("USD", 0.9),
        } } }).fields;
        expect(matchingLeaves(fields, "610 USD", false, false, 0.7).size).toBe(2);
        expect([...matchingLeaves(fields, "610 USD", true, false, 0.7)]).toEqual([fields[0]!.children[0]!.id]);
        expect(matchingLeaves(fields, "2 properties", false, false, 0.7).size).toBe(0);
    });

    it("does not reveal or search unrelated values through a required ancestor in a table scope", () => {
        const group = content({ Group: { type: "object", valueObject: {
            External: text("external value"), Related: text("related value"),
        } } }).fields[0]!;
        const related = group.children[1]!, included = new Set([related.id]);
        expect(collapsedValue(group, included)).toBe("related value");
        expect(matchingLeaves([group], "external value", false, false, 0.7, included).has(related.id)).toBe(false);
        expect(matchingLeaves([group], "related value", false, false, 0.7, included).has(related.id)).toBe(true);
    });
});

describe("independent object and table initial expansion", () => {
    const object = (count: number) => ({ type: "object", valueObject: Object.fromEntries(
        Array.from({ length: count }, (_, index) => [`Field${index}`, text(`Value ${index}`)])) });
    const array = (count: number) => ({ type: "array", valueArray: Array.from({ length: count }, () => object(2)) });

    it("collapses objects and expands every nonempty table without changing the fields", () => {
        const fields = content({ Large: object(6), Rows: array(3), Small: object(2) }).fields;
        const before = JSON.stringify(fields);
        expect([...initialExpandedFields(fields)]).toEqual([fields[1]!.id]);
        expect(JSON.stringify(fields)).toBe(before);
    });

    it("keeps nested tables ready without opening their object parents", () => {
        const fields = content({ Group: { type: "object", valueObject: {
            Nested: { type: "object", valueObject: { Rows: array(2) } },
        } } }).fields;
        const nested = fields[0]!.children[0]!;
        expect([...initialExpandedFields(fields)]).toEqual([nested.children[0]!.id]);
    });

    it("does not restrict table defaults to the first array or a visible-row budget", () => {
        const fields = content({ Huge: array(100), Later: array(1), Empty: array(0) }).fields;
        expect([...initialExpandedFields(fields)]).toEqual([fields[0]!.id, fields[1]!.id]);
    });

    it("uses the real invoice structure without hardcoded business names", () => {
        const original: unknown = JSON.parse(readFileSync(resolve("tests", "fixtures", "mixed-financial-docs.cu.json"), "utf8"));
        const fields = parseCuResult(original).contents[0]!.fields;
        const expanded = initialExpandedFields(fields);
        expect(fields.filter(field => expanded.has(field.id)).map(field => field.name)).toEqual(["LineItems", "TaxDetails"]);
    });
});

describe("field-order projection and schema identity", () => {
    it("renders real nested-money LineItems as a business-order grid, not a scalar-only fixture shortcut", () => {
        const original: unknown = JSON.parse(readFileSync(resolve("tests", "fixtures", "mixed-financial-docs.cu.json"), "utf8"));
        const before = JSON.stringify(original);
        const value = parseCuResult(original).contents[0]!.fields.find(field => field.name === "LineItems")!;
        const projection = inlineArrayProjection(value)!;
        expect(projection.rows).toHaveLength(3);
        expect(projection.columns).toContainEqual({ key: "/TaxAmount/Amount", label: "TaxAmount / Amount" });
        expect(projection.rows[0]?.cells.get("/TaxAmount/Amount")?.value).toBe(6);
        expect(projection.rows[0]?.cells.get("/TaxAmount/CurrencyCode")?.value).toBe("USD");
        expect(projection.rows[0]?.cells.get("/TaxAmount/CurrencyCode")?.confidence).toBeUndefined();
        expect(JSON.stringify(original)).toBe(before);
    });
    it("uses escaped content-relative paths, immutably moves siblings and appends unlisted fields", () => {
        const value = content({ "A/B~": text("first"), B: text("second"), Group: { type: "object", valueObject: { Child: text("third") } } });
        const entries = fieldEntries(value.fields);
        expect(entries[0]?.path).toBe("/A~1B~0");
        const order = moveField(entries, {}, value.fields[0]!.id, value.fields[1]!.id);
        expect(order).toEqual({ $root: ["/B", "/A~1B~0", "/Group"] });
        expect(value.fields[0]?.name).toBe("A/B~");
        expect(moveField(entries, {}, value.fields[0]!.id, value.fields[1]!.id, "before").$root).toEqual(["/A~1B~0", "/B", "/Group"]);
        expect(moveField(entries, {}, value.fields[0]!.id, value.fields[1]!.id, "after").$root).toEqual(["/B", "/A~1B~0", "/Group"]);
        expect(orderedFields(value.fields, "$root", { $root: ["/Group"] }).map(field => field.name)).toEqual(["Group", "A/B~", "B"]);
        expect(() => moveField(entries, order, value.fields[0]!.id, entries[3]!.field.id)).toThrow("same object");
    });
    it("rejects cross-parent paths, duplicates and array-row/cell ordering", () => {
        expect(() => validateFieldOrder({ $root: ["/A/B"] })).toThrow();
        expect(() => validateFieldOrder({ $root: ["/A", "/A"] })).toThrow();
        const value = content({ Rows: { type: "array", valueArray: [{ type: "object", valueObject: { A: text("A") } }] } });
        expect(() => validateOrderParents({ "/Rows": ["/Rows/0"] }, fieldEntries(value.fields))).toThrow("array");
        const entries = fieldEntries(value.fields);
        expect(() => moveField(entries, {}, entries[1]!.field.id, entries[1]!.field.id)).toThrow("array");
    });
    it("ignores extracted values, row count and object display order, but isolates structure and analyzer/API", () => {
        const first = content({ A: text("first"), Rows: { type: "array", valueArray: [{ type: "object", valueObject: { "123": text("one") } }] } });
        const second = content({ Rows: { type: "array", valueArray: [
            { type: "object", valueObject: { "123": text("two") } }, { type: "object", valueObject: { "123": text("three") } },
        ] }, A: text("new value") });
        expect(schemaIdentity(first, "GA")).toBe(schemaIdentity(second, "GA"));
        expect(schemaIdentity(first, "GA")).not.toBe(schemaIdentity(first, "Preview"));
        expect(schemaIdentity(first, "GA")).not.toBe(schemaIdentity({ ...first, analyzerId: "another" }, "GA"));
        expect(schemaIdentity(first, "GA")).not.toBe(schemaIdentity(content({ A: text("first") }), "GA"));
    });
});
