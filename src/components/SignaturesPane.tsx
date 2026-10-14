import { useId } from "react";
import type { LoadedSource } from "../internal/source";
import type { CuContent, CuField, CuSignature } from "../internal/types";
import { DetailSourceInfo } from "./DetailSourceInfo";
import { SourceThumbnail } from "./SourceThumbnail";

export function SignaturesPane({ signatures, content, source, selected, onSelect }: {
    signatures: readonly CuSignature[]; content: CuContent; source: LoadedSource | null;
    selected: CuField | null; onSelect: (field: CuField) => void;
}) {
    const baseId = useId();
    return <div className="cu-rich-result-scroll">
        <ul className="cu-detail-list" aria-label="Returned signatures">
            {signatures.map(signature => <li key={signature.id}>
                <button type="button" className="cu-detail-select" aria-label={`Select ${signature.field.name}`}
                    aria-describedby={`${baseId}-${encodeURIComponent(signature.id)}-metadata ${baseId}-${encodeURIComponent(signature.id)}-id ${baseId}-${encodeURIComponent(signature.id)}-source`}
                    aria-pressed={selected?.id === signature.id} data-detail-id={signature.id} onClick={() => onSelect(signature.field)}>
                    <span id={`${baseId}-${encodeURIComponent(signature.id)}-metadata`} className="cu-detail-heading"><strong>{signature.field.name}</strong>
                        {signature.role !== undefined && <span>{signature.role}</span>}</span>
                    <span id={`${baseId}-${encodeURIComponent(signature.id)}-id`} className="cu-detail-source">ID: {signature.signatureId}</span>
                    <DetailSourceInfo field={signature.field} id={`${baseId}-${encodeURIComponent(signature.id)}-source`} />
                    {signature.field.regions.map((region, index) => <SourceThumbnail key={index} source={source}
                        content={content} region={region} label={`${signature.field.name} region ${index + 1} preview on page ${region.pageNumber}`} />)}
                </button>
            </li>)}
        </ul>
    </div>;
}
