import { afterEach, describe, expect, it, vi } from "vitest";
import { createImageSource, detectImageFormat } from "./imageSource";
import { decodeHeif } from "./heifSource";

vi.mock("./heifSource", () => ({ decodeHeif: vi.fn() }));

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer;

function heif(major = "heic", compatible: string[] = []): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(16 + compatible.length * 4);
    new DataView(bytes.buffer).setUint32(0, bytes.length);
    bytes.set(new TextEncoder().encode(`ftyp${major}`), 4);
    compatible.forEach((brand, index) => bytes.set(new TextEncoder().encode(brand), 16 + index * 4));
    return bytes;
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
});

describe("image content detection", () => {
    it("detects native formats independently of filename and MIME type", () => {
        expect(detectImageFormat(new Uint8Array(png))).toBe("png");
        expect(detectImageFormat(new Uint8Array([255, 216, 255, 224]))).toBe("jpeg");
        expect(detectImageFormat(new Uint8Array([66, 77, 0, 0]))).toBe("bmp");
    });

    it.each(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1"])("recognizes HEIF brand %s", brand => {
        expect(detectImageFormat(heif(brand))).toBe("heif");
    });

    it("uses compatible brands and honors a nonzero typed-array offset", () => {
        const data = heif("test", ["mif1", "heic"]);
        const buffer = new Uint8Array(data.length + 4);
        buffer.set(data, 4);
        expect(detectImageFormat(buffer.subarray(4))).toBe("heif");
    });

    it.each(["avif", "avis"])("does not mislabel %s as an accepted HEIF source", brand => {
        expect(() => detectImageFormat(heif(brand, ["mif1"]))).toThrow("AVIF");
    });

    it("explicitly rejects image sequences", () => {
        expect(() => detectImageFormat(heif("msf1", ["hevc"]))).toThrow("sequences");
    });

    it.each([0, 8, 17, 128])("rejects invalid file-type box size %s", size => {
        const bytes = heif();
        new DataView(bytes.buffer).setUint32(0, size);
        expect(() => detectImageFormat(bytes)).toThrow("Invalid HEIF");
    });

    it("does not treat arbitrary BMFF or corrupt bytes as an image", () => {
        expect(() => detectImageFormat(heif("mp42"))).toThrow("unsupported or corrupt");
        expect(() => detectImageFormat(new Uint8Array([1, 2, 3]))).toThrow("unsupported or corrupt");
    });
});

describe("common image source lifecycle", () => {
    it("requests EXIF-normalized native decoding and owns exactly one bitmap", async () => {
        const close = vi.fn();
        const image: ImageBitmap = { width: 80, height: 120, close };
        const decode = vi.fn().mockResolvedValue(image);
        vi.stubGlobal("createImageBitmap", decode);
        const source = await createImageSource(png, "portrait.jpg", new AbortController().signal);
        expect(source.pages).toEqual([{ pageNumber: 1, width: 80, height: 120 }]);
        expect(decode).toHaveBeenCalledWith(expect.any(Blob), { imageOrientation: "from-image" });
        const blob: unknown = decode.mock.calls[0]?.[0];
        expect(blob).toBeInstanceOf(Blob);
        if (!(blob instanceof Blob)) throw new Error("Expected a native input Blob.");
        expect(blob.type).toBe("image/png");
        await source.dispose();
        await source.dispose();
        expect(close).toHaveBeenCalledTimes(1);
    });

    it("dispatches HEIF to the owned-worker path instead of attempting native decoding", async () => {
        const close = vi.fn();
        const image: ImageBitmap = { width: 1280, height: 854, close };
        vi.mocked(decodeHeif).mockResolvedValue(image);
        const native = vi.fn();
        vi.stubGlobal("createImageBitmap", native);
        const bytes = heif().buffer;
        const signal = new AbortController().signal;
        const source = await createImageSource(bytes, "example.heic", signal);
        expect(decodeHeif).toHaveBeenCalledWith(bytes, signal);
        expect(native).not.toHaveBeenCalled();
        expect(source.pages).toEqual([{ pageNumber: 1, width: 1280, height: 854 }]);
        await source.dispose();
        expect(close).toHaveBeenCalledTimes(1);
    });

    it("closes a native bitmap whose decoding finishes after cancellation", async () => {
        const controller = new AbortController();
        const close = vi.fn();
        const image: ImageBitmap = { width: 20, height: 10, close };
        vi.stubGlobal("createImageBitmap", vi.fn(() => {
            controller.abort();
            return Promise.resolve(image);
        }));
        await expect(createImageSource(png, "late.png", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
        expect(close).toHaveBeenCalledTimes(1);
    });

    it("closes a HEIF bitmap whose conversion finishes after cancellation", async () => {
        const controller = new AbortController();
        const close = vi.fn();
        const image: ImageBitmap = { width: 20, height: 10, close };
        vi.mocked(decodeHeif).mockImplementation(() => {
            controller.abort();
            return Promise.resolve(image);
        });
        await expect(createImageSource(heif().buffer, "late.heif", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
        expect(close).toHaveBeenCalledTimes(1);
    });

    it("does not start decoding for pre-aborted input", async () => {
        const native = vi.fn();
        vi.stubGlobal("createImageBitmap", native);
        const controller = new AbortController();
        controller.abort();
        await expect(createImageSource(png, "cancelled.png", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
        expect(native).not.toHaveBeenCalled();
    });

    it("propagates native and HEIF decoder failures rather than returning a blank source", async () => {
        vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("Native decode failed")));
        await expect(createImageSource(png, "corrupt.png", new AbortController().signal)).rejects.toThrow("Native decode failed");
        vi.mocked(decodeHeif).mockRejectedValue(new Error("HEIF decode failed"));
        await expect(createImageSource(heif().buffer, "corrupt.heic", new AbortController().signal)).rejects.toThrow("HEIF decode failed");
    });
});
