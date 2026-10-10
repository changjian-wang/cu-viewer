import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CuResultParseError, parseCuResult } from "./parseCuResult";
import type { CuField, CuResultModel } from "./types";

function fixture(name: "mixed-financial-docs" | "receipt"): unknown {
    const value: unknown = JSON.parse(readFileSync(resolve("tests", "fixtures", `${name}.cu.json`), "utf8"));
    return value;
}

function first<T>(items: readonly T[]): T {
    const value = items[0];
    if (value === undefined) throw new Error("Expected a nonempty test collection.");
    return value;
}

function flatten(model: CuResultModel): CuField[] {
    const fields: CuField[] = [];
    const stack = model.contents.flatMap(content => content.fields);
    while (stack.length > 0) {
        const field = stack.pop();
        if (!field) break;
        fields.push(field);
        stack.push(...field.children);
    }
    return fields;
}

function byId(model: CuResultModel, id: string): CuField {
    const field = flatten(model).find(value => value.id === id);
    if (!field) throw new Error(`Test field is absent: ${id}`);
    return field;
}

function syntheticResult(fields: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}): unknown {
    return {
        apiVersion: "2025-11-01",
        analyzerId: "synthetic-boundary-case",
        contents: [{
            kind: "document",
            unit: "pixel",
            pages: [{ pageNumber: 1, width: 100, height: 200, angle: 0 }],
            fields,
            ...overrides,
        }],
    };
}

function parseError(input: unknown): CuResultParseError {
    try {
        parseCuResult(input);
    } catch (error) {
        if (error instanceof CuResultParseError) return error;
        throw error;
    }
    throw new Error("Expected the test input to fail parsing.");
}

function deepFreeze(value: unknown): void {
    const visited = new WeakSet<object>();
    const stack: unknown[] = [value];
    while (stack.length > 0) {
        const current = stack.pop();
        if (typeof current !== "object" || current === null || visited.has(current)) continue;
        visited.add(current);
        const children: unknown[] = Object.values(current);
        stack.push(...children);
        Object.freeze(current);
    }
}

