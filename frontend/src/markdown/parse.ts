import type { Element, Root, RootContent } from "hast";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import {
    MARKDOWN_FRAGMENT_CHARACTERS, MARKDOWN_FRAGMENT_NODES, MARKDOWN_STATIC_CHARACTERS, MARKDOWN_STATIC_NODES, textBoundary,
} from "./model";
import type {
    MarkdownBlock, MarkdownBlockIndex, MarkdownCell, MarkdownDocumentIndex, MarkdownFlowIndex, MarkdownNode,
    MarkdownTableIndex, MarkdownTableRange, MarkdownTableWindow,
} from "./model";

interface Statistics { characters: number; nodes: number; }
interface Fragment extends Statistics { node: MarkdownNode; before: boolean; after: boolean; }
interface TableModel {
    cells: MarkdownCell[];
    columns: number[];
    headerRows: number[];
    rowPages: number[][];
    caption: MarkdownNode[];
}
interface TablePage {
    index: MarkdownTableIndex;
    model: TableModel;
    bodyRows: number[];
}

function isContent(node: RootContent): node is MarkdownNode {
    return node.type === "element" || node.type === "text";
}

function children(node: Element): MarkdownNode[] {
    return node.children.filter(isContent);
}

function statistics(nodes: readonly MarkdownNode[]): Statistics & { figures: number } {
    let characters = 0, count = 0, figures = 0;
    const pending = [...nodes];
    while (pending.length) {
        const node = pending.pop();
        if (!node) break;
        count++;
        if (node.type === "text") characters += node.value.length;
        else {
            if (node.data?.cuMarkdownTable) count += 500;
            if (node.data?.cuMarkdownFigure) { count += 64; figures++; }
            pending.push(...children(node));
        }
    }
    return { characters, nodes: count, figures };
}

function safeHref(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const href = value.trim();
    if (href.startsWith("#")) return href;
    try {
        const protocol = new URL(href).protocol.toLowerCase();
        return ["http:", "https:", "mailto:"].includes(protocol) ? href : undefined;
    } catch {
        return undefined;
    }
}

