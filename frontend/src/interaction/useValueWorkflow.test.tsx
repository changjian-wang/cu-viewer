// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CuField } from "../model/types";
import { useValueWorkflow } from "./useValueWorkflow";

const field: CuField = { id: "A", path: "/A", name: "A", type: "string", hasValue: true, value: "A", children: [], regions: [] };
function deferred() {
    let resolve!: () => void, reject!: (error: Error) => void;
    const promise = new Promise<void>((success, failure) => { resolve = success; reject = failure; });
    return { promise, resolve, reject };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); Reflect.deleteProperty(navigator, "clipboard"); });

describe("viewer-scoped asynchronous copy ownership", () => {
    it("requests value focus only for an explicit quick-details action, not subsequent source selections", () => {
        const context = {};
        const { result } = renderHook(() => useValueWorkflow(context));
        act(() => result.current.inspect(field, true));
        const first = result.current.detailsFocusRequest;
        expect(first).toBeTypeOf("number");
        act(() => result.current.select({ ...field, id: "B" }));
        expect(result.current.detailsFocusRequest).toBe(first);
        act(() => result.current.inspect(field, true));
        expect(result.current.detailsFocusRequest).not.toBe(first);
        act(() => result.current.closeDetails());
        expect(result.current.detailsFocusRequest).toBeNull();
        act(() => result.current.inspect(field));
        expect(result.current.detailsFocusRequest).toBeNull();
        act(() => result.current.inspect(field, true));
        act(() => result.current.clear());
        expect(result.current.detailsFocusRequest).toBeNull();
    });
    it("does not let an old success replace a newer failure", async () => {
        const old = deferred(), next = deferred();
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn()
            .mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise) } });
        const context = {};
        const { result } = renderHook(() => useValueWorkflow(context));
        let first!: Promise<void>, second!: Promise<void>;
        act(() => { first = result.current.copy(field); });
        act(() => { second = result.current.copy({ ...field, id: "B", value: "B" }); });
        await act(async () => { next.reject(new Error("denied")); await second; });
        expect(result.current.feedback?.message).toContain("denied");
        await act(async () => { old.resolve(); await first; });
        expect(result.current.feedback?.field.id).toBe("B");
        expect(result.current.feedback?.status).toBe("error");
    });
    it.each(["clear", "same-field select", "details close", "context round-trip", "unmount"])("invalidates old callbacks on %s", async reset => {
        const old = deferred();
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => old.promise } });
        const context = {};
        const { result, rerender, unmount } = renderHook(({ token }) => useValueWorkflow(token), { initialProps: { token: context } });
        let pending!: Promise<void>;
        act(() => { pending = result.current.copy(field); });
        if (reset === "clear") act(() => result.current.clear());
        else if (reset === "same-field select") act(() => result.current.select(field));
        else if (reset === "details close") { act(() => result.current.inspect(field)); act(() => result.current.closeDetails()); }
        else if (reset === "context round-trip") { rerender({ token: {} }); rerender({ token: context }); }
        else unmount();
        await act(async () => { old.resolve(); await pending; });
        if (reset !== "unmount") expect(result.current.feedback).toBeNull();
    });
    it("logs an obsolete failure without replacing a newer success", async () => {
        const old = deferred();
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn()
            .mockReturnValueOnce(old.promise).mockResolvedValueOnce(undefined) } });
        const context = {};
        const { result } = renderHook(() => useValueWorkflow(context));
        let pending!: Promise<void>;
        act(() => { pending = result.current.copy(field); });
        await act(async () => { await result.current.copy({ ...field, id: "B" }); });
        await act(async () => { old.reject(new Error("old denied")); await pending; });
        expect(result.current.feedback?.status).toBe("copied");
        expect(result.current.feedback?.field.id).toBe("B");
        expect(warn).toHaveBeenCalledOnce();
    });
    it("keeps details synchronized with explicit scalar selection and closes them for groups", () => {
        const context = {};
        const { result } = renderHook(() => useValueWorkflow(context));
        act(() => result.current.inspect(field));
        act(() => result.current.select({ ...field, id: "B" }));
        expect(result.current.inspected?.id).toBe("B");
        act(() => result.current.select({ ...field, type: "object" }));
        expect(result.current.inspected).toBeNull();
    });
});
