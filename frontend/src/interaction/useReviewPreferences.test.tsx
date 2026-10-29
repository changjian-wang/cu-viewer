// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseCuResult } from "../model/parseCuResult";
import type { ContentUnderstandingResultViewerProps, ViewerFieldOrder } from "../index";
import { useReviewPreferences } from "./useReviewPreferences";
import { preferenceKey, readPreferences, writePreferences } from "./reviewPreferences";
import { defaultReviewSettings, defaultSourceCategories, schemaIdentity } from "./reviewFields";

const content = parseCuResult({ apiVersion: "2025-11-01", contents: [{ kind: "document",
    fields: { A: { type: "string", valueString: "A" }, B: { type: "string", valueString: "B" } } }] }).contents[0]!;
const base: ContentUnderstandingResultViewerProps = { source: new ArrayBuffer(1), result: {} };
const schema = schemaIdentity(content, "2025-11-01");
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

describe("controlled and browser-owned field order", () => {
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
    it("persists category choices through master changes and remounts until an explicit reset", () => {
        const first = renderHook(() => useReviewPreferences(base, content, "2025-11-01", undefined));
        act(() => first.result.current.changeSettings({ ...first.result.current.settings,
            sourceCategories: { ...defaultSourceCategories, lowField: false, unavailable: false } }));
        act(() => first.result.current.changeSettings({ ...first.result.current.settings, showFields: false }));
        act(() => first.result.current.changeSettings({ ...first.result.current.settings, showFields: true }));
        expect(readPreferences(localStorage, schema)?.settings.sourceCategories.lowField).toBe(false);
        first.unmount();
        const second = renderHook(() => useReviewPreferences(base, content, "2025-11-01", undefined));
        expect(second.result.current.settings.sourceCategories.unavailable).toBe(false);
        expect(second.result.current.settings.showFields).toBe(true);
        act(() => second.result.current.reset());
        expect(second.result.current.settings.sourceCategories).toEqual(defaultSourceCategories);
    });
    it("blocks malformed stored categories until reset rather than silently replacing them", () => {
        const text = JSON.stringify({ format: "cu-viewer-review", version: 1, schema,
            settings: { ...defaultReviewSettings, sourceCategories: { field: "invalid" } }, order: {} });
        localStorage.setItem(preferenceKey(schema), text);
        const { result } = renderHook(() => useReviewPreferences(base, content, "2025-11-01", undefined));
        expect(result.current.error).toContain("source highlight categories");
        act(() => result.current.changeSettings({ ...result.current.settings,
            sourceCategories: { ...defaultSourceCategories, field: false } }));
        expect(localStorage.getItem(preferenceKey(schema))).toBe(text);
        act(() => result.current.reset());
        expect(result.current.error).toBeNull();
        expect(readPreferences(localStorage, schema)?.settings.sourceCategories).toEqual(defaultSourceCategories);
    });
});
