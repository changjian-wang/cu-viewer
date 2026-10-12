import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeHeif } from "./heifSource";

class TestWorker {
    static created: TestWorker[] = [];
    onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
    onerror: ((event: { message: string; preventDefault(): void }) => void) | null = null;
    onmessageerror: (() => void) | null = null;
    terminate = vi.fn();
    postMessage = vi.fn();
    constructor(readonly url: URL, readonly options: WorkerOptions) {
        TestWorker.created.push(this);
    }
}

beforeEach(() => {
    TestWorker.created = [];
    vi.stubGlobal("Worker", TestWorker);
    vi.stubGlobal("ImageData", class {
        constructor(readonly data: Uint8ClampedArray, readonly width: number, readonly height: number) {}
    });
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 2, height: 1, close: vi.fn() }));
    vi.stubEnv("DEV", true);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

function worker(): TestWorker {
    const value = TestWorker.created[0];
    if (!value) throw new Error("No HEIF worker was created.");
    return value;
}

describe("development-only owned HEIF decoder", () => {
    it("decodes through a local classic worker, copies caller input and terminates after success", async () => {
        const bytes = new Uint8Array([1, 2, 3]).buffer;
        const loading = decodeHeif(bytes, new AbortController().signal);
        const active = worker();
        expect(active.url.pathname).toContain("heif.worker.ts");
        expect(active.options.type).toBe("classic");
        const message: unknown = active.postMessage.mock.calls[0]?.[0];
        if (!message || typeof message !== "object" || !("bytes" in message)) throw new Error("Missing owned input.");
        expect(message.bytes).not.toBe(bytes);
        expect(message.bytes).toEqual(bytes);
        active.onmessage?.(new MessageEvent("message", { data: { type: "decoded", width: 2, height: 1, rgba: new ArrayBuffer(8) } }));
        await expect(loading).resolves.toMatchObject({ width: 2, height: 1 });
        expect(bytes.byteLength).toBe(3);
        expect(active.terminate).toHaveBeenCalledTimes(1);
        expect(active.onmessage).toBeNull();
    });

    it("rejects production decoding without creating a worker or relying on hidden assets", async () => {
        vi.stubEnv("DEV", false);
        await expect(decodeHeif(new ArrayBuffer(1), new AbortController().signal)).rejects.toThrow("development-only");
        expect(TestWorker.created).toHaveLength(0);
    });

    it("does not create a worker for an already cancelled input", async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(decodeHeif(new ArrayBuffer(1), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
        expect(TestWorker.created).toHaveLength(0);
    });

    it("terminates a pending worker on abort", async () => {
        const controller = new AbortController();
        const loading = decodeHeif(new ArrayBuffer(1), controller.signal);
        const active = worker();
        controller.abort();
        await expect(loading).rejects.toMatchObject({ name: "AbortError" });
        expect(active.terminate).toHaveBeenCalledTimes(1);
    });

    it.each([
        {},
        { type: "decoded", width: 2, height: 1, rgba: new ArrayBuffer(4) },
        { type: "decoded", width: 0, height: 1, rgba: new ArrayBuffer(0) },
        { type: "decoded", width: Infinity, height: 1, rgba: new ArrayBuffer(0) },
    ])("rejects invalid worker data and releases its worker (%j)", data => {
        const loading = decodeHeif(new ArrayBuffer(1), new AbortController().signal);
        const active = worker();
        active.onmessage?.(new MessageEvent("message", { data }));
        expect(active.terminate).toHaveBeenCalledTimes(1);
        return expect(loading).rejects.toThrow("invalid image response");
    });

    it("surfaces a decoder error and terminates", async () => {
        const loading = decodeHeif(new ArrayBuffer(1), new AbortController().signal);
        const active = worker();
        active.onmessage?.(new MessageEvent("message", { data: { type: "error", message: "Exactly one declared primary HEIF image is required." } }));
        await expect(loading).rejects.toThrow("primary");
        expect(active.terminate).toHaveBeenCalledTimes(1);
    });

    it("surfaces worker startup and message failures", async () => {
        const first = decodeHeif(new ArrayBuffer(1), new AbortController().signal);
        const active = worker();
        const preventDefault = vi.fn();
        active.onerror?.({ message: "Worker loading failed", preventDefault });
        await expect(first).rejects.toThrow("Worker loading failed");
        expect(preventDefault).toHaveBeenCalledTimes(1);
        expect(active.terminate).toHaveBeenCalledTimes(1);
        TestWorker.created = [];
        const second = decodeHeif(new ArrayBuffer(1), new AbortController().signal);
        const next = worker();
        next.onmessageerror?.();
        await expect(second).rejects.toThrow("could not be read");
        expect(next.terminate).toHaveBeenCalledTimes(1);
    });

    it("terminates a hung decode at the explicit development deadline", async () => {
        vi.useFakeTimers();
        const loading = decodeHeif(new ArrayBuffer(1), new AbortController().signal);
        const rejected = expect(loading).rejects.toThrow("30-second");
        await vi.advanceTimersByTimeAsync(30000);
        await rejected;
        expect(worker().terminate).toHaveBeenCalledTimes(1);
    });
});
