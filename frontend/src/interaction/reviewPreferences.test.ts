import { describe, expect, it } from "vitest";
import { defaultReviewSettings, defaultSourceCategories } from "./reviewFields";
import { preferenceKey, readPreferences, validateSettings, writePreferences } from "./reviewPreferences";

function storage() {
    const values = new Map<string, string>();
    return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
describe("versioned Viewer preferences", () => {
    it("round-trips isolated schema settings/order and supplies missing layout defaults", () => {
        const store = storage();
        writePreferences(store, "schema", { settings: { ...defaultReviewSettings, threshold: 0 }, order: { $root: ["/A"] } });
        expect(readPreferences(store, "schema")?.settings.threshold).toBe(0);
        expect(readPreferences(store, "other")).toBeNull();
        expect(validateSettings({ threshold: 1 }).fieldRatio).toBe(0.46);
        expect(readPreferences(store, "schema")?.order).toEqual({ $root: ["/A"] });
    });
    it("reports corrupt, mismatched and unavailable storage without overwriting it", () => {
        const store = storage();
        store.setItem(preferenceKey("schema"), "{bad");
        expect(() => readPreferences(store, "schema")).toThrow();
        expect(store.getItem(preferenceKey("schema"))).toBe("{bad");
        store.setItem(preferenceKey("schema"), JSON.stringify({ format: "cu-viewer-review", version: 1, schema: "collision", settings: {}, order: {} }));
        expect(() => readPreferences(store, "schema")).toThrow("mismatched");
        expect(() => readPreferences({ getItem: () => { throw new Error("denied"); } }, "schema")).toThrow("denied");
        expect(() => writePreferences({ setItem: () => { throw new Error("full"); } }, "schema",
            { settings: { ...defaultReviewSettings }, order: {} })).toThrow("full");
    });
    it("loads existing version-one records with all categories on and no precision or order changes", () => {
        const store = storage();
        const text = JSON.stringify({ format: "cu-viewer-review", version: 1, schema: "schema",
            settings: { threshold: 0.341, showFields: true, showTables: false, highlightLow: true, columns: 3, paneRatio: 0.58, fieldRatio: 0.46 },
            order: { $root: ["/A"] } });
        store.setItem(preferenceKey("schema"), text);
        const loaded = readPreferences(store, "schema");
        expect(loaded?.settings.sourceCategories).toEqual(defaultSourceCategories);
        expect(loaded?.settings.threshold).toBe(0.341);
        expect(loaded?.order).toEqual({ $root: ["/A"] });
        expect(store.getItem(preferenceKey("schema"))).toBe(text);
    });
    it("round-trips an independent category mask and clones validated visibility", () => {
        const store = storage(), sourceCategories = { ...defaultSourceCategories, field: false, unavailable: false };
        writePreferences(store, "schema", { settings: { ...defaultReviewSettings, sourceCategories }, order: {} });
        expect(readPreferences(store, "schema")?.settings.sourceCategories).toEqual(sourceCategories);
        expect(validateSettings({ sourceCategories }).sourceCategories).not.toBe(sourceCategories);
        expect(defaultSourceCategories.field).toBe(true);
    });
    it.each([null, [], false, "hidden", { field: false }, { ...defaultSourceCategories, field: "false" },
        { ...defaultSourceCategories, extra: true }])("rejects malformed category visibility %j without overwriting it", sourceCategories => {
        const store = storage();
        const text = JSON.stringify({ format: "cu-viewer-review", version: 1, schema: "schema",
            settings: { ...defaultReviewSettings, sourceCategories }, order: {} });
        store.setItem(preferenceKey("schema"), text);
        expect(() => readPreferences(store, "schema")).toThrow("source highlight categories");
        expect(store.getItem(preferenceKey("schema"))).toBe(text);
    });
    it.each([NaN, -1, 2, Infinity])("rejects invalid stored threshold %s", threshold => {
        expect(() => validateSettings({ threshold })).toThrow();
    });
});
