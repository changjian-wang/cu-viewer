// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { MarkdownDocumentClient } from "./client";
import type { MarkdownSnapshot } from "./client";

const clients: MarkdownDocumentClient[] = [];

function client(markdown: string): MarkdownDocumentClient {
    const value = new MarkdownDocumentClient(markdown);
    clients.push(value);
    return value;
}

async function ready(value: MarkdownDocumentClient): Promise<Extract<MarkdownSnapshot, { status: "ready" }>> {
    await waitFor(() => expect(value.getSnapshot().status).toBe("ready"));
    const snapshot = value.getSnapshot();
    if (snapshot.status !== "ready") throw new Error("The test document did not become ready.");
    return snapshot;
}

afterEach(() => {
    clients.splice(0).forEach(value => value.dispose());
    vi.restoreAllMocks();
});

describe("Markdown worker client ownership", () => {
    it("starts lazily, reuses a parsed document, and releases its worker", async () => {
        const Base = Worker;
        let created = 0, terminated = 0;
        vi.stubGlobal("Worker", class extends Base {
            constructor(url: string | URL, options?: WorkerOptions) { super(url, options); created++; }
            terminate(): void { terminated++; super.terminate(); }
        });
        const value = client("# Saved content");
        expect(created).toBe(0);
        value.ensure();
        const snapshot = await ready(value);
        value.ensure();
        expect(created).toBe(1);
        expect(value.getSnapshot()).toBe(snapshot);
        value.dispose();
        expect(terminated).toBe(1);
    });

    it("cancels a pending range without poisoning the parsed document", async () => {
        const value = client(`${"large content ".repeat(10_000)}original-tail`);
        value.ensure();
        const snapshot = await ready(value);
        const id = snapshot.index.pages[0]?.blocks.at(-1)?.id;
        if (!id) throw new Error("The test tail block is missing.");
        const controller = new AbortController();
        const pending = value.getBlocks([id], controller.signal);
        controller.abort();
        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
        const blocks = await value.getBlocks([id], new AbortController().signal);
        expect(JSON.stringify(blocks)).toContain("original-tail");
        expect(value.getSnapshot().status).toBe("ready");
        await expect(value.getBlocks(["missing-block"], new AbortController().signal)).rejects.toThrow("does not exist");
        expect(value.getSnapshot().status).toBe("ready");
    });

    it("ignores an obsolete worker response after retrying a document", async () => {
        const Base = Worker;
        const workers: Worker[] = [];
        vi.stubGlobal("Worker", class extends Base {
            constructor(url: string | URL, options?: WorkerOptions) { super(url, options); workers.push(this); }
        });
        const post = vi.spyOn(Worker.prototype, "postMessage");
        const value = client("# Current content");
        value.ensure();
        const old = await ready(value);
        const worker = workers[0], handler = worker?.onmessage;
        const request: unknown = post.mock.calls[0]?.[0];
        if (!worker || !handler || typeof request !== "object" || request === null ||
            !("document" in request) || typeof request.document !== "number") throw new Error("The old worker request is missing.");
        value.retry();
        const current = await ready(value);
        handler.call(worker, new MessageEvent("message", {
            data: { type: "ready", document: request.document, index: old.index, blocks: [] },
        }));
        expect(value.getSnapshot()).toBe(current);
        expect(current.attempt).toBeGreaterThan(old.attempt);
    });

    it("reports invalid worker messages explicitly instead of showing an empty success", async () => {
        const Base = Worker;
        vi.stubGlobal("Worker", class extends Base {
            constructor(url: string | URL, options?: WorkerOptions) {
                super(url, options);
                queueMicrotask(() => {
                    this.onmessage?.(new MessageEvent("message", { data: { unexpected: true } }));
                });
            }
        });
        const value = client("# Original data");
        value.ensure();
        await waitFor(() => expect(value.getSnapshot().status).toBe("error"));
        expect(value.getSnapshot()).toMatchObject({ message: "The Markdown worker returned an invalid response." });
    });
});
