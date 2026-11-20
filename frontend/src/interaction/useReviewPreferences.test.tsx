// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseCuResult } from "../model/parseCuResult";
import type { ContentUnderstandingResultViewerProps, ViewerFieldOrder } from "../index";
import { useReviewPreferences } from "./useReviewPreferences";
import { preferenceKey, readPreferences, writePreferences } from "./reviewPreferences";
import { defaultReviewSettings, schemaIdentity } from "./reviewFields";

const content = parseCuResult({ apiVersion: "2025-11-01", contents: [{ kind: "document",
    fields: { A: { type: "string", valueString: "A" }, B: { type: "string", valueString: "B" } } }] }).contents[0]!;
const base: ContentUnderstandingResultViewerProps = { source: new ArrayBuffer(1), result: {} };
const schema = schemaIdentity(content, "2025-11-01");
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

describe("browser object expansion", () => {
    const grouped = parseCuResult({ apiVersion: "2025-11-01", contents: [{ kind: "document", fields: {
        "Group/~": { type: "object", valueObject: { Name: { type: "string", valueString: "A" } } },
        Other: { type: "object", valueObject: { Name: { type: "string", valueString: "B" } } },
    } }] }).contents[0]!;
    const groupedSchema = schemaIdentity(grouped, "2025-11-01");
    const [group, other] = grouped.fields;

    it("uses JSON order while off and preserves the saved customization for re-enabling", () => {
        const order = { $root: ["/Other", "/Group~1~0"] };
        const objectExpansion = { "/Group~1~0": true };
        writePreferences(localStorage, groupedSchema, { settings: { ...defaultReviewSettings }, order, objectExpansion });
        const first = renderHook(() => useReviewPreferences({ ...base, defaultFieldOrder: order },
            grouped, "2025-11-01", undefined));
        expect(first.result.current.customizedFieldOrder?.enabled).toBe(true);
        expect(first.result.current.order).toEqual(order);
        act(() => first.result.current.customizedFieldOrder?.onChange(false));
        expect(first.result.current.order).toEqual({});
        expect(first.result.current.objectExpansion).toBeUndefined();
        act(() => first.result.current.changeOrder({}));
        act(() => first.result.current.changeObjectExpansion([other!], true));
        expect(readPreferences(localStorage, groupedSchema)).toMatchObject({ order, objectExpansion, useCustomizedFieldOrder: false });
        first.unmount();
        const second = renderHook(() => useReviewPreferences(base, grouped, "2025-11-01", undefined));
        expect(second.result.current.customizedFieldOrder?.enabled).toBe(false);
        const latest = { order: { $root: ["/Group~1~0", "/Other"] }, objectExpansion: { "/Other": true } };
        writePreferences(localStorage, groupedSchema, { settings: { ...defaultReviewSettings },
            ...latest, useCustomizedFieldOrder: false });
        act(() => second.result.current.customizedFieldOrder?.onChange(true));
        expect(second.result.current.order).toEqual(latest.order);
        expect(second.result.current.objectExpansion).toEqual(latest.objectExpansion);
    });

    it("does not overwrite order, layout or other objects saved by another Viewer of the same schema", () => {
        const first = renderHook(() => useReviewPreferences(base, grouped, "2025-11-01", undefined));
        const second = renderHook(() => useReviewPreferences(base, grouped, "2025-11-01", undefined));
        const order = { $root: ["/Other", "/Group~1~0"] };
        act(() => first.result.current.changeOrder(order));
        act(() => first.result.current.changeObjectExpansion([group!], true));
        act(() => second.result.current.changeObjectExpansion([other!], false));
        act(() => second.result.current.changeSettings({ ...defaultReviewSettings, columns: 3 }));
        expect(readPreferences(localStorage, groupedSchema)).toEqual({
            settings: { ...defaultReviewSettings, columns: 3 }, order,
            objectExpansion: { "/Group~1~0": true, "/Other": false },
        });
    });

    it("keeps azd-hosted object expansion session-only without changing saved order or browser preferences", () => {
        const order = { $root: ["/Other", "/Group~1~0"] };
        writePreferences(localStorage, groupedSchema, { settings: { ...defaultReviewSettings }, order: {},
            objectExpansion: { "/Group~1~0": true } });
        const before = localStorage.getItem(preferenceKey(groupedSchema));
        const onFieldOrderChange = vi.fn();
        const { result } = renderHook(() => useReviewPreferences({ ...base, fieldOrder: order, onFieldOrderChange },
            grouped, "2025-11-01", undefined, defaultReviewSettings, true));
        expect(result.current.objectExpansion).toBeUndefined();
        act(() => result.current.changeObjectExpansion([group!], false));
        expect(result.current.order).toEqual(order);
        expect(onFieldOrderChange).not.toHaveBeenCalled();
        expect(localStorage.getItem(preferenceKey(groupedSchema))).toBe(before);
    });
});

