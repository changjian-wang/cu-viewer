import type { ViewerSource } from "../index";
import type { PageSize } from "./geometry";
import { getRasterSize } from "./geometry";
import { createPdfSource } from "./pdfSource";

export interface SourcePage extends PageSize {
    pageNumber: number;
}

export interface LoadedSource {
    kind: "pdf" | "image";
    name: string;
    pages: SourcePage[];
    render(pageNumber: number, canvas: HTMLCanvasElement, zoom: number, rotation: number, signal: AbortSignal): Promise<PageSize>;
    dispose(): Promise<void>;
}

export function hasSourcePage(pages: readonly SourcePage[] | undefined, pageNumber: number | undefined): boolean {
    return Boolean(pages?.some(page => page.pageNumber === pageNumber));
}

export function unavailableSourcePageMessage(pageNumber: number): string {
    return `Page ${pageNumber} is not present in the loaded source. Check that the source file matches the saved result.`;
}

export function abortIfNeeded(signal: AbortSignal): void {
    if (signal.aborted) throw new DOMException("Source operation was cancelled.", "AbortError");
}

export function sourceName(source: ViewerSource): string {
    if (source instanceof File) return source.name;
    if (typeof source === "string") {
        const url = new URL(source);
        return decodeURIComponent(url.pathname.split("/").pop() || "Source document");
    }
    return "Source document";
}

export function detectSource(bytes: Uint8Array): "pdf" | "image" {
    const header = new TextDecoder("ascii").decode(bytes.subarray(0, 1024));
    if (header.includes("%PDF-")) return "pdf";
    const png = [137, 80, 78, 71, 13, 10, 26, 10];
    if (png.every((value, index) => bytes[index] === value) ||
        (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
        (bytes[0] === 66 && bytes[1] === 77)) return "image";
    if (header.slice(4, 8) === "ftyp") {
        throw new Error("HEIF/HEIC decoding is not integrated in this prototype yet; its licensed worker remains a separate investigation.");
    }
    throw new Error("This prototype can preview PDF, PNG, JPEG and BMP content. The supplied file is unsupported or corrupt.");
}

export async function readSource(source: ViewerSource, signal: AbortSignal): Promise<ArrayBuffer> {
    abortIfNeeded(signal);
    let bytes: ArrayBuffer;
    if (typeof source === "string") {
        const url = new URL(source);
        if (!["http:", "https:", "blob:"].includes(url.protocol)) {
            throw new Error("Source strings must be HTTP, HTTPS or host-owned blob URLs, not filesystem or data URLs.");
        }
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error(`Source request failed (${response.status}).`);
        bytes = await response.arrayBuffer();
    } else if (source instanceof Blob) {
        bytes = await source.arrayBuffer();
    } else {
        bytes = source.slice(0);
    }
    abortIfNeeded(signal);
    if (bytes.byteLength === 0) throw new Error("The source file is empty.");
    return bytes;
}

async function createImageSource(bytes: ArrayBuffer, name: string, signal: AbortSignal): Promise<LoadedSource> {
    const image = await createImageBitmap(new Blob([bytes]));
    if (signal.aborted) {
        image.close();
        abortIfNeeded(signal);
    }
    let disposed = false;
    const page = { pageNumber: 1, width: image.width, height: image.height };
    return {
        kind: "image",
        name,
        pages: [page],
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

export async function loadSource(source: ViewerSource, signal: AbortSignal): Promise<LoadedSource> {
    const bytes = await readSource(source, signal);
    const kind = detectSource(new Uint8Array(bytes));
    return kind === "pdf" ? createPdfSource(bytes, sourceName(source), signal) :
        createImageSource(bytes, sourceName(source), signal);
}
