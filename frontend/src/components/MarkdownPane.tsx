import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ViewerIcon } from "./ViewerIcon";
import { useMarkdownDocument, useMarkdownSnapshot } from "../markdown/client";
import type { MarkdownDocumentClient } from "../markdown/client";
import { MarkdownFlow, MarkdownSourceContext } from "./MarkdownContent";
import type { CuContent } from "../model/types";
import type { LoadedSource } from "../source/source";
import { MarkdownErrorBoundary, MarkdownFailure, RawMarkdown } from "./MarkdownRecovery";

export { MARKDOWN_STATIC_CHARACTERS } from "../markdown/model";

interface MarkdownPaneProps {
    markdown: string | undefined;
    pageIndex?: number;
    onPageChange?: (page: number) => void;
    client?: MarkdownDocumentClient;
    content?: CuContent | undefined;
    source?: LoadedSource | null | undefined;
}

function MarkdownPagination({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
    const [text, setText] = useState(String(page + 1));
    const [error, setError] = useState<string | null>(null);
    const errorId = useId();
    const edited = useRef(false);
    const currentPage = useRef(page);
    useEffect(() => {
        currentPage.current = page;
        edited.current = false;
        setText(String(page + 1));
        setError(null);
    }, [page, pages]);
    const commit = (next: number): void => {
        currentPage.current = next;
        edited.current = false;
        setText(String(next + 1));
        setError(null);
        onChange(next);
    };
    const applyPage = (): void => {
        const number = Number(text);
        if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(number) || number > pages) {
            setError("Enter an existing Markdown page number.");
            return;
        }
        commit(number - 1);
    };
    const step = (offset: number): void => commit(Math.max(0, Math.min(pages - 1, currentPage.current + offset)));
    if (pages <= 1) return null;
    return <footer className="cu-markdown-toolbar cu-source-view-toolbar" role="group" aria-label="Markdown pagination">
        <div className="cu-page-controls">
            <button type="button" className="cu-icon-button" aria-label="Previous Markdown page" disabled={page === 0}
                title={page === 0 ? "First Markdown page" : "Previous Markdown page"} onClick={() => step(-1)}>
                <ViewerIcon name="left" />
            </button>
            <input aria-label="Markdown page number" inputMode="numeric" value={text}
                aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
                onChange={event => { edited.current = true; setText(event.target.value); }}
                onKeyDown={event => { if (event.key === "Enter") applyPage(); }}
                onBlur={() => { if (edited.current) applyPage(); }} />
            <span aria-label="Total Markdown pages">/ {pages}</span>
            <button type="button" className="cu-icon-button" aria-label="Next Markdown page" disabled={page === pages - 1}
                title={page === pages - 1 ? "Last Markdown page" : "Next Markdown page"} onClick={() => step(1)}>
                <ViewerIcon name="right" />
            </button>
            <span className="cu-visually-hidden" role="status">Page {page + 1} of {pages}</span>
        </div>
        {error && <div id={errorId} className="cu-inline-error" role="alert">{error}</div>}
    </footer>;
}

function MarkdownDocument({ client, pageIndex, onPageChange }: {
    client: MarkdownDocumentClient; pageIndex: number; onPageChange: (page: number) => void;
}) {
    const snapshot = useMarkdownSnapshot(client);
    const [raw, setRaw] = useState<"none" | "page" | "document">("none");
    useEffect(() => { client.ensure(pageIndex); }, [client]);
    const index = snapshot.status === "ready" ? snapshot.index : null;
    const page = index ? Math.min(pageIndex, index.pages.length - 1) : pageIndex;
    const flow = index?.pages[page];
    const original = flow && raw !== "document" ? client.markdown.slice(flow.rawStart, flow.rawEnd) : client.markdown;
    const retry = (): void => { setRaw("none"); client.retry(page); };
    return <>
        {snapshot.status === "error" ? <MarkdownFailure markdown={client.markdown} message={snapshot.message} onRetry={retry} /> :
            raw !== "none" ? <>
                <div className="cu-markdown-notice" role="status">
                    Original Markdown{raw === "document" ? " (whole document)" : ""}.
                    <button type="button" onClick={() => setRaw("none")}>Show formatted Markdown</button>
                </div>
                <RawMarkdown key={`${client.identity}:${raw}:${page}`} markdown={original} />
            </> : flow ? <MarkdownErrorBoundary key={`${client.identity}:${snapshot.attempt}:${page}`}
                markdown={original} onRetry={retry}>
                <MarkdownFlow client={client} flow={flow} />
            </MarkdownErrorBoundary> : <div className="cu-state" role="status">
                <h2>Formatting Markdown...</h2>
                <p>The document is being parsed in the background. PDF and other result views remain available.</p>
                <button type="button" onClick={() => setRaw("document")}>View original Markdown</button>
            </div>}
        {index && raw !== "document" && <MarkdownPagination page={page} pages={index.pages.length} onChange={onPageChange} />}
    </>;
}

export function MarkdownPane({ markdown, pageIndex, onPageChange, client, content, source }: MarkdownPaneProps) {
    const owned = useMarkdownDocument(client ? undefined : markdown, markdown);
    const document = client ?? owned;
    const [choice, setChoice] = useState({ markdown, page: 0 });
    const page = pageIndex ?? (choice.markdown === markdown ? choice.page : 0);
    const sourceContext = useMemo(() => ({ content, source: source ?? null }), [content, source]);
    if (markdown === undefined || !markdown.trim() || !document) {
        return <div className="cu-state">
            <h2>No Markdown returned</h2>
            <p>This content item does not include a nonempty Markdown result.</p>
        </div>;
    }
    return <MarkdownSourceContext.Provider value={sourceContext}>
        <MarkdownDocument key={document.identity} client={document} pageIndex={page} onPageChange={next => {
            setChoice({ markdown, page: next });
            onPageChange?.(next);
        }} />
    </MarkdownSourceContext.Provider>;
}
