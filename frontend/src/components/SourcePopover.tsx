import { useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { displayValue, fieldLabel, formatConfidence } from "../interaction/interaction";
import { popoverPosition } from "../source/sourceOverlays";
import type { CuField, CuPoint, CuTable } from "../model/types";

interface SourcePopoverProps {
    id: string;
    field: CuField;
    table?: CuTable;
    color: string;
    points: readonly CuPoint[];
    pan: CuPoint;
    viewport: RefObject<HTMLDivElement | null>;
    paper: RefObject<HTMLDivElement | null>;
    onEnter: () => void;
    onLeave: () => void;
}

export function SourcePopover(props: SourcePopoverProps) {
    const element = useRef<HTMLElement>(null);
    const [position, setPosition] = useState<CuPoint | null>(null);
    const [error, setError] = useState<string | null>(null);
    useLayoutEffect(() => {
        const popup = element.current;
        const viewport = props.viewport.current;
        const paper = props.paper.current;
        if (!popup || !viewport || !paper) return;
        const update = (): void => {
            try {
                const frame = paper.getBoundingClientRect();
                const bounds = viewport.getBoundingClientRect();
                const left = Math.min(...props.points.map(point => point.x));
                const top = Math.min(...props.points.map(point => point.y));
                const right = Math.max(...props.points.map(point => point.x));
                const bottom = Math.max(...props.points.map(point => point.y));
                const anchor = { x: frame.x + left - bounds.x - viewport.clientLeft,
                    y: frame.y + top - bounds.y - viewport.clientTop, width: right - left, height: bottom - top };
                const fullHeight = viewport.clientHeight - 16;
                const beside = anchor.x - 18 >= popup.offsetWidth ||
                    viewport.clientWidth - anchor.x - anchor.width - 18 >= popup.offsetWidth;
                const freeHeight = Math.max(anchor.y - 18, viewport.clientHeight - anchor.y - anchor.height - 18);
                popup.style.maxHeight = `${Math.max(1, Math.min(fullHeight, beside || freeHeight < 48 ? fullHeight : freeHeight))}px`;
                const next = popoverPosition(anchor, { width: viewport.clientWidth, height: viewport.clientHeight },
                    { width: popup.offsetWidth, height: popup.offsetHeight });
                setPosition(next ? { x: next.x + viewport.scrollLeft, y: next.y + viewport.scrollTop } : null);
                setError(null);
            } catch (failure) {
                setPosition(null);
                setError(failure instanceof Error ? failure.message : String(failure));
            }
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(viewport);
        observer.observe(paper);
        observer.observe(popup);
        viewport.addEventListener("scroll", update, { passive: true });
        return () => {
            observer.disconnect();
            viewport.removeEventListener("scroll", update);
        };
    }, [props.viewport, props.paper, props.points, props.pan]);
    const paragraph = props.field.detailView === "paragraphs";
    return <>
        <aside id={props.id} ref={element} role="tooltip" aria-label={props.table ? "Table preview" : paragraph ? "Paragraph preview" : "Field preview"}
            className={`cu-source-popover${props.table ? " cu-table-popover" : ""}`}
            style={{ left: position?.x, top: position?.y, visibility: position ? "visible" : "hidden" }}
            onMouseEnter={props.onEnter} onMouseLeave={props.onLeave}
            onPointerDown={event => event.stopPropagation()}>
            {!paragraph && !props.table && <strong className="cu-popover-heading">
                <span className="cu-dot" aria-hidden="true" style={{ background: props.color, borderColor: props.color }} />
                {fieldLabel(props.field)}
            </strong>}
            {props.table ? <span id={`${props.id}-content`}>Rows: {props.table.rowCount}, Columns: {props.table.columnCount}</span> :
            <dl id={`${props.id}-content`}>
                <dt>{paragraph ? "Content" : "Value"}</dt><dd>{displayValue(props.field)}</dd>
                {!paragraph && props.field.confidence !== undefined && <>
                    <dt>Confidence</dt><dd>{formatConfidence(props.field.confidence)}</dd>
                </>}
            </dl>}
        </aside>
        {error && <div className="cu-inline-error" role="alert">Source preview: {error}</div>}
    </>;
}
