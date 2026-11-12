import { createContext, Fragment, isValidElement, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import type { ExtraProps } from "hast-util-to-jsx-runtime";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Element } from "hast";
import type { MarkdownDocumentClient } from "../markdown/client";
import type { CuContent } from "../model/types";
import type { LoadedSource } from "../source/source";
import { SourceThumbnail } from "./SourceThumbnail";
import { markdownReference } from "../markdown/model";
import type {
    MarkdownBlock, MarkdownCell, MarkdownFlowIndex, MarkdownNode, MarkdownTableIndex, MarkdownTableRange, MarkdownTableWindow,
} from "../markdown/model";

export const MarkdownSourceContext = createContext<{ content: CuContent | undefined; source: LoadedSource | null }>({
    content: undefined, source: null,
});

function MarkdownFigure({ id, alt }: { id: string | undefined; alt: string }) {
    const { content, source } = useContext(MarkdownSourceContext);
    const matches = content?.figures?.filter(figure => figure.figureId === id) ?? [];
    const figure = matches[0];
    const error = !id ? "The figure reference is unavailable." :
        matches.length > 1 ? `Figure ${id} has ambiguous source metadata.` :
        !figure ? `Figure ${id} is not available in this content.` :
        !figure.field.regions.length ? `Figure ${id} has no source region.` : null;
    if (error || !content || !figure) return <span className="cu-markdown-figure" role="alert">
        Image preview{alt ? ` (${alt})` : ""}: {error}
    </span>;
    return <span className="cu-markdown-figure" data-markdown-figure={id}>
        {figure.field.regions.map((region, index) => <SourceThumbnail key={index} source={source}
            content={content} region={region} label={alt || `Figure ${id}`} reserveSpace />)}
    </span>;
}

function useResource<T>(key: string, read: () => T | undefined, load: (signal: AbortSignal) => Promise<T>, enabled = true): T | undefined {
    const callbacks = useRef({ read, load });
    callbacks.current = { read, load };
    const [state, setState] = useState<{ key: string; value?: T; error?: Error }>({ key });
    const existing = enabled ? read() : undefined;
    useEffect(() => {
        if (!enabled || callbacks.current.read() !== undefined) return;
        const controller = new AbortController();
        void callbacks.current.load(controller.signal).then(value => {
            if (!controller.signal.aborted) setState({ key, value });
        }).catch((error: unknown) => {
            if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error : new Error("Markdown content could not be loaded.") });
        });
        return () => controller.abort();
    }, [key, enabled]);
    if (enabled && state.key === key && state.error) throw state.error;
    return existing ?? (enabled && state.key === key ? state.value : undefined);
}

function resourceKey(client: MarkdownDocumentClient, key: string): string {
    return `${client.identity}:${client.getSnapshot().attempt}:${key}`;
}

function useBlocks(client: MarkdownDocumentClient, ids: readonly string[]): readonly MarkdownBlock[] | undefined {
    return useResource(resourceKey(client, `blocks:${ids.join(",")}`),
        () => client.readBlocks(ids), signal => client.getBlocks(ids, signal), ids.length > 0);
}

export function MarkdownHtml({ client, nodes }: { client: MarkdownDocumentClient; nodes: readonly MarkdownNode[] }) {
    const components = useMemo(() => ({
        img: ({ node, alt }: ComponentProps<"img"> & ExtraProps) =>
            <MarkdownFigure id={markdownReference(node, "cuMarkdownFigure")} alt={alt ?? ""} />,
        table: ({ node, children, ...properties }: ComponentProps<"table"> & ExtraProps) => {
            const id = markdownReference(node, "cuMarkdownTable");
            return id ? <MarkdownTable client={client} id={id} /> :
                <div className="cu-markdown-table-scroll"><table {...properties}>{children}</table></div>;
        },
        td: ({ node, children, ...properties }: ComponentProps<"td"> & ExtraProps) => {
            const id = markdownReference(node, "cuMarkdownFlow");
            return <td {...properties}>{id ? <CellFlow client={client} id={id} /> : children}</td>;
        },
        th: ({ node, children, ...properties }: ComponentProps<"th"> & ExtraProps) => {
            const id = markdownReference(node, "cuMarkdownFlow");
            return <th {...properties}>{id ? <CellFlow client={client} id={id} /> : children}</th>;
        },
    }), [client]);
    const rendered: unknown = toJsxRuntime({ type: "root", children: [...nodes] },
        { Fragment, jsx, jsxs, components, passNode: true });
    if (!isValidElement(rendered)) throw new Error("The formatted Markdown tree could not be rendered.");
    return rendered;
}

function CellFlow({ client, id }: { client: MarkdownDocumentClient; id: string }) {
    const flow = useResource(resourceKey(client, `flow:${id}`), () => client.readFlow(id), signal => client.getFlow(id, signal));
    return flow ? <MarkdownFlow client={client} flow={flow} nested /> :
        <div className="cu-markdown-loading" role="status">Loading cell content...</div>;
}

