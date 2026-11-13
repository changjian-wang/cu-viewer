import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { fieldLabel } from "../interaction/interaction";
import { inlineArrayProjection } from "../interaction/reviewFields";
import type { FieldComparison, FieldComparisonNode } from "../model/fieldComparison";
import type { FieldsPaneProps } from "./FieldsPane";
import { ComparisonValue } from "./ComparisonValue";

type Projection = NonNullable<ReturnType<typeof inlineArrayProjection>>;

function ArrayTable({ node, side, projection, comparison, props, request, onReveal }: {
    node: FieldComparisonNode; side: "label" | "extracted"; projection: Projection; comparison: FieldComparison;
    props: FieldsPaneProps; request: number | null; onReveal: () => void;
}) {
    const scroll = useRef<HTMLDivElement>(null);
    const handled = useRef<string | null>(null);
    const count = projection.rows.length;
    const virtual = count > 100;
    const virtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
        count: virtual ? count : 0, getScrollElement: () => scroll.current, estimateSize: () => 36, overscan: 4,
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
        <h3>{caption} <span>{field?.children.length ?? 0} items</span></h3>
        <div className="cu-inline-table-wrap cu-comparison-array-scroll" ref={attachScroll} data-array-id={cacheKey}
            onScroll={event => {
                props.tableScroll.set(cacheKey, event.currentTarget.scrollLeft);
                props.tableScroll.set(`${cacheKey}:top`, event.currentTarget.scrollTop);
            }}>
            <table className="cu-items-table" aria-label={`${fieldLabel(node.field)} ${side} values`}>
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
                                return <td key={column.key}>{pair ? <ComparisonValue node={pair} side={side} props={props} /> :
                                    <span className="cu-missing-cell">No cell returned</span>}</td>;
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
    const projection = useMemo(() => inlineArrayProjection(node.field), [node.field]);
    if (!projection) throw new Error("Nested arrays must be expanded as comparison fields.");
    const sides: ("label" | "extracted")[] = comparison.comparable ? ["label", "extracted"] : ["label"];
    return <div className="cu-comparison-arrays">{sides.map(side =>
        <ArrayTable key={side} node={node} side={side} projection={projection} comparison={comparison}
            props={props} request={request} onReveal={onReveal} />)}</div>;
}
