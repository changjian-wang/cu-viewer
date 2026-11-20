import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { canExpandJsonTree, indexJsonSearch, isJsonContainer, jsonSearchMatch } from "../model/jsonTree";
import type { JsonSearchIndex, JsonSearchMatch, JsonTreeViewState } from "../model/jsonTree";
import { inspectJson, validateLargeJson } from "../model/resultLimits";
import type { JsonValidation } from "../model/resultLimits";
import { PagedJsonTree } from "./PagedJsonTree";
import { JsonStringDialog } from "./JsonStringDialog";
import type { JsonStringSelection } from "./JsonStringDialog";
import { ViewerIcon } from "./ViewerIcon";

export { MAX_JSON_CHARACTERS, MAX_JSON_VALUES } from "../model/resultLimits";

export interface JsonPaneState {
    tree: JsonTreeViewState;
    scroll: { top: number; left: number };
    validation: JsonValidation | null;
    search?: { query: string; position: number; index?: JsonSearchIndex; error?: string };
}

interface JsonPaneProps {
    value: unknown;
    viewState?: JsonPaneState;
}

function revealMatch(state: JsonPaneState, match: JsonSearchMatch): void {
    const nodes = new Map(state.tree.nodes);
    for (const { path, page } of match.ancestors) nodes.set(path, { expanded: true, page });
    state.tree = { ...state.tree, nodes };
}

