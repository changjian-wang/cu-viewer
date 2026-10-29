import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, KeyboardEvent, ReactNode, SetStateAction } from "react";
import type { ViewerFieldOrder } from "../index";
import { displayValue, fieldDisplayName, fieldLabel, fieldRegions } from "../interaction/interaction";
import { emphasizeFieldTarget, revealFieldTarget } from "../interaction/fieldNavigation";
import { appearance, collapsedValue, confidenceDescription, fieldEntries, formatScore, initialExpandedFields, inlineArrayProjection, isFieldGroup, isLowConfidence,
    isTableValue, leafFields, matchingLeaves, moveField, orderedFields, visibleFieldIds } from "../interaction/reviewFields";
import type { ReviewSettings } from "../interaction/reviewFields";
import type { ValueWorkflow } from "../interaction/useValueWorkflow";
import { tableFieldIds } from "../interaction/tableFields";
import type { TableFieldLocation } from "../interaction/tableFields";
import type { CuField } from "../model/types";
import { ResizeHandle } from "./ResizeHandle";
import { ValueMenuTrigger } from "./ValueActions";
import { ViewerIcon } from "./ViewerIcon";

export interface FieldsReviewState {
    expanded: Set<string>;
    query: string;
    lowOnly: boolean;
    focused: string | null;
}

export const initialFieldsReview = (fields: readonly CuField[] = [], order: ViewerFieldOrder = {}): FieldsReviewState =>
    ({ expanded: initialExpandedFields(fields, order), query: "", lowOnly: false, focused: null });

interface FieldsPaneProps {
    fields: readonly CuField[];
    settings: ReviewSettings;
    onSettings: (settings: ReviewSettings) => void;
    order: ViewerFieldOrder;
    onOrder: (order: ViewerFieldOrder) => void;
    orderReadOnly: boolean;
    review: FieldsReviewState;
    setReview: Dispatch<SetStateAction<FieldsReviewState>>;
    hideMissing: boolean;
    onHideMissing: (value: boolean) => void;
    selected: CuField | null;
    hovered: CuField | null;
    workflow: ValueWorkflow;
    menuId: string;
    onMenu: (field: CuField, trigger: HTMLElement) => void;
    onHover: (field: CuField, navigate?: boolean) => void;
    onLeave: (field: CuField) => void;
    onSelect: (field: CuField) => void;
    sourceReady: boolean;
    pageNumber: number;
    isPageAvailable: (pageNumber: number) => boolean;
    restoringFocus: { current: boolean };
    tableScroll: Map<string, number>;
    selectionRequest: number | null;
    sourceSelection: boolean;
    tableLocation: TableFieldLocation | null;
    tableSelection: boolean;
    tableScope: TableFieldLocation | null;
    onShowAllFields?: (() => void) | undefined;
    handledReveal: { current: number | null };
    orderControlled: boolean;
    preferenceError: boolean;
}

