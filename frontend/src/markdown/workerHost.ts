import { parseMarkdownDocument } from "./parse";
import type { ParsedMarkdownDocument } from "./parse";
import type { MarkdownRequest, MarkdownResponse, MarkdownTableRange } from "./model";

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integer(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function range(value: unknown): value is MarkdownTableRange {
    return record(value) && integer(value.rowStart) && integer(value.rowEnd) &&
        integer(value.columnStart) && integer(value.columnEnd);
}

function request(value: unknown): value is MarkdownRequest {
    if (!record(value) || !integer(value.document)) return false;
    if (value.type === "parse") return typeof value.markdown === "string" && integer(value.page);
    if (!integer(value.request)) return false;
    if (value.type === "blocks") return Array.isArray(value.ids) && value.ids.every((id: unknown) => typeof id === "string");
    if (value.type === "flow" || value.type === "table") return typeof value.id === "string";
    return value.type === "rows" && typeof value.id === "string" && range(value.range);
}

export class MarkdownWorkerHost {
    private documentId = 0;
    private document: ParsedMarkdownDocument | null = null;

    constructor(private readonly post: (response: MarkdownResponse) => void) {}

    async handle(data: unknown): Promise<void> {
        try {
            if (!request(data)) throw new Error("The Markdown worker received an invalid request.");
            if (data.type === "parse") {
                this.documentId = data.document;
                const parsed = await parseMarkdownDocument(data.markdown);
                if (this.documentId !== data.document) return;
                this.document = parsed;
                const page = parsed.index.pages[Math.min(data.page, parsed.index.pages.length - 1)];
                const ids = page?.blocks.slice(0, page.virtual ? 3 : undefined).map(block => block.id) ?? [];
                this.post({ type: "ready", document: this.documentId, index: parsed.index, blocks: parsed.getBlocks(ids) });
                return;
            }
            if (data.document !== this.documentId) return;
            if (!this.document) throw new Error("The Markdown document has not been parsed.");
            switch (data.type) {
                case "blocks":
                    this.post({ type: "blocks", document: this.documentId, request: data.request, blocks: this.document.getBlocks(data.ids) });
                    break;
                case "flow":
                    this.post({ type: "flow", document: this.documentId, request: data.request, flow: this.document.getFlow(data.id) });
                    break;
                case "table":
                    this.post({ type: "table", document: this.documentId, request: data.request, table: this.document.getTable(data.id) });
                    break;
                case "rows":
                    this.post({ type: "rows", document: this.documentId, request: data.request, window: this.document.getRows(data.id, data.range) });
                    break;
            }
        } catch (error) {
            const id = record(data) && integer(data.document) ? data.document : this.documentId;
            const requestId = record(data) && integer(data.request) ? data.request : undefined;
            this.post({ type: "error", document: id, ...(requestId === undefined ? {} : { request: requestId }),
                message: error instanceof Error ? error.message : "The Markdown worker failed." });
        }
    }
}
