import type { ViewerSource } from "../index";
import type { PageSize } from "./geometry";
import { createPdfSource } from "./pdfSource";
import { createImageSource, detectImageFormat } from "./imageSource";

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
    detectImageFormat(bytes);
    return "image";
}

export async function readSource(source: ViewerSource, signal: AbortSignal): Promise<ArrayBuffer> {
    abortIfNeeded(signal);
    let bytes: ArrayBuffer;
    if (typeof source === "string") {
        const url = new URL(source);
        if (!["http:", "https:", "blob:"].includes(url.protocol)) {
            throw new Error("Source strings must be HTTP, HTTPS or host-owned blob URLs, not filesystem or data URLs.");
        }
        const response = await fetch(url, { signal, credentials: "same-origin" });
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

export async function loadSource(source: ViewerSource, signal: AbortSignal): Promise<LoadedSource> {
    const bytes = await readSource(source, signal);
    const kind = detectSource(new Uint8Array(bytes));
    return kind === "pdf" ? createPdfSource(bytes, sourceName(source), signal) :
        createImageSource(bytes, sourceName(source), signal);
}
