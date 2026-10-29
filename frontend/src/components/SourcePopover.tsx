import { useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { displayValue, fieldLabel, formatConfidence } from "../interaction/interaction";
import { appearance, confidenceDescription, defaultReviewSettings, isTableValue } from "../interaction/reviewFields";
import type { ReviewSettings } from "../interaction/reviewFields";
import { popoverPosition } from "../source/sourceOverlays";
import type { CuField, CuPoint } from "../model/types";
import type { PageSize } from "../source/geometry";
import { ViewerIcon } from "./ViewerIcon";

interface SourcePopoverProps {
    id: string;
    field: CuField;
    settings?: ReviewSettings;
    onMeasure?: (size: PageSize) => void;
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
                props.onMeasure?.({ width: popup.offsetWidth, height: popup.offsetHeight });
                const next = popoverPosition(anchor, { width: viewport.clientWidth, height: viewport.clientHeight },
                    { width: popup.offsetWidth, height: popup.offsetHeight });
                popup.style.setProperty("--cu-arrow-left", `${Math.max(8, Math.min(popup.offsetWidth - 16, anchor.x - (next?.x ?? anchor.x) + 18))}px`);
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
    }, [props.viewport, props.paper, props.points, props.pan, props.onMeasure]);
    const paragraph = props.field.detailView === "paragraphs";
    const settings = props.settings ?? defaultReviewSettings;
    const style = appearance(props.field, isTableValue(props.field), settings);
    return <>
        <aside id={props.id} ref={element} role="tooltip" aria-label={paragraph ? "Paragraph preview" : "Field preview"}
            className="cu-source-popover"
            style={{ left: position?.x ?? 0, top: position?.y ?? 0, visibility: position ? "visible" : "hidden" }}
            onMouseEnter={props.onEnter} onMouseLeave={props.onLeave}
            onPointerDown={event => event.stopPropagation()}>
            {!paragraph && <strong className="cu-popover-heading">
                {fieldLabel(props.field)}
            </strong>}
            <dl id={`${props.id}-content`} className="cu-flyover-body">
                <div className="cu-flyover-value"><dt className="cu-visually-hidden">{paragraph ? "Content" : "Value"}</dt>
                    <dd style={paragraph ? { color: style.color } : undefined}>{displayValue(props.field)}</dd></div>
                {!paragraph && <div className="cu-flyover-confidence" title={confidenceDescription(props.field, settings.threshold)}
                    style={{ color: style.color, background: style.background }}>
                    <dt className="cu-visually-hidden">Confidence</dt><dd>{props.field.confidence !== undefined ?
                        <><ViewerIcon name="gauge" />{formatConfidence(props.field.confidence, settings.threshold)}</> : "N/A"}</dd>
                </div>}
            </dl>
        </aside>
        {error && <div className="cu-inline-error" role="alert">Source preview: {error}</div>}
    </>;
}