function applyPresentationPolicy(root: Root): void {
    const pending: MarkdownNode[] = root.children.filter(isContent);
    while (pending.length) {
        const node = pending.pop();
        if (!node || node.type !== "element") continue;
        if (node.tagName === "img") {
            const alt = typeof node.properties.alt === "string" ? node.properties.alt : "";
            const figure = typeof node.properties.src === "string" ?
                /^(?:\.\/)?figures\/([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(node.properties.src)?.[1] : undefined;
            if (figure) {
                node.data = { ...node.data, cuMarkdownFigure: figure };
                node.properties = { alt };
                node.children = [];
            } else {
                node.tagName = "span";
                node.properties = { className: ["cu-markdown-image-omitted"] };
                node.children = [{ type: "text", value: `Image omitted${alt ? `: ${alt}` : ""}` }];
            }
        } else if (node.tagName === "a") {
            const href = safeHref(node.properties.href);
            if (href === undefined) { node.tagName = "span"; node.properties = {}; }
            else node.properties = { ...node.properties, href, target: "_blank", rel: ["noreferrer", "noopener"] };
        }
        pending.push(...children(node));
    }
}

function pageBreaks(root: Root, markdown: string): number[] {
    if (markdown.length <= MARKDOWN_STATIC_CHARACTERS) return [];
    const offsets: number[] = [];
    const pending: { node: RootContent; literal: boolean }[] = root.children.map(node => ({ node, literal: false })).reverse();
    while (pending.length) {
        const entry = pending.pop();
        if (!entry) break;
        const { node, literal } = entry;
        if (node.type === "comment" && !literal && node.value.trim() === "PageBreak") {
            const start = node.position?.start.offset, end = node.position?.end.offset;
            if (start === undefined || end === undefined) throw new Error("The Markdown page marker has no source position.");
            const lineStart = markdown.lastIndexOf("\n", start - 1) + 1;
            const nextLine = markdown.indexOf("\n", end);
            if (!markdown.slice(lineStart, start).trim() && !markdown.slice(end, nextLine < 0 ? markdown.length : nextLine).trim()) {
                offsets.push(end);
            }
        }
        if (node.type === "element") {
            const nestedLiteral = literal || ["pre", "code", "script", "style", "textarea"].includes(node.tagName);
            for (const child of node.children.slice().reverse()) pending.push({ node: child, literal: nestedLiteral });
        }
    }
    return offsets.sort((a, b) => a - b);
}

function lowerBound(values: readonly number[], target: number): number {
    let start = 0, end = values.length;
    while (start < end) {
        const middle = Math.floor((start + end) / 2);
        const value = values[middle];
        if (value === undefined) throw new Error("The Markdown index is incomplete.");
        if (value < target) start = middle + 1;
        else end = middle;
    }
    return start;
}

function elementCopy(node: Element, contents: MarkdownNode[]): Element {
    return { ...node, properties: { ...node.properties }, data: { ...node.data }, children: contents };
}

function addClass(node: Element, name: string): void {
    const existing = node.properties.className;
    node.properties.className = [...(Array.isArray(existing) ? existing : typeof existing === "string" ? [existing] : []), name];
}

function span(value: unknown, maximum: number, zeroMeansRest = false): number {
    const number = typeof value === "number" || typeof value === "string" ? Number(value) : 1;
    if (zeroMeansRest && number === 0) return maximum;
    return Number.isSafeInteger(number) && number > 0 ? Math.min(number, maximum) : 1;
}

function fragments(node: MarkdownNode): Fragment[] {
    const size = statistics([node]);
    if (node.type === "element" && node.data?.cuMarkdownTable) return [{ node, ...size, before: false, after: false }];
    if (size.characters <= MARKDOWN_FRAGMENT_CHARACTERS && size.nodes <= MARKDOWN_FRAGMENT_NODES) {
        return [{ node, ...size, before: false, after: false }];
    }
    if (node.type === "text") {
        const result: Fragment[] = [];
        for (let start = 0; start < node.value.length;) {
            const end = textBoundary(node.value, Math.min(node.value.length, start + MARKDOWN_FRAGMENT_CHARACTERS));
            const value = node.value.slice(start, end);
            result.push({ node: { ...node, value }, characters: value.length, nodes: 1, before: start > 0, after: end < node.value.length });
            start = end;
        }
        return result;
    }
    type Group = { contents: MarkdownNode[]; characters: number; nodes: number };
    const parts: Group[] = [];
    let current: Group = { contents: [], characters: 0, nodes: 1 };
    for (const child of children(node)) {
        for (const fragment of fragments(child)) {
            if (current.contents.length && (current.characters + fragment.characters > MARKDOWN_FRAGMENT_CHARACTERS ||
                current.nodes + fragment.nodes > MARKDOWN_FRAGMENT_NODES)) {
                parts.push(current);
                current = { contents: [], characters: 0, nodes: 1 };
            }
            if (fragment.node.type === "element" && fragment.before && fragment.node.tagName === "li") {
                addClass(fragment.node, "cu-markdown-list-continuation");
            }
            current.contents.push(fragment.node);
            current.characters += fragment.characters;
            current.nodes += fragment.nodes;
        }
    }
    if (current.contents.length) parts.push(current);
    return parts.map((part, index) => {
        const copy = elementCopy(node, part.contents);
        if (index > 0) delete copy.properties.id;
        if (copy.tagName === "ol") {
            const first = children(copy).find(child => child.type === "element" && child.tagName === "li");
            if (first?.type === "element" && typeof first.data?.cuListOrdinal === "number") copy.properties.start = first.data.cuListOrdinal;
        }
        return { node: copy, characters: part.characters, nodes: part.nodes, before: index > 0, after: index + 1 < parts.length };
    });
}

function annotateLists(node: MarkdownNode): void {
    if (node.type !== "element") return;
    if (node.tagName === "ol") {
        let ordinal = Number(node.properties.start ?? 1);
        if (!Number.isSafeInteger(ordinal)) ordinal = 1;
        for (const child of children(node)) if (child.type === "element" && child.tagName === "li") {
            const explicit = Number(child.properties.value);
            if (Number.isSafeInteger(explicit)) ordinal = explicit;
            child.data = { ...child.data, cuListOrdinal: ordinal++ };
        }
    }
    for (const child of children(node)) annotateLists(child);
}

export class ParsedMarkdownDocument {
    readonly index: MarkdownDocumentIndex;
    private sequence = 0;
    private readonly blocks = new Map<string, MarkdownBlock>();
    private readonly flows = new Map<string, MarkdownFlowIndex>();
    private readonly tables = new Map<string, TablePage>();

    constructor(private readonly breaks: readonly number[], root: Root, markdown: string) {
        const pages: MarkdownNode[][] = Array.from({ length: breaks.length + 1 }, () => []);
        // Generated whitespace has no position and must not accumulate on the first page.
        let currentPage = 0;
        for (const node of root.children.filter(isContent)) {
            annotateLists(node);
            for (const [page, contents] of this.partition(node, currentPage)) {
                pages[page]?.push(...contents);
                currentPage = Math.max(currentPage, page);
            }
        }
        this.index = { pages: pages.map((nodes, index) => ({
            ...this.addFlow(nodes),
            rawStart: index === 0 ? 0 : breaks[index - 1] ?? 0,
            rawEnd: breaks[index] ?? markdown.length,
        })) };
    }

    private pageAt(offset: number): number {
        return lowerBound(this.breaks, offset);
    }

    private sourcePage(node: MarkdownNode, fallback: number): number {
        const offset = node.position?.start.offset;
        return offset === undefined ? fallback : this.pageAt(offset);
    }

    private partition(node: MarkdownNode, fallback: number): Map<number, MarkdownNode[]> {
        const page = this.sourcePage(node, fallback);
        if (node.type === "text") return new Map([[page, [node]]]);
        if (node.tagName === "table") return this.partitionTable(node, page);
        const grouped = new Map<number, MarkdownNode[]>();
        let currentPage = page;
        for (const child of children(node)) for (const [childPage, parts] of this.partition(child, currentPage)) {
            const existing = grouped.get(childPage);
            if (existing) existing.push(...parts);
            else grouped.set(childPage, [...parts]);
            currentPage = Math.max(currentPage, childPage);
        }
        if (!grouped.size) grouped.set(page, []);
        return new Map([...grouped].map(([childPage, contents]) => {
            const copy = elementCopy(node, contents);
            if (copy.tagName === "li" && childPage > page) addClass(copy, "cu-markdown-list-continuation");
            if (copy.tagName === "ol") {
                const first = contents.find(child => child.type === "element" && child.tagName === "li");
                if (first?.type === "element" && typeof first.data?.cuListOrdinal === "number") copy.properties.start = first.data.cuListOrdinal;
            }
            return [childPage, [copy]];
        }));
    }

    private addFlow(nodes: MarkdownNode[], cell = false): MarkdownFlowIndex {
        const size = statistics(nodes);
        const virtual = cell
            ? size.characters > MARKDOWN_FRAGMENT_CHARACTERS || size.nodes > MARKDOWN_FRAGMENT_NODES
            : size.characters > MARKDOWN_STATIC_CHARACTERS || size.nodes > MARKDOWN_STATIC_NODES;
        const parts = virtual ? nodes.flatMap(node => fragments(node)) : [{
            node: null, characters: size.characters, nodes: size.nodes, before: false, after: false,
        }];
        const metadata: MarkdownBlockIndex[] = [];
        for (const part of parts) {
            const id = `b${this.sequence++}`;
            const contents = part.node === null ? nodes : [part.node];
            this.blocks.set(id, { id, nodes: contents });
            metadata.push({ id, characters: part.characters, nodes: part.nodes,
                estimate: contents.some(node => node.type === "element" && node.data?.cuMarkdownTable) ? 480 :
                    Math.max(32, Math.ceil(part.characters / 75) * 21 + 24 + statistics(contents).figures * 344),
                continuedBefore: part.before, continuedAfter: part.after });
        }
        const id = `f${this.sequence++}`;
        const flow: MarkdownFlowIndex = { id, virtual, blocks: metadata };
        this.flows.set(id, flow);
        return flow;
    }

    private cellContents(node: Element, page: number): Element {
        const nodes: MarkdownNode[] = [];
        for (const child of children(node)) {
            for (const parts of this.partition(child, page).values()) nodes.push(...parts);
        }
        const copy = elementCopy(node, nodes);
        const size = statistics(nodes);
        if (size.characters > MARKDOWN_FRAGMENT_CHARACTERS || size.nodes > MARKDOWN_FRAGMENT_NODES) {
            const flow = this.addFlow(nodes, true);
            copy.children = [];
            copy.data = { ...copy.data, cuMarkdownFlow: flow.id };
        }
        return copy;
    }

    private partitionTable(node: Element, startPage: number): Map<number, MarkdownNode[]> {
        const records: { node: Element; header: boolean; groupEnd: number }[] = [];
        let caption: MarkdownNode[] = [];
        for (const child of children(node)) {
            if (child.type !== "element") continue;
            if (child.tagName === "caption") caption = children(child);
            if (child.tagName === "tr") records.push({ node: child, header: false, groupEnd: 0 });
            else if (["thead", "tbody", "tfoot"].includes(child.tagName)) {
                const first = records.length;
                for (const row of children(child)) if (row.type === "element" && row.tagName === "tr") {
                    records.push({ node: row, header: child.tagName === "thead", groupEnd: 0 });
                }
                for (let index = first; index < records.length; index++) {
                    const record = records[index];
                    if (record) record.groupEnd = records.length;
                }
            }
        }
        if (!records.length) {
            const copy = elementCopy(node, children(node));
            const size = statistics([copy]);
            if (size.characters <= MARKDOWN_STATIC_CHARACTERS && size.nodes <= MARKDOWN_STATIC_NODES) return new Map([[startPage, [copy]]]);
            const flow = this.addFlow(caption, true);
            const id = `t${this.sequence++}`;
            this.tables.set(id, { index: { id, rows: 0, headers: 0, columns: [120], captionFlow: flow.id, continued: false },
                model: { cells: [], columns: [120], headerRows: [], rowPages: [], caption }, bodyRows: [] });
            return new Map([[startPage, [{ ...node, children: [], data: { ...node.data, cuMarkdownTable: id } }]]]);
        }
        const rowPages = records.map(record => {
            const first = this.sourcePage(record.node, startPage);
            const lastOffset = record.node.position?.end.offset;
            const last = lastOffset === undefined ? first : this.pageAt(Math.max(0, lastOffset - 1));
            return Array.from({ length: last - first + 1 }, (_, index) => first + index);
        });
        const allPages = [...new Set(rowPages.flat())].sort((a, b) => a - b);
        const rawSize = statistics([node]);
        const cellsPerRow = records.map(record => children(record.node).filter(child =>
            child.type === "element" && (child.tagName === "td" || child.tagName === "th")).length);
        const largeCell = records.some(record => children(record.node).some(cell => {
            if (cell.type !== "element") return false;
            const size = statistics(children(cell));
            return size.characters > MARKDOWN_FRAGMENT_CHARACTERS || size.nodes > MARKDOWN_FRAGMENT_NODES;
        }));
        const complex = largeCell || allPages.length > 1 || records.length > 100 || cellsPerRow.some(count => count > 40) ||
            rawSize.characters > MARKDOWN_STATIC_CHARACTERS || rawSize.nodes > MARKDOWN_STATIC_NODES;
        if (!complex) return new Map([[startPage, [node]]]);
        const cells: MarkdownCell[] = [];
        const occupied: { from: number; to: number; end: number }[] = [];
        let columns = 0;
        for (const [row, record] of records.entries()) {
            for (let index = occupied.length - 1; index >= 0; index--) {
                if ((occupied[index]?.end ?? 0) <= row) occupied.splice(index, 1);
            }
            let column = 0;
            for (const child of children(record.node)) {
                if (child.type !== "element" || !["td", "th"].includes(child.tagName)) continue;
                const columnSpan = span(child.properties.colSpan, 1000);
                let overlap = occupied.find(item => column < item.to && column + columnSpan > item.from);
                while (overlap) {
                    column = overlap.to;
                    overlap = occupied.find(item => column < item.to && column + columnSpan > item.from);
                }
                const rowSpan = span(child.properties.rowSpan, (record.groupEnd || records.length) - row, true);
                const cell = this.cellContents(child, rowPages[row]?.[0] ?? startPage);
                cells.push({ id: `c${this.sequence++}`, row, column, rowSpan, columnSpan, node: cell });
                if (rowSpan > 1) occupied.push({ from: column, to: column + columnSpan, end: row + rowSpan });
                column += columnSpan;
                columns = Math.max(columns, column);
            }
        }
        const widths = Array.from({ length: Math.max(1, columns) }, () => 120);
        for (const cell of cells) if (cell.columnSpan === 1) {
            const size = statistics(children(cell.node));
            widths[cell.column] = Math.max(widths[cell.column] ?? 120, Math.min(280, 24 + size.characters * 6));
        }
        let leadingHeaders = true;
        for (const record of records) {
            const cells = children(record.node).filter(child => child.type === "element" && ["td", "th"].includes(child.tagName));
            if (leadingHeaders && cells.length && cells.every(cell => cell.type === "element" && cell.tagName === "th")) record.header = true;
            else leadingHeaders = false;
        }
        const allHeaders = records.flatMap((record, index) => record.header ? [index] : []);
        const headerRows = allHeaders.length <= 8 ? allHeaders : [];
        const model: TableModel = { cells, columns: widths, headerRows, rowPages, caption };
        const result = new Map<number, MarkdownNode[]>();
        for (const page of allPages) {
            const bodyRows = records.flatMap((_record, index) => !headerRows.includes(index) && rowPages[index]?.includes(page) ? [index] : []);
            if (!bodyRows.length && page !== startPage) continue;
            const id = `t${this.sequence++}`;
            const captionFlow = caption.length && page === startPage ? this.addFlow(caption, true).id : null;
            this.tables.set(id, { model, bodyRows, index: { id, rows: bodyRows.length, headers: headerRows.length,
                columns: widths, captionFlow, continued: page !== startPage } });
            result.set(page, [{ ...node, children: [], data: { ...node.data, cuMarkdownTable: id } }]);
        }
        return result;
    }

    getFlow(id: string): MarkdownFlowIndex {
        const flow = this.flows.get(id);
        if (!flow) throw new Error("The requested Markdown flow does not exist.");
        return flow;
    }

    getBlocks(ids: readonly string[]): MarkdownBlock[] {
        return ids.map(id => {
            const block = this.blocks.get(id);
            if (!block) throw new Error("The requested Markdown block does not exist.");
            return block;
        });
    }

    getTable(id: string): MarkdownTableIndex {
        const table = this.tables.get(id);
        if (!table) throw new Error("The requested Markdown table does not exist.");
        return table.index;
    }

    getRows(id: string, range: MarkdownTableRange): MarkdownTableWindow {
        const table = this.tables.get(id);
        if (!table) throw new Error("The requested Markdown table does not exist.");
        const { model, bodyRows } = table;
        if (!Object.values(range).every(value => Number.isSafeInteger(value) && value >= 0) ||
            range.rowEnd < range.rowStart || range.rowEnd > bodyRows.length ||
            range.columnEnd < range.columnStart || range.columnEnd > model.columns.length) {
            throw new Error("The requested Markdown table window is invalid.");
        }
        const headers: MarkdownCell[] = [], cells: MarkdownCell[] = [];
        for (const cell of model.cells) {
            if (cell.column >= range.columnEnd || cell.column + cell.columnSpan <= range.columnStart) continue;
            const header = model.headerRows.indexOf(cell.row);
            if (header >= 0) {
                headers.push({ ...cell, row: header, rowSpan: Math.min(cell.rowSpan, model.headerRows.length - header) });
                continue;
            }
            const first = lowerBound(bodyRows, cell.row), end = lowerBound(bodyRows, cell.row + cell.rowSpan);
            if (end > range.rowStart && first < range.rowEnd) cells.push({ ...cell, row: first, rowSpan: end - first });
        }
        return { id, ...range, headers, cells };
    }
}

export async function parseMarkdownDocument(markdown: string): Promise<ParsedMarkdownDocument> {
    const processor = unified().use(remarkParse).use(remarkGfm)
        .use(remarkRehype, { allowDangerousHtml: true }).use(rehypeRaw, { tagfilter: true });
    const raw = await processor.run(processor.parse(markdown));
    const breaks = pageBreaks(raw, markdown);
    const sanitized = await unified().use(rehypeSanitize, defaultSchema).run(raw);
    applyPresentationPolicy(sanitized);
    return new ParsedMarkdownDocument(breaks, sanitized, markdown);
}
