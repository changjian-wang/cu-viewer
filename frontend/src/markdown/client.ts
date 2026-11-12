import { useEffect, useMemo, useSyncExternalStore } from "react";
import type {
    MarkdownBlock, MarkdownDocumentIndex, MarkdownFlowIndex, MarkdownNode, MarkdownRequest, MarkdownResponse,
    MarkdownTableIndex, MarkdownTableRange, MarkdownTableWindow,
} from "./model";

export type MarkdownSnapshot =
    | { readonly status: "idle" | "loading"; readonly attempt: number }
    | { readonly status: "ready"; readonly attempt: number; readonly index: MarkdownDocumentIndex }
    | { readonly status: "error"; readonly attempt: number; readonly message: string };

type Query =
    | { type: "blocks"; ids: readonly string[] }
    | { type: "flow" | "table"; id: string }
    | { type: "rows"; id: string; range: MarkdownTableRange };

let nextIdentity = 0;
let nextDocument = 0;

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integer(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function nodes(value: unknown): value is readonly MarkdownNode[] {
    if (!Array.isArray(value)) return false;
    const input: readonly unknown[] = value;
    const pending: unknown[] = [...input];
    while (pending.length) {
        const node = pending.pop();
        if (!record(node)) return false;
        if (node.type === "text") { if (typeof node.value !== "string") return false; }
        else if (node.type === "element" && typeof node.tagName === "string" &&
            record(node.properties) && Array.isArray(node.children)) {
            const children: readonly unknown[] = node.children;
            pending.push(...children);
        }
        else return false;
    }
    return true;
}

function blocks(value: unknown): value is readonly MarkdownBlock[] {
    return Array.isArray(value) && value.every((block: unknown) => record(block) && typeof block.id === "string" && nodes(block.nodes));
}

function flow(value: unknown): value is MarkdownFlowIndex {
    return record(value) && typeof value.id === "string" && typeof value.virtual === "boolean" &&
        Array.isArray(value.blocks) && value.blocks.every((block: unknown) => record(block) &&
            typeof block.id === "string" && integer(block.characters) && integer(block.nodes) &&
            typeof block.estimate === "number" && Number.isFinite(block.estimate) && block.estimate > 0 &&
            typeof block.continuedBefore === "boolean" && typeof block.continuedAfter === "boolean");
}

function index(value: unknown): value is MarkdownDocumentIndex {
    return record(value) && Array.isArray(value.pages) && value.pages.length > 0 &&
        value.pages.every((page: unknown) => flow(page) && record(page) && integer(page.rawStart) && integer(page.rawEnd));
}

function table(value: unknown): value is MarkdownTableIndex {
    return record(value) && typeof value.id === "string" && integer(value.rows) && integer(value.headers) &&
        Array.isArray(value.columns) && value.columns.length > 0 &&
        value.columns.every((width: unknown) => typeof width === "number" && Number.isFinite(width) && width > 0) &&
        (value.captionFlow === null || typeof value.captionFlow === "string") && typeof value.continued === "boolean";
}

function window(value: unknown): value is MarkdownTableWindow {
    const cells = (input: unknown): boolean => Array.isArray(input) && input.every((cell: unknown) =>
        record(cell) && typeof cell.id === "string" && integer(cell.row) && integer(cell.column) &&
        integer(cell.rowSpan) && cell.rowSpan > 0 && integer(cell.columnSpan) && cell.columnSpan > 0 &&
        nodes([cell.node]) && record(cell.node) && cell.node.type === "element");
    return record(value) && typeof value.id === "string" && integer(value.rowStart) && integer(value.rowEnd) &&
        integer(value.columnStart) && integer(value.columnEnd) && cells(value.headers) && cells(value.cells);
}

function response(value: unknown): value is MarkdownResponse {
    if (!record(value) || !integer(value.document)) return false;
    if (value.type === "ready") return index(value.index) && blocks(value.blocks);
    if (value.type === "error") return typeof value.message === "string" && (value.request === undefined || integer(value.request));
    if (!integer(value.request)) return false;
    switch (value.type) {
        case "blocks": return blocks(value.blocks);
        case "flow": return flow(value.flow);
        case "table": return table(value.table);
        case "rows": return window(value.window);
        default: return false;
    }
}

function abortError(): DOMException {
    return new DOMException("Markdown rendering was cancelled.", "AbortError");
}

function cached<T>(cache: Map<string, T>, key: string): T | undefined {
    const value = cache.get(key);
    if (value !== undefined) { cache.delete(key); cache.set(key, value); }
    return value;
}

function cacheValue<T>(cache: Map<string, T>, key: string, value: T, maximum: number): void {
    cache.delete(key);
    cache.set(key, value);
    while (cache.size > maximum) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
    }
}

