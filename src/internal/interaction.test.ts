import { describe, expect, it } from "vitest";
import { displayValue, fieldColor, fieldLabel, flattenFields, formatConfidence, initialInteraction, interaction, primaryRegion } from "./interaction";
import type { CuField } from "./types";

function field(name: string, pageNumber?: number): CuField {
    return {
        id: `/contents/0/fields/${name}`, path: `/contents/0/fields/${name}`,
        name, type: "string", hasValue: true, value: name, children: [],
        regions: pageNumber === undefined ? [] : [{ pageNumber, polygon: [
            { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 },
        ] }],
    };
}

describe("prototype selection and page interaction", () => {
    it("previews across pages without fixing a selection", () => {
        const value = field("Amount", 1);
        const hovered = interaction({ ...initialInteraction, pageNumber: 4 }, { type: "hover", field: value, pageAvailable: true });
        expect(hovered).toEqual({ pageNumber: 1, hovered: value, selected: null });
        expect(interaction(hovered, { type: "leave", fieldId: value.id, restorePageAvailable: false }))
            .toEqual({ pageNumber: 1, hovered: null, selected: null });
    });

    it("pins a field and restores it after another field's preview", () => {
        const pinned = field("Amount", 1);
        const preview = field("Address", 2);
        const selected = interaction(initialInteraction, { type: "select", field: pinned, pageAvailable: true });
        const hovered = interaction(selected, { type: "hover", field: preview, pageAvailable: true });
        expect(hovered.selected).toBe(pinned);
        expect(hovered.pageNumber).toBe(2);
        expect(interaction(hovered, { type: "leave", fieldId: preview.id, restorePageAvailable: true }))
            .toEqual({ pageNumber: 1, selected: pinned, hovered: null });
    });

    it("lets manual navigation override preview restoration while retaining the pin", () => {
        const pinned = field("Amount", 1);
        const preview = field("Address", 2);
        const selected = interaction(initialInteraction, { type: "select", field: pinned, pageAvailable: true });
        const hovered = interaction(selected, { type: "hover", field: preview, pageAvailable: true });
        const manual = interaction(hovered, { type: "page", pageNumber: 4 });
        expect(manual).toEqual({ pageNumber: 4, selected: pinned, hovered: null });
        expect(interaction(manual, { type: "leave", fieldId: preview.id, restorePageAvailable: true })).toBe(manual);
    });

    it("keeps an ungrounded selection inspectable without a fake page jump", () => {
        const selected = field("CountryRegion");
        const state = interaction({ ...initialInteraction, pageNumber: 4 }, { type: "select", field: selected, pageAvailable: false });
        expect(state).toEqual({ pageNumber: 4, selected, hovered: null });
        expect(interaction(state, { type: "clear" })).toEqual({ pageNumber: 4, selected: null, hovered: null });
    });

    it("does not restore a page that is unavailable in the source", () => {
        const selected = field("Amount", 9);
        const preview = field("Address", 1);
        const state = interaction({ pageNumber: 1, selected, hovered: preview }, { type: "leave", fieldId: preview.id, restorePageAvailable: false });
        expect(state.pageNumber).toBe(1);
    });

    it("ignores a stale pointer leave for another field", () => {
        const hovered = field("Address", 1);
        const state = { ...initialInteraction, hovered };
        expect(interaction(state, { type: "leave", fieldId: "different", restorePageAvailable: false })).toBe(state);
    });

    it("does not undo a manual page choice after hovering an ungrounded field", () => {
        const selected = field("Amount", 1);
        const ungrounded = field("CountryRegion");
        const manual = { ...initialInteraction, pageNumber: 4, selected };
        const hovered = interaction(manual, { type: "hover", field: ungrounded, pageAvailable: false });
        expect(interaction(hovered, { type: "leave", fieldId: ungrounded.id, restorePageAvailable: true }))
            .toEqual({ pageNumber: 4, selected, hovered: null });
    });
});

describe("truthful field values and identities", () => {
    it.each([
        [0, "0.00%"],
        [0.317, "31.70%"],
        [0.341, "34.10%"],
        [0.12345, "12.35%"],
        [1, "100.00%"],
    ])("formats service confidence consistently (%s)", (confidence, expected) => {
        expect(formatConfidence(confidence)).toBe(expected);
    });

    it.each([
        [false, undefined, "Not returned"],
        [true, 0, "0"],
        [true, false, "false"],
        [true, null, "null"],
        [true, "", '"" (empty string)'],
    ])("preserves distinct field values (%s / %s)", (hasValue, value, expected) => {
        expect(displayValue({ ...field("Value"), hasValue, value })).toBe(expected);
    });

    it("uses readable nested identities without exposing pointer escapes", () => {
        expect(fieldLabel({ ...field("Amount"), id: "/contents/0/fields/A~1B/valueObject/Rows/valueArray/0/valueObject/Amount" }))
            .toBe("A/B / Rows / 0 / Amount");
        expect(fieldLabel({ ...field("valueObject"), id: "/contents/0/fields/valueObject/valueObject/valueArray" }))
            .toBe("valueObject / valueArray");
    });

    it("flattens in stable display order without mutating child arrays", () => {
        const child = field("Child");
        const parent = { ...field("Parent"), children: [child] };
        expect(flattenFields([parent, field("Second")]).map(value => value.name)).toEqual(["Parent", "Child", "Second"]);
        expect(parent.children).toEqual([child]);
    });
});

describe("Studio-style grouped field grounding and colors", () => {
    it("locates a collapsed group from its first genuinely grounded descendant", () => {
        const amount = field("Amount", 2);
        const group = { ...field("AmountDue"), type: "object", children: [field("CurrencyCode"), amount] };
        expect(primaryRegion(group)).toBe(amount.regions[0]);
        expect(group.regions).toEqual([]);
        expect(group.children).toEqual([field("CurrencyCode"), amount]);
    });

    it("keeps a group's own grounding ahead of its descendant's regions", () => {
        const group = { ...field("AmountDue", 1), children: [field("Amount", 2)] };
        expect(primaryRegion(group)).toBe(group.regions[0]);
    });

    it("does not invent a region for an ungrounded group or empty selection", () => {
        expect(primaryRegion({ ...field("Group"), children: [field("Child")] })).toBeUndefined();
        expect(primaryRegion(null)).toBeUndefined();
    });

    it("uses the same page for a grouped hover, pin and restoration", () => {
        const group = { ...field("AmountDue"), type: "object", children: [field("Amount", 1)] };
        const selected = interaction({ ...initialInteraction, pageNumber: 4 }, { type: "select", field: group, pageAvailable: true });
        const preview = field("Address", 2);
        const hovered = interaction(selected, { type: "hover", field: preview, pageAvailable: true });
        expect(selected.pageNumber).toBe(1);
        expect(interaction(hovered, { type: "leave", fieldId: preview.id, restorePageAvailable: true }).pageNumber).toBe(1);
    });

    it("keeps root colors stable across nesting, collapse and display filtering", () => {
        const amountDue = field("AmountDue");
        const balance = field("BalanceForward");
        const address = field("BillingAddress");
        const recipient = field("BillingAddressRecipient");
        const roots = [amountDue, balance, address, recipient];
        const child = { ...field("Amount"), id: `${amountDue.id}/valueObject/Amount` };
        expect(fieldColor(amountDue, roots)).toBe("#d13438");
        expect(fieldColor(child, roots)).toBe("#d13438");
        expect(fieldColor(balance, roots)).toBe("#ffaa44");
        expect(fieldColor(address, roots)).toBe("#8cbd18");
        expect(fieldColor(recipient, roots)).toBe("#005b70");
    });
});
