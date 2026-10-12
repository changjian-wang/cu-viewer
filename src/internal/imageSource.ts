import type { LoadedSource } from "./source";
import { abortIfNeeded } from "./source";
import { getRasterSize } from "./geometry";
import { decodeHeif } from "./heifSource";

export type ImageFormat = "png" | "jpeg" | "bmp" | "heif";
const heifBrands = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1"]);

export function detectImageFormat(bytes: Uint8Array): ImageFormat {
    const png = [137, 80, 78, 71, 13, 10, 26, 10];
    if (png.every((value, index) => bytes[index] === value)) return "png";
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpeg";
    if (bytes[0] === 66 && bytes[1] === 77) return "bmp";
    const text = new TextDecoder("ascii");
    if (bytes.length >= 16 && text.decode(bytes.subarray(4, 8)) === "ftyp") {
        const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
        if (size < 16 || size > bytes.length || size % 4 !== 0) throw new Error("Invalid HEIF file-type box.");
        const brands = [text.decode(bytes.subarray(8, 12))];
        for (let offset = 16; offset < size; offset += 4) brands.push(text.decode(bytes.subarray(offset, offset + 4)));
        if (brands.includes("avif") || brands.includes("avis")) throw new Error("AVIF is not a supported P0 source.");
        if (brands.includes("msf1")) throw new Error("HEIF image sequences are not supported; provide a still primary image.");
        if (brands.some(brand => heifBrands.has(brand))) return "heif";
    }
    throw new Error("The supplied image is unsupported or corrupt. Supported sources are PNG, JPEG, BMP and development-only HEIF/HEIC.");
}

export async function createImageSource(bytes: ArrayBuffer, name: string, signal: AbortSignal): Promise<LoadedSource> {
    abortIfNeeded(signal);
    const format = detectImageFormat(new Uint8Array(bytes));
    const image = format === "heif" ? await decodeHeif(bytes, signal) :
        await createImageBitmap(new Blob([bytes], { type: format === "jpeg" ? "image/jpeg" : `image/${format}` }),
            { imageOrientation: "from-image" });
    if (signal.aborted) {
        image.close();
        abortIfNeeded(signal);
    }
    let disposed = false;
    const page = { pageNumber: 1, width: image.width, height: image.height };
    return {
        kind: "image", name, pages: [page],
        render(pageNumber, canvas, zoom, rotation, renderSignal) {
            abortIfNeeded(renderSignal);
            if (disposed) throw new Error("The image source has been disposed.");
            if (pageNumber !== 1) throw new Error("The image has only one page.");
            const swapped = rotation % 180 !== 0;
            const size = { width: (swapped ? image.height : image.width) * zoom, height: (swapped ? image.width : image.height) * zoom };
            const raster = getRasterSize(size, window.devicePixelRatio);
            canvas.width = raster.width;
            canvas.height = raster.height;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Canvas rendering is unavailable.");
            context.scale(window.devicePixelRatio * zoom, window.devicePixelRatio * zoom);
            if (rotation === 90) context.translate(image.height, 0);
            if (rotation === 180) context.translate(image.width, image.height);
            if (rotation === 270) context.translate(0, image.width);
            context.rotate(rotation * Math.PI / 180);
            context.drawImage(image, 0, 0);
            return Promise.resolve(size);
        },
        dispose() {
            if (!disposed) image.close();
            disposed = true;
            return Promise.resolve();
        },
    };
}