function StaticFlow({ client, flow }: { client: MarkdownDocumentClient; flow: MarkdownFlowIndex }) {
    const blocks = useBlocks(client, flow.blocks.map(block => block.id));
    return blocks ? <MarkdownHtml client={client} nodes={blocks.flatMap(block => [...block.nodes])} /> :
        <div className="cu-markdown-loading" role="status">Loading Markdown content...</div>;
}

function VirtualFlow({ client, flow, nested }: { client: MarkdownDocumentClient; flow: MarkdownFlowIndex; nested: boolean }) {
    const scroll = useRef<HTMLDivElement>(null);
    const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
        count: flow.blocks.length,
        getScrollElement: () => scroll.current,
        estimateSize: index => flow.blocks[index]?.estimate ?? 64,
        getItemKey: index => flow.blocks[index]?.id ?? index,
        overscan: 2,
        useAnimationFrameWithResizeObserver: true,
    });
    const items = virtualizer.getVirtualItems();
    const ids = items.map(item => {
        const block = flow.blocks[item.index];
        if (!block) throw new Error("The Markdown block index is unavailable.");
        return block.id;
    });
    const blocks = useBlocks(client, ids);
    const byId = new Map(blocks?.map(block => [block.id, block]));
    return <div ref={scroll} className={nested ? "cu-markdown-cell-scroll" : "cu-rich-result-scroll"}
        role="region" aria-label={nested ? "Long Markdown cell content" : "Markdown content"} tabIndex={0}
        data-markdown-flow={flow.id}>
        <article className={nested ? "cu-markdown-cell-body" : "cu-markdown"}>
            <div className="cu-markdown-virtual-space" style={{ height: virtualizer.getTotalSize() }}>
                {items.map(item => {
                    const metadata = flow.blocks[item.index];
                    if (!metadata) throw new Error("The visible Markdown block is unavailable.");
                    const block = byId.get(metadata.id);
                    return <div key={metadata.id} ref={virtualizer.measureElement} data-index={item.index}
                        data-markdown-block={metadata.id}
                        className={`cu-markdown-virtual-block${metadata.continuedBefore ? " is-continuation" : ""}${metadata.continuedAfter ? " continues" : ""}`}
                        style={{ transform: `translateY(${item.start}px)` }}>
                        {block ? <MarkdownHtml client={client} nodes={block.nodes} /> :
                            <div className="cu-markdown-loading" role="status" style={{ minHeight: metadata.estimate }}>Loading content...</div>}
                    </div>;
                })}
            </div>
        </article>
    </div>;
}

export function MarkdownFlow({ client, flow, nested = false }: {
    client: MarkdownDocumentClient; flow: MarkdownFlowIndex; nested?: boolean;
}) {
    if (flow.virtual) return <VirtualFlow client={client} flow={flow} nested={nested} />;
    return nested ? <StaticFlow client={client} flow={flow} /> :
        <div className="cu-rich-result-scroll" data-markdown-flow={flow.id}>
            <article className="cu-markdown"><StaticFlow client={client} flow={flow} /></article>
        </div>;
}

function clippedCells(
    cells: readonly MarkdownCell[], row: number, rowStart: number, rowEnd: number,
    columnStart: number, columnEnd: number, left: number, right: number,
): MarkdownNode[] {
    const result: MarkdownNode[] = [];
    const spacer = (width: number): Element => ({
        type: "element", tagName: "td", properties: { ariaHidden: "true", className: ["cu-markdown-column-spacer"], style: `width:${width}px;min-width:0;padding:0;border:0` },
        children: [],
    });
    if (left > 0) result.push(spacer(left));
    let column = columnStart;
    while (column < columnEnd) {
        const occupied = cells.find(cell => Math.max(rowStart, cell.row) < row && cell.row + cell.rowSpan > row &&
            cell.column <= column && cell.column + cell.columnSpan > column);
        if (occupied) { column = Math.min(columnEnd, occupied.column + occupied.columnSpan); continue; }
        const cell = cells.find(cell => Math.max(rowStart, cell.row) === row && cell.row < rowEnd &&
            Math.max(columnStart, cell.column) === column && cell.column + cell.columnSpan > columnStart);
        if (cell) {
            const end = Math.min(columnEnd, cell.column + cell.columnSpan);
            result.push({ ...cell.node, properties: { ...cell.node.properties,
                rowSpan: Math.min(rowEnd, cell.row + cell.rowSpan) - row,
                colSpan: end - column, ariaColIndex: column + 1 },
            });
            column = end;
        } else {
            result.push({ type: "element", tagName: "td", properties: { ariaColIndex: column + 1 }, children: [] });
            column++;
        }
    }
    if (right > 0) result.push(spacer(right));
    return result;
}

