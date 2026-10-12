import { describe, expect, it, vi } from "vitest";
import { detectSource, hasSourcePage, readSource, sourceName, unavailableSourcePageMessage } from "./source";

describe("prototype source boundary", () => {
    it("checks actual source page identities instead of treating all result pages as available", () => {
        const pages = [
            { pageNumber: 1, width: 816, height: 1056 },
            { pageNumber: 4, width: 793.7, height: 1122.5 },
        ];
        expect(hasSourcePage(pages, 1)).toBe(true);
        expect(hasSourcePage(pages, 4)).toBe(true);
        expect(hasSourcePage(pages, 2)).toBe(false);
        expect(hasSourcePage(pages, 5)).toBe(false);
        expect(unavailableSourcePageMessage(5)).toContain("Page 5 is not present in the loaded source");
    });

    it("does not claim a page is available before its source or region is known", () => {
        expect(hasSourcePage(undefined, 1)).toBe(false);
        expect(hasSourcePage([], 1)).toBe(false);
        expect(hasSourcePage([{ pageNumber: 1, width: 100, height: 100 }], undefined)).toBe(false);
    });

    it("detects supported files from content instead of filenames", () => {
        expect(detectSource(new TextEncoder().encode("%PDF-1.7\n"))).toBe("pdf");
        expect(detectSource(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).toBe("image");
        expect(detectSource(new Uint8Array([255, 216, 255, 224]))).toBe("image");
        expect(detectSource(new Uint8Array([66, 77, 0, 0]))).toBe("image");
        expect(() => detectSource(new Uint8Array([1, 2, 3, 4]))).toThrow("unsupported or corrupt");
    });

    it("recognizes a valid HEIF file-type box without trusting an extension", () => {
        const bytes = new Uint8Array([0, 0, 0, 16, ...new TextEncoder().encode("ftypheic"), 0, 0, 0, 0]);
        expect(detectSource(bytes)).toBe("image");
    });

    it("does not transfer or mutate host-owned ArrayBuffer input", async () => {
        const bytes = new Uint8Array([1, 2, 3]).buffer;
        const result = await readSource(bytes, new AbortController().signal);
        expect(result).not.toBe(bytes);
        expect([...new Uint8Array(result)]).toEqual([1, 2, 3]);
        expect(bytes.byteLength).toBe(3);
    });

    it("accepts browser File and Blob inputs without SDK objects", async () => {
        const source = new File(["source"], "sample.pdf");
        expect(sourceName(source)).toBe("sample.pdf");
        expect(new TextDecoder().decode(await readSource(source, new AbortController().signal))).toBe("source");
    });

    it("rejects empty sources and cancelled reads explicitly", async () => {
        await expect(readSource(new Blob(), new AbortController().signal)).rejects.toThrow("empty");
        const controller = new AbortController();
        controller.abort();
        await expect(readSource(new ArrayBuffer(4), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    });

    it("rejects filesystem/data URLs and propagates URL loading errors", async () => {
        await expect(readSource("data:application/pdf;base64,AAAA", new AbortController().signal)).rejects.toThrow("Source strings");
        await expect(readSource("file:///C:/sample.pdf", new AbortController().signal)).rejects.toThrow("Source strings");
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("missing", { status: 404 }));
        try {
            await expect(readSource("https://example.invalid/sample.pdf", new AbortController().signal)).rejects.toThrow("404");
            expect(fetchMock).toHaveBeenCalledTimes(1);
        } finally {
            fetchMock.mockRestore();
        }
    });
});
