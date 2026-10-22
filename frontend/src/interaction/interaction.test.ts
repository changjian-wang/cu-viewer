import { describe, expect, it } from "vitest";
import { displayValue, fieldColor, fieldDisplayName, fieldLabel, fieldRegion, fieldRegions, flattenFields, formatConfidence, initialInteraction, interaction, primaryRegion } from "./interaction";
import type { CuField } from "../model/types";

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
        expect(hovered).toEqual({ pageNumber: 1, hovered: value, selected: null, selectedRegionIndex: 0 });
        expect(interaction(hovered, { type: "leave", fieldId: value.id, restorePageAvailable: false }))
            .toEqual({ pageNumber: 1, hovered: null, selected: null, selectedRegionIndex: 0 });
    });

    it("pins a field and restores it after another field's preview", () => {
        const pinned = field("Amount", 1);
        const preview = field("Address", 2);
        const selected = interaction(initialInteraction, { type: "select", field: pinned, pageAvailable: true });
        const hovered = interaction(selected, { type: "hover", field: preview, pageAvailable: true });
        expect(hovered.selected).toBe(pinned);
        expect(hovered.pageNumber).toBe(2);
        expect(interaction(hovered, { type: "leave", fieldId: preview.id, restorePageAvailable: true }))
            .toEqual({ pageNumber: 1, selected: pinned, hovered: null, selectedRegionIndex: 0 });
    });

    it("lets manual navigation override preview restoration while retaining the pin", () => {
        const pinned = field("Amount", 1);
        const preview = field("Address", 2);
        const selected = interaction(initialInteraction, { type: "select", field: pinned, pageAvailable: true });
        const hovered = interaction(selected, { type: "hover", field: preview, pageAvailable: true });
        const manual = interaction(hovered, { type: "page", pageNumber: 4 });
        expect(manual).toEqual({ pageNumber: 4, selected: pinned, hovered: null, selectedRegionIndex: 0 });
        expect(interaction(manual, { type: "leave", fieldId: preview.id, restorePageAvailable: true })).toBe(manual);
    });

    it("keeps an ungrounded selection inspectable without a fake page jump", () => {
        const selected = field("CountryRegion");
        const state = interaction({ ...initialInteraction, pageNumber: 4 }, { type: "select", field: selected, pageAvailable: false });
        expect(state).toEqual({ pageNumber: 4, selected, hovered: null, selectedRegionIndex: 0 });
        expect(interaction(state, { type: "clear" })).toEqual({ pageNumber: 4, selected: null, hovered: null, selectedRegionIndex: 0 });
    });

    it("does not restore a page that is unavailable in the source", () => {
        const selected = field("Amount", 9);
        const preview = field("Address", 1);
        const state = interaction({ pageNumber: 1, selected, hovered: preview, selectedRegionIndex: 0 },
            { type: "leave", fieldId: preview.id, restorePageAvailable: false });
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
            .toEqual({ pageNumber: 4, selected, hovered: null, selectedRegionIndex: 0 });
    });

    it("navigates every selected region and restores the chosen region after a preview", () => {
        const selected = field("Address", 1);
        selected.regions.push({ pageNumber: 4, polygon: [
            { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 4 }, { x: 3, y: 4 },
        ] });
        const pinned = interaction(initialInteraction, { type: "select", field: selected, pageAvailable: true });
        const second = interaction(pinned, { type: "region", fieldId: selected.id, index: 1, pageAvailable: true });
        expect(second).toEqual({ pageNumber: 4, selected, hovered: null, selectedRegionIndex: 1 });
        const preview = field("Amount", 1);
        const hovered = interaction(second, { type: "hover", field: preview, pageAvailable: true });
        expect(interaction(hovered, { type: "leave", fieldId: preview.id, restorePageAvailable: true }))
            .toEqual({ pageNumber: 4, selected, hovered: null, selectedRegionIndex: 1 });
    });

    it("records an unavailable chosen region without fabricating a page jump", () => {
        const selected = field("Address", 1);
        selected.regions.push({ pageNumber: 9, polygon: [
            { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 4 }, { x: 3, y: 4 },
        ] });
        const pinned = interaction(initialInteraction, { type: "select", field: selected, pageAvailable: true });
        const unavailable = interaction(pinned, { type: "region", fieldId: selected.id, index: 1, pageAvailable: false });
        expect(unavailable).toEqual({ pageNumber: 1, selected, hovered: null, selectedRegionIndex: 1 });
        expect(interaction(unavailable, { type: "region", fieldId: selected.id, index: 4, pageAvailable: false }))
            .toBe(unavailable);
        expect(interaction(unavailable, { type: "region", fieldId: "other", index: 0, pageAvailable: true }))
            .toBe(unavailable);
    });

    it("resets the region index when another field is selected or the selection is cleared", () => {
        const address = field("Address", 1);
        address.regions.push({ ...address.regions[0]!, pageNumber: 2 });
        const second = interaction(
            interaction(initialInteraction, { type: "select", field: address, pageAvailable: true }),
            { type: "region", fieldId: address.id, index: 1, pageAvailable: true },
        );
        expect(interaction(second, { type: "select", field: field("Amount", 1), pageAvailable: true }).selectedRegionIndex).toBe(0);
        expect(interaction(second, { type: "clear" }).selectedRegionIndex).toBe(0);
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
            .toBe("A/B / Rows / Item 1 / Amount");
        expect(fieldLabel({ ...field("valueObject"), id: "/contents/0/fields/valueObject/valueObject/valueArray" }))
            .toBe("valueObject / valueArray");
    });

    it("uses readable one-based array item labels while retaining stable numeric identities", () => {
        const item = { ...field("0"), id: "/contents/0/fields/LineItems/valueArray/0", type: "object" };
        expect(fieldDisplayName(item)).toBe("Item 1");
        expect(fieldLabel({ ...field("Date"), id: `${item.id}/valueObject/Date` })).toBe("LineItems / Item 1 / Date");
        expect(item.id).toContain("/valueArray/0");
        expect(fieldDisplayName(field("2026"))).toBe("2026");
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

    it("preserves all own regions and collects every grounded descendant when a group has none", () => {
        const address = field("Address", 1);
        address.regions.push({ pageNumber: 2, polygon: [
            { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 4 }, { x: 3, y: 4 },
        ] });
        expect(fieldRegions(address)).toEqual(address.regions);
        expect(fieldRegion(address, 1)).toBe(address.regions[1]);
        expect(fieldRegion(address, -1)).toBeUndefined();
        const amount = field("Amount", 3);
        const date = field("Date", 4);
        const item = { ...field("0"), type: "object", regions: [], children: [date] };
        const group = { ...field("Rows"), type: "array", regions: [], children: [item, amount] };
        expect(fieldRegions(group)).toEqual([date.regions[0], amount.regions[0]]);
        expect(primaryRegion(group)).toBe(date.regions[0]);
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