export function JsonPane({ value, viewState }: JsonPaneProps) {
    const inspection = useMemo(() => inspectJson(value), [value]);
    const ownState = useMemo<JsonPaneState>(() => ({
        tree: { nodes: new Map(), expansion: "root" }, scroll: { top: 0, left: 0 }, validation: null,
    }), [value]);
    const state = viewState ?? ownState;
    const [, refresh] = useReducer((version: number) => version + 1, 0);
    const viewport = useRef<HTMLDivElement | null>(null);
    const scrollToMatch = useRef(false);
    const attach = useCallback((element: HTMLDivElement | null): void => {
        if (viewport.current) state.scroll = { top: viewport.current.scrollTop, left: viewport.current.scrollLeft };
        viewport.current = element;
        if (element) { element.scrollTop = state.scroll.top; element.scrollLeft = state.scroll.left; }
    }, [state]);
    const [stringChoice, setStringChoice] = useState<{ root: unknown; selection: JsonStringSelection } | null>(null);
    const onViewString = useCallback((selection: JsonStringSelection): void => setStringChoice({ root: value, selection }), [value]);
    const closeString = useCallback((): void => setStringChoice(null), []);
    const [largeInspection, setLargeInspection] = useState<{ value: unknown; validation: JsonValidation } | null>(null);
    useEffect(() => {
        if (inspection.status !== "limit" || state.validation?.status === "ready" || state.validation?.status === "invalid") return;
        const controller = new AbortController();
        void validateLargeJson(value, controller.signal).then(validation => {
            if (!controller.signal.aborted) { state.validation = validation; setLargeInspection({ value, validation }); }
        }).catch((error: unknown) => {
            if (!controller.signal.aborted) setLargeInspection({ value, validation: {
                status: "invalid", message: error instanceof Error ? error.message : "The supplied result could not be inspected as JSON.",
            } });
        });
        return () => controller.abort();
    }, [inspection, value, state]);
    if (stringChoice && stringChoice.root !== value) setStringChoice(null);
    const validation = state.validation ?? (largeInspection && largeInspection.value === value ? largeInspection.validation : null);
    const error = inspection.status === "invalid" ? inspection.message :
        inspection.status === "limit" && validation?.status === "invalid" ? validation.message : null;
    const ready = inspection.status === "ready" || (inspection.status === "limit" && validation?.status === "ready");
    const search = state.search;
    const query = search?.query ?? "";
    const index = search?.index;
    const position = search?.position ?? 0;
    const pending = query && !index && !search?.error ? search : undefined;
    const [bulkNotice, setBulkNotice] = useState<JsonPaneState | null>(null);
    useEffect(() => {
        if (!pending || !ready) return;
        const previousTree = state.tree;
        const controller = new AbortController();
        void indexJsonSearch(value, pending.query, controller.signal).then(index => {
            if (controller.signal.aborted || state.search !== pending) return;
            state.search = { ...pending, index };
            if (index.count && state.tree === previousTree) {
                revealMatch(state, jsonSearchMatch(index, pending.position));
                scrollToMatch.current = true;
            }
            refresh();
        }).catch((failure: unknown) => {
            if (controller.signal.aborted || state.search !== pending) return;
            state.search = { ...pending, error: failure instanceof Error ? failure.message : "The original result could not be searched." };
            refresh();
        });
        return () => controller.abort();
    }, [pending, ready, state, value]);
    const match = useMemo(() => index?.count ? jsonSearchMatch(index, position) : null, [index, position]);
    useLayoutEffect(() => {
        if (!scrollToMatch.current) return;
        scrollToMatch.current = false;
        const scroll = viewport.current;
        const target = scroll?.querySelector<HTMLElement>("mark[data-json-tree-match]");
        if (!scroll || !target || !match) return;
        const bounds = scroll.getBoundingClientRect(), hit = target.getBoundingClientRect();
        if (hit.top < bounds.top + 8 || hit.bottom > bounds.top + scroll.clientHeight - 8) {
            scroll.scrollTop += hit.top - bounds.top - Math.max(8, (scroll.clientHeight - hit.height) / 2);
        }
        if (hit.left < bounds.left || hit.right > bounds.left + scroll.clientWidth) scroll.scrollLeft += hit.left - bounds.left - 8;
    }, [match, state.tree]);
    const changeQuery = (text: string): void => {
        state.search = { query: text, position: 0 };
        refresh();
    };
    const move = (direction: number): void => {
        if (!index?.count) return;
        const next = (position + direction + index.count) % index.count;
        state.search = { query, position: next, index };
        revealMatch(state, jsonSearchMatch(index, next));
        scrollToMatch.current = true;
        refresh();
    };
    const bulkExpand = (expanded: boolean): void => {
        if (expanded && !canExpandJsonTree(value)) {
            setBulkNotice(state);
            return;
        }
        setBulkNotice(null);
        const nodes = new Map<string, { page: number }>();
        for (const [path, node] of state.tree.nodes) if (node.page) nodes.set(path, { page: node.page });
        state.tree = { nodes, expansion: expanded ? "expanded" : "collapsed" };
        if (viewport.current) { viewport.current.scrollTop = 0; viewport.current.scrollLeft = 0; }
        refresh();
    };
    const toolbar = <footer className="cu-fields-review-footer cu-aligned-search-footer cu-json-toolbar" role="group" aria-label="Result JSON toolbar">
        <label className="cu-search-box"><ViewerIcon name="search" /><input type="search" aria-label="Search result JSON"
            placeholder="Search JSON..." title="Find literal text in original JSON keys and values."
            value={query} disabled={!ready} onChange={event => changeQuery(event.target.value)}
            onKeyDown={event => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Enter") { event.preventDefault(); move(event.shiftKey ? -1 : 1); }
                if (event.key === "Escape" && query) { event.preventDefault(); event.stopPropagation(); changeQuery(""); }
            }} /></label>
        <div className="cu-json-toolbar-trailing">
            {query && <span className="cu-json-find-position" role="status" aria-label="JSON search results">{
                search?.error ? "Search failed" : !index ? "Searching..." : !index.count ? "No matches" :
                    `${position + 1} / ${index.count.toLocaleString("en-US")}`
            }</span>}
            <div className="cu-fields-toolbar-actions cu-json-bulk-actions">
                <button type="button" className="cu-text-button" disabled={!ready || !isJsonContainer(value)}
                    onClick={() => bulkExpand(false)}><ViewerIcon name="collapseAll" />Collapse all</button>
                <button type="button" className="cu-text-button" disabled={!ready || !isJsonContainer(value)}
                    onClick={() => bulkExpand(true)}><ViewerIcon name="expandAll" />Expand all</button>
            </div>
        </div>
    </footer>;
    if (error) {
        return <><div className="cu-state cu-error" role="alert">
            <h2>JSON could not be displayed</h2>
            <p>{error}</p>
        </div>{toolbar}</>;
    }
    if (!ready) {
        return <><div className="cu-state" role="status">Validating large JSON without blocking the viewer...</div>{toolbar}</>;
    }
    return <>{bulkNotice === state && <div className="cu-inline-error cu-json-bulk-notice" role="status">
        This result is too large to expand all at once. Search or expand individual nodes.
        <button type="button" className="cu-icon-button" aria-label="Dismiss JSON expansion notice"
            onClick={() => setBulkNotice(null)}><ViewerIcon name="close" /></button>
    </div>}
        {search?.error && <div className="cu-inline-error" role="alert">JSON search failed: {search.error}</div>}
        <div className="cu-rich-result-scroll" ref={attach} onScroll={event => {
            state.scroll = { top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft };
        }}><PagedJsonTree value={value} state={state.tree} match={match} onViewString={onViewString} /></div>
        {toolbar}
        {stringChoice && stringChoice.root === value && <JsonStringDialog key={stringChoice.selection.path}
            selection={stringChoice.selection} onClose={closeString} />}
    </>;
}