describe("verified CU result parsing", () => {
    it("parses the real four-page PDF without normalizing or mutating the input", () => {
        const raw = fixture("mixed-financial-docs");
        const before = JSON.stringify(raw);
        deepFreeze(raw);
        const model = parseCuResult(raw);
        const content = first(model.contents);
        const fields = flatten(model);

        expect(model.original).toBe(raw);
        expect(model.apiVersion).toBe("2025-11-01");
        expect(model.analyzerId).toBe("prebuilt-invoice");
        expect(model.issues).toEqual([]);
        expect(content.unit).toBe("inch");
        expect(content.pages.map(page => page.pageNumber)).toEqual([1, 2, 3, 4]);
        expect(content.pages[3]).toMatchObject({ width: 8.2639, height: 11.6806, textAngle: 0 });
        expect(content.fields).toHaveLength(31);
        expect(fields).toHaveLength(100);
        expect(fields.filter(field => field.hasValue)).toHaveLength(88);
        expect(fields.filter(field => field.confidence === undefined)).toHaveLength(43);
        expect(fields.flatMap(field => field.regions)).toHaveLength(53);
        expect(byId(model, "/contents/0/fields/AmountDue/valueObject/Amount")).toMatchObject({
            value: 610,
            confidence: 0.341,
            path: "/result/contents/0/fields/AmountDue/valueObject/Amount",
            regions: [{
                pageNumber: 1,
                polygon: [
                    { x: 7.3628, y: 8.0513 }, { x: 7.9272, y: 8.0513 },
                    { x: 7.9272, y: 8.2124 }, { x: 7.3628, y: 8.2124 },
                ],
            }],
        });
        expect(byId(model, "/contents/0/fields/BillingAddress").regions).toHaveLength(2);
        expect(JSON.stringify(raw)).toBe(before);
    });

    it("parses the real PNG with pixel units, nested fields and missing values", () => {
        const model = parseCuResult(fixture("receipt"));
        const content = first(model.contents);
        const fields = flatten(model);

        expect(model.issues).toEqual([]);
        expect(model.analyzerId).toBe("prebuilt-receipt");
        expect(content.pages).toEqual([{ pageNumber: 1, width: 1743, height: 878, textAngle: 0 }]);
        expect(content.unit).toBe("pixel");
        expect(content.fields).toHaveLength(12);
        expect(fields).toHaveLength(42);
        expect(fields.filter(field => !field.hasValue)).toHaveLength(11);
        expect(fields.filter(field => field.confidence === undefined)).toHaveLength(23);
        expect(fields.flatMap(field => field.regions)).toHaveLength(13);
        expect(byId(model, "/contents/0/fields/MerchantName")).toMatchObject({
            value: "Contoso", confidence: 0.378,
            regions: [{ pageNumber: 1, polygon: [
                { x: 775, y: 73 }, { x: 973, y: 72 }, { x: 973, y: 111 }, { x: 775, y: 112 },
            ] }],
        });
        expect(byId(model, "/contents/0/fields/TotalAmount/valueObject/Amount").value).toBe(2516.28);
        expect(byId(model, "/contents/0/fields/MerchantAddress").regions).toHaveLength(2);
        expect(byId(model, "/contents/0/fields/TransactionDate").value).toBe("2019-06-10");
    });

    it("accepts the verified inner result and preserves stable field identities", () => {
        const raw = fixture("receipt");
        if (typeof raw !== "object" || raw === null || !("result" in raw)) throw new Error("Invalid real test fixture.");
        const wrapped = parseCuResult(raw);
        const inner = parseCuResult(raw.result);

        expect(flatten(inner).map(field => field.id)).toEqual(flatten(wrapped).map(field => field.id));
        expect(byId(inner, "/contents/0/fields/MerchantName").path).toBe("/contents/0/fields/MerchantName");
        expect(inner.original).toBe(raw.result);
    });
});