export class MarkdownDocumentClient {
    readonly identity = ++nextIdentity;
    private snapshot: MarkdownSnapshot = { status: "idle", attempt: 0 };
    private worker: Worker | null = null;
    private document = 0;
    private requestId = 0;
    private disposed = false;
    private readonly listeners = new Set<() => void>();
    private readonly pending = new Map<number, {
        resolve: (value: MarkdownResponse) => void; reject: (error: Error) => void; cleanup: () => void;
    }>();
    private readonly blockCache = new Map<string, MarkdownBlock>();
    private readonly flowCache = new Map<string, MarkdownFlowIndex>();
    private readonly tableCache = new Map<string, MarkdownTableIndex>();
    private readonly rowCache = new Map<string, MarkdownTableWindow>();

    constructor(readonly markdown: string) {}

    getSnapshot = (): MarkdownSnapshot => this.snapshot;
    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    private publish(snapshot: MarkdownSnapshot): void {
        this.snapshot = snapshot;
        this.listeners.forEach(listener => listener());
    }

    private fail(message: string): void {
        this.stop(new Error(message));
        this.publish({ status: "error", attempt: this.snapshot.attempt, message });
    }

    ensure(page = 0): void {
        if (this.disposed) {
            this.disposed = false;
            this.snapshot = { status: "idle", attempt: this.snapshot.attempt };
        }
        if (this.snapshot.status !== "idle") return;
        this.document = ++nextDocument;
        this.publish({ status: "loading", attempt: this.snapshot.attempt + 1 });
        try {
            const directory = "./markdown/";
            const resources = new URL(directory, import.meta.url);
            // Vite's development asset URLs can omit a directory's trailing slash.
            if (!resources.pathname.endsWith("/")) resources.pathname += "/";
            this.worker = new Worker(new URL("markdown.worker.js", resources), { type: "classic" });
            this.worker.onmessage = (event: MessageEvent<unknown>) => {
                if (!response(event.data)) { this.fail("The Markdown worker returned an invalid response."); return; }
                const reply = event.data;
                if (reply.document !== this.document || this.disposed) return;
                if (reply.type === "ready") {
                    reply.blocks.forEach(block => cacheValue(this.blockCache, block.id, block, 64));
                    reply.index.pages.forEach(page => cacheValue(this.flowCache, page.id, page, 32));
                    this.publish({ status: "ready", attempt: this.snapshot.attempt, index: reply.index });
                    return;
                }
                if (reply.type === "error" && reply.request === undefined) { this.fail(reply.message); return; }
                const id = reply.request;
                if (id === undefined) return;
                const pending = this.pending.get(id);
                if (!pending) return;
                this.pending.delete(id);
                pending.cleanup();
                if (reply.type === "error") pending.reject(new Error(reply.message));
                else pending.resolve(reply);
            };
            this.worker.onerror = event => {
                event.preventDefault();
                this.fail(event.message || "The Markdown worker could not be loaded.");
            };
            this.worker.onmessageerror = () => this.fail("The Markdown worker message could not be read.");
            const request: MarkdownRequest = { type: "parse", document: this.document, markdown: this.markdown, page };
            this.worker.postMessage(request);
        } catch (error) {
            this.fail(error instanceof Error ? error.message : "The Markdown worker could not be started.");
        }
    }

    retry(page = 0): void {
        if (this.disposed) return;
        this.stop(abortError());
        this.blockCache.clear(); this.flowCache.clear(); this.tableCache.clear(); this.rowCache.clear();
        this.publish({ status: "idle", attempt: this.snapshot.attempt });
        this.ensure(page);
    }

