import type { BrowserContext, Page, Request } from "@playwright/test";

interface SourceResources {
    workersCreated: number;
    workersTerminated: number;
    bitmapsCreated: number;
    bitmapsClosed: number;
    urlsCreated: number;
    urlsRevoked: number;
}

declare global {
    interface Window {
        cuSourceResources: SourceResources;
        cuHoldImageDecode: boolean;
        cuReleaseImageDecode: () => void;
    }
}

export async function trackSourceResources(page: Page): Promise<void> {
    await page.addInitScript(() => {
        const metrics = { workersCreated: 0, workersTerminated: 0, bitmapsCreated: 0, bitmapsClosed: 0, urlsCreated: 0, urlsRevoked: 0 };
        window.cuSourceResources = metrics;
        window.cuHoldImageDecode = false;
        let releaseImages!: () => void;
        const imageGate = new Promise<void>(resolve => { releaseImages = resolve; });
        window.cuReleaseImageDecode = () => {
            window.cuHoldImageDecode = false;
            releaseImages();
        };
        const workers = new Set<Worker>();
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker {
            constructor(url: string | URL, options?: WorkerOptions) {
                super(url, options);
                workers.add(this);
                metrics.workersCreated++;
            }
            override terminate(): void {
                if (workers.delete(this)) metrics.workersTerminated++;
                super.terminate();
            }
        };
        const bitmaps = new Set<ImageBitmap>();
        const nativeBitmap = window.createImageBitmap.bind(window);
        window.createImageBitmap = new Proxy(nativeBitmap, {
            async apply(target, _receiver: unknown, args: Parameters<typeof nativeBitmap>) {
                const bitmap = await target(...args);
                bitmaps.add(bitmap);
                metrics.bitmapsCreated++;
                const close = bitmap.close.bind(bitmap);
                bitmap.close = () => {
                    if (bitmaps.delete(bitmap)) metrics.bitmapsClosed++;
                    close();
                };
                if (window.cuHoldImageDecode) await imageGate;
                return bitmap;
            },
        });
        const urls = new Set<string>();
        const createUrl = URL.createObjectURL.bind(URL);
        URL.createObjectURL = value => {
            const url = createUrl(value);
            urls.add(url);
            metrics.urlsCreated++;
            return url;
        };
        const revokeUrl = URL.revokeObjectURL.bind(URL);
        URL.revokeObjectURL = url => {
            if (urls.delete(url)) metrics.urlsRevoked++;
            revokeUrl(url);
        };
    });
}

export async function alive(page: Page): Promise<{ workers: number; bitmaps: number; urls: number }> {
    return page.evaluate(() => {
        const counts = window.cuSourceResources;
        return {
            workers: counts.workersCreated - counts.workersTerminated,
            bitmaps: counts.bitmapsCreated - counts.bitmapsClosed,
            urls: counts.urlsCreated - counts.urlsRevoked,
        };
    });
}

export async function monitorSourceRaster(page: Page) {
    return page.getByTestId("rendered-page").evaluateHandle(frame => {
        const canvas = frame.querySelector("canvas"), viewport = frame.closest(".cu-document-container");
        const pane = frame.closest(".cu-source-pane");
        const probe = document.createElement("canvas");
        probe.width = probe.height = 48;
        const context = probe.getContext("2d", { willReadFrequently: true });
        if (!canvas || !context || !viewport || !pane) throw new Error("Painted source probe is unavailable.");
        const stats = { frames: 0, hidden: 0, loading: 0, blank: 0, pending: 0, staleLayers: 0, minWidth: Infinity, maxWidth: 0 };
        let frameId = 0;
        const sample = (): void => {
            stats.frames++;
            const bounds = frame.getBoundingClientRect();
            if (getComputedStyle(frame).visibility !== "visible" || bounds.width <= 0 || bounds.height <= 0) stats.hidden++;
            if (viewport.querySelector(".cu-source-state")) stats.loading++;
            if (pane.getAttribute("aria-busy") === "true") {
                stats.pending++;
                if (viewport.querySelector(".cu-overlay, .cu-source-popover")) stats.staleLayers++;
            }
            stats.minWidth = Math.min(stats.minWidth, bounds.width);
            stats.maxWidth = Math.max(stats.maxWidth, bounds.width);
            context.clearRect(0, 0, 48, 48);
            context.drawImage(canvas, 0, 0, 48, 48);
            const pixels = context.getImageData(0, 0, 48, 48).data;
            let ink = 0;
            for (let index = 0; index < pixels.length; index += 4) {
                if (pixels[index + 3]! > 0 && Math.min(pixels[index]!, pixels[index + 1]!, pixels[index + 2]!) < 245) ink++;
            }
            if (ink === 0) stats.blank++;
            frameId = requestAnimationFrame(sample);
        };
        sample();
        return { stats, stop: () => { cancelAnimationFrame(frameId); probe.width = probe.height = 0; } };
    });
}

export async function holdRequest(context: BrowserContext, pattern: string): Promise<{
    started: Promise<void>;
    requests: readonly Request[];
    release: () => Promise<void>;
}> {
    let start!: () => void;
    let finish!: () => void;
    const started = new Promise<void>(resolve => { start = resolve; });
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const pending: Promise<void>[] = [];
    const requests: Request[] = [];
    await context.route(pattern, route => {
        requests.push(route.request());
        start();
        const request = gate.then(() => route.continue());
        pending.push(request);
        return request;
    });
    return { started, requests, release: async () => { finish(); await Promise.all(pending); } };
}