describe("synthetic field and metadata boundaries", () => {
    it("distinguishes zero, false, null, an empty string and an absent value", () => {
        const model = parseCuResult(syntheticResult({
            Zero: { type: "integer", valueInteger: 0, confidence: 0 },
            False: { type: "boolean", valueBoolean: false },
            Null: { type: "string", valueString: null },
            Empty: { type: "string", valueString: "" },
            Missing: { type: "string" },
        }));
        const fields = first(model.contents).fields;

        expect(fields.map(field => field.value)).toEqual([0, false, null, "", undefined]);
        expect(fields.map(field => field.hasValue)).toEqual([true, true, true, true, false]);
        expect(first(fields).confidence).toBe(0);
        expect(fields.every(field => field.regions.length === 0)).toBe(true);
        expect(model.issues).toEqual([]);
    });

    it("keeps duplicate names in nested objects, array entries and separate contents distinct", () => {
        const entry = {
            type: "object",
            valueObject: { Name: { type: "string", valueString: "same" } },
        };
        const raw = {
            apiVersion: "2025-11-01",
            contents: [0, 1].map(() => ({
                kind: "document",
                fields: { Rows: { type: "array", valueArray: [entry, entry] } },
            })),
        };
        const fields = flatten(parseCuResult(raw));
        const names = fields.filter(field => field.name === "Name");

        expect(names).toHaveLength(4);
        expect(new Set(names.map(field => field.id)).size).toBe(4);
        expect(names.map(field => field.value)).toEqual(["same", "same", "same", "same"]);
    });

    it("escapes JSON pointer property names without changing displayed labels", () => {
        const field = first(first(parseCuResult(syntheticResult({
            "A/~B": { type: "string", valueString: "value" },
        })).contents).fields);

        expect(field.id).toBe("/contents/0/fields/A~1~0B");
        expect(field.name).toBe("A/~B");
    });

    it("converts the documented rectangle form and keeps all regions", () => {
        const field = first(first(parseCuResult(syntheticResult({
            Box: { type: "string", valueString: "value", source: " D(1,10,20,30,40) ; D(1,1,2,3,4) " },
        })).contents).fields);

        expect(field.source).toBe(" D(1,10,20,30,40) ; D(1,1,2,3,4) ");
        expect(field.regions).toHaveLength(2);
        expect(first(field.regions).polygon).toEqual([
            { x: 10, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 60 }, { x: 10, y: 60 },
        ]);
    });

    it("preserves page numbers independently within different contents", () => {
        const raw = {
            apiVersion: "2025-11-01",
            contents: [100, 200].map(width => ({
                kind: "document", unit: "pixel",
                pages: [{ pageNumber: 2, width, height: 200 }],
                startPageNumber: 2, endPageNumber: 2,
                fields: { Name: { type: "string", valueString: "name", source: "D(2,10,20,30,40)" } },
            })),
        };
        const model = parseCuResult(raw);

        expect(model.contents.map(content => first(content.pages).width)).toEqual([100, 200]);
        expect(model.contents.flatMap(content => content.fields).every(field => first(field.regions).pageNumber === 2)).toBe(true);
    });

    it("treats an empty contents array and absent extraction fields as valid empty data", () => {
        expect(parseCuResult({ apiVersion: "2025-11-01", contents: [] }).contents).toEqual([]);
        const raw = { apiVersion: "2025-11-01", contents: [{ kind: "document" }] };
        expect(first(parseCuResult(raw).contents).fields).toEqual([]);
    });

    it("retains new opaque field values with an explicit unverified-type warning", () => {
        const value = { enabled: false, counts: [0, null] };
        const model = parseCuResult(syntheticResult({ Data: { type: "future", valueFuture: value } }));

        expect(first(first(model.contents).fields).value).toBe(value);
        expect(model.issues).toEqual([expect.objectContaining({
            code: "unverified-field-type", path: "/contents/0/fields/Data/type",
        })]);
    });

    it("handles deep typed relationships without recursive stack overflow", () => {
        let field: unknown = { type: "string", valueString: "leaf" };
        for (let index = 0; index < 1500; index++) field = { type: "object", valueObject: { Next: field } };
        const model = parseCuResult(syntheticResult({ Root: field }));

        expect(flatten(model)).toHaveLength(1501);
        expect(model.issues).toEqual([]);
    });
});

