import { abortIfNeeded } from "./source";

export async function decodeHeif(bytes: ArrayBuffer, signal: AbortSignal): Promise<ImageBitmap> {
    abortIfNeeded(signal);
    const pixels = await new Promise<ImageData>((resolve, reject) => {
        let worker: Worker | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let settled = false;
        const finish = (error: Error | null, value?: ImageData): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal.removeEventListener("abort", abort);
            if (worker) {
                worker.onmessage = null;
                worker.onerror = null;
                worker.onmessageerror = null;
                worker.terminate();
            }
            if (error) reject(error);
            else if (value) resolve(value);
            else reject(new Error("The HEIF worker produced no image."));
        };
        const abort = (): void => finish(new DOMException("HEIF decoding was cancelled.", "AbortError"));
        try {
            const assetDirectory = "./heif/";
            const resources = new URL(assetDirectory, import.meta.url);
            if (!resources.pathname.endsWith("/")) resources.pathname += "/";
            worker = new Worker(new URL("heif.worker.js", resources), { type: "classic" });
            worker.onerror = event => {
                event.preventDefault();
                finish(new Error(event.message || "The HEIF decoder worker failed."));
            };
            worker.onmessageerror = () => finish(new Error("The HEIF worker response could not be read."));
            worker.onmessage = (event: MessageEvent<unknown>) => {
                const data = event.data;
                if (data && typeof data === "object" && "type" in data) {
                    if (data.type === "error" && "message" in data && typeof data.message === "string") {
                        finish(new Error(data.message));
                        return;
                    }
                    if (data.type === "decoded" && "width" in data && "height" in data && "rgba" in data &&
                        typeof data.width === "number" && typeof data.height === "number" &&
                        Number.isSafeInteger(data.width) && data.width > 0 && Number.isSafeInteger(data.height) && data.height > 0 &&
                        data.rgba instanceof ArrayBuffer && data.rgba.byteLength === data.width * data.height * 4) {
                        try {
                            finish(null, new ImageData(new Uint8ClampedArray(data.rgba), data.width, data.height));
                        } catch (error) {
                            finish(error instanceof Error ? error : new Error(String(error)));
                        }
                        return;
                    }
                }
                finish(new Error("The HEIF worker returned an invalid image response."));
            };
            signal.addEventListener("abort", abort, { once: true });
            timer = setTimeout(() => finish(new Error("HEIF decoding exceeded the 30-second deadline.")), 30000);
            const owned = bytes.slice(0);
            worker.postMessage({ bytes: owned }, [owned]);
        } catch (error) {
            finish(error instanceof Error ? error : new Error(String(error)));
        }
    });
    abortIfNeeded(signal);
    return createImageBitmap(pixels);
}
