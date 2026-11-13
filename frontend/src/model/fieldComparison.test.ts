import { describe, expect, it } from "vitest";
import { compareFields } from "./fieldComparison";
import { parseFields } from "./parseCuResult";
import type { CuContent, CuField } from "./types";

function fields(raw: unknown, label = false) {
    const content: CuContent = { id: label ? "/labels" : "/contents/0", kind: "document", fields: [], pages: [] };
    return parseFields(raw, content, "", [], label ? "fieldLabels" : "fields");
}
const string = (value: string) => ({ type: "string", valueString: value });
const object = (value: unknown) => ({ type: "object", valueObject: value });
const array = (value: unknown[]) => ({ type: "array", valueArray: value });

describe("read-only field comparison", () => {
    it("compares typed values exactly while keeping missing, null and falsy values distinct", () => {
        const labels = fields({
            same: { ...string("John Smith"), confidence: 0.1 }, different: string("John Smith"),
            missing: string("Expected"), zero: { type: "number", valueNumber: 0 },
            false: { type: "boolean", valueBoolean: false }, empty: string(""), null: { type: "string", valueString: null },
            absent: { type: "string" }, "a/b~c": string("Exact"),
        }, true);
        const extracted = fields({
            same: { ...string("John Smith"), confidence: 0.99 }, different: string("john Smith "),
            extra: string("Unexpected"), zero: { type: "number", valueNumber: 0 },
            false: { type: "boolean", valueBoolean: false }, empty: string(""), null: { type: "string" },
            absent: { type: "string" }, "a/b~c": string("Exact"),
        });
        const comparison = compareFields(labels, extracted, true);
        expect(comparison.matched).toBe(5);
        expect(comparison.errors).toBe(4);
        expect(comparison.roots.find(node => node.path === "/null")?.status).toBe("missing");
        expect(comparison.roots.find(node => node.path === "/absent")?.status).toBe("uncompared");
        expect(comparison.roots.find(node => node.path === "/a~1b~0c")?.status).toBe("matched");
        expect(comparison.byFieldId.get(extracted[0]!.id)?.label).toBe(labels[0]);
    });

    it("ignores object property order and metadata, but never realigns array rows", () => {
        const labels = fields({ group: object({ first: string("A"), second: string("B") }),
            items: array([object({ code: string("A"), count: { type: "integer", valueInteger: 2 } }), object({ code: string("B") })]) }, true);
        const extracted = fields({ group: object({ second: string("B"), first: string("A") }),
            items: array([object({ code: string("B"), count: { type: "integer", valueInteger: 2 } }), object({ code: string("A") }),
                object({ code: string("C") })]) });
        const before = JSON.stringify([labels, extracted]);
        const comparison = compareFields(labels, extracted, true);
        expect(comparison.matched).toBe(3);
        expect(comparison.errors).toBe(3);
        expect(comparison.roots[1]?.errors).toBe(3);
        expect(comparison.nodes.find(node => node.path === "/items/0/code")?.array).toBe(comparison.roots[1]);
        expect(JSON.stringify([labels, extracted])).toBe(before);
        expect(comparison.fields[0]).not.toBe(labels[0]);
    });

    it("counts empty containers and type conflicts once, and does not invent comparison in reference mode", () => {
        const labels = fields({ empty: object({}), array: array([]), conflict: object({ child: string("A") }) }, true);
        const extracted = fields({ empty: object({}), array: array([]), conflict: string("A") });
        const compared = compareFields(labels, extracted, true);
        expect([compared.matched, compared.errors]).toEqual([2, 1]);
        expect(compared.roots[2]?.children).toHaveLength(0);
        const reference = compareFields(labels, [], false);
        expect([reference.matched, reference.errors]).toEqual([0, 0]);
        expect(reference.nodes.every(node => node.status === "uncompared")).toBe(true);
    });

    it("walks deeply nested field models without recursive stack growth or duplicate parent counts", () => {
        const nested = (prefix: string): CuField => {
            let field: CuField = { id: `${prefix}:value`, path: "", name: "Value", type: "string",
                hasValue: true, value: "Same", children: [], regions: [] };
            for (let depth = 0; depth < 5_000; depth++) field = {
                id: `${prefix}:${depth}`, path: "", name: "Group", type: "object",
                hasValue: true, value: {}, children: [field], regions: [],
            };
            return field;
        };
        const comparison = compareFields([nested("label")], [nested("extracted")], true);
        expect(comparison.nodes).toHaveLength(5_001);
        expect([comparison.matched, comparison.errors]).toEqual([1, 0]);
    });
});
