import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPdfSource } from "./pdfSource";

const mocked = vi.hoisted(() => ({ getDocument: vi.fn(), workerOptions: { workerSrc: "" } }));
vi.mock("pdfjs-dist", () => ({ getDocument: mocked.getDocument, GlobalWorkerOptions: mocked.workerOptions }));

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((fulfilled, failed) => { resolve = fulfilled; reject = failed; });
    return { promise, resolve, reject };
}

beforeEach(() => mocked.getDocument.mockReset());

describe("prototype PDF source lifecycle", () => {
    it("loads page metadata with local resources and disposes the loading task only once", async () => {
        const destroy = vi.fn().mockResolvedValue(undefined);
        const document = {
            numPages: 2,
            getPage: vi.fn((pageNumber: number) => Promise.resolve({
                getViewport: () => ({ width: pageNumber === 1 ? 816 : 793.7, height: 1056 }),
            })),
        };
        const task = { promise: Promise.resolve(document), destroy, onPassword: undefined };
        mocked.getDocument.mockReturnValue(task);
        const source = await createPdfSource(new ArrayBuffer(8), "two-pages.pdf", new AbortController().signal);
        expect(source.pages).toEqual([
            { pageNumber: 1, width: 816, height: 1056 },
            { pageNumber: 2, width: 793.7, height: 1056 },
        ]);
        const options: unknown = mocked.getDocument.mock.calls[0]?.[0];
        if (typeof options !== "object" || options === null ||
            !("standardFontDataUrl" in options) || !("cMapUrl" in options) || !("stopAtErrors" in options)) {
            throw new Error("Expected local PDF loading options.");
        }
        expect(options.stopAtErrors).toBe(true);
        expect(options.standardFontDataUrl).toEqual(expect.stringContaining("pdfjs/standard_fonts/"));
        expect(options.cMapUrl).toEqual(expect.stringContaining("pdfjs/cmaps/"));
        expect(mocked.workerOptions.workerSrc).toContain("pdfjs/build/pdf.worker.mjs");
        await source.dispose();
        await source.dispose();
        expect(destroy).toHaveBeenCalledTimes(1);
    });

    it("cancels a pending PDF load and rejects with an AbortError", async () => {
        const pending = deferred<never>();
        const destroy = vi.fn(() => { pending.reject(new Error("loading stopped")); return Promise.resolve(); });
        const controller = new AbortController();
        const task = { promise: pending.promise, destroy, onPassword: undefined };
        mocked.getDocument.mockReturnValue(task);
        const loading = createPdfSource(new ArrayBuffer(8), "pending.pdf", controller.signal);
        await vi.waitFor(() => expect(mocked.getDocument).toHaveBeenCalledTimes(1));
        controller.abort();
        await expect(loading).rejects.toMatchObject({ name: "AbortError" });
        expect(destroy).toHaveBeenCalledTimes(1);
    });

    it("surfaces a failed load and releases owned resources", async () => {
        const destroy = vi.fn().mockResolvedValue(undefined);
        mocked.getDocument.mockReturnValue({ promise: Promise.reject(new Error("invalid PDF")), destroy });
        await expect(createPdfSource(new ArrayBuffer(8), "invalid.pdf", new AbortController().signal)).rejects.toThrow("invalid PDF");
        expect(destroy).toHaveBeenCalledTimes(1);
    });

    it("reports a password-required source without waiting indefinitely", async () => {
        const pending = deferred<never>();
        const original = new Error("Password required");
        const destroy = vi.fn(() => { pending.reject(original); return Promise.resolve(); });
        const task: { promise: Promise<never>; destroy: typeof destroy; onPassword?: () => void } = {
            promise: pending.promise, destroy,
        };
        mocked.getDocument.mockReturnValue(task);
        const loading = createPdfSource(new ArrayBuffer(8), "encrypted.pdf", new AbortController().signal);
        await vi.waitFor(() => expect(task.onPassword).toBeTypeOf("function"));
        task.onPassword?.();
        await expect(loading).rejects.toMatchObject({
            message: "Password-protected PDF input is not supported in this prototype.",
            cause: original,
        });
        expect(destroy).toHaveBeenCalledTimes(1);
    });
});