    private query(query: Query, signal: AbortSignal): Promise<MarkdownResponse> {
        if (signal.aborted || this.disposed) return Promise.reject(abortError());
        const worker = this.worker;
        if (!worker || this.snapshot.status !== "ready") return Promise.reject(new Error("The Markdown document is not ready."));
        const id = ++this.requestId;
        return new Promise((resolve, reject) => {
            const abort = (): void => {
                this.pending.delete(id);
                signal.removeEventListener("abort", abort);
                reject(abortError());
            };
            this.pending.set(id, { resolve, reject, cleanup: () => signal.removeEventListener("abort", abort) });
            signal.addEventListener("abort", abort, { once: true });
            try { worker.postMessage({ ...query, request: id, document: this.document }); }
            catch (error) {
                this.pending.delete(id);
                signal.removeEventListener("abort", abort);
                reject(error instanceof Error ? error : new Error("The Markdown request could not be sent."));
            }
        });
    }

    readBlocks(ids: readonly string[]): readonly MarkdownBlock[] | undefined {
        const values = ids.map(id => cached(this.blockCache, id));
        return values.every((value): value is MarkdownBlock => value !== undefined) ? values : undefined;
    }

    async getBlocks(ids: readonly string[], signal: AbortSignal): Promise<readonly MarkdownBlock[]> {
        const existing = new Map<string, MarkdownBlock>();
        const missing: string[] = [];
        for (const id of ids) {
            const block = cached(this.blockCache, id);
            if (block) existing.set(id, block); else missing.push(id);
        }
        if (signal.aborted) throw abortError();
        if (missing.length) {
            const reply = await this.query({ type: "blocks", ids: missing }, signal);
            if (reply.type !== "blocks") throw new Error("The Markdown worker returned the wrong block response.");
            for (const block of reply.blocks) {
                existing.set(block.id, block);
                cacheValue(this.blockCache, block.id, block, 64);
            }
        }
        return ids.map(id => {
            const block = existing.get(id);
            if (!block) throw new Error("The requested Markdown block was not returned.");
            return block;
        });
    }

    readFlow(id: string): MarkdownFlowIndex | undefined { return cached(this.flowCache, id); }
    async getFlow(id: string, signal: AbortSignal): Promise<MarkdownFlowIndex> {
        const existing = this.readFlow(id);
        if (existing) return existing;
        const reply = await this.query({ type: "flow", id }, signal);
        if (reply.type !== "flow") throw new Error("The Markdown worker returned the wrong flow response.");
        cacheValue(this.flowCache, id, reply.flow, 32);
        return reply.flow;
    }

    readTable(id: string): MarkdownTableIndex | undefined { return cached(this.tableCache, id); }
    async getTable(id: string, signal: AbortSignal): Promise<MarkdownTableIndex> {
        const existing = this.readTable(id);
        if (existing) return existing;
        const reply = await this.query({ type: "table", id }, signal);
        if (reply.type !== "table") throw new Error("The Markdown worker returned the wrong table response.");
        cacheValue(this.tableCache, id, reply.table, 16);
        return reply.table;
    }

    private rowKey(id: string, range: MarkdownTableRange): string {
        return `${id}:${range.rowStart}:${range.rowEnd}:${range.columnStart}:${range.columnEnd}`;
    }
    readRows(id: string, range: MarkdownTableRange): MarkdownTableWindow | undefined {
        return cached(this.rowCache, this.rowKey(id, range));
    }
    async getRows(id: string, range: MarkdownTableRange, signal: AbortSignal): Promise<MarkdownTableWindow> {
        const existing = this.readRows(id, range);
        if (existing) return existing;
        const reply = await this.query({ type: "rows", id, range }, signal);
        if (reply.type !== "rows") throw new Error("The Markdown worker returned the wrong table-window response.");
        cacheValue(this.rowCache, this.rowKey(id, range), reply.window, 12);
        return reply.window;
    }

    private stop(error: Error): void {
        if (this.worker) {
            this.worker.onmessage = null; this.worker.onerror = null; this.worker.onmessageerror = null;
            this.worker.terminate(); this.worker = null;
        }
        for (const request of this.pending.values()) { request.cleanup(); request.reject(error); }
        this.pending.clear();
    }

    dispose(): void {
        this.disposed = true;
        this.stop(abortError());
        this.blockCache.clear(); this.flowCache.clear(); this.tableCache.clear(); this.rowCache.clear();
        this.listeners.clear();
    }
}

export function useMarkdownDocument(markdown: string | undefined, context: unknown): MarkdownDocumentClient | null {
    const client = useMemo(() => markdown === undefined ? null : new MarkdownDocumentClient(markdown), [markdown, context]);
    useEffect(() => () => client?.dispose(), [client]);
    return client;
}

export function useMarkdownSnapshot(client: MarkdownDocumentClient): MarkdownSnapshot {
    return useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
}
