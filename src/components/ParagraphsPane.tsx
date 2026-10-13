import type { CuField, CuParagraph } from "../internal/types";
import { DetailSourceInfo } from "./DetailSourceInfo";

interface ParagraphsPaneProps {
    paragraphs: readonly CuParagraph[];
    selected: CuField | null;
    onSelect: (field: CuField) => void;
}

export function ParagraphsPane({ paragraphs, selected, onSelect }: ParagraphsPaneProps) {
    return <div className="cu-rich-result-scroll">
        <ol className="cu-detail-list" aria-label="Returned paragraphs">
            {paragraphs.map(paragraph => <li key={paragraph.id}>
                <button type="button" className="cu-detail-select" aria-label={`Select ${paragraph.field.name}`}
                    aria-pressed={selected?.id === paragraph.id} data-detail-id={paragraph.id}
                    onClick={() => onSelect(paragraph.field)}>
                    <span className="cu-detail-heading"><strong>{paragraph.field.name}</strong>
                        {paragraph.role !== undefined && <span>{paragraph.role}</span>}</span>
                    <DetailSourceInfo field={paragraph.field} />
                    <span className="cu-detail-text">{paragraph.content === "" ? '"" (empty string)' : paragraph.content}</span>
                </button>
            </li>)}
        </ol>
    </div>;
}
