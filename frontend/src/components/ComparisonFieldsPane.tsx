import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { displayValue, fieldDisplayName, fieldLabel } from "../interaction/interaction";
import { revealFieldTarget } from "../interaction/fieldNavigation";
import { collapsedValue, FIELD_REVIEW_COLORS, fieldEntries, inlineArrayProjection, moveField, orderedFields, orderedLeafFields } from "../interaction/reviewFields";
import { comparisonOriginal, isComparisonError } from "../model/fieldComparison";
import type { ComparisonFilter, FieldComparison } from "../model/fieldComparison";
import type { FieldsPaneProps } from "./FieldsPane";
import { ComparisonValue } from "./ComparisonValue";
import { ComparisonArrayTables } from "./ComparisonArrayTables";
import { FieldsSettings } from "./FieldsSettings";
import { ViewerIcon } from "./ViewerIcon";

export function ComparisonFieldsPane(props: FieldsPaneProps & { comparison: FieldComparison }) {
    const { comparison, review } = props;
    const comparable = comparison.comparable;
    const id = useId();
    const viewport = useRef<HTMLDivElement>(null);
    const settingsButton = useRef<HTMLButtonElement>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [choice, setChoice] = useState<{ context: object; filter: ComparisonFilter }>({ context: props.workflow.context, filter: "all" });
    const filter = comparable && choice.context === props.workflow.context ? choice.filter : "all";
    const entries = useMemo(() => fieldEntries(comparison.fields), [comparison]);
    const entryById = useMemo(() => new Map(entries.map(entry => [entry.field.id, entry])), [entries]);
    const [revision, setRevision] = useState(0);
    const onArrayReveal = useCallback(() => setRevision(value => value + 1), []);
    const pendingFocus = useRef(false);
    const dragging = useRef<string | null>(null);
    const [dragId, setDragId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<{ id: string; placement: "before" | "after" } | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    useEffect(() => {
        setSettingsOpen(false); setNotice(null);
        dragging.current = null; setDragId(null); setDropTarget(null);
    }, [props.workflow.context]);
    const selected = props.selected && comparison.byFieldId.get(props.selected.id);
    const inlineArrays = useMemo(() => new Set(comparison.nodes.filter(node =>
        node.field.type === "array" && inlineArrayProjection(node.field)).map(node => node.field.id)), [comparison]);
    const search = useMemo(() => {
        const needle = review.query.trim().toLocaleLowerCase();
        const found = new Set<string>();
        for (const node of comparison.nodes) {
            if (node.children.length) continue;
            if (needle) {
                const values = [node.label, node.extracted].map(field => !field ? "" :
                    field.type === "object" ? collapsedValue(field) : displayValue(field));
                if (!`${fieldLabel(node.field)} ${node.path} ${values.join(" ")}`.toLocaleLowerCase().includes(needle)) continue;
            }
            if (props.tableScope && !props.tableScope.match.fields.some(field => comparison.byFieldId.get(field.id) === node)) continue;
            if (filter === "errors" && !isComparisonError(node.status)) continue;
            if (filter === "matched") {
                if (node.status !== "matched") continue;
                let array = node.array;
                while (array && !array.errors) array = array.array;
                if (array) continue;
            }
            found.add(node.field.id);
        }
        return found;
    }, [comparison, review.query, filter, props.settings.threshold, props.tableScope]);
    const visible = useMemo(() => {
        const result = new Set(search);
        for (const node of comparison.nodes.slice().reverse()) if (node.children.some(child => result.has(child.field.id))) result.add(node.field.id);
        return result;
    }, [comparison, search]);
    const filtering = filter !== "all" || Boolean(review.query.trim());
    const reorderReason = props.orderReadOnly ?
        "Field order is read-only. Check the configuration; controlled order requires onFieldOrderChange." :
        props.tableScope ? "Show all fields before reordering." :
            filtering ? "Clear search and filters to reorder fields." : null;
    const navigation = useMemo(() => orderedLeafFields(comparison.fields, props.order, search)
        .map(field => comparison.byFieldId.get(field.id)!), [comparison, props.order, search]);
    const currentIndex = selected ? navigation.indexOf(selected) : -1;
    const move = (from: string, to: string, placement?: "before" | "after"): void => {
        try {
            props.onOrder(moveField(entries, props.order, from, to, placement));
            setNotice("Field display order updated.");
        } catch (error) {
            setNotice(`Reorder failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    };
    const onFieldKey = (event: KeyboardEvent<HTMLElement>, node: FieldComparison["nodes"][number]): void => {
        if (event.key === "Escape" && dragging.current) {
            event.preventDefault(); event.stopPropagation();
            dragging.current = null; setDragId(null); setDropTarget(null); setNotice("Reorder cancelled."); return;
        }
        if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
            event.preventDefault(); event.stopPropagation();
            const entry = entryById.get(node.field.id);
            if (!entry || entry.inArray || reorderReason) {
                setNotice(reorderReason ?? "Array rows and cells cannot be reordered."); return;
            }
            const siblings = orderedFields(entries.filter(item => item.parent === entry.parent)
                .map(item => item.field), entry.parent, props.order);
            const index = siblings.findIndex(item => item.id === node.field.id);
            const next = siblings[index + (event.key === "ArrowUp" ? -1 : 1)];
            if (next) move(node.field.id, next.id);
            return;
        }
        if (event.key === "F2") { event.preventDefault(); props.workflow.inspect(comparisonOriginal(comparison, node.field)); return; }
        if (event.shiftKey && event.key === "F10") {
            event.preventDefault(); props.onMenu(comparisonOriginal(comparison, node.field), event.currentTarget); return;
        }
        if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
            const buttons = [...(viewport.current?.querySelectorAll<HTMLButtonElement>("[data-review-focus]") ?? [])];
            const index = buttons.findIndex(button => button === event.currentTarget);
            const target = event.key === "Home" ? buttons[0] : event.key === "End" ? buttons.at(-1) :
                buttons[index + (event.key === "ArrowDown" ? 1 : -1)];
            if (target && viewport.current) {
                event.preventDefault(); target.focus({ preventScroll: true }); revealFieldTarget(target, viewport.current);
            }
        }
    };
    const chooseNext = (direction: number): void => {
        const node = navigation[currentIndex < 0 ? direction > 0 ? 0 : navigation.length - 1 :
            (currentIndex + direction + navigation.length) % navigation.length];
        if (!node) return;
        pendingFocus.current = true;
        props.setReview(current => ({ ...current, focused: node.field.id, expanded: new Set([...current.expanded,
            ...comparison.nodes.filter(parent => node.path.startsWith(`${parent.path}/`)).map(parent => parent.field.id)]) }));
        props.onSelect(comparisonOriginal(comparison, node.field));
    };
    useLayoutEffect(() => {
        if (!props.selectionRequest || !selected || props.handledReveal.current === props.selectionRequest) return;
        if (!visible.has(selected.field.id)) {
            setNotice("The selected field is hidden by the current search or status filter.");
            props.handledReveal.current = props.selectionRequest;
            return;
        }
        const parents = comparison.nodes.filter(node => selected.path.startsWith(`${node.path}/`));
        if (parents.some(node => !review.expanded.has(node.field.id))) {
            props.setReview(current => ({ ...current, expanded: new Set([...current.expanded, ...parents.map(node => node.field.id)]) }));
            return;
        }
        const button = [...(viewport.current?.querySelectorAll<HTMLButtonElement>("[data-source-field-id]") ?? [])]
            .find(element => element.dataset.sourceFieldId === props.selected?.id);
        if (!button || !viewport.current) return;
        revealFieldTarget(button, viewport.current, props.sourceSelection);
        if (pendingFocus.current) { button.focus({ preventScroll: true }); pendingFocus.current = false; }
        props.handledReveal.current = props.selectionRequest;
    }, [props.selectionRequest, props.selected, selected, visible, comparison, review.expanded, props.setReview,
        props.handledReveal, props.sourceSelection, revision]);
    const rows: ReactNode[] = [];
    const stack = orderedFields(comparison.fields, "$root", props.order).slice().reverse().map(field => ({
        node: comparison.byFieldId.get(field.id)!, depth: 0,
    }));
    while (stack.length) {
        const { node, depth } = stack.pop()!;
        if (!visible.has(node.field.id)) continue;
        const open = filtering || review.expanded.has(node.field.id);
        const original = comparisonOriginal(comparison, node.field);
        const generated = Boolean(node.label?.generated || node.extracted?.generated);
        const hovered = props.hovered && comparison.byFieldId.get(props.hovered.id) === node;
        const entry = entryById.get(node.field.id);
        rows.push(<tr key={node.path} data-field-id={node.field.id} data-comparison-path={node.path}
            aria-level={depth + 1} aria-expanded={node.children.length ? open : undefined}
            className={`${node.children.length ? "is-group " : ""}${selected === node ? "is-selected " : ""}` +
                `${dragId === node.field.id ? "is-dragging " : ""}` +
                `${dropTarget?.id === node.field.id ? `cu-drop-${dropTarget.placement} ` : ""}${hovered ? "is-hovered" : ""}`}
            onDragOver={event => {
                const from = entryById.get(dragging.current ?? "");
                if (!reorderReason && entry && from?.parent === entry.parent && !entry.inArray &&
                    !from.inArray && from.field.id !== node.field.id) {
                    event.preventDefault();
                    const bounds = event.currentTarget.getBoundingClientRect();
                    const placement = event.clientY < bounds.y + bounds.height / 2 ? "before" : "after";
                    setDropTarget(current => current?.id === node.field.id && current.placement === placement ?
                        current : { id: node.field.id, placement });
                } else setDropTarget(null);
            }}
            onDrop={event => {
                event.preventDefault();
                if (dragging.current && !reorderReason) {
                    const bounds = event.currentTarget.getBoundingClientRect();
                    move(dragging.current, node.field.id, event.clientY < bounds.y + bounds.height / 2 ? "before" : "after");
                }
                dragging.current = null; setDragId(null); setDropTarget(null);
            }}>
            <td><div className="cu-field-name-content" style={{ paddingLeft: 8 + Math.min(depth, 10) * 15 }}>
                <button type="button" className="cu-drag-handle" tabIndex={-1}
                    aria-label={`Reorder ${fieldLabel(node.field)}`}
                    title={reorderReason ?? (entry?.inArray ? "Array business rows and cells cannot be reordered." :
                        "Drag among siblings; Alt+Up/Down on the field also reorders.")}
                    disabled={Boolean(reorderReason || entry?.inArray)} draggable={!reorderReason && !entry?.inArray}
                    onDragStart={event => {
                        if (!entry) { event.preventDefault(); return; }
                        dragging.current = node.field.id; setDragId(node.field.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", entry.path);
                        event.dataTransfer.setDragImage(event.currentTarget.closest("tr") ?? event.currentTarget, 12, 12);
                    }}
                    onDragEnd={() => { dragging.current = null; setDragId(null); setDropTarget(null); }}>
                    <ViewerIcon name="grip" />
                </button>
                {node.children.length ? <button type="button" className="cu-expand" aria-label={`${open ? "Collapse" : "Expand"} ${fieldDisplayName(node.field)}`}
                    aria-expanded={open} disabled={filtering} onClick={() => props.setReview(current => {
                        const expanded = new Set(current.expanded);
                        if (open) expanded.delete(node.field.id); else expanded.add(node.field.id);
                        return { ...current, expanded };
                    })}><ViewerIcon name={open ? "down" : "right"} /></button> : <span className="cu-expand-spacer" />}
                <button type="button" className={`cu-field-name${generated ? " is-generated" : ""}`} aria-label={fieldDisplayName(node.field)}
                    aria-pressed={selected === node} title={fieldLabel(original)} data-review-focus={original.id}
                    data-source-field-id={original.id}
                    aria-expanded={node.children.length ? open : undefined}
                    onPointerMove={() => props.onHover(original)} onPointerLeave={() => props.onLeave(original)}
                    onFocus={() => { if (!props.restoringFocus.current) props.onHover(original, false); }}
                    onBlur={() => props.onLeave(original)}
                    onClick={() => {
                        if (!node.children.length) { props.onSelect(original); return; }
                        if (filtering) return;
                        props.setReview(current => {
                            const expanded = new Set(current.expanded);
                            if (open) expanded.delete(node.field.id); else expanded.add(node.field.id);
                            return { ...current, expanded };
                        });
                    }}
                    onKeyDown={event => onFieldKey(event, node)}>
                    {generated && <span className="cu-generated-field-icon"><ViewerIcon name="sparkle" /></span>}
                    <span className={generated ? "cu-generated-field-name" : undefined}>{fieldDisplayName(node.field)}</span>
                </button>
            </div></td>
            <td><ComparisonValue node={node} side="label" props={props} /></td>
            {comparable && <td><ComparisonValue node={node} side="extracted" props={props}
                objectSummary={node.field.type === "object" && node.children.length > 0} /></td>}
        </tr>);
        if (!open || !node.children.length) continue;
        if (inlineArrays.has(node.field.id)) {
            rows.push(<tr key={`${node.path}:arrays`} className="cu-inline-detail-row"><td colSpan={comparable ? 3 : 2}>
                <ComparisonArrayTables node={node} comparison={comparison} props={props}
                    request={props.handledReveal.current !== props.selectionRequest ? props.selectionRequest : null}
                    onReveal={onArrayReveal} />
            </td></tr>);
        } else {
            const children = orderedFields(node.children.map(child => child.field), node.path, props.order).slice().reverse();
            stack.push(...children.map(field => ({ node: comparison.byFieldId.get(field.id)!, depth: depth + 1 })));
        }
    }
    const toggleFilter = (next: ComparisonFilter): void => setChoice({ context: props.workflow.context, filter: filter === next ? "all" : next });
    return <>
        <div className="cu-fields-scroll" ref={viewport} onKeyDown={event => {
            if (event.defaultPrevented || !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key) ||
                !(event.target instanceof HTMLButtonElement) || !event.target.matches("[data-review-focus]")) return;
            const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-review-focus]")];
            const index = buttons.indexOf(event.target);
            const target = event.key === "Home" ? buttons[0] : event.key === "End" ? buttons.at(-1) :
                buttons[index + (event.key === "ArrowUp" ? -1 : 1)];
            if (target) { event.preventDefault(); target.focus({ preventScroll: true }); revealFieldTarget(target, event.currentTarget); }
        }}>
            <table className="cu-fields-table cu-comparison-fields" role="treegrid" aria-label={comparable ? "Compared fields" : "Labels"}>
                <colgroup><col style={{ width: comparable ? "30%" : "40%" }} /><col />
                    {comparable && <col style={{ width: "35%" }} />}</colgroup>
                <thead><tr><th scope="col">Field Name</th><th scope="col">Label Value</th>
                    {comparable && <th scope="col">Extracted Value</th>}</tr></thead>
                <tbody>{rows}</tbody>
            </table>
            {!navigation.length && <div className="cu-state"><h2>No matching fields</h2><p>No values match the current search and status filter.</p>
                <button type="button" onClick={() => { props.setReview(current => ({ ...current, query: "" })); toggleFilter(filter); }}>Clear filters</button></div>}
        </div>
        {notice && <div className="cu-fields-status" role="status">{notice}</div>}
        <footer className="cu-fields-review-footer" role="group" aria-label="Fields toolbar">
            <label className="cu-search-box"><ViewerIcon name="search" /><input type="search"
                aria-label={comparable ? "Search field names, label values or extracted values" : "Search labels or values"}
                placeholder={comparable ? "Search field name, label value or extracted value..." : "Search label names or values..."}
                title={comparable ? "Search field name, label value or extracted value" : "Search label names or values"}
                value={review.query} onChange={event => props.setReview(current => ({ ...current, query: event.target.value }))} /></label>
            <div className="cu-field-navigation" role="group" aria-label="Field navigation">
                <button type="button" className="cu-icon-button" aria-label="Previous field" disabled={!navigation.length} onClick={() => chooseNext(-1)}><ViewerIcon name="left" /></button>
                <span aria-label="Current field position" aria-live="polite">{currentIndex < 0 ? "—" : currentIndex + 1} / {navigation.length}{comparable ? " fields" : ""}</span>
                <button type="button" className="cu-icon-button" aria-label="Next field" disabled={!navigation.length} onClick={() => chooseNext(1)}><ViewerIcon name="right" /></button>
            </div>
            {comparable && <div className="cu-comparison-filters">
                <button type="button" className="cu-match-filter" aria-label={`Show matching fields (${comparison.matched} ${comparison.matched === 1 ? "value" : "values"})`}
                    style={{ background: FIELD_REVIEW_COLORS.matched }}
                    aria-pressed={filter === "matched"} title="Matching leaf values in this content; array cells count individually."
                    onClick={() => toggleFilter("matched")}><ViewerIcon name="checkCircle" />{comparison.matched}</button>
                <button type="button" className="cu-error-filter" aria-label={`Show incorrect fields (${comparison.errors} ${comparison.errors === 1 ? "value" : "values"})`}
                    style={{ background: FIELD_REVIEW_COLORS.error }}
                    aria-pressed={filter === "errors"} title="Incorrect leaf values in this content; arrays with any error stay together."
                    onClick={() => toggleFilter("errors")}><ViewerIcon name="close" />{comparison.errors}</button>
            </div>}
            <div className="cu-fields-toolbar-actions"><button type="button" className="cu-icon-button" ref={settingsButton}
                aria-label="Fields settings" aria-haspopup="dialog" aria-expanded={settingsOpen}
                onClick={() => setSettingsOpen(open => !open)}><ViewerIcon name="settings" /></button></div>
            {settingsOpen && settingsButton.current && <FieldsSettings id={`${id}-settings`} anchor={settingsButton.current}
                hideConfidence settings={props.settings} onSettings={props.onSettings} onResetOrder={() => props.onOrder({})}
                resetOrderDisabledReason={props.orderReadOnly || props.tableScope ? reorderReason : null}
                onObjectExpansion={open => props.setReview(current => {
                    const expanded = new Set(current.expanded);
                    for (const node of comparison.nodes) if (node.field.type === "object") {
                        if (open) expanded.add(node.field.id); else expanded.delete(node.field.id);
                    }
                    return { ...current, expanded };
                })}
                objectExpansionDisabledReason={filtering ? "Clear search and filters before changing object expansion." : null}
                onClose={restore => { if (restore) settingsButton.current?.focus({ preventScroll: true }); setSettingsOpen(false); }} />}
        </footer>
    </>;
}
