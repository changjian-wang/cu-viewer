import { describe, expect, it } from "vitest";
import type { Element } from "hast";
import { parseMarkdownDocument } from "./parse";
import type { MarkdownNode, MarkdownPageIndex } from "./model";
import { markdownReference } from "./model";

function elements(nodes: readonly MarkdownNode[]): Element[] {
    return nodes.flatMap(node => node.type === "element"
        ? [node, ...elements(node.children.filter((child): child is MarkdownNode => child.type === "element" || child.type === "text"))] : []);
}

function text(nodes: readonly MarkdownNode[]): string {
    return nodes.map(node => node.type === "text" ? node.value :
        text(node.children.filter((child): child is MarkdownNode => child.type === "element" || child.type === "text"))).join("");
}

function pageNodes(document: Awaited<ReturnType<typeof parseMarkdownDocument>>, page: MarkdownPageIndex | undefined): MarkdownNode[] {
    if (!page) throw new Error("The requested test page is missing.");
    return document.getBlocks(page.blocks.map(block => block.id)).flatMap(block => [...block.nodes]);
}

describe("background Markdown document model", () => {
    it("keeps ordinary paragraphs and tables on their original CU pages", async () => {
        const markdown = Array.from({ length: 41 }, (_, index) =>
            `# Large page ${index + 1}\n\n${"Saved document text.\n\n".repeat(80)}\n\n<table><tr><td>Page ${index + 1} cell</td></tr></table>\n`)
            .join("\n<!-- PageBreak -->\n\n");
        const document = await parseMarkdownDocument(markdown);
        expect(document.index.pages).toHaveLength(41);
        for (const [index, page] of document.index.pages.entries()) {
            const nodes = pageNodes(document, page);
            expect(elements(nodes).filter(node => node.tagName === "table")).toHaveLength(1);
            expect(text(nodes)).toContain(`Large page ${index + 1}`);
            expect(page.virtual).toBe(false);
        }
    });
    it("keeps all text and formatting of a single oversized paragraph in bounded fragments", async () => {
        const original = `${"long text ".repeat(12_000)}\u{1f600}tail`;
        const document = await parseMarkdownDocument(`**${original}**`);
        const page = document.index.pages[0];
        expect(page?.virtual).toBe(true);
        expect(page?.blocks.length).toBeGreaterThan(1);
        expect(page?.blocks.every(block => block.characters <= 4096)).toBe(true);
        const nodes = pageNodes(document, page);
        expect(text(nodes)).toBe(original);
        expect(elements(nodes).filter(node => node.tagName === "strong").length).toBeGreaterThan(1);
    });

    it("resolves document-wide references before pagination and ignores markers in code", async () => {
        const first = `[Across pages][reference]\n\n\`\`\`text\n<!-- PageBreak -->\n\`\`\`\n\n${"first ".repeat(4500)}`;
        const second = `[reference]: https://example.invalid/reference\n\n${"second ".repeat(4000)}`;
        const document = await parseMarkdownDocument(`${first}\n\n<!-- PageBreak -->\n\n${second}`);
        expect(document.index.pages).toHaveLength(2);
        const nodes = pageNodes(document, document.index.pages[0]);
        const link = elements(nodes).find(node => node.tagName === "a");
        expect(link?.properties.href).toBe("https://example.invalid/reference");
        expect(link?.properties.target).toBe("_blank");
        expect(text(nodes)).toContain("<!-- PageBreak -->");
    });

    it("keeps a cross-page HTML table structured, with shared headers and spanning cells", async () => {
        const markdown = `${"first ".repeat(4500)}\n\n<table><tr><th>A</th><th>B</th></tr>\n` +
            '<tr><td rowspan="2">Merged</td><td>First row</td></tr>\n<!-- PageBreak -->\n' +
            `<tr><td>Last row</td></tr></table>\n\n${"second ".repeat(4000)}`;
        const document = await parseMarkdownDocument(markdown);
        expect(document.index.pages).toHaveLength(2);
        const references = document.index.pages.map(page => elements(pageNodes(document, page))
            .map(node => markdownReference(node, "cuMarkdownTable")).find(value => value !== undefined));
        if (!references[0] || !references[1]) throw new Error("The paginated table is missing.");
        const first = document.getTable(references[0]), last = document.getTable(references[1]);
        expect(first.columns).toEqual(last.columns);
        expect(last.headers).toBe(1);
        expect(last.continued).toBe(true);
        const window = document.getRows(last.id, { rowStart: 0, rowEnd: last.rows, columnStart: 0, columnEnd: last.columns.length });
        expect(window.cells.map(cell => text([cell.node]))).toContain("Merged");
        expect(window.cells.map(cell => text([cell.node]))).toContain("Last row");
        expect(window.headers.map(cell => text([cell.node]))).toEqual(["A", "B"]);
    });

    it("indexes a ten-thousand-row table without returning all rows for one viewport", async () => {
        const markdown = `<table><tr><th>Index</th><th>Value</th></tr>${Array.from({ length: 10_000 }, (_, index) =>
            `<tr><td>${index}</td><td>value-${index}</td></tr>`).join("")}</table>`;
        const document = await parseMarkdownDocument(markdown);
        const tableNode = elements(pageNodes(document, document.index.pages[0])).find(node => markdownReference(node, "cuMarkdownTable"));
        const id = markdownReference(tableNode, "cuMarkdownTable");
        if (!id) throw new Error("The large table is missing.");
        const table = document.getTable(id);
        expect(table.rows).toBe(10_000);
        const window = document.getRows(id, { rowStart: 9990, rowEnd: 10_000, columnStart: 0, columnEnd: 2 });
        expect(window.cells).toHaveLength(20);
        expect(window.cells.map(cell => text([cell.node]))).toContain("value-9999");
    }, 20_000);

    it("keeps the end of a long cell in an independently indexed flow", async () => {
        const value = `${"cell text ".repeat(8_000)}last-cell-tail`;
        const document = await parseMarkdownDocument(`<table><tr><td>${value}</td></tr></table>`);
        const tableNode = elements(pageNodes(document, document.index.pages[0])).find(node => markdownReference(node, "cuMarkdownTable"));
        const id = markdownReference(tableNode, "cuMarkdownTable");
        if (!id) throw new Error("The cell table is missing.");
        const window = document.getRows(id, { rowStart: 0, rowEnd: 1, columnStart: 0, columnEnd: 1 });
        const flowId = markdownReference(window.cells[0]?.node, "cuMarkdownFlow");
        if (!flowId) throw new Error("The long cell flow is missing.");
        const flow = document.getFlow(flowId);
        expect(flow.virtual).toBe(true);
        expect(text(document.getBlocks(flow.blocks.map(block => block.id)).flatMap(block => [...block.nodes]))).toBe(value);
    });

    it("retains safe content without active markup, unsafe links, or image requests", async () => {
        const document = await parseMarkdownDocument('# Safe\n\n[safe](https://example.com)\n\n[bad](javascript:alert(1))\n\n' +
            '<img src="https://example.invalid/tracker" alt="receipt" onerror="alert(1)"><script>alert(1)</script>');
        const nodes = pageNodes(document, document.index.pages[0]);
        expect(elements(nodes).some(node => ["img", "script", "iframe"].includes(node.tagName))).toBe(false);
        expect(elements(nodes).filter(node => node.tagName === "a").map(node => node.properties.href)).toEqual(["https://example.com"]);
        expect(text(nodes)).toContain("Image omitted: receipt");
    });

    it("keeps only local CU figure references as source-free image tokens without changing ordinary text", async () => {
        const document = await parseMarkdownDocument('![Logo](figures/1.1)\n\n<img src="./figures/5.1" alt="Other logo">\n\n' +
            '\u2713 YES BANK\n\n![Remote](https://user:pass@example.invalid/image?sig=secret)\n\n' +
            '![Other local](/figures/1.1)\n\n![Traversal](figures/../1.1)\n\n![Query](figures/1.1?sig=secret)');
        const nodes = pageNodes(document, document.index.pages[0]);
        const images = elements(nodes).filter(node => node.tagName === "img");
        expect(images.map(node => markdownReference(node, "cuMarkdownFigure"))).toEqual(["1.1", "5.1"]);
        expect(images.map(node => node.properties)).toEqual([{ alt: "Logo" }, { alt: "Other logo" }]);
        expect(text(nodes)).toContain("\u2713 YES BANK");
        expect(text(nodes)).toContain("Image omitted: Remote");
        expect(text(nodes)).toContain("Image omitted: Traversal");
        expect(text(nodes)).toContain("Image omitted: Query");
        expect(JSON.stringify(nodes)).not.toMatch(/user:pass|example\.invalid|sig=secret/);
    });

    it("virtualizes image-heavy pages without losing their local figure references", async () => {
        const document = await parseMarkdownDocument(Array.from({ length: 80 }, (_, index) =>
            `![Figure ${index}](figures/${index}.1)`).join("\n\n"));
        const page = document.index.pages[0];
        expect(page?.virtual).toBe(true);
        const images = elements(pageNodes(document, page)).filter(node => node.tagName === "img");
        expect(images.map(node => markdownReference(node, "cuMarkdownFigure")))
            .toEqual(Array.from({ length: 80 }, (_, index) => `${index}.1`));
    });
});
