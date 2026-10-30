import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseCuResult } from "../model/parseCuResult";
import { fieldRegions, interaction, initialInteraction } from "./interaction";
import { appearance, collapsedValue, confidenceDescription, copyValue, defaultReviewSettings, defaultSourceCategories, fieldEntries, formatScore, leafFields,
    formatThreshold, initialExpandedFields, inlineArrayProjection, matchingLeaves, moveField, orderedFields, parseThreshold, schemaIdentity,
    sourceAppearance, sourceCategoryDisabledReason, sourceCategoryVisibility, validateFieldOrder, validateOrderParents } from "./reviewFields";

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
        expect(appearance({ confidence: 0.699 }, true, defaultReviewSettings).background).toBe("#FFE8EC");
        expect(appearance({}, true, defaultReviewSettings).background).toBe("#F1F3F5");
        expect(appearance({ confidence: 0 }, true, { ...defaultReviewSettings, highlightLow: false }).background).toBe("#E8F1FF");
        expect(appearance({ confidence: 0 }, false, { ...defaultReviewSettings, showFields: false }).enabled).toBe(false);
    });
    it("keeps semantic low-confidence colors independent of source visibility", () => {
        for (const table of [false, true]) {
            const style = appearance({ confidence: 0 }, table, { ...defaultReviewSettings, showFields: false, showTables: false });
            expect(style.enabled).toBe(false);
            expect(style.low).toBe(true);
            expect(style.background).toBe(table ? "#FFE8EC" : "#FCE8E6");
        }
        expect(confidenceDescription({ confidence: 0.698 }, 0.699)).toBe("Confidence 0.698, below threshold 0.699");
    });
    const categories = [
        ["field", false, 0.7, "#E8F5E9"], ["table", true, 1, "#E8F1FF"],
        ["lowField", false, 0, "#FCE8E6"], ["lowTable", true, 0.699, "#FFE8EC"],
        ["unavailable", false, undefined, "#F1F3F5"],
    ] as const;
    it.each(categories)("independently hides the %s source category without changing right-hand appearance", category => {
        const settings = { ...defaultReviewSettings, sourceCategories: { ...defaultSourceCategories, [category]: false } };
        for (const [candidate, table, confidence, background] of categories) {
            const field = confidence === undefined ? {} : { confidence };
            const source = sourceAppearance(field, table, settings), value = appearance(field, table, settings);
            expect(source.enabled).toBe(candidate !== category);
            expect(source.background).toBe(background);
            expect(value.enabled).toBe(true);
            expect(value.background).toBe(background);
        }
        expect(defaultSourceCategories[category]).toBe(true);
    });
    it("keeps unavailable scores distinct from real zero and preserves threshold/emphasis precedence", () => {
        const settings = { ...defaultReviewSettings, sourceCategories: { ...defaultSourceCategories, unavailable: false, lowField: false } };
        expect(sourceAppearance({}, false, settings).enabled).toBe(false);
        expect(sourceAppearance({ confidence: 0 }, false, { ...settings, sourceCategories: { ...settings.sourceCategories, lowField: true } }).enabled).toBe(true);
        expect(sourceAppearance({ confidence: 0 }, false, settings).enabled).toBe(false);
        expect(sourceAppearance({ confidence: 0 }, false, { ...settings, threshold: 0 }).enabled).toBe(true);
        expect(sourceAppearance({ confidence: 0 }, false, { ...settings, highlightLow: false }).background).toBe("#E8F5E9");
        expect(sourceAppearance({ confidence: 0 }, false, { ...settings, highlightLow: false }).enabled).toBe(true);
    });
    it("keeps master gates above category preferences with explicit disabled explanations", () => {
        const fieldsOff = { ...defaultReviewSettings, showFields: false };
        expect(sourceAppearance({ confidence: 0.9 }, false, fieldsOff).enabled).toBe(false);
        expect(sourceCategoryDisabledReason("field", fieldsOff)).toContain("Show field highlights");
        expect(sourceCategoryDisabledReason("lowField", fieldsOff)).toContain("Show field highlights");
        expect(sourceCategoryDisabledReason("table", fieldsOff)).toBeNull();
        expect(sourceCategoryDisabledReason("unavailable", fieldsOff)).toBeNull();
        expect(sourceCategoryDisabledReason("table", { ...defaultReviewSettings, showTables: false })).toContain("Show table highlights");
        expect(sourceCategoryDisabledReason("lowTable", { ...defaultReviewSettings, highlightLow: false })).toContain("Show low confidence highlight");
        expect(sourceCategoryDisabledReason("unavailable", { ...fieldsOff, showTables: false })).toContain("field or table");
        expect(fieldsOff.sourceCategories).toEqual(defaultSourceCategories);
    });
    it("defaults legacy in-memory visibility to all categories without mutating defaults", () => {
        expect(sourceCategoryVisibility({})).toEqual(defaultSourceCategories);
        const configured = { ...defaultSourceCategories, field: false };
        expect(sourceCategoryVisibility({ sourceCategories: configured })).toBe(configured);
        expect(defaultSourceCategories.field).toBe(true);
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

describe("bounded array-first initial expansion", () => {
    const object = (count: number) => ({ type: "object", valueObject: Object.fromEntries(
        Array.from({ length: count }, (_, index) => [`Field${index}`, text(`Value ${index}`)])) });
    const array = (count: number) => ({ type: "array", valueArray: Array.from({ length: count }, () => object(2)) });

    it("reserves the first array header/business rows before opening first-level objects", () => {
        const fields = content({ Large: object(6), Rows: array(3), Small: object(2) }).fields;
        const expanded = initialExpandedFields(fields, {}, 9);
        expect([...expanded]).toEqual([fields[1]!.id, fields[2]!.id]);
    });

    it("counts the array header and never expands beyond the row budget", () => {
        const fields = content({ Rows: array(2) }).fields;
        expect(initialExpandedFields(fields, {}, 3).size).toBe(0);
        expect([...initialExpandedFields(fields, {}, 4)]).toEqual([fields[0]!.id]);
    });

    it("leaves oversized arrays folded without replacing them with a later array", () => {
        const fields = content({ Huge: array(100), Later: array(1), Small: object(2) }).fields;
        expect([...initialExpandedFields(fields)]).toEqual([fields[2]!.id]);
    });

    it("uses configured display order for object priority without changing the fields", () => {
        const fields = content({ First: object(2), Second: object(2), Rows: array(1) }).fields;
        const before = JSON.stringify(fields);
        expect([...initialExpandedFields(fields, {}, 7)]).toEqual([fields[2]!.id, fields[0]!.id]);
        expect([...initialExpandedFields(fields, { $root: ["/Second", "/First", "/Rows"] }, 7)]).toEqual([fields[2]!.id, fields[1]!.id]);
        expect(JSON.stringify(fields)).toBe(before);
    });

    it("does not recursively open nested objects or nested array rows", () => {
        const fields = content({ Group: { type: "object", valueObject: { Nested: object(100) } } }).fields;
        expect([...initialExpandedFields(fields)]).toEqual([fields[0]!.id]);
        const nested = content({ Rows: { type: "array", valueArray: [{
            type: "object", valueObject: { Nested: array(2) },
        }] } }).fields;
        expect([...initialExpandedFields(nested, {}, 2)]).toEqual([nested[0]!.id]);
    });

    it("keeps all groups folded if the root rows already fill the budget", () => {
        const fields = content({ Group: object(1), Other: object(1) }).fields;
        expect(initialExpandedFields(fields, {}, 2).size).toBe(0);
    });

    it("uses the real invoice structure without hardcoded business names", () => {
        const original: unknown = JSON.parse(readFileSync(resolve("tests", "fixtures", "mixed-financial-docs.cu.json"), "utf8"));
        const fields = parseCuResult(original).contents[0]!.fields;
        const expanded = initialExpandedFields(fields);
        expect(fields.filter(field => expanded.has(field.id)).map(field => field.name)).toEqual(["AmountDue", "BalanceForward", "LineItems"]);
    });

    it.each([-1, 0.5, Infinity, NaN])("rejects invalid row budget %s", budget => {
        expect(() => initialExpandedFields([], {}, budget)).toThrow(RangeError);
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
