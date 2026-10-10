import type { LoadedSource, SourcePage } from "./source";
import { abortIfNeeded } from "./source";
import { getRasterSize } from "./geometry";

export async function createPdfSource(bytes: ArrayBuffer, name: string, signal: AbortSignal): Promise<LoadedSource> {
    const pdfjs = await import("pdfjs-dist");
    abortIfNeeded(signal);
    // Keep this a runtime directory URL; Vite's single-asset rewrite drops its trailing slash.
    const assetDirectory = "./pdfjs/";
    const resources = new URL(assetDirectory, import.meta.url);
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("build/pdf.worker.mjs", resources).href;
    const task = pdfjs.getDocument({
        data: new Uint8Array(bytes),
        stopAtErrors: true,
        useSystemFonts: false,
        standardFontDataUrl: new URL("standard_fonts/", resources).href,
        cMapUrl: new URL("cmaps/", resources).href,
        cMapPacked: true,
        wasmUrl: new URL("wasm/", resources).href,
        iccUrl: new URL("iccs/", resources).href,
    });
    let disposed = false;
    let disposal: Promise<void> | undefined;
    let passwordRequired = false;
    const dispose = async (): Promise<void> => {
        disposed = true;
        disposal ??= task.destroy();
        await disposal;
    };
    const cancelLoading = (): void => {
        void dispose().catch((error: unknown) => console.error("PDF loading cancellation failed.", error));
    };
    signal.addEventListener("abort", cancelLoading, { once: true });
    task.onPassword = (): void => {
        passwordRequired = true;
        cancelLoading();
    };
    try {
        const document = await task.promise;
        abortIfNeeded(signal);
        const pages: SourcePage[] = [];
        for (let number = 1; number <= document.numPages; number++) {
            abortIfNeeded(signal);
            const page = await document.getPage(number);
            const size = page.getViewport({ scale: 96 / 72 });
            pages.push({ pageNumber: number, width: size.width, height: size.height });
        }
        return {
            kind: "pdf", name, pages,
            async render(pageNumber, canvas, zoom, rotation, renderSignal) {
                abortIfNeeded(renderSignal);
                if (disposed) throw new Error("The PDF source has been disposed.");
                if (!pages.some(page => page.pageNumber === pageNumber)) throw new Error("The requested PDF page does not exist.");
                const page = await document.getPage(pageNumber);
                abortIfNeeded(renderSignal);
                const viewport = page.getViewport({ scale: 96 / 72 * zoom, rotation: (page.rotate + rotation) % 360 });
                const size = { width: viewport.width, height: viewport.height };
                const raster = getRasterSize(size, window.devicePixelRatio);
                canvas.width = raster.width;
                canvas.height = raster.height;
                const dpr = window.devicePixelRatio;
                const render = page.render({
                    canvas, viewport,
                    ...(dpr === 1 ? {} : { transform: [dpr, 0, 0, dpr, 0, 0] }),
                });
                const cancel = (): void => render.cancel();
                renderSignal.addEventListener("abort", cancel, { once: true });
                try {
                    await render.promise;
                    abortIfNeeded(renderSignal);
                    return size;
                } finally {
                    renderSignal.removeEventListener("abort", cancel);
                }
            },
            dispose,
        };
    } catch (error) {
        await dispose();
        if (signal.aborted) abortIfNeeded(signal);
        if (passwordRequired) throw new Error("Password-protected PDF input is not supported in this prototype.", { cause: error });
        throw error;
    } finally {
        signal.removeEventListener("abort", cancelLoading);
    }
}
