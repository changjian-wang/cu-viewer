import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { CuField, CuParagraph } from "../model/types";
import { emphasizeFieldTarget, getFieldRevealOffset } from "../interaction/fieldNavigation";
import { defaultReviewSettings, matchingLeaves } from "../interaction/reviewFields";
import { DetailSourceInfo, detailSourcePages } from "./DetailSourceInfo";
import { ExpansionSettings } from "./ExpansionSettings";
import { ViewerIcon } from "./ViewerIcon";

interface ParagraphsPaneProps {
    paragraphs: readonly CuParagraph[];
    selected: CuField | null;
    hovered: CuField | null;
    previewId: string | undefined;
    onHover: (field: CuField, navigate?: boolean) => void;
    onLeave: (field: CuField) => void;
    onSelect: (field: CuField) => void;
    selectionRequest?: number | null;
    sourceSelection?: boolean;
    handledReveal?: RefObject<number | null>;
}

export function ParagraphsPane({ paragraphs, selected, hovered, previewId, onHover, onLeave, onSelect,
    selectionRequest = null, sourceSelection = false, handledReveal: parentReveal }: ParagraphsPaneProps) {
    const baseId = useId();
    const viewport = useRef<HTMLDivElement>(null);
    const localReveal = useRef<number | null>(null);
    const handledReveal = parentReveal ?? localReveal;
    const emphasis = useRef<Animation | null>(null);
    const pendingNavigation = useRef<{ paragraphs: readonly CuParagraph[]; id: string } | null>(null);
    const [search, setSearch] = useState({ paragraphs, query: "" });
    const query = search.paragraphs === paragraphs ? search.query : "";
    const filtering = Boolean(query.trim());
    const settingsButton = useRef<HTMLButtonElement>(null);
    const [settingsContext, setSettingsContext] = useState<{ paragraphs: readonly CuParagraph[] } | null>(null);
    const settingsOpen = settingsContext !== null && settingsContext.paragraphs === paragraphs;
    const [fold, setFold] = useState<{ paragraphs: readonly CuParagraph[]; groups: ReadonlySet<string> }>({
        paragraphs, groups: new Set(),
    });
    const collapsed = useMemo(() => fold.paragraphs === paragraphs ? fold.groups : new Set<string>(), [fold, paragraphs]);
    const items = useMemo(() => {
        let previousPages: string | null = null;
        let groupId = "";
        const indexWidth = Math.max(2, String(paragraphs.length).length);
        return paragraphs.map((paragraph, index) => {
            const pages = detailSourcePages(paragraph.field);
            const pageKey = pages.join(",");
            const startsPage = pageKey !== previousPages;
            if (startsPage) groupId = paragraph.id;
            previousPages = pageKey;
            const hasMeta = paragraph.role !== undefined || paragraph.field.regions.length > 1;
            return { paragraph, index, groupId, startsPage, hasMeta,
                pageLabel: pages.length ? `${pages.length === 1 ? "Page" : "Pages"} ${pages.join(", ")}` : "No source region",
                columns: `${indexWidth}ch minmax(0, 1fr)${hasMeta ? " auto" : ""}` };
        });
    }, [paragraphs]);
    const groupIds = useMemo(() => items.filter(item => item.startsPage).map(item => item.groupId), [items]);
    const matches = useMemo(() => matchingLeaves(paragraphs.map(paragraph => paragraph.field), query, false, false,
        defaultReviewSettings.threshold), [paragraphs, query]);
    const navigation = useMemo(() => items.filter(item => matches.has(item.paragraph.id)), [items, matches]);
    const displayedItems = useMemo(() => {
        let previousGroup: string | null = null;
        return navigation.map(item => {
            const startsPage = item.groupId !== previousGroup;
            previousGroup = item.groupId;
            return { ...item, startsPage };
        });
    }, [navigation]);
    const currentIndex = navigation.findIndex(item => item.paragraph.id === selected?.id);
    const hiddenSelection = filtering && selected?.detailView === "paragraphs" &&
        items.some(item => item.paragraph.id === selected.id) && !matches.has(selected.id);
    useLayoutEffect(() => () => { emphasis.current?.cancel(); }, []);
    useLayoutEffect(() => {
        const request = pendingNavigation.current;
        const navigating = request?.paragraphs === paragraphs ? request : null;
        if (request && !navigating) pendingNavigation.current = null;
        const sourceRequest = sourceSelection && selectionRequest && selected?.detailView === "paragraphs" &&
            handledReveal.current !== selectionRequest;
        if (!navigating && !sourceRequest) {
            emphasis.current?.cancel(); emphasis.current = null; return;
        }
        const target = items.find(item => item.paragraph.id === (navigating?.id ?? selected?.id));
        if (!target || !matches.has(target.paragraph.id)) {
            pendingNavigation.current = null;
            if (sourceRequest) handledReveal.current = selectionRequest;
            emphasis.current?.cancel(); emphasis.current = null;
            return;
        }
        if (!filtering && collapsed.has(target.groupId)) {
            const groups = new Set(collapsed);
            groups.delete(target.groupId);
            setFold({ paragraphs, groups });
            return;
        }
        const element = viewport.current;
        const button = [...(element?.querySelectorAll<HTMLButtonElement>("[data-detail-id]") ?? [])]
            .find(button => button.dataset.detailId === target.paragraph.id);
        if (!element || !button) return;
        if (element.clientWidth && element.clientHeight) {
            const bounds = element.getBoundingClientRect();
            const visible = {
                left: bounds.left + element.clientLeft,
                right: bounds.left + element.clientLeft + element.clientWidth,
                top: bounds.top + element.clientTop + 8,
                bottom: bounds.top + element.clientTop + element.clientHeight - 8,
            };
            if (visible.bottom <= visible.top) return;
            element.scrollTop += getFieldRevealOffset(button.getBoundingClientRect(), visible, true).y;
        } else if (!navigating) return;
        if (selectionRequest) handledReveal.current = selectionRequest;
        emphasis.current?.cancel(); emphasis.current = emphasizeFieldTarget(button);
        if (navigating) {
            pendingNavigation.current = null;
            button.focus({ preventScroll: true });
        }
    }, [selectionRequest, sourceSelection, selected, paragraphs, handledReveal, items, collapsed, matches, filtering]);
    const togglePage = (groupId: string): void => {
        const groups = new Set(collapsed);
        if (groups.has(groupId)) groups.delete(groupId);
        else {
            groups.add(groupId);
            emphasis.current?.cancel(); emphasis.current = null;
        }
        setFold({ paragraphs, groups });
    };
    const chooseNext = (direction: number): void => {
        const target = navigation[currentIndex < 0 ? direction > 0 ? 0 : navigation.length - 1 :
            (currentIndex + direction + navigation.length) % navigation.length];
        if (!target) return;
        pendingNavigation.current = { paragraphs, id: target.paragraph.id };
        const groups = new Set(collapsed);
        if (!filtering) groups.delete(target.groupId);
        setFold({ paragraphs, groups });
        onSelect(target.paragraph.field);
    };
    const closeSettings = (restore: boolean): void => {
        if (restore) settingsButton.current?.focus({ preventScroll: true });
        setSettingsContext(null);
    };
    const expansionDisabledReason = filtering ? "Clear search before expanding or collapsing pages." :
        groupIds.length ? null : "No pages to expand or collapse.";
    return <><div className="cu-rich-result-scroll cu-paragraphs-scroll" ref={viewport}>
        <ol className="cu-paragraph-list" aria-label="Returned paragraphs">
            {displayedItems.map(({ paragraph, index, groupId, startsPage, hasMeta, pageLabel, columns }) => {
                const open = filtering || !collapsed.has(groupId);
                if (!open && !startsPage) return null;
                return <li key={paragraph.id}>
                    {startsPage && <h2 className="cu-paragraph-page" aria-label={pageLabel}>
                        <button type="button" className="cu-paragraph-page-toggle" aria-expanded={open}
                            aria-label={`${open ? "Collapse" : "Expand"} ${pageLabel}`} disabled={filtering}
                            title={filtering ? "Automatically expanded while filtering." : undefined} onClick={() => togglePage(groupId)}>
                            <ViewerIcon name={open ? "down" : "right"} /><span>{pageLabel}</span>
                        </button>
                    </h2>}
                    {open && <button type="button" className={`cu-paragraph-row${hovered?.id === paragraph.id ? " is-hovered" : ""}`}
                        style={{ gridTemplateColumns: columns }}
                        aria-label={`Select ${paragraph.field.name}`}
                        aria-describedby={`${previewId && hovered?.id === paragraph.id && paragraph.field.regions.length ? `${previewId}-content` : `${baseId}-${encodeURIComponent(paragraph.id)}-text`} ${baseId}-${encodeURIComponent(paragraph.id)}-source${paragraph.role !== undefined ? ` ${baseId}-${encodeURIComponent(paragraph.id)}-role` : ""}`}
                        aria-pressed={selected?.id === paragraph.id} data-detail-id={paragraph.id} data-review-focus={paragraph.id}
                        onPointerMove={() => onHover(paragraph.field)} onMouseLeave={() => onLeave(paragraph.field)}
                        onFocus={() => onHover(paragraph.field, false)} onBlur={() => onLeave(paragraph.field)}
                        onClick={() => onSelect(paragraph.field)}>
                        <span className="cu-paragraph-index" aria-hidden="true" title={`${paragraph.field.name} \u00b7 ${pageLabel}`}>{index + 1}</span>
                        <span id={`${baseId}-${encodeURIComponent(paragraph.id)}-text`} className="cu-detail-text cu-paragraph-content">
                            {paragraph.content === "" ? '"" (empty string)' : paragraph.content}
                        </span>
                        {hasMeta && <span className="cu-paragraph-meta">
                            {paragraph.role !== undefined && <span id={`${baseId}-${encodeURIComponent(paragraph.id)}-role`}
                                className="cu-paragraph-role" title={paragraph.role}>{paragraph.role}</span>}
                            {paragraph.field.regions.length > 1 && <span className="cu-paragraph-regions" title={pageLabel}>
                                {paragraph.field.regions.length} regions
                            </span>}
                        </span>}
                        <span className="cu-visually-hidden">
                            <DetailSourceInfo field={paragraph.field} id={`${baseId}-${encodeURIComponent(paragraph.id)}-source`} />
                        </span>
                    </button>}
                </li>;
            })}
        </ol>
        {filtering && !navigation.length && <div className="cu-state"><h2>No matching paragraphs</h2>
            <p>No paragraphs match the current search.</p>
            <button type="button" onClick={() => setSearch({ paragraphs, query: "" })}>Clear search</button>
        </div>}
    </div>
        {hiddenSelection && <div className="cu-fields-status cu-paragraph-status" role="status">
            The selected paragraph is hidden by the current search.
        </div>}
        <footer className="cu-fields-review-footer" role="group" aria-label="Paragraphs toolbar" onKeyDown={event => {
            if (event.key === "Escape" && settingsOpen) {
                event.preventDefault(); event.stopPropagation(); closeSettings(true);
            }
        }}>
            <label className="cu-search-box" title="Search paragraph names or content"><ViewerIcon name="search" />
                <input type="search" aria-label="Search paragraphs" placeholder="Search paragraphs..." value={query}
                    onChange={event => setSearch({ paragraphs, query: event.target.value })} /></label>
            <div className="cu-field-navigation" role="group" aria-label="Paragraph navigation">
                <button type="button" className="cu-icon-button" aria-label="Previous paragraph" disabled={!navigation.length}
                    title={navigation.length ? "Previous paragraph" : "No matching paragraphs"} onClick={() => chooseNext(-1)}>
                    <ViewerIcon name="left" /></button>
                <span aria-label="Current paragraph position" aria-live="polite"
                    title={`${navigation.length} matching paragraphs out of ${paragraphs.length} total.${
                        currentIndex < 0 ? " No paragraph selected in this navigation range." : ""}`}>
                    {currentIndex < 0 ? "\u2014" : currentIndex + 1} / {navigation.length} paragraphs
                </span>
                <button type="button" className="cu-icon-button" aria-label="Next paragraph" disabled={!navigation.length}
                    title={navigation.length ? "Next paragraph" : "No matching paragraphs"} onClick={() => chooseNext(1)}>
                    <ViewerIcon name="right" /></button>
            </div>
            <div className="cu-fields-toolbar-actions">
                <button type="button" className="cu-icon-button" ref={settingsButton} aria-label="Paragraphs settings"
                    aria-haspopup="dialog" aria-expanded={settingsOpen}
                    aria-controls={settingsOpen ? `${baseId}-settings` : undefined} title="Paragraphs settings"
                    onClick={() => setSettingsContext(settingsOpen ? null : { paragraphs })}><ViewerIcon name="settings" /></button>
            </div>
            {settingsOpen && settingsButton.current && <ExpansionSettings id={`${baseId}-settings`} anchor={settingsButton.current}
                label="Paragraphs settings" closeLabel="Close paragraph settings" items="pages"
                disabledReason={expansionDisabledReason} onExpansion={open => {
                    emphasis.current?.cancel(); emphasis.current = null;
                    setFold({ paragraphs, groups: new Set(open ? [] : groupIds) });
                }} onClose={closeSettings} />}
        </footer>
    </>;
}
