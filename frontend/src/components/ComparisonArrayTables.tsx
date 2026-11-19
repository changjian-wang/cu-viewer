import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { displayValue, fieldLabel } from "../interaction/interaction";
import { inlineArrayProjection } from "../interaction/reviewFields";
import type { FieldComparison, FieldComparisonNode } from "../model/fieldComparison";
import type { FieldsPaneProps } from "./FieldsPane";
import { ComparisonValue } from "./ComparisonValue";

type Projection = NonNullable<ReturnType<typeof inlineArrayProjection>>;

function ArrayTable({ node, side, projection, columnWidths, comparison, props, request, onReveal }: {
    node: FieldComparisonNode; side: "label" | "extracted"; projection: Projection; comparison: FieldComparison;
    columnWidths: readonly number[];
    props: FieldsPaneProps; request: number | null; onReveal: () => void;
}) {
    const scroll = useRef<HTMLDivElement>(null);
    const handled = useRef<string | null>(null);
    const count = projection.rows.length;
    const virtual = count > 100;
    const virtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
        count: virtual ? count : 0, getScrollElement: () => scroll.current, estimateSize: () => 28, overscan: 4,
        useAnimationFrameWithResizeObserver: true,
    });
    const items = virtualizer.getVirtualItems();
    const selected = props.selected && comparison.byFieldId.get(props.selected.id);
    const indexText = selected?.path.startsWith(`${node.path}/`) ? selected.path.slice(node.path.length + 1).split("/")[0] : undefined;
    const rowIndex = indexText !== undefined ? Number(indexText) : -1;
    useLayoutEffect(() => {
        if (request && virtual && rowIndex >= 0 && rowIndex < count) virtualizer.scrollToIndex(rowIndex, { align: "auto" });
    }, [request, rowIndex, virtual, count, virtualizer]);
    useLayoutEffect(() => {
        const key = request && props.selected ? `${request}:${props.selected.id}` : null;
        if (!key || handled.current === key || (virtual && !items.some(item => item.index === rowIndex))) return;
        handled.current = key;
        onReveal();
    }, [request, props.selected, items, rowIndex, virtual, onReveal]);
    const field = node[side];
    const itemCount = field?.children.length ?? 0;
    const caption = side === "label" ? "Label Value" : "Extracted Value";
    const cacheKey = `${node.path}:${side}`;
    const attachScroll = useCallback((element: HTMLDivElement | null): void => {
        if (element && scroll.current !== element) {
            element.scrollLeft = props.tableScroll.get(cacheKey) ?? 0;
            element.scrollTop = props.tableScroll.get(`${cacheKey}:top`) ?? 0;
        }
        scroll.current = element;
    }, [cacheKey, props.tableScroll]);
    const visible = virtual ? items.map(item => ({ index: item.index, start: item.start, size: item.size })) :
        projection.rows.map((_, index) => ({ index, start: 0, size: 0 }));
    return <section className="cu-comparison-array">
        <h3>{caption} <span>{"\u2014"} {itemCount} {itemCount === 1 ? "item" : "items"}</span></h3>
        <div className="cu-inline-table-wrap cu-comparison-array-scroll" ref={attachScroll} data-array-id={cacheKey}
            onScroll={event => {
                props.tableScroll.set(cacheKey, event.currentTarget.scrollLeft);
                props.tableScroll.set(`${cacheKey}:top`, event.currentTarget.scrollTop);
            }}>
            <table className="cu-items-table" aria-label={`${fieldLabel(node.field)} ${side} values`}
                style={{ width: 29 + columnWidths.reduce((sum, width) => sum + width, 0) }}>
                <colgroup><col style={{ width: 29 }} />{projection.columns.map((column, index) =>
                    <col key={column.key} style={{ width: columnWidths[index] }} />)}</colgroup>
                <thead><tr><th scope="col">#</th>{projection.columns.map(column =>
                    <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
                <tbody>
                    {virtual && <tr aria-hidden="true"><td colSpan={projection.columns.length + 1}
                        style={{ height: items[0]?.start ?? 0, padding: 0, border: 0 }} /></tr>}
                    {visible.map(item => {
                        const row = projection.rows[item.index];
                        if (!row) throw new Error("The comparison array row is unavailable.");
                        return <tr key={row.field.id} data-index={item.index} data-comparison-row={item.index}
                            ref={virtual ? virtualizer.measureElement : undefined}>
                            <th scope="row">{item.index + 1}</th>{projection.columns.map(column => {
                                const cell = row.cells.get(column.key);
                                const pair = cell && comparison.byFieldId.get(cell.id);
                                return <td key={column.key}>{pair ? <ComparisonValue node={pair} side={side} props={props} arrayCell /> :
                                    <span className="cu-value-chip is-missing cu-missing-cell">{displayValue()}</span>}</td>;
                            })}
                        </tr>;
                    })}
                    {virtual && <tr aria-hidden="true"><td colSpan={projection.columns.length + 1}
                        style={{ height: Math.max(0, virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0)), padding: 0, border: 0 }} /></tr>}
                </tbody>
            </table>
        </div>
    </section>;
}

