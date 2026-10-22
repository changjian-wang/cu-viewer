import { useId } from "react";
import type { LoadedSource } from "../source/source";
import type { CuContent, CuField, CuFigure } from "../model/types";
import { DetailSourceInfo } from "./DetailSourceInfo";
import { SourceThumbnail } from "./SourceThumbnail";

export function FiguresPane({ figures, content, source, selected, onSelect }: {
    figures: readonly CuFigure[]; content: CuContent; source: LoadedSource | null;
    selected: CuField | null; onSelect: (field: CuField) => void;
}) {
    const baseId = useId();
    return <div className="cu-rich-result-scroll">
        <ul className="cu-detail-list" aria-label="Returned figures">
            {figures.map(figure => {
                const id = `${baseId}-${encodeURIComponent(figure.id)}`;
                const description = [
                    `${id}-metadata`, `${id}-id`, `${id}-source`,
                    figure.caption !== undefined ? `${id}-caption` : undefined,
                    figure.description !== undefined ? `${id}-description` : undefined,
                    ...figure.footnotes.map((_, index) => `${id}-footnote-${index}`),
                ].filter(Boolean).join(" ");
                return <li key={figure.id}>
                <button type="button" className="cu-detail-select" aria-label={`Select ${figure.field.name}`}
                    aria-describedby={description}
                    aria-pressed={selected?.id === figure.id} data-detail-id={figure.id} onClick={() => onSelect(figure.field)}>
                    <span id={`${id}-metadata`} className="cu-detail-heading"><strong>{figure.field.name}</strong><span>{figure.kind}</span>
                        {figure.role !== undefined && <span>{figure.role}</span>}</span>
                    <span id={`${id}-id`} className="cu-detail-source">ID: {figure.figureId}</span>
                    <DetailSourceInfo field={figure.field} id={`${id}-source`} />
                    {figure.field.regions.map((region, index) => <SourceThumbnail key={index} source={source}
                        content={content} region={region} label={`${figure.field.name} region ${index + 1} preview on page ${region.pageNumber}`} />)}
                    {figure.caption !== undefined && <span id={`${id}-caption`} className="cu-detail-text">Caption: {figure.caption}</span>}
                    {figure.description !== undefined && <span id={`${id}-description`} className="cu-detail-text">{figure.description}</span>}
                    {figure.footnotes.map((note, index) => <span key={index} id={`${id}-footnote-${index}`} className="cu-detail-text">Footnote: {note}</span>)}
                </button>
                </li>;
            })}
        </ul>
    </div>;
}