describe("explicit errors and nonfatal grounding diagnostics", () => {
    it.each([null, undefined, "", "{}", [], 0, false, new Date()])("rejects a non-JSON-object input %#", input => {
        expect(parseError(input).code).toBe("invalid-result");
    });

    it("does not poll or accept unsuccessful operation envelopes", () => {
        expect(parseError({ status: "Running", result: syntheticResult() })).toMatchObject({
            code: "analysis-not-succeeded", path: "/status",
        });
    });

    it("rejects unverified API versions and malformed result containers", () => {
        expect(parseError({ apiVersion: "2026-06-01-preview", contents: [] }).code).toBe("unsupported-api-version");
        expect(parseError({ apiVersion: "2025-11-01", contents: {} }).code).toBe("invalid-contents");
        expect(parseError(syntheticResult({}, { fields: [] })).code).toBe("invalid-fields");
        expect(parseError(syntheticResult({}, { pages: {} })).code).toBe("invalid-pages");
    });

    it.each([
        { type: "number", valueNumber: "0" },
        { type: "integer", valueInteger: 1.5 },
        { type: "boolean", valueBoolean: "false" },
        { type: "array", valueArray: {} },
        { type: "object", valueObject: [] },
        { type: "date", valueDate: new Date() },
        { type: "string", valueNumber: 1 },
        { type: "string", valueString: "value", valueNumber: 1 },
    ])("rejects a malformed typed field %#", field => {
        expect(parseError(syntheticResult({ Field: field })).code).toBe("invalid-field-value");
    });

    it("rejects missing field types and ambiguous page metadata", () => {
        expect(parseError(syntheticResult({ Field: { valueString: "value" } })).code).toBe("invalid-field");
        expect(parseError(syntheticResult({}, { pages: [{ pageNumber: 0 }] })).code).toBe("invalid-page");
        expect(parseError(syntheticResult({}, { pages: [{ pageNumber: 1 }, { pageNumber: 1 }] })).code).toBe("duplicate-page");
        expect(parseError(syntheticResult({}, { startPageNumber: 2, endPageNumber: 1 })).code).toBe("invalid-page-range");
    });

    it("reports invalid confidence without replacing it with a fabricated score", () => {
        const model = parseCuResult(syntheticResult({ Name: { type: "string", valueString: "name", confidence: 2 } }));
        const field = first(first(model.contents).fields);

        expect(field.value).toBe("name");
        expect(field.confidence).toBeUndefined();
        expect(model.issues).toEqual([expect.objectContaining({
            code: "invalid-confidence", path: "/contents/0/fields/Name/confidence",
        })]);
    });

    it.each([
        ["D(0,1,2,3,4)", "invalid-source"],
        ["D(1,,2,3,4)", "invalid-source"],
        ["D(1,0x10,2,3,4)", "invalid-source"],
        ["D(1,NaN,2,3,4)", "invalid-source"],
        ["D(1,Infinity,2,3,4)", "invalid-source"],
        ["D(1,1,2,0,4)", "invalid-source"],
        ["D(1,1,2,3,4,5,6)", "invalid-source"],
        ["D(1,1,1,2,2,3,3,4,4)", "invalid-source"],
        ["D(1,99,20,30,40)", "source-out-of-bounds"],
        ["D(2,10,20,30,40)", "missing-source-page"],
        ["I(1,2,3,4)", "invalid-source"],
    ])("preserves values and reports malformed source %s", (source, code) => {
        const model = parseCuResult(syntheticResult({ Name: { type: "string", valueString: "name", source } }));
        const field = first(first(model.contents).fields);

        expect(field.value).toBe("name");
        expect(field.source).toBe(source);
        expect(field.regions).toEqual([]);
        expect(model.issues).toEqual([expect.objectContaining({ code })]);
    });

    it("does not invent source geometry without dimensions or verified units", () => {
        const fields = { Name: { type: "string", valueString: "name", source: "D(1,10,20,30,40)" } };
        const noDimensions = parseCuResult(syntheticResult(fields, { pages: [{ pageNumber: 1 }] }));
        const noUnit = parseCuResult(syntheticResult(fields, { unit: "centimeter" }));

        expect(first(first(noDimensions.contents).fields).regions).toEqual([]);
        expect(noDimensions.issues.map(issue => issue.code)).toEqual(["invalid-page-dimensions", "unavailable-source-geometry"]);
        expect(first(first(noUnit.contents).fields).regions).toEqual([]);
        expect(noUnit.issues.map(issue => issue.code)).toEqual(["unverified-unit", "unavailable-source-geometry"]);
    });

    it("retains valid regions when another source region is malformed", () => {
        const model = parseCuResult(syntheticResult({
            Name: { type: "string", valueString: "name", source: "D(1,10,20,30,40);bad" },
        }));
        expect(first(first(model.contents).fields).regions).toHaveLength(1);
        expect(model.issues).toEqual([expect.objectContaining({ code: "invalid-source" })]);
    });

    it("rejects cyclic typed fields and opaque values explicitly", () => {
        const field: Record<string, unknown> = { type: "object" };
        field.valueObject = { Self: field };
        expect(parseError(syntheticResult({ Field: field })).code).toBe("cyclic-input");
        const value: Record<string, unknown> = {};
        value.self = value;
        expect(parseError(syntheticResult({ Opaque: { type: "future", valueFuture: value } })).code).toBe("cyclic-input");
    });
});