export function ComparisonArrayTables({ node, comparison, props, request, onReveal }: {
    node: FieldComparisonNode; comparison: FieldComparison; props: FieldsPaneProps;
    request: number | null; onReveal: () => void;
}) {
    const pair = useRef<HTMLDivElement>(null);
    const [layout, setLayout] = useState({ context: props.workflow.context, sideBySide: true });
    const sideBySide = comparison.comparable && (layout.context === props.workflow.context ? layout.sideBySide : true);
    const horizontalKey = `${node.path}:horizontal`;
    const verticalKey = `${node.path}:vertical`;
    const synchronizeScroll = useCallback((requested: number, requestedTop?: number): void => {
        const scrollers = pair.current?.querySelectorAll<HTMLDivElement>(
            ":scope > .cu-comparison-array > .cu-comparison-array-scroll");
        if (!scrollers?.length) return;
        const maximum = Math.min(...[...scrollers].map(element => Math.max(0, element.scrollWidth - element.clientWidth)));
        const left = Math.max(0, Math.min(requested, maximum));
        const top = requestedTop === undefined ? undefined : Math.max(0, Math.min(requestedTop,
            ...[...scrollers].map(element => Math.max(0, element.scrollHeight - element.clientHeight))));
        props.tableScroll.set(horizontalKey, left);
        if (top !== undefined) props.tableScroll.set(verticalKey, top);
        for (const element of scrollers) {
            if (element.dataset.arrayId) {
                props.tableScroll.set(element.dataset.arrayId, left);
                if (top !== undefined) props.tableScroll.set(`${element.dataset.arrayId}:top`, top);
            }
            if (element.scrollLeft !== left) element.scrollLeft = left;
            if (top !== undefined && element.scrollTop !== top) element.scrollTop = top;
        }
    }, [horizontalKey, verticalKey, props.tableScroll]);
    useLayoutEffect(() => {
        synchronizeScroll(props.tableScroll.get(horizontalKey) ?? props.tableScroll.get(`${node.path}:label`) ??
            props.tableScroll.get(`${node.path}:extracted`) ?? 0,
        sideBySide ? props.tableScroll.get(`${node.path}:label:top`) ?? 0 : undefined);
    }, [horizontalKey, node.path, props.tableScroll, sideBySide, synchronizeScroll]);
    const projection = useMemo(() => inlineArrayProjection(node.field), [node.field]);
    const columnWidths = useMemo(() => projection?.columns.map(column => {
        let length = column.label.length;
        for (const row of projection.rows) {
            const cell = row.cells.get(column.key);
            const pair = cell && comparison.byFieldId.get(cell.id);
            for (const field of [pair?.label, pair?.extracted]) if (field?.hasValue) length = Math.max(length, displayValue(field).length);
        }
        return Math.max(48, Math.min(180, length * 6 + (comparison.comparable ? 18 : 20)));
    }) ?? [], [projection, comparison]);
    if (!projection) throw new Error("Nested arrays must be expanded as comparison fields.");
    const sides: ("label" | "extracted")[] = comparison.comparable ? ["label", "extracted"] : ["label"];
    const selected = props.selected && comparison.byFieldId.get(props.selected.id);
    const containsSelection = selected === node || selected?.path.startsWith(`${node.path}/`);
    return <div ref={pair} className={`cu-comparison-arrays${containsSelection ? " is-selected" : ""}${sideBySide ? " is-side-by-side" : ""}`}
        onScrollCapture={event => {
            const element = event.target;
            if (!(element instanceof HTMLDivElement) || !element.classList.contains("cu-comparison-array-scroll") ||
                element.closest(".cu-comparison-arrays") !== event.currentTarget) return;
            if (element.scrollLeft !== props.tableScroll.get(horizontalKey) ||
                (sideBySide && element.scrollTop !== props.tableScroll.get(verticalKey))) {
                synchronizeScroll(element.scrollLeft, sideBySide ? element.scrollTop : undefined);
            }
        }}>
        {comparison.comparable && <div className="cu-array-layout-controls" role="group" aria-label={`${fieldLabel(node.field)} array layout`}>
            <button type="button" aria-pressed={sideBySide}
                onClick={() => setLayout({ context: props.workflow.context, sideBySide: true })}>Side by side</button>
            <button type="button" aria-pressed={!sideBySide}
                onClick={() => setLayout({ context: props.workflow.context, sideBySide: false })}>Stacked</button>
        </div>}
        {sides.map(side =>
        <ArrayTable key={side} node={node} side={side} projection={projection} columnWidths={columnWidths} comparison={comparison}
            props={props} request={request} onReveal={onReveal} />)}</div>;
}
