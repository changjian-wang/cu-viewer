import type { LoadedSource } from "../internal/source";
import type { CuContent, CuField, CuSignature } from "../internal/types";
import { DetailSourceInfo } from "./DetailSourceInfo";
import { SourceThumbnail } from "./SourceThumbnail";

export function SignaturesPane({ signatures, content, source, selected, onSelect }: {
    signatures: readonly CuSignature[]; content: CuContent; source: LoadedSource | null;
    selected: CuField | null; onSelect: (field: CuField) => void;
}) {
    return <div className="cu-rich-result-scroll">
        <ul className="cu-detail-list" aria-label="Returned signatures">
            {signatures.map(signature => <li key={signature.id}>
                <button type="button" className="cu-detail-select" aria-label={`Select ${signature.field.name}`}
                    aria-pressed={selected?.id === signature.id} data-detail-id={signature.id} onClick={() => onSelect(signature.field)}>
                    <span className="cu-detail-heading"><strong>{signature.field.name}</strong>
                        {signature.role !== undefined && <span>{signature.role}</span>}</span>
                    <span className="cu-detail-source">ID: {signature.signatureId}</span>
                    <DetailSourceInfo field={signature.field} />
                    {signature.field.regions.map((region, index) => <SourceThumbnail key={index} source={source}
                        content={content} region={region} label={`${signature.field.name} region ${index + 1} preview on page ${region.pageNumber}`} />)}
                </button>
            </li>)}
        </ul>
    </div>;
}
