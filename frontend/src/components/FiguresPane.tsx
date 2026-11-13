import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { LoadedSource } from "../source/source";
import type { CuContent, CuField, CuFigure } from "../model/types";
import { emphasizeFieldTarget, getFieldRevealOffset } from "../interaction/fieldNavigation";
import { defaultReviewSettings, matchingLeaves } from "../interaction/reviewFields";
import { DetailSourceInfo, detailSourcePages } from "./DetailSourceInfo";
import { ExpansionSettings } from "./ExpansionSettings";
import { SourceThumbnail } from "./SourceThumbnail";
import { ViewerIcon } from "./ViewerIcon";

export function FiguresPane({ figures, content, source, selected, hovered, onHover, onLeave, onSelect,
    selectionRequest = null, sourceSelection = false, handledReveal: parentReveal }: {
    figures: readonly CuFigure[]; content: CuContent; source: LoadedSource | null;
    hovered: CuField | null;
    selected: CuField | null; onSelect: (field: CuField) => void;
    onHover: (field: CuField, navigate?: boolean) => void; onLeave: (field: CuField) => void;
    selectionRequest?: number | null; sourceSelection?: boolean; handledReveal?: RefObject<number | null>;
}) {
    const baseId = useId();
    const viewport = useRef<HTMLDivElement>(null);
    const localReveal = useRef<number | null>(null);
    const handledReveal = parentReveal ?? localReveal;
    const emphasis = useRef<Animation | null>(null);
    const pendingNavigation = useRef<{ figures: readonly CuFigure[]; id: string } | null>(null);
    const [search, setSearch] = useState({ figures, query: "" });
    const query = search.figures === figures ? search.query : "";
    const filtering = Boolean(query.trim());
    const [fold, setFold] = useState<{ figures: readonly CuFigure[]; groups: ReadonlySet<string> }>({ figures, groups: new Set() });
    const collapsed = useMemo(() => fold.figures === figures ? fold.groups : new Set<string>(), [fold, figures]);
    const settingsButton = useRef<HTMLButtonElement>(null);
    const [settingsContext, setSettingsContext] = useState<{ figures: readonly CuFigure[] } | null>(null);
    const settingsOpen = settingsContext?.figures === figures;
    const items = useMemo(() => {
        let previousPages: string | null = null, groupId = "";
        return figures.map(figure => {
            const pages = detailSourcePages(figure.field), key = pages.join(",");
            const startsPage = key !== previousPages;
            if (startsPage) groupId = figure.id;
            previousPages = key;
            return { figure, groupId, startsPage,
                pageLabel: pages.length ? `${pages.length === 1 ? "Page" : "Pages"} ${pages.join(", ")}` : "No source region" };
        });
    }, [figures]);
    const groupIds = useMemo(() => items.filter(item => item.startsPage).map(item => item.groupId), [items]);
    const matches = useMemo(() => matchingLeaves(items.map(({ figure, pageLabel }) => ({
        ...figure.field, hasValue: true, children: [],
        value: [figure.figureId, figure.kind, figure.role, figure.caption, figure.description, ...figure.footnotes, pageLabel]
            .filter(value => value !== undefined).join("\n"),
    })), query, false, false, defaultReviewSettings.threshold), [items, query]);
    const navigation = useMemo(() => items.filter(item => matches.has(item.figure.id)), [items, matches]);
    const displayedItems = useMemo(() => {
        let previousGroup: string | null = null;
        return navigation.map(item => {
            const startsPage = item.groupId !== previousGroup;
            previousGroup = item.groupId;
            return { ...item, startsPage };
        });
    }, [navigation]);
    const currentIndex = navigation.findIndex(item => item.figure.id === selected?.id);
    const hiddenSelection = filtering && selected?.detailView === "figures" &&
        items.some(item => item.figure.id === selected.id) && !matches.has(selected.id);
    useLayoutEffect(() => () => { emphasis.current?.cancel(); }, []);
    useLayoutEffect(() => {
        const request = pendingNavigation.current;
        const navigating = request?.figures === figures ? request : null;
        if (request && !navigating) pendingNavigation.current = null;
        const sourceRequest = sourceSelection && selectionRequest && selected?.detailView === "figures" &&
            handledReveal.current !== selectionRequest;
        if (!navigating && !sourceRequest) {
            emphasis.current?.cancel(); emphasis.current = null; return;
        }
        const target = items.find(item => item.figure.id === (navigating?.id ?? selected?.id));
        if (!target || !matches.has(target.figure.id)) {
            pendingNavigation.current = null;
            if (sourceRequest) handledReveal.current = selectionRequest;
            emphasis.current?.cancel(); emphasis.current = null;
            return;
        }
        if (!filtering && collapsed.has(target.groupId)) {
            const groups = new Set(collapsed);
            groups.delete(target.groupId);
            setFold({ figures, groups });
            return;
        }
        const element = viewport.current;
        const button = [...(element?.querySelectorAll<HTMLButtonElement>("[data-detail-id]") ?? [])]
            .find(button => button.dataset.detailId === target.figure.id);
        if (!element || !button) return;
        if (element.clientWidth && element.clientHeight) {
            const bounds = element.getBoundingClientRect();
            const visible = { left: bounds.left + element.clientLeft,
                right: bounds.left + element.clientLeft + element.clientWidth,
                top: bounds.top + element.clientTop + 8,
                bottom: bounds.top + element.clientTop + element.clientHeight - 8 };
            if (visible.bottom <= visible.top) return;
            element.scrollTop += getFieldRevealOffset(button.getBoundingClientRect(), visible, true).y;
        } else if (!navigating) return;
        if (selectionRequest) handledReveal.current = selectionRequest;
        emphasis.current?.cancel(); emphasis.current = emphasizeFieldTarget(button);
        if (navigating) {
            pendingNavigation.current = null;
            button.focus({ preventScroll: true });
        }
    }, [selectionRequest, sourceSelection, selected, figures, handledReveal, items, collapsed, matches, filtering]);
    const togglePage = (groupId: string): void => {
        const groups = new Set(collapsed);
        if (groups.has(groupId)) groups.delete(groupId); else groups.add(groupId);
        emphasis.current?.cancel(); emphasis.current = null;
        setFold({ figures, groups });
    };
    const chooseNext = (direction: number): void => {
        const target = navigation[currentIndex < 0 ? direction > 0 ? 0 : navigation.length - 1 :
            (currentIndex + direction + navigation.length) % navigation.length];
        if (!target) return;
        pendingNavigation.current = { figures, id: target.figure.id };
        const groups = new Set(collapsed);
        if (!filtering) groups.delete(target.groupId);
        setFold({ figures, groups });
        onSelect(target.figure.field);
    };
    const closeSettings = (restore: boolean): void => {
        if (restore) settingsButton.current?.focus({ preventScroll: true });
        setSettingsContext(null);
    };
    const expansionDisabledReason = filtering ? "Clear search before expanding or collapsing pages." :
        groupIds.length ? null : "No pages to expand or collapse.";
    return <><div className="cu-rich-result-scroll cu-figures-scroll" ref={viewport}>
        <ul className="cu-figure-list" aria-label="Returned figures">
            {displayedItems.map(({ figure, groupId, startsPage, pageLabel }) => {
                const open = filtering || !collapsed.has(groupId);
                if (!open && !startsPage) return null;
                const id = `${baseId}-${encodeURIComponent(figure.id)}`;
                const description = [
                    `${id}-metadata`, `${id}-id`, `${id}-source`,
                    figure.caption !== undefined ? `${id}-caption` : undefined,
                    figure.description !== undefined ? `${id}-description` : undefined,
                    ...figure.footnotes.map((_, index) => `${id}-footnote-${index}`),
                ].filter(Boolean).join(" ");
                return <li key={figure.id}>
                    {startsPage && <h2 className="cu-figure-page" aria-label={pageLabel}>
                        <button type="button" className="cu-figure-page-toggle" aria-expanded={open}
                            aria-label={`${open ? "Collapse" : "Expand"} ${pageLabel}`} disabled={filtering}
                            title={filtering ? "Automatically expanded while filtering." : undefined} onClick={() => togglePage(groupId)}>
                            <ViewerIcon name={open ? "down" : "right"} /><span>{pageLabel}</span>
                        </button>
                    </h2>}
                {open && <button type="button" className={`cu-figure-row${hovered?.id === figure.id ? " is-hovered" : ""}`}
                    aria-label={`Select ${figure.field.name}`}
                    aria-describedby={description}
                    aria-pressed={selected?.id === figure.id} data-detail-id={figure.id} data-review-focus={figure.id}
                    onPointerMove={() => onHover(figure.field)} onMouseLeave={() => onLeave(figure.field)}
                    onFocus={() => onHover(figure.field, false)} onBlur={() => onLeave(figure.field)}
                    onClick={() => onSelect(figure.field)}>
                    {figure.field.regions.length > 0 && <span className="cu-figure-previews">
                        {figure.field.regions.map((region, index) => <SourceThumbnail key={index} source={source} reserveSpace
                            content={content} region={region} label={`${figure.field.name} region ${index + 1} preview on page ${region.pageNumber}`} />)}
                    </span>}
                    <span className="cu-figure-content">
                        <span id={`${id}-metadata`} className="cu-figure-heading"><strong>{figure.field.name}</strong>
                            {(figure.kind !== "unknown" || Object.hasOwn(figure.raw, "kind")) && <span>{figure.kind}</span>}
                            {figure.role !== undefined && <span>{figure.role}</span>}
                            {figure.field.regions.length > 1 && <span>{figure.field.regions.length} regions</span>}
                        </span>
                        <span id={`${id}-id`} className="cu-figure-id">ID: {figure.figureId}</span>
                        {figure.caption !== undefined && <span id={`${id}-caption`} className="cu-detail-text">Caption: {figure.caption}</span>}
                        {figure.description !== undefined && <span id={`${id}-description`} className="cu-detail-text">{figure.description}</span>}
                        {figure.footnotes.map((note, index) => <span key={index} id={`${id}-footnote-${index}`} className="cu-detail-text">Footnote: {note}</span>)}
                    </span>
                    <span className="cu-visually-hidden"><DetailSourceInfo field={figure.field} id={`${id}-source`} /></span>
                </button>}
                </li>;
            })}
        </ul>
        {filtering && !navigation.length && <div className="cu-state"><h2>No matching figures</h2>
            <p>No figures match the current search.</p>
            <button type="button" onClick={() => setSearch({ figures, query: "" })}>Clear search</button>
        </div>}
    </div>
        {hiddenSelection && <div className="cu-fields-status" role="status">The selected figure is hidden by the current search.</div>}
        <footer className="cu-fields-review-footer" role="group" aria-label="Figures toolbar" onKeyDown={event => {
            if (event.key === "Escape" && settingsOpen) {
                event.preventDefault(); event.stopPropagation(); closeSettings(true);
            }
        }}>
            <label className="cu-search-box" title="Search figure names, IDs, types, captions, descriptions or footnotes">
                <ViewerIcon name="search" /><input type="search" aria-label="Search figures" placeholder="Search figures..." value={query}
                    onChange={event => setSearch({ figures, query: event.target.value })} />
            </label>
            <div className="cu-field-navigation" role="group" aria-label="Figure navigation">
                <button type="button" className="cu-icon-button" aria-label="Previous figure" disabled={!navigation.length}
                    title={navigation.length ? "Previous figure" : "No matching figures"} onClick={() => chooseNext(-1)}>
                    <ViewerIcon name="left" /></button>
                <span aria-label="Current figure position" aria-live="polite"
                    title={`${navigation.length} matching figures out of ${figures.length} total.${
                        currentIndex < 0 ? " No figure selected in this navigation range." : ""}`}>
                    {currentIndex < 0 ? "\u2014" : currentIndex + 1} / {navigation.length} figures
                </span>
                <button type="button" className="cu-icon-button" aria-label="Next figure" disabled={!navigation.length}
                    title={navigation.length ? "Next figure" : "No matching figures"} onClick={() => chooseNext(1)}>
                    <ViewerIcon name="right" /></button>
            </div>
            <div className="cu-fields-toolbar-actions">
                <button type="button" className="cu-icon-button" ref={settingsButton} aria-label="Figures settings"
                    aria-haspopup="dialog" aria-expanded={settingsOpen} aria-controls={settingsOpen ? `${baseId}-settings` : undefined}
                    title="Figures settings" onClick={() => setSettingsContext(settingsOpen ? null : { figures })}>
                    <ViewerIcon name="settings" /></button>
            </div>
            {settingsOpen && settingsButton.current && <ExpansionSettings id={`${baseId}-settings`} anchor={settingsButton.current}
                label="Figures settings" closeLabel="Close figure settings" items="pages" disabledReason={expansionDisabledReason}
                onExpansion={open => {
                    emphasis.current?.cancel(); emphasis.current = null;
                    setFold({ figures, groups: new Set(open ? [] : groupIds) });
                }} onClose={closeSettings} />}
        </footer>
    </>;
}
