import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { inspectJson, MAX_JSON_CHARACTERS, MAX_JSON_VALUES } from "../model/resultLimits";
import { indexJson, jsonSourceTargets } from "../model/jsonNavigation";
import type { JsonNode } from "../model/jsonNavigation";
import type { CuContent, CuField } from "../model/types";
import { getFieldRevealOffset } from "../interaction/fieldNavigation";
import { unavailableSourcePageMessage } from "../source/source";
import { ViewerIcon } from "./ViewerIcon";
import { ExpansionSettings } from "./ExpansionSettings";

export { MAX_JSON_CHARACTERS, MAX_JSON_VALUES } from "../model/resultLimits";

const emptyContents: readonly CuContent[] = [];

interface JsonPaneProps {
    value: unknown;
    contents?: readonly CuContent[];
    sourceReady?: boolean;
    isPageAvailable?: (pageNumber: number) => boolean;
    onLocateSource?: ((field: CuField, contentIndex: number) => void) | undefined;
}

function initialReview(value: unknown) {
    return { value, query: "", path: null as string | null, expanded: new Set([""]) };
}

function JsonBrowser({ value, contents = emptyContents, sourceReady = false, isPageAvailable, onLocateSource }: JsonPaneProps) {
    const baseId = useId();
    const tree = useMemo(() => {
        // Index serialized JSON rather than object graphs hidden behind toJSON.
        const serialized: unknown = JSON.parse(JSON.stringify(value));
        return indexJson(serialized);
    }, [value]);
    const sources = useMemo(() => jsonSourceTargets(tree, contents), [tree, contents]);
    const expandablePaths = useMemo(() => [...tree.nodes.values()].filter(node => node.children.length > 0).map(node => node.path), [tree]);
    const summaryExpandedPaths = useMemo(() => {
        const contentsPath = ["/result/contents", "/contents"].find(path => tree.nodes.has(path));
        return contentsPath ? expandablePaths.filter(path => path !== contentsPath && !path.startsWith(`${contentsPath}/`)) : [""];
    }, [tree, expandablePaths]);
    const viewport = useRef<HTMLDivElement>(null);
    const settingsButton = useRef<HTMLButtonElement>(null);
    const [settingsContext, setSettingsContext] = useState<{ value: unknown } | null>(null);
    const settingsOpen = settingsContext !== null && settingsContext.value === value;
    const elements = useRef(new Map<string, HTMLLIElement>());
    const pendingReveal = useRef<{ value: unknown; path: string; focus: boolean } | null>(null);
    const [review, setReview] = useState(() => initialReview(value));
    const current = useMemo(() => review.value === value ? review : initialReview(value), [review, value]);
    const query = current.query.trim().toLowerCase();
    const navigation = useMemo(() => tree.properties.filter(node => node.key?.toLowerCase().includes(query)), [tree, query]);
    const matches = useMemo(() => new Set(query ? navigation.map(node => node.path) : []), [query, navigation]);
    const currentIndex = navigation.findIndex(node => node.path === current.path);
    const ancestors = (path: string): string[] => {
        const paths: string[] = [];
        let parent = tree.nodes.get(path)?.parentPath;
        while (parent !== undefined && parent !== null) {
            paths.push(parent);
            parent = tree.nodes.get(parent)?.parentPath;
        }
        return paths;
    };
    const searchExpanded = new Set(query ? navigation.flatMap(node => ancestors(node.path)) : []);
    const isExpanded = (node: JsonNode): boolean => current.expanded.has(node.path) || searchExpanded.has(node.path);
    const focusPath = ancestors(current.path ?? "").reverse()
        .find(path => !current.expanded.has(path) && !searchExpanded.has(path)) ?? current.path ?? "";
    useLayoutEffect(() => {
        const request = pendingReveal.current;
        if (!request) return;
        if (request.value !== value) { pendingReveal.current = null; return; }
        const element = elements.current.get(request.path), scroll = viewport.current;
        if (!element || !scroll) return;
        const target = element.querySelector<HTMLElement>(":scope > .cu-json-line > .cu-json-label") ??
            element.querySelector<HTMLElement>(":scope > .cu-json-line");
        if (target && scroll.clientWidth && scroll.clientHeight) {
            const bounds = scroll.getBoundingClientRect();
            const offset = getFieldRevealOffset(target.getBoundingClientRect(), {
                left: bounds.left + scroll.clientLeft + 8,
                right: bounds.left + scroll.clientLeft + scroll.clientWidth - 8,
                top: bounds.top + scroll.clientTop + 8,
                bottom: bounds.top + scroll.clientTop + scroll.clientHeight - 8,
            }, true);
            scroll.scrollLeft += offset.x;
            scroll.scrollTop += offset.y;
        }
        pendingReveal.current = null;
        if (request.focus) element.focus({ preventScroll: true });
    }, [current, tree, value]);
    const choose = (path: string, focus: boolean): void => {
        pendingReveal.current = { value, path, focus };
        setReview({ ...current, path, expanded: query ? current.expanded : new Set([...current.expanded, ...ancestors(path)]) });
    };
    const chooseNext = (direction: number, focus = true): void => {
        const node = navigation[currentIndex < 0 ? direction > 0 ? 0 : navigation.length - 1 :
            (currentIndex + direction + navigation.length) % navigation.length];
        if (node) choose(node.path, focus);
    };
    const toggle = (node: JsonNode): void => {
        if (searchExpanded.has(node.path)) { setReview({ ...current, path: node.path }); return; }
        const expanded = new Set(current.expanded);
        if (expanded.has(node.path)) expanded.delete(node.path); else expanded.add(node.path);
        setReview({ ...current, path: node.path, expanded });
    };
    const closeSettings = (restore: boolean): void => {
        if (restore) settingsButton.current?.focus({ preventScroll: true });
        setSettingsContext(null);
    };
    const expansionDisabledReason = query ? "Clear search before expanding or collapsing JSON." :
        expandablePaths.length ? null : "No JSON nodes to expand or collapse.";
    const handleTreeKey = (event: KeyboardEvent<HTMLUListElement>): void => {
        if (!(event.target instanceof HTMLElement) || event.nativeEvent.isComposing) return;
        const path = event.target.closest<HTMLElement>("[data-json-path]")?.dataset.jsonPath;
        const node = path === undefined ? undefined : tree.nodes.get(path);
        if (!node) return;
        const visible = [...(viewport.current?.querySelectorAll<HTMLLIElement>("[data-json-path]") ?? [])];
        const index = visible.findIndex(element => element.dataset.jsonPath === path);
        let target: string | undefined;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            target = visible[index + (event.key === "ArrowDown" ? 1 : -1)]?.dataset.jsonPath;
        } else if (event.key === "Home") target = visible[0]?.dataset.jsonPath;
        else if (event.key === "End") target = visible.at(-1)?.dataset.jsonPath;
        else if (event.key === "ArrowRight" && node.children.length) {
            if (isExpanded(node)) target = node.children[0]?.path; else toggle(node);
        } else if (event.key === "ArrowLeft") {
            if (node.children.length && isExpanded(node) && !searchExpanded.has(node.path)) toggle(node);
            else target = node.parentPath ?? undefined;
        } else if ((event.key === "Enter" || event.key === " ") && event.target.tagName !== "BUTTON") {
            if (node.children.length) toggle(node);
        } else return;
        event.preventDefault(); event.stopPropagation();
        if (target !== undefined) choose(target, true);
    };
    const renderNode = (node: JsonNode, last = true): ReactElement => {
        const container = typeof node.value === "object" && node.value !== null;
        const open = isExpanded(node), expandable = node.children.length > 0;
        const start = Array.isArray(node.value) ? "[" : "{", end = Array.isArray(node.value) ? "]" : "}";
        const source = sources.get(node.path), location = source?.location;
        const missingPage = location?.field.regions.find(region => !isPageAvailable?.(region.pageNumber))?.pageNumber;
        const sourceError = source?.error ?? (!onLocateSource ? "Source navigation is unavailable." :
            !sourceReady ? "Source is not ready for navigation." : missingPage !== undefined ? unavailableSourcePageMessage(missingPage) : null);
        const selected = current.path === node.path;
        const scalar = container ? undefined : JSON.stringify(node.value);
        return <li key={node.path} role="treeitem" className={`cu-json-node${selected ? " is-current" : ""}`}
            aria-label={node.key ?? (node.parentPath === null ? "JSON root" : `Item ${Number(node.path.split("/").at(-1)) + 1}`)}
            aria-expanded={expandable ? open : undefined} aria-selected={selected}
            tabIndex={focusPath === node.path ? 0 : -1} data-json-path={node.path}
            ref={element => { if (element) elements.current.set(node.path, element); else elements.current.delete(node.path); }}
            onFocus={event => {
                if (event.target === event.currentTarget && current.path !== node.path) setReview({ ...current, path: node.path });
            }}>
            <div className="cu-json-line" onClick={() => {
                if (expandable) toggle(node); else setReview({ ...current, path: node.path });
            }}>
                {expandable && <button type="button" className={`cu-json-expander cu-json-${open ? "collapse" : "expand"}`}
                    tabIndex={-1} aria-label={`${open ? "Collapse" : "Expand"} JSON node`}
                    disabled={searchExpanded.has(node.path)} title={searchExpanded.has(node.path) ? "Automatically expanded while searching." : undefined} />}
                {node.key !== undefined && <span className={`cu-json-label${expandable ? " cu-json-clickable-label" : ""}${matches.has(node.path) ? " cu-json-match" : ""}`}
                    title={source?.error ?? node.path}>{node.key}:</span>}
                {container ? <span className="cu-json-punctuation">{start}{!expandable ? end : !open ? <><span className="cu-json-collapsed" />{end}</> : ""}</span> :
                    node.key === "source" && typeof node.value === "string" ?
                        <button type="button" className="cu-json-source cu-json-string" aria-label={`Locate source ${node.path}`}
                            disabled={Boolean(sourceError)} title={sourceError ?? `Locate source on ${[...new Set(location?.field.regions.map(region => region.pageNumber))].join(", ")} page(s)`}
                            onClick={event => {
                                event.stopPropagation();
                                if (location && onLocateSource) {
                                    choose(node.path, false);
                                    onLocateSource(location.field, location.contentIndex);
                                }
                            }}>{scalar}</button> :
                        <span className={`cu-json-${node.value === null ? "null" : typeof node.value}`}>{scalar}</span>}
                {(!expandable || !open) && !last && <span className="cu-json-punctuation">,</span>}
            </div>
            {expandable && open && <>
                <ul role="group" className="cu-json-children">{node.children.map((child, index) => renderNode(child, index === node.children.length - 1))}</ul>
                <span className="cu-json-closing cu-json-punctuation">{end}{last ? "" : ","}</span>
            </>}
        </li>;
    };
    return <>
        <div className="cu-rich-result-scroll" ref={viewport}>
            {typeof value === "object" && value !== null ?
                <ul role="tree" className="cu-json-tree" aria-label="Original Analyze result JSON" onKeyDown={handleTreeKey}>{renderNode(tree.root)}</ul> :
                <pre className="cu-json-scalar">{JSON.stringify(value)}</pre>}
        </div>
        {query && !navigation.length && <div className="cu-fields-status" role="status">No matching JSON keys.</div>}
        <footer className="cu-fields-review-footer" role="group" aria-label="Result toolbar" onKeyDown={event => {
            if (event.key === "Escape" && settingsOpen) {
                event.preventDefault(); event.stopPropagation(); closeSettings(true);
            }
        }}>
            <label className="cu-search-box" title="Search JSON key names"><ViewerIcon name="search" />
                <input type="search" aria-label="Search JSON keys" placeholder="Search JSON keys..." value={current.query}
                    onChange={event => {
                        const next = event.target.value, normalized = next.trim().toLowerCase();
                        const matching = tree.properties.filter(node => node.key?.toLowerCase().includes(normalized));
                        const path = normalized ? (matching.find(node => node.path === current.path) ?? matching[0])?.path ?? null : current.path;
                        if (normalized && path !== null) pendingReveal.current = { value, path, focus: false };
                        setReview({ ...current, query: next, path });
                    }}
                    onKeyDown={event => {
                        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                            event.preventDefault(); chooseNext(event.shiftKey ? -1 : 1, false);
                        }
                    }} /></label>
            <div className="cu-field-navigation" role="group" aria-label="JSON key navigation">
                <button type="button" className="cu-icon-button" aria-label="Previous JSON key" disabled={!navigation.length}
                    title={navigation.length ? "Previous JSON key" : "No matching JSON keys"} onClick={() => chooseNext(-1)}><ViewerIcon name="left" /></button>
                <span aria-label="Current JSON key position" aria-live="polite" title={current.path ?? undefined}>
                    {currentIndex < 0 ? "\u2014" : currentIndex + 1} / {navigation.length} keys
                </span>
                <button type="button" className="cu-icon-button" aria-label="Next JSON key" disabled={!navigation.length}
                    title={navigation.length ? "Next JSON key" : "No matching JSON keys"} onClick={() => chooseNext(1)}><ViewerIcon name="right" /></button>
            </div>
            <div className="cu-fields-toolbar-actions">
                <button type="button" className="cu-icon-button" ref={settingsButton} aria-label="Result settings"
                    aria-haspopup="dialog" aria-expanded={settingsOpen}
                    aria-controls={settingsOpen ? `${baseId}-settings` : undefined} title="Result settings"
                    onClick={() => setSettingsContext(settingsOpen ? null : { value })}><ViewerIcon name="settings" /></button>
            </div>
            {settingsOpen && settingsButton.current && <ExpansionSettings id={`${baseId}-settings`} anchor={settingsButton.current}
                label="Result settings" closeLabel="Close result settings" items="JSON"
                disabledReason={expansionDisabledReason} onExpansion={open => {
                    pendingReveal.current = null;
                    setReview({ ...current, expanded: new Set(open ? expandablePaths : summaryExpandedPaths) });
                }} onClose={closeSettings} />}
        </footer>
    </>;
}

export function JsonPane(props: JsonPaneProps) {
    const inspection = useMemo(() => inspectJson(props.value), [props.value]);
    if (inspection.status === "limit") {
        const exceeded = inspection.values !== undefined && inspection.values > MAX_JSON_VALUES
            ? `${inspection.values.toLocaleString("en-US")} values exceeds the ${MAX_JSON_VALUES.toLocaleString("en-US")}-value limit`
            : `${inspection.characters?.toLocaleString("en-US") ?? "The result size"} exceeds the ${MAX_JSON_CHARACTERS.toLocaleString("en-US")}-character limit`;
        return <div className="cu-state cu-result-limit" role="alert">
            <h2>JSON is too large to render</h2>
            <p>{exceeded}. Use the original saved result for full inspection.</p>
        </div>;
    }
    if (inspection.status === "invalid") {
        return <div className="cu-state cu-error" role="alert">
            <h2>JSON could not be displayed</h2>
            <p>{inspection.message}</p>
        </div>;
    }
    return <JsonBrowser {...props} />;
}
