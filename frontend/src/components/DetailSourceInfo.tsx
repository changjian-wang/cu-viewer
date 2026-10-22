import type { CuField } from "../model/types";

export function DetailSourceInfo({ field, id }: { field: CuField; id?: string | undefined }) {
    const pages = [...new Set(field.regions.map(region => region.pageNumber))];
    return <span id={id} className="cu-detail-source">
        {pages.length ? `Page ${pages.join(", ")}${field.regions.length > 1 ? ` · ${field.regions.length} regions` : ""}` : "No source region"}
    </span>;
}
