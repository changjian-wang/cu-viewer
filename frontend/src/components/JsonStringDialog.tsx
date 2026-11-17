import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ViewerIcon } from "./ViewerIcon";
import { JsonStringText } from "./JsonStringText";
import { CopyButton } from "./CopyButton";
import { indexedTextMatch, indexLiteralText } from "../model/textSearch";
import type { TextSearchIndex } from "../model/textSearch";

export interface JsonStringSelection {
    value: string;
    path: string;
    label: string | undefined;
    trigger: HTMLButtonElement;
}

export function JsonStringDialog({ selection, onClose }: {
    selection: JsonStringSelection; onClose: () => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const viewport = useRef<HTMLDivElement>(null);
    const titleId = useId();
    const literal = useMemo(() => JSON.stringify(selection.value), [selection.value]);
    const searchInput = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState("");
    const [position, setPosition] = useState(0);
    const [search, setSearch] = useState<{ text: string; query: string; index: TextSearchIndex | null; error: string | null } | null>(null);
    useEffect(() => {
        if (!query) return;
        const controller = new AbortController();
        void indexLiteralText(literal, query, controller.signal).then(index => {
            if (!controller.signal.aborted) { setPosition(0); setSearch({ text: literal, query, index, error: null }); }
        }).catch((error: unknown) => {
            if (!controller.signal.aborted) setSearch({ text: literal, query, index: null,
                error: error instanceof Error ? error.message : "Full-text search failed." });
        });
        return () => controller.abort();
    }, [literal, query]);
    const currentSearch = search?.text === literal && search.query === query ? search : null;
    const index = query ? currentSearch?.index ?? null : null;
    const current = index?.count ? Math.min(position, index.count - 1) : 0;
    const activeMatch = useMemo(() => index?.count ? indexedTextMatch(literal, index, current) : null, [literal, index, current]);
    const move = (direction: number): void => {
        if (index?.count) setPosition((current + direction + index.count) % index.count);
    };
    useLayoutEffect(() => {
        const element = dialog.current;
        if (!element) return;
        const scroll = selection.trigger.closest<HTMLElement>(".cu-rich-result-scroll");
        const position = scroll ? { top: scroll.scrollTop, left: scroll.scrollLeft } : null;
        element.showModal();
        viewport.current?.focus({ preventScroll: true });
        return () => {
            if (element.open) element.close();
            if (selection.trigger.isConnected) {
                if (scroll && position) { scroll.scrollTop = position.top; scroll.scrollLeft = position.left; }
                selection.trigger.focus({ preventScroll: true });
            }
        };
    }, [selection.trigger]);
    return <dialog ref={dialog} className="cu-json-string-dialog" aria-labelledby={titleId} aria-modal="true"
        onKeyDown={event => {
            if (event.key === "Escape") {
                event.stopPropagation();
                // Search inputs otherwise consume Escape before native dialog cancellation.
                if (!event.nativeEvent.isComposing) { event.preventDefault(); onClose(); }
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
                event.preventDefault(); event.stopPropagation(); searchInput.current?.focus();
            }
        }}
        onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}>
        <header>
            <div className="cu-json-string-heading">
                <h2 id={titleId}>{selection.label ?? "JSON string"}</h2>
                <span className="cu-json-string-path">{selection.path || "/"}</span>
            </div>
            <span className="cu-json-string-count">{selection.value.length.toLocaleString("en-US")} characters</span>
            <button type="button" className="cu-icon-button" aria-label="Close full text" title="Close full text" onClick={onClose}>
                <ViewerIcon name="close" />
            </button>
        </header>
        <div className="cu-json-string-search" role="search" aria-label="Full text search">
            <label className="cu-search-box"><ViewerIcon name="search" /><input ref={searchInput} type="search"
                aria-label="Search full text" placeholder="Find text..."
                title="Literal, case-insensitive search of the complete displayed JSON string."
                value={query} onChange={event => setQuery(event.target.value)}
                onKeyDown={event => {
                    if (event.key === "Enter") { event.preventDefault(); move(event.shiftKey ? -1 : 1); }
                }} /></label>
            <span role="status" aria-label="Full text search results">{!query ? "0 / 0" : currentSearch?.error ? "Search failed" :
                !index ? "Searching..." : !index.count ? "No matches" : `${current + 1} / ${index.count.toLocaleString("en-US")}`}</span>
            <button type="button" className="cu-icon-button" aria-label="Previous text match" disabled={!index?.count}
                onClick={() => move(-1)}><ViewerIcon name="left" /></button>
            <button type="button" className="cu-icon-button" aria-label="Next text match" disabled={!index?.count}
                onClick={() => move(1)}><ViewerIcon name="right" /></button>
        </div>
        {query && currentSearch?.error && <div className="cu-inline-error" role="alert">Full-text search failed: {currentSearch.error}</div>}
        <JsonStringText text={literal} viewportRef={viewport} searchIndex={index} activeMatch={activeMatch} />
        <footer><span>JSON string literal; escape sequences are preserved. Copy copies the original value.</span>
            <CopyButton value={selection.value} label="Copy full text" context={selection} />
        </footer>
    </dialog>;
}