describe("controlled and browser-owned field order", () => {
    it("changes unsaved mode defaults without overwriting a saved layout or confidence setting", () => {
        const comparisonDefaults = { ...defaultReviewSettings, paneRatio: 0.45 };
        const { result, rerender } = renderHook(({ defaults }) =>
            useReviewPreferences(base, content, "2025-11-01", undefined, defaults),
        { initialProps: { defaults: defaultReviewSettings } });
        rerender({ defaults: comparisonDefaults });
        expect(result.current.settings.paneRatio).toBe(0.45);
        expect(localStorage.length).toBe(0);
        act(() => result.current.changeSettings({ ...result.current.settings, paneRatio: 0.62, columns: 3 }));
        const saved = localStorage.getItem(preferenceKey(schema));
        rerender({ defaults: defaultReviewSettings });
        expect(result.current.settings).toMatchObject({ paneRatio: 0.62, columns: 3 });
        rerender({ defaults: comparisonDefaults });
        expect(result.current.settings).toMatchObject({ paneRatio: 0.62, columns: 3 });
        expect(localStorage.getItem(preferenceKey(schema))).toBe(saved);
        act(() => result.current.reset());
        expect(result.current.settings.paneRatio).toBe(0.45);
    });

    it("gives a saved same-schema order precedence over the initial configuration", () => {
        writePreferences(localStorage, schema, { settings: { ...defaultReviewSettings }, order: { $root: ["/B", "/A"] } });
        const { result } = renderHook(() => useReviewPreferences({ ...base, defaultFieldOrder: { $root: ["/A"] } }, content, "2025-11-01", undefined));
        expect(result.current.order).toEqual({ $root: ["/B", "/A"] });
        act(() => result.current.changeOrder({ $root: ["/A", "/B"] }));
        expect(readPreferences(localStorage, schema)?.order).toEqual({ $root: ["/A", "/B"] });
    });
    it("emits immutable controlled changes without writing the host order to browser storage", () => {
        const onFieldOrderChange = vi.fn();
        const fieldOrder: ViewerFieldOrder = { $root: ["/A", "/B"] };
        const set = vi.spyOn(Storage.prototype, "setItem");
        const { result } = renderHook(() => useReviewPreferences({ ...base, fieldOrder, onFieldOrderChange }, content, "2025-11-01", undefined));
        act(() => result.current.changeOrder({ $root: ["/B", "/A"] }));
        expect(onFieldOrderChange).toHaveBeenCalledWith({ $root: ["/B", "/A"] });
        expect(result.current.order).toEqual(fieldOrder);
        expect(set).not.toHaveBeenCalled();
        act(() => result.current.changeSettings({ ...result.current.settings, columns: 3 }));
        expect(readPreferences(localStorage, schema)?.order).toEqual({});
    });
    it("keeps controlled order read-only without a handler and reports invalid configuration", () => {
        const { result, rerender } = renderHook(({ fieldOrder }) =>
            useReviewPreferences({ ...base, fieldOrder }, content, "2025-11-01", undefined),
        { initialProps: { fieldOrder: { $root: ["/A"] } } });
        expect(result.current.orderReadOnly).toBe(true);
        rerender({ fieldOrder: { $root: ["/A/B"] } });
        expect(result.current.error).toContain("configuration");
    });
    it("does not overwrite corrupt preferences until explicit reset", () => {
        localStorage.setItem(preferenceKey(schema), "{broken");
        const { result } = renderHook(() => useReviewPreferences(base, content, "2025-11-01", undefined));
        expect(result.current.error).toContain("could not be read");
        act(() => result.current.changeSettings({ ...result.current.settings, columns: 3 }));
        expect(localStorage.getItem(preferenceKey(schema))).toBe("{broken");
        act(() => result.current.reset());
        expect(result.current.error).toBeNull();
        expect(result.current.settings.columns).toBe(2);
        expect(readPreferences(localStorage, schema)?.settings.columns).toBe(2);
    });
    it("loads legacy category masks without hidden filters and persists only the remaining settings", () => {
        const text = JSON.stringify({ format: "cu-viewer-review", version: 1, schema,
            settings: { ...defaultReviewSettings, threshold: 0.699, showTables: false,
                sourceCategories: { field: false, table: false, lowField: false, lowTable: false, unavailable: false } },
            order: { $root: ["/B", "/A"] } });
        localStorage.setItem(preferenceKey(schema), text);
        const first = renderHook(() => useReviewPreferences(base, content, "2025-11-01", undefined));
        expect(first.result.current.settings).toEqual({ ...defaultReviewSettings, threshold: 0.699, showTables: false });
        expect(first.result.current.order).toEqual({ $root: ["/B", "/A"] });
        expect(localStorage.getItem(preferenceKey(schema))).toBe(text);
        act(() => first.result.current.changeSettings({ ...first.result.current.settings, showFields: false }));
        act(() => first.result.current.changeSettings({ ...first.result.current.settings, showFields: true }));
        expect(localStorage.getItem(preferenceKey(schema))).not.toContain("sourceCategories");
        first.unmount();
        const second = renderHook(() => useReviewPreferences(base, content, "2025-11-01", undefined));
        expect(second.result.current.settings).toEqual({ ...defaultReviewSettings, threshold: 0.699, showTables: false });
        act(() => second.result.current.reset());
        expect(second.result.current.settings).toEqual(defaultReviewSettings);
    });
    it("blocks malformed stored categories until reset rather than silently replacing them", () => {
        const text = JSON.stringify({ format: "cu-viewer-review", version: 1, schema,
            settings: { ...defaultReviewSettings, sourceCategories: { field: "invalid" } }, order: {} });
        localStorage.setItem(preferenceKey(schema), text);
        const { result } = renderHook(() => useReviewPreferences(base, content, "2025-11-01", undefined));
        expect(result.current.error).toContain("source highlight categories");
        act(() => result.current.changeSettings({ ...result.current.settings, showFields: false }));
        expect(localStorage.getItem(preferenceKey(schema))).toBe(text);
        act(() => result.current.reset());
        expect(result.current.error).toBeNull();
        expect(readPreferences(localStorage, schema)?.settings).toEqual(defaultReviewSettings);
    });
});
