import { useId, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import type { CuField, CuParagraph } from "../model/types";
import { emphasizeFieldTarget, getFieldRevealOffset } from "../interaction/fieldNavigation";
import { DetailSourceInfo } from "./DetailSourceInfo";

interface ParagraphsPaneProps {
    paragraphs: readonly CuParagraph[];
    selected: CuField | null;
    hovered: CuField | null;
    previewId: string | undefined;
    onHover: (field: CuField, navigate?: boolean) => void;
    onLeave: (field: CuField) => void;
    onSelect: (field: CuField) => void;
    selectionRequest?: number | null;
    sourceSelection?: boolean;
    handledReveal?: RefObject<number | null>;
}

export function ParagraphsPane({ paragraphs, selected, hovered, previewId, onHover, onLeave, onSelect,
    selectionRequest = null, sourceSelection = false, handledReveal: parentReveal }: ParagraphsPaneProps) {
    const baseId = useId();
    const viewport = useRef<HTMLDivElement>(null);
    const localReveal = useRef<number | null>(null);
    const handledReveal = parentReveal ?? localReveal;
    const emphasis = useRef<Animation | null>(null);
    useLayoutEffect(() => () => { emphasis.current?.cancel(); }, []);
    useLayoutEffect(() => {
        if (!sourceSelection || !selectionRequest || selected?.detailView !== "paragraphs") {
            emphasis.current?.cancel(); emphasis.current = null; return;
        }
        if (handledReveal.current === selectionRequest) return;
        const element = viewport.current;
        const button = [...(element?.querySelectorAll<HTMLButtonElement>("[data-detail-id]") ?? [])]
            .find(button => button.dataset.detailId === selected.id);
        if (!element || !button || !element.clientWidth || !element.clientHeight) return;
        const bounds = element.getBoundingClientRect();
        const visible = {
            left: bounds.left + element.clientLeft,
            right: bounds.left + element.clientLeft + element.clientWidth,
            top: bounds.top + element.clientTop + 8,
            bottom: bounds.top + element.clientTop + element.clientHeight - 8,
        };
        if (visible.bottom <= visible.top) return;
        element.scrollTop += getFieldRevealOffset(button.getBoundingClientRect(), visible, true).y;
        handledReveal.current = selectionRequest;
        emphasis.current?.cancel(); emphasis.current = emphasizeFieldTarget(button);
    }, [selectionRequest, sourceSelection, selected, paragraphs, handledReveal]);
    return <div className="cu-rich-result-scroll" ref={viewport}>
        <ol className="cu-detail-list" aria-label="Returned paragraphs">
            {paragraphs.map(paragraph => <li key={paragraph.id}>
                <button type="button" className={`cu-detail-select${hovered?.id === paragraph.id ? " is-hovered" : ""}`}
                    aria-label={`Select ${paragraph.field.name}`}
                    aria-describedby={`${previewId && hovered?.id === paragraph.id && paragraph.field.regions.length ? `${previewId}-content` : `${baseId}-${encodeURIComponent(paragraph.id)}-text`} ${baseId}-${encodeURIComponent(paragraph.id)}-source${paragraph.role !== undefined ? ` ${baseId}-${encodeURIComponent(paragraph.id)}-role` : ""}`}
                    aria-pressed={selected?.id === paragraph.id} data-detail-id={paragraph.id} data-review-focus={paragraph.id}
                    onPointerMove={() => onHover(paragraph.field)} onMouseLeave={() => onLeave(paragraph.field)}
                    onFocus={() => onHover(paragraph.field, false)} onBlur={() => onLeave(paragraph.field)}
                    onClick={() => onSelect(paragraph.field)}>
                    <span className="cu-detail-heading"><strong>{paragraph.field.name}</strong>
                        {paragraph.role !== undefined && <span id={`${baseId}-${encodeURIComponent(paragraph.id)}-role`}>{paragraph.role}</span>}</span>
                    <DetailSourceInfo field={paragraph.field} id={`${baseId}-${encodeURIComponent(paragraph.id)}-source`} />
                    <span id={`${baseId}-${encodeURIComponent(paragraph.id)}-text`} className="cu-detail-text">{paragraph.content === "" ? '"" (empty string)' : paragraph.content}</span>
                </button>
            </li>)}
        </ol>
    </div>;
}