export function FieldsPane(props: FieldsPaneProps) {
    const { settings, fields, review } = props;
    const related = useMemo(() => new Set(props.tableLocation?.match.fields.map(field => field.id) ?? []), [props.tableLocation]);
    const relatedTargets = useMemo(() => new Set(props.tableLocation?.match.targets.map(field => field.id) ?? []), [props.tableLocation]);
    const relatedBlock = useMemo(() => props.tableLocation ? tableFieldIds(props.tableLocation.match) : new Set<string>(), [props.tableLocation]);
    const scopeIds = useMemo(() => props.tableScope ? tableFieldIds(props.tableScope.match) : null, [props.tableScope]);
    const id = useId();
    const descriptionId = (field: CuField): string => `${id}-value-${encodeURIComponent(field.id)}`;
    const description = (field: CuField, summary?: string): string => {
        const value = summary ?? displayValue(field);
        return `${value ? `${value} · ` : ""}${isFieldGroup(field) ? "Group of descendant fields" :
            confidenceDescription(field, settings.threshold)}${fieldRegions(field).length ? "" : " · No source region"}${
                relatedBlock.has(field.id) ? " · Related to the current source table" : ""}`;
    };
    const viewport = useRef<HTMLDivElement>(null);
    const nameButtons = useRef(new Map<string, HTMLButtonElement>());
    const pendingFocus = useRef<{ id: string; force: boolean } | null>(null);
    const emphasis = useRef<Animation[]>([]);
    const dragging = useRef<string | null>(null);
    const [dragId, setDragId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<{ id: string; placement: "before" | "after" } | null>(null);
    const [size, setSize] = useState({ width: 440, height: 0 });
    const [notice, setNotice] = useState<string | null>(null);
    const entries = useMemo(() => fieldEntries(fields), [fields]);
    const byId = useMemo(() => new Map(entries.map(entry => [entry.field.id, entry])), [entries]);
    const leaves = useMemo(() => leafFields(fields), [fields]);
    const matches = useMemo(() => {
        const found = matchingLeaves(fields, review.query, review.lowOnly, props.hideMissing, settings.threshold, scopeIds ?? undefined);
        return scopeIds ? new Set([...found].filter(id => scopeIds.has(id))) : found;
    }, [fields, review.query, review.lowOnly, props.hideMissing, settings.threshold, scopeIds]);
    const visible = useMemo(() => visibleFieldIds(fields, matches), [fields, matches]);
    const filtering = Boolean(review.query.trim() || review.lowOnly);
    const missing = leaves.filter(field => !field.hasValue).length;
    const lowCount = leaves.filter(field => isLowConfidence(field, settings.threshold)).length;
    const reorderReason = props.orderReadOnly ? "Field order is read-only. Check the configuration; controlled order requires onFieldOrderChange." :
        props.tableScope ? "Show all fields before reordering." :
            filtering || (props.hideMissing && missing > 0) ? "Clear search and filters to reorder fields." : null;
    const columnWidth = size.width * (settings.columns === 3 ? 0.83 : 1);
    const selectedGroup = props.selected && isFieldGroup(props.selected) ? props.selected : null;
    const hiddenGroupCount = props.tableLocation ? props.tableLocation.match.fields.filter(field => !visible.has(field.id)).length :
        selectedGroup ? leafFields([selectedGroup]).filter(field => !matches.has(field.id)).length :
        props.selected && byId.has(props.selected.id) && !matches.has(props.selected.id) ? 1 : 0;
    const tableMessage = props.tableLocation ? props.tableLocation.match.fields.length ?
        `${props.tableLocation.table.name}: ${props.tableLocation.match.fields.length} related fields located in Fields.${
            props.tableLocation.match.ambiguous ? ` ${props.tableLocation.match.ambiguous} ambiguous fields were not located.` : ""}` :
        props.tableLocation.match.ambiguous ?
            `${props.tableLocation.table.name}: field association is ambiguous; no field was chosen. Inspect the original tables in Result.` :
            `${props.tableLocation.table.name}: no corresponding extracted fields. Inspect the original tables in Result.` : null;
    useLayoutEffect(() => {
        const element = viewport.current;
        if (!element) return;
        const measure = (): void => setSize(current => {
            const width = element.clientWidth || 440, height = element.clientHeight;
            return current.width === width && current.height === height ? current : { width, height };
        });
        const observer = new ResizeObserver(measure);
        measure();
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    useLayoutEffect(() => () => { emphasis.current.forEach(animation => animation.cancel()); }, []);
    const revealButton = (button: HTMLElement, comfortable = false): HTMLElement | null => {
        if (!viewport.current) return null;
        const target = revealFieldTarget(button, viewport.current, comfortable);
        const wrapper = button.closest<HTMLElement>("[data-array-id]");
        if (wrapper?.dataset.arrayId) props.tableScroll.set(wrapper.dataset.arrayId, wrapper.scrollLeft);
        return target;
    };
    useLayoutEffect(() => {
        const request = pendingFocus.current;
        if (!request) return;
        pendingFocus.current = null;
        const button = nameButtons.current.get(request.id);
        if (!button) return;
        const active = button.ownerDocument.activeElement;
        if (!request.force && active !== button.ownerDocument.body &&
            active?.closest("[data-field-id]")?.getAttribute("data-field-id") !== request.id) return;
        props.restoringFocus.current = true;
        button.focus({ preventScroll: true });
        props.restoringFocus.current = false;
    }, [props.order, review.expanded, props.restoringFocus]);
    useLayoutEffect(() => {
        if (!props.selectionRequest || !props.selected) {
            emphasis.current.forEach(animation => animation.cancel()); emphasis.current = []; return;
        }
        if (props.handledReveal.current === props.selectionRequest) return;
        emphasis.current.forEach(animation => animation.cancel()); emphasis.current = [];
        const targets = props.tableSelection && props.tableLocation ? props.tableLocation.match.targets : [props.selected];
        const ids = new Set(targets.filter(field => visible.has(field.id)).map(field => field.id));
        const groups = entries.filter(entry => isFieldGroup(entry.field) && targets.some(field => visible.has(field.id) &&
            (field.id.startsWith(`${entry.field.id}/`) || (props.tableSelection && field === entry.field))));
        if (groups.some(entry => !review.expanded.has(entry.field.id))) {
            props.setReview(current => ({ ...current, expanded: new Set([...current.expanded, ...groups.map(entry => entry.field.id)]) }));
            return;
        }
        const buttons = [...(viewport.current?.querySelectorAll<HTMLButtonElement>("[data-review-focus]") ?? [])]
            .filter(button => ids.has(button.dataset.reviewFocus ?? ""));
        const button = buttons[0];
        const target = button ? revealButton(button, props.sourceSelection) : null;
        if (button && !target) return;
        if (target && props.tableSelection && viewport.current && target.nextElementSibling?.classList.contains("cu-inline-detail-row")) {
            const header = viewport.current.querySelector(".cu-fields-table > thead th")?.getBoundingClientRect();
            if (header) viewport.current.scrollTop += target.getBoundingClientRect().top - header.bottom - 8;
        }
        props.handledReveal.current = props.selectionRequest;
        if (target && props.sourceSelection) for (const button of buttons) {
            const element = button.closest<HTMLElement>(button.closest(".cu-inline-table-wrap") ? "td" : "tr");
            if (element) {
                const animation = emphasizeFieldTarget(element);
                if (animation) emphasis.current.push(animation);
            }
        }
    }, [props.selectionRequest, props.sourceSelection, props.selected, props.tableLocation, props.tableSelection, review.expanded, visible, entries, props.handledReveal, size]);
    const setFocus = (id: string): void => props.setReview(current => current.focused === id ? current : { ...current, focused: id });
    const move = (from: string, to: string, placement?: "before" | "after"): void => {
        try {
            pendingFocus.current = { id: from, force: false };
            props.onOrder(moveField(entries, props.order, from, to, placement));
            setNotice("Field display order updated.");
        } catch (error) {
            setNotice(`Reorder failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    };
    const onFieldKey = (event: KeyboardEvent<HTMLElement>, field: CuField): void => {
        if (event.key === "Escape" && dragging.current) {
            event.preventDefault(); event.stopPropagation();
            dragging.current = null; setDragId(null); setDropTarget(null); setNotice("Reorder cancelled."); return;
        }
        if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
            event.preventDefault(); event.stopPropagation();
            const entry = byId.get(field.id);
            if (!entry || entry.inArray || reorderReason) { setNotice(reorderReason ?? "Array rows and cells cannot be reordered."); return; }
            const siblings = orderedFields(entries.filter(item => item.parent === entry.parent).map(item => item.field), entry.parent, props.order);
            const index = siblings.findIndex(item => item.id === field.id);
            const next = siblings[index + (event.key === "ArrowUp" ? -1 : 1)];
            if (next) move(field.id, next.id);
            return;
        }
        if (event.key === "F2") { event.preventDefault(); props.workflow.inspect(field); return; }
        if (event.shiftKey && event.key === "F10") { event.preventDefault(); props.onMenu(field, event.currentTarget); return; }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            const buttons = [...(viewport.current?.querySelectorAll<HTMLButtonElement>("[data-review-focus]") ?? [])];
            const index = buttons.findIndex(button => button === event.currentTarget);
            const next = event.key === "Home" ? buttons[0] : event.key === "End" ? buttons.at(-1) :
                buttons[index + (event.key === "ArrowDown" ? 1 : -1)];
            if (next) { event.preventDefault(); next.focus({ preventScroll: true }); revealButton(next); }
        }
    };
    const chooseNext = (direction: number): void => {
        const navigation: CuField[] = [];
        const visit = (siblings: readonly CuField[], parent: string, inArray: boolean): void => {
            for (const field of inArray ? siblings : orderedFields(siblings, parent, props.order)) {
                const entry = byId.get(field.id)!;
                if (field.children.length) visit(field.children, entry.path, inArray || field.type === "array");
                else if (matches.has(field.id)) navigation.push(field);
            }
        };
        visit(fields, "$root", false);
        const index = navigation.findIndex(field => field.id === props.selected?.id);
        const field = navigation[index < 0 ? direction > 0 ? 0 : navigation.length - 1 :
            (index + direction + navigation.length) % navigation.length];
        if (!field) return;
        pendingFocus.current = { id: field.id, force: true };
        props.setReview(current => ({ ...current, focused: field.id, expanded: new Set([...current.expanded,
            ...entries.filter(entry => field.id.startsWith(`${entry.field.id}/`)).map(entry => entry.field.id)]) }));
        props.onSelect(field);
    };
    const value = (field: CuField, inline = false): ReactNode => {
        const style = appearance(field, inline || isTableValue(field), settings);
        return <span className={`cu-value-chip${!field.hasValue ? " is-missing" : ""}`}
            style={style.low ? { background: style.background, color: style.color } : undefined}
            title={confidenceDescription(field, settings.threshold)}>{displayValue(field)}</span>;
    };
    const cell = (field: CuField): ReactNode => <div className="cu-cell-content"
        data-field-id={field.id} data-field-type={field.type}
        onPointerMove={() => { if (!props.workflow.menuOpen.current) props.onHover(field); }}
        onPointerLeave={() => props.onLeave(field)}
        onFocus={() => { if (!props.restoringFocus.current && !props.workflow.menuOpen.current) { setFocus(field.id); props.onHover(field, false); } }}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) props.onLeave(field); }}>
        <button type="button" className="cu-cell-value" aria-label={`Select value of ${fieldLabel(field)}`}
            aria-describedby={descriptionId(field)}
            aria-pressed={props.selected?.id === field.id} data-review-focus={matches.has(field.id) ? field.id : undefined}
            tabIndex={review.focused === field.id ? 0 : -1}
            ref={button => { if (button) nameButtons.current.set(field.id, button); else nameButtons.current.delete(field.id); }}
            onKeyDown={event => onFieldKey(event, field)} onClick={() => props.onSelect(field)}>{value(field, true)}</button>
        <ValueMenuTrigger field={field} workflow={props.workflow} menuId={props.menuId} onOpen={props.onMenu} />
        <span className="cu-visually-hidden" id={descriptionId(field)}>{description(field)}</span>
    </div>;
    const renderArray = (field: CuField): ReactNode | null => {
        const projection = inlineArrayProjection(field);
        if (!projection || field.children.length === 0) return null;
        const selectedRow = projection.rows.find(row => [...row.cells.values()].some(child => child.id === props.selected?.id));
        const selectedColumn = selectedRow && [...selectedRow.cells].find(([, child]) => child.id === props.selected?.id)?.[0];
        const groupMember = selectedGroup && (field.id === selectedGroup.id || field.id.startsWith(`${selectedGroup.id}/`));
        return <tr className={`cu-inline-detail-row${relatedBlock.has(field.id) ? " is-table-block" : ""}${groupMember ? " is-group-member" : ""}`} key={`${field.id}:grid`}><td colSpan={settings.columns}>
            <div className="cu-inline-table-wrap" data-array-id={field.id} ref={element => { if (element) element.scrollLeft = props.tableScroll.get(field.id) ?? 0; }}
                onScroll={event => { props.tableScroll.set(field.id, event.currentTarget.scrollLeft); }}>
                <table className="cu-items-table" aria-label={`${fieldLabel(field)} values`}>
                    <thead><tr><th scope="col">#</th>{projection.columns.map(column => <th key={column.key} scope="col"
                        className={column.key === selectedColumn ? "is-location-column" : undefined}>{column.label}</th>)}</tr></thead>
                    <tbody>{projection.rows.map(row => {
                        if (![...row.cells.values()].some(child => matches.has(child.id))) return null;
                        return <tr key={row.field.id}><th scope="row"
                            className={[row === selectedRow ? "is-location-row" : "",
                                groupMember ? "is-group-member" : "",
                                relatedBlock.has(row.field.id) ? "is-table-context" : ""].filter(Boolean).join(" ")}>{row.index + 1}</th>{projection.columns.map(column => {
                            const child = row.cells.get(column.key);
                            return <td key={column.key} className={[child && !matches.has(child.id) ? "is-context-value" : "",
                                child && child.id === props.selected?.id ? "is-selected-cell" : "",
                                child && child.id === props.hovered?.id ? "is-hovered-cell" : "",
                                groupMember ? "is-group-member" : "",
                                child && relatedBlock.has(child.id) ? "is-table-related-cell" : ""].filter(Boolean).join(" ")}
                                onClick={event => {
                                    if (child && !(event.target instanceof Element && event.target.closest("button"))) props.onSelect(child);
                                }}>
                                {child ? cell(child) : <span className="cu-missing-cell">No cell returned</span>}
                            </td>;
                        })}</tr>;
                    })}</tbody>
                </table>
            </div>
        </td></tr>;
    };
    const renderRows = (siblings: readonly CuField[], depth: number, parent: string, inArray: boolean): ReactNode[] => {
        const sorted = inArray ? [...siblings] : orderedFields(siblings, parent, props.order);
        return sorted.flatMap((field): ReactNode[] => {
            if (!visible.has(field.id)) return [];
            const entry = byId.get(field.id)!;
            const group = isFieldGroup(field);
            const open = filtering || review.expanded.has(field.id);
            const collapsed = group && (!open || !field.children.length);
            const summary = group ? collapsed ? collapsedValue(field, scopeIds ?? undefined) : displayValue(field) : "";
            const name = fieldDisplayName(field);
            const regions = fieldRegions(field);
            const pages = [...new Set(regions.map(region => region.pageNumber))];
            const page = regions.find(region => region.pageNumber === props.pageNumber && props.isPageAvailable(region.pageNumber))?.pageNumber ??
                regions.find(region => props.isPageAvailable(region.pageNumber))?.pageNumber ?? pages[0];
            const member = selectedGroup && field.id.startsWith(`${selectedGroup.id}/`);
            const selectedProxy = Boolean(group && !open && props.selected?.id.startsWith(`${field.id}/`));
            const hovered = props.hovered?.id === field.id ||
                (group && !open && props.hovered?.id.startsWith(`${field.id}/`));
            const selected = props.selected?.id === field.id || relatedTargets.has(field.id) ||
                (group && !open && (props.selected?.id.startsWith(`${field.id}/`) ||
                    props.tableLocation?.match.fields.some(child => child.id.startsWith(`${field.id}/`))));
            const expand = (): void => {
                if (!field.children.length) { props.workflow.inspect(field); return; }
                if (filtering) return;
                props.setReview(current => {
                    const expanded = new Set(current.expanded);
                    if (open) expanded.delete(field.id); else expanded.add(field.id);
                    return { ...current, expanded };
                });
            };
            const row = <tr key={field.id} aria-level={depth + 1} aria-expanded={group && field.children.length ? open : undefined}
                data-field-id={field.id} data-field-depth={depth} data-field-type={field.type}
                className={[group ? "is-group" : "", selected ? "is-selected" : "", member ? "is-group-member" : "",
                    selectedGroup?.id === field.id ? "is-group-selected" : "", related.has(field.id) ? "is-table-related" : "",
                    selectedProxy ? "is-selection-proxy" : "",
                    relatedBlock.has(field.id) ? "is-table-block" : "", props.selected?.id === field.id && !group ? "is-current-value" : "",
                    dragId === field.id ? "is-dragging" : "",
                    dropTarget?.id === field.id ? `cu-drop-${dropTarget.placement}` : "",
                    hovered ? "is-hovered" : ""].filter(Boolean).join(" ")}
                onPointerMove={() => { if (!props.workflow.menuOpen.current) props.onHover(field); }}
                onPointerLeave={() => props.onLeave(field)}
                onFocus={event => {
                    if (!props.restoringFocus.current && !props.workflow.menuOpen.current && !event.currentTarget.contains(event.relatedTarget)) props.onHover(field, false);
                }}
                onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) props.onLeave(field); }}
                onClick={event => { if (!group && !(event.target instanceof Element && event.target.closest("button"))) props.onSelect(field); }}
                onDragOver={event => {
                    const from = entries.find(item => item.field.id === dragging.current);
                    if (!reorderReason && from?.parent === entry.parent && !entry.inArray && !from.inArray && from.field.id !== field.id) {
                        event.preventDefault();
                        const bounds = event.currentTarget.getBoundingClientRect();
                        const placement = event.clientY < bounds.y + bounds.height / 2 ? "before" : "after";
                        setDropTarget(current => current?.id === field.id && current.placement === placement ? current : { id: field.id, placement });
                    } else setDropTarget(null);
                }}
                onDrop={event => {
                    event.preventDefault();
                    if (dragging.current && !reorderReason) {
                        const bounds = event.currentTarget.getBoundingClientRect();
                        move(dragging.current, field.id, event.clientY < bounds.y + bounds.height / 2 ? "before" : "after");
                    }
                    dragging.current = null; setDragId(null); setDropTarget(null);
                }}>
                <td><div className="cu-field-name-content" style={{ paddingLeft: 5 + Math.min(depth, 10) * 15 }}>
                    <button type="button" className="cu-drag-handle" tabIndex={-1}
                        aria-label={`Reorder ${fieldLabel(field)}`} title={reorderReason ?? (entry.inArray ? "Array business rows and cells cannot be reordered." : "Drag among siblings; Alt+Up/Down on the field also reorders.")}
                        disabled={Boolean(reorderReason || entry.inArray)} draggable={!reorderReason && !entry.inArray}
                        onKeyDown={event => onFieldKey(event, field)}
                        onDragStart={event => {
                            dragging.current = field.id; setDragId(field.id);
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", entry.path);
                            event.dataTransfer.setDragImage(event.currentTarget.closest("tr") ?? event.currentTarget, 12, 12);
                        }} onDragEnd={() => { dragging.current = null; setDragId(null); setDropTarget(null); }}><ViewerIcon name="grip" /></button>
                    {group && field.children.length ? <button type="button" className="cu-expand" tabIndex={-1}
                        aria-label={`${open ? "Collapse" : "Expand"} ${name}`} aria-expanded={open} disabled={filtering}
                        title={filtering ? "Automatically expanded while filtering." : undefined} onClick={expand}><ViewerIcon name={open ? "down" : "right"} /></button> :
                        <span className="cu-expand-spacer" />}
                    <button type="button" className="cu-field-name" data-review-focus={field.id}
                        aria-describedby={descriptionId(field)}
                        aria-pressed={group ? undefined : props.selected?.id === field.id}
                        aria-expanded={group && field.children.length ? open : undefined}
                        aria-label={name} title={fieldLabel(field)}
                        tabIndex={review.focused === field.id || (!review.focused && depth === 0 && sorted[0] === field) ? 0 : -1}
                        ref={button => { if (button) nameButtons.current.set(field.id, button); else nameButtons.current.delete(field.id); }}
                        onFocus={() => setFocus(field.id)} onKeyDown={event => onFieldKey(event, field)}
                        onClick={() => group ? expand() : props.onSelect(field)}>{name}</button>
                </div></td>
                <td><div className="cu-field-value-content">
                    {collapsed ? <button type="button" className="cu-field-value cu-summary-value" tabIndex={-1}
                        aria-label={`View full value of ${fieldLabel(field)}`} aria-describedby={descriptionId(field)}
                        title="View full value and confidence (F2)"
                        onClick={() => props.workflow.inspect(field, true)}>{summary}</button> :
                        group ? <span className="cu-summary-value">{summary}</span> :
                        <button type="button" className="cu-field-value" tabIndex={-1} aria-label={`Select value of ${fieldLabel(field)}`}
                            aria-describedby={descriptionId(field)}
                            aria-pressed={props.selected?.id === field.id} onClick={() => props.onSelect(field)}>{value(field)}</button>}
                    {group && page !== undefined ? <span className="cu-group-value-actions"><button type="button" className="cu-page-badge"
                        aria-label={`Locate ${name} on page ${page}${pages.length > 1 ? `, ${pages.length} source pages` : ""}`}
                        aria-pressed={props.selected?.id === field.id}
                        disabled={!props.sourceReady || !regions.some(region => props.isPageAvailable(region.pageNumber))}
                        title={!props.sourceReady ? "Source is not ready for navigation." : !props.isPageAvailable(page) ?
                            `Page ${page} is not present in the loaded source.` : `Locate all ${leafFields([field]).length} descendant fields.`}
                        onClick={() => props.onSelect(field)}><ViewerIcon name="locate" />p.{page}{pages.length > 1 ? ` · ${pages.length} pages` : ""}</button></span> :
                        <ValueMenuTrigger field={field} workflow={props.workflow} menuId={props.menuId} onOpen={props.onMenu} />}
                    <span className="cu-visually-hidden" id={descriptionId(field)}>{description(field, collapsed ? summary : undefined)}</span>
                </div></td>
                {settings.columns === 3 && <td className="cu-confidence" title={group ? undefined : confidenceDescription(field, settings.threshold)}>
                    {group ? null : field.confidence !== undefined ? formatScore(field.confidence, settings.threshold) : "N/A"}</td>}
            </tr>;
            const grid = group && open && field.type === "array" ? renderArray(field) : null;
            return [row, ...(group && open ? grid ? [grid] : renderRows(field.children, depth + 1, entry.path, inArray || field.type === "array") : [])];
        });
    };
    const rows = renderRows(fields, 0, "$root", false);
    return <>
        <div className="cu-fields-controls">
            <div className="cu-result-heading">{props.tableScope ? <div className="cu-table-scope" role="status">
                <span title="Only related fields are shown. Existing search and filters still apply.">{props.tableScope.table.name} · Related fields only</span>
                <button type="button" className="cu-text-button" aria-label="Show all fields" disabled={!props.onShowAllFields}
                    title={props.onShowAllFields ? undefined : "Scope exit is unavailable in this host."} onClick={() => {
                    props.onShowAllFields?.();
                    viewport.current?.closest(".cu-result-panel")?.querySelector<HTMLInputElement>('input[type="search"]')?.focus({ preventScroll: true });
                }}>Show all</button>
            </div> : <span>{leaves.length} fields / {missing} not returned</span>}
                <div className="cu-layout-switch" aria-label="Fields columns">{([2, 3] as const).map(columns =>
                    <button key={columns} type="button" aria-pressed={settings.columns === columns}
                        onClick={() => props.onSettings({ ...settings, columns })}>{columns} columns</button>)}</div></div>
            <label className="cu-search-box"><ViewerIcon name="search" /><input type="search" aria-label="Search fields or values"
                placeholder="Search fields or values..." value={review.query}
                onChange={event => props.setReview(current => ({ ...current, query: event.target.value }))} /></label>
            <div className="cu-review-toolbar">
                <button type="button" className="cu-filter-button" aria-pressed={review.lowOnly}
                    onClick={() => props.setReview(current => ({ ...current, lowOnly: !current.lowOnly }))}>Low confidence <span>{lowCount}</span></button>
                <label className="cu-missing-toggle"><input type="checkbox" role="switch" aria-label="Hide missing fields"
                    checked={props.hideMissing} aria-checked={props.hideMissing} onChange={event => props.onHideMissing(event.target.checked)} />Hide missing</label>
                <div className="cu-field-navigation"><span>{matches.size} / {leaves.length} fields</span>
                    <button type="button" className="cu-icon-button" aria-label="Previous field" disabled={!matches.size} onClick={() => chooseNext(-1)}><ViewerIcon name="left" /></button>
                    <button type="button" className="cu-icon-button" aria-label="Next field" disabled={!matches.size} onClick={() => chooseNext(1)}><ViewerIcon name="right" /></button>
                </div>
            </div>
        </div>
        <div className="cu-fields-scroll" ref={viewport}>
            <table className="cu-fields-table" role="treegrid" aria-label="Extracted fields">
                <colgroup><col style={{ width: `${settings.fieldRatio * (settings.columns === 3 ? 83 : 100)}%` }} /><col />
                    {settings.columns === 3 && <col style={{ width: "17%" }} />}</colgroup>
                <thead><tr><th scope="col">Field<ResizeHandle label="Field column width" className="cu-column-resizer"
                    value={columnWidth * settings.fieldRatio} min={columnWidth * 0.25} max={columnWidth * 0.7}
                    step={12} defaultValue={columnWidth * 0.46}
                    onChange={next => props.onSettings({ ...settings, fieldRatio: next / columnWidth })} /></th>
                    <th scope="col">Value</th>{settings.columns === 3 && <th scope="col">Confidence</th>}</tr></thead>
                <tbody>{rows}</tbody>
            </table>
            {fields.length === 0 ? <div className="cu-state"><h2>No extracted fields</h2>
                <p>This content has no extracted fields. Original table data remains available in Result.</p></div> :
            matches.size === 0 && <div className="cu-state"><h2>No matching fields</h2><p>No values match the current search and filters.</p>
                <button type="button" onClick={() => {
                    props.setReview(current => ({ ...current, query: "", lowOnly: false })); props.onHideMissing(false);
                }}>Clear filters</button></div>}
        </div>
        <footer className="cu-fields-review-footer"><div><span role={tableMessage ? "status" : undefined}>{props.preferenceError ?
            "Preferences were not saved. See the warning above." : tableMessage ??
                (props.orderControlled ? "Field order is managed by the host." : "Preferences stay in this browser.")}</span>
            <span>{hiddenGroupCount ? `${hiddenGroupCount} selected fields are hidden by filters. ` : ""}
                {notice ?? reorderReason ?? "Up / Down: browse · Enter: locate · F2: details · Alt+Up/Down: reorder"}</span></div>
            <button type="button" className="cu-text-button" disabled={props.orderReadOnly || Boolean(props.tableScope)}
                title={props.tableScope ? "Show all fields before reordering." : undefined}
                onClick={() => props.onOrder({})}><ViewerIcon name="reset" />Reset order</button>
        </footer>
    </>;
}
