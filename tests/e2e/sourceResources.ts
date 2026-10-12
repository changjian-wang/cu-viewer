import type { BrowserContext, Page } from "@playwright/test";

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

export async function holdRequest(context: BrowserContext, pattern: string): Promise<{ started: Promise<void>; release: () => Promise<void> }> {
    let start!: () => void;
    let finish!: () => void;
    const started = new Promise<void>(resolve => { start = resolve; });
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const pending: Promise<void>[] = [];
    await context.route(pattern, route => {
        start();
        const request = gate.then(() => route.continue());
        pending.push(request);
        return request;
    });
    return { started, release: async () => { finish(); await Promise.all(pending); } };
}
