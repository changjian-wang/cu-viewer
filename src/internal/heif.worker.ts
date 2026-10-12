interface HeifImage {
    is_primary(): boolean;
    get_width(): number;
    get_height(): number;
    display(pixels: ImageData, callback: (result: ImageData | null) => void): void;
    free(): void;
}

interface HeifModule {
    HeifDecoder: new () => { decode(bytes: Uint8Array): HeifImage[] };
}

declare const libheif: () => Promise<HeifModule>;

async function decode(event: MessageEvent<unknown>): Promise<void> {
    let images: HeifImage[] = [];
    try {
        const data = event.data;
        if (!data || typeof data !== "object" || !("bytes" in data) ||
            !(data.bytes instanceof ArrayBuffer) || data.bytes.byteLength === 0) {
            throw new Error("Nonempty owned HEIF bytes are required.");
        }
        try {
            importScripts(new URL("./heif-codec/libheif-asm.js", self.location.href).href);
        } catch (error) {
            throw new Error("The local HEIF decoder could not be loaded. Configure CU_HEIF_DEV_ASSET_DIR for development validation.", { cause: error });
        }
        if (typeof libheif !== "function") throw new Error("The local libheif factory is unavailable.");
        const module = await libheif();
        images = new module.HeifDecoder().decode(new Uint8Array(data.bytes));
        const primary = images.filter(image => image.is_primary());
        if (primary.length !== 1) throw new Error("Exactly one declared primary HEIF image is required.");
        const image = primary[0];
        if (!image) throw new Error("The primary HEIF image is missing.");
        const width = image.get_width();
        const height = image.get_height();
        if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
            !Number.isSafeInteger(width * height * 4)) {
            throw new Error("The primary HEIF image has invalid dimensions.");
        }
        const pixels = new ImageData(width, height);
        for (let index = 3; index < pixels.data.length; index += 4) pixels.data[index] = 255;
        const displayed = await new Promise<ImageData>((resolve, reject) => {
            image.display(pixels, result => {
                if (result) resolve(result);
                else reject(new Error("HEIF pixel conversion failed."));
            });
        });
        const rgba = displayed.data.buffer;
        self.postMessage({ type: "decoded", width, height, rgba }, [rgba]);
    } catch (error) {
        self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
        for (const image of images) image.free();
    }
}

self.addEventListener("message", (event: MessageEvent<unknown>) => {
    void decode(event).catch((error: unknown) => {
        self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
    });
});