function TableViewport({ client, table }: { client: MarkdownDocumentClient; table: MarkdownTableIndex }) {
    const scroll = useRef<HTMLDivElement>(null);
    const header = useRef<HTMLTableSectionElement>(null);
    const [headerHeight, setHeaderHeight] = useState(table.headers * 36);
    const rows = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
        count: table.rows,
        getScrollElement: () => scroll.current,
        estimateSize: () => 36,
        scrollMargin: headerHeight,
        overscan: 5,
    });
    const columns = useVirtualizer<HTMLDivElement, HTMLTableColElement>({
        count: table.columns.length,
        getScrollElement: () => scroll.current,
        estimateSize: index => table.columns[index] ?? 120,
        horizontal: true,
        overscan: 2,
    });
    useLayoutEffect(() => {
        const element = header.current;
        if (!element) return;
        const update = (): void => setHeaderHeight(element.getBoundingClientRect().height);
        update();
        const observer = new ResizeObserver(update);
        observer.observe(element);
        return () => observer.disconnect();
    }, [table.id]);
    const visibleRows = rows.getVirtualItems(), visibleColumns = columns.getVirtualItems();
    const rowStart = visibleRows[0]?.index ?? 0;
    const rowEnd = (visibleRows.at(-1)?.index ?? -1) + 1;
    const columnStart = visibleColumns[0]?.index ?? 0;
    const columnEnd = (visibleColumns.at(-1)?.index ?? -1) + 1;
    const range: MarkdownTableRange = {
        rowStart: Math.floor(rowStart / 64) * 64,
        rowEnd: Math.min(table.rows, Math.ceil(rowEnd / 64) * 64),
        columnStart: Math.floor(columnStart / 8) * 8,
        columnEnd: Math.min(table.columns.length, Math.ceil(columnEnd / 8) * 8),
    };
    const key = `${table.id}:${range.rowStart}:${range.rowEnd}:${range.columnStart}:${range.columnEnd}`;
    const window = useResource<MarkdownTableWindow>(resourceKey(client, `rows:${key}`),
        () => client.readRows(table.id, range), signal => client.getRows(table.id, range, signal), columnEnd > columnStart);
    const left = visibleColumns[0]?.start ?? 0;
    const right = Math.max(0, columns.getTotalSize() - (visibleColumns.at(-1)?.end ?? 0));
    const before = Math.max(0, (visibleRows[0]?.start ?? headerHeight) - headerHeight);
    const after = Math.max(0, rows.getTotalSize() - ((visibleRows.at(-1)?.end ?? headerHeight) - headerHeight));
    const count = visibleColumns.length + Number(left > 0) + Number(right > 0);
    const renderCells = (cells: readonly MarkdownCell[], row: number, start: number, end: number) =>
        <MarkdownHtml client={client} nodes={clippedCells(cells, row, start, end, columnStart, columnEnd, left, right)} />;
    return <>
        {table.captionFlow && <CellFlow client={client} id={table.captionFlow} />}
        <div ref={scroll} className="cu-markdown-table-scroll cu-markdown-virtual-table" tabIndex={0}
            role="region" aria-label="Scrollable Markdown table" data-markdown-table={table.id}
            style={{ height: Math.max(80, Math.min(480, (table.rows + table.headers) * 36 + 2)) }}>
            <table aria-label={table.continued ? "Markdown table (continued)" : "Markdown table"}
                aria-rowcount={table.rows + table.headers} aria-colcount={table.columns.length}
                style={{ width: columns.getTotalSize(), minWidth: 0, tableLayout: "fixed" }}>
                <colgroup>
                    {left > 0 && <col style={{ width: left }} />}
                    {visibleColumns.map(column => <col key={column.index} style={{ width: column.size }} />)}
                    {right > 0 && <col style={{ width: right }} />}
                </colgroup>
                <thead ref={header}>
                    {Array.from({ length: table.headers }, (_, row) => <tr key={row} aria-rowindex={row + 1}>
                        {window ? renderCells(window.headers, row, 0, table.headers) :
                            <th colSpan={Math.max(1, count)}>Loading table...</th>}
                    </tr>)}
                </thead>
                <tbody>
                    {before > 0 && <tr aria-hidden="true"><td className="cu-markdown-row-spacer" colSpan={Math.max(1, count)}
                        style={{ height: before, padding: 0, border: 0 }} /></tr>}
                    {visibleRows.map(row => <tr key={row.index} ref={rows.measureElement} data-index={row.index}
                        data-markdown-row={row.index} aria-rowindex={table.headers + row.index + 1}>
                        {window ? renderCells(window.cells, row.index, rowStart, rowEnd) :
                            <td colSpan={Math.max(1, count)}>Loading table...</td>}
                    </tr>)}
                    {after > 0 && <tr aria-hidden="true"><td className="cu-markdown-row-spacer" colSpan={Math.max(1, count)}
                        style={{ height: after, padding: 0, border: 0 }} /></tr>}
                </tbody>
            </table>
        </div>
    </>;
}

function MarkdownTable({ client, id }: { client: MarkdownDocumentClient; id: string }) {
    const table = useResource(resourceKey(client, `table:${id}`), () => client.readTable(id), signal => client.getTable(id, signal));
    return table ? <TableViewport key={table.id} client={client} table={table} /> :
        <div className="cu-markdown-loading" role="status">Loading table model...</div>;
}
