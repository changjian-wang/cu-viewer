import { afterEach, beforeEach } from "vitest";
import { MarkdownWorkerHost } from "./src/markdown/workerHost";

class TestMarkdownWorker {
    static readonly active = new Set<TestMarkdownWorker>();
    onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null;
    private terminated = false;
    private readonly host = new MarkdownWorkerHost(data => {
        if (!this.terminated) this.onmessage?.(new MessageEvent("message", { data }));
    });

    constructor(url: string | URL) {
        if (!String(url).endsWith("/markdown.worker.js")) throw new Error("This unit-test worker only handles Markdown.");
        TestMarkdownWorker.active.add(this);
    }
    postMessage(data: unknown): void {
        queueMicrotask(() => { if (!this.terminated) void this.host.handle(data); });
    }
    terminate(): void {
        this.terminated = true;
        TestMarkdownWorker.active.delete(this);
    }
}

let workerDescriptor: PropertyDescriptor | undefined;
let mocked = false;
beforeEach(() => {
    mocked = typeof window !== "undefined";
    if (!mocked) return;
    workerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
    Object.defineProperty(globalThis, "Worker", { configurable: true, writable: true, value: TestMarkdownWorker });
});
afterEach(() => {
    for (const worker of TestMarkdownWorker.active) worker.terminate();
    if (mocked) {
        if (workerDescriptor) Object.defineProperty(globalThis, "Worker", workerDescriptor);
        else Reflect.deleteProperty(globalThis, "Worker");
    }
});
