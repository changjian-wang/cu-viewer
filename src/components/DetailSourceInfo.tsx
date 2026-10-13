import type { CuField } from "../internal/types";

export function DetailSourceInfo({ field }: { field: CuField }) {
    const pages = [...new Set(field.regions.map(region => region.pageNumber))];
    return <span className="cu-detail-source">
        {pages.length ? `Page ${pages.join(", ")}${field.regions.length > 1 ? ` · ${field.regions.length} regions` : ""}` : "No source region"}
    </span>;
}
