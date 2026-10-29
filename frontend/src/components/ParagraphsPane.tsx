import { useId } from "react";
import type { CuField, CuParagraph } from "../model/types";
import { DetailSourceInfo } from "./DetailSourceInfo";

interface ParagraphsPaneProps {
    paragraphs: readonly CuParagraph[];
    selected: CuField | null;
    hovered: CuField | null;
    previewId: string | undefined;
    onHover: (field: CuField, navigate?: boolean) => void;
    onLeave: (field: CuField) => void;
    onSelect: (field: CuField) => void;
}

export function ParagraphsPane({ paragraphs, selected, hovered, previewId, onHover, onLeave, onSelect }: ParagraphsPaneProps) {
    const baseId = useId();
    return <div className="cu-rich-result-scroll">
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
