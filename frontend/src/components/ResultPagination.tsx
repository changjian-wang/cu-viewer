interface ResultPaginationProps {
    label: string;
    page: number;
    pages: number;
    summary?: string;
    onChange: (page: number) => void;
}

export function ResultPagination({ label, page, pages, summary, onChange }: ResultPaginationProps) {
    if (pages <= 1) return null;
    return <div className="cu-result-pagination" role="group" aria-label={`${label} pagination`}>
        <button type="button" aria-label={`First ${label} page`} disabled={page === 0} onClick={() => onChange(0)}>First</button>
        <button type="button" aria-label={`Previous ${label} page`} disabled={page === 0} onClick={() => onChange(page - 1)}>Previous</button>
        <span aria-live="polite">{summary ?? `Page ${page + 1} of ${pages}`}</span>
        <button type="button" aria-label={`Next ${label} page`} disabled={page === pages - 1} onClick={() => onChange(page + 1)}>Next</button>
        <button type="button" aria-label={`Last ${label} page`} disabled={page === pages - 1} onClick={() => onChange(pages - 1)}>Last</button>
    </div>;
}
