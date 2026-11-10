import { Fragment, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { inspectJson } from "../model/resultLimits";
import { resultInfoEntries } from "../model/resultInfo";
import type { ResultInfoEntry } from "../model/resultInfo";
import { ViewerIcon } from "./ViewerIcon";
import { ExpansionSettings } from "./ExpansionSettings";

interface InfoRow extends ResultInfoEntry {
    label: string;
    depth: number;
    childCount: number;
}

function infoRows(entries: readonly ResultInfoEntry[], collapsed: ReadonlySet<string>): InfoRow[] {
    const rows: InfoRow[] = [];
    const stack = entries.map(entry => ({ ...entry, depth: 0, label: entry.name })).reverse();
    while (stack.length) {
        const entry = stack.pop();
        if (!entry) break;
        const arrayItem = Array.isArray(entry.value);
        const children = entry.children ?? (typeof entry.value === "object" && entry.value !== null ?
            Object.entries(entry.value).map(([name, value]: [string, unknown]) => ({
                name: arrayItem ? `item ${Number(name) + 1}` : name,
                path: `${entry.path}/${name.replaceAll("~", "~0").replaceAll("/", "~1")}`, value,
            })) : []);
        rows.push({ ...entry, childCount: children.length });
        if (!collapsed.has(entry.path)) for (const child of children.slice().reverse()) {
            const suffix = arrayItem ? `[${child.path.slice(child.path.lastIndexOf("/") + 1)}]` : `.${child.name}`;
            stack.push({ ...child, label: `${entry.label}${suffix}`, depth: entry.depth + 1 });
        }
    }
    return rows;
}

function displayInfoValue(value: unknown): string {
    if (value === null) return "null";
    if (value === "") return '"" (empty string)';
    if (Array.isArray(value)) return value.length ? `${value.length} ${value.length === 1 ? "item" : "items"}` : "[]";
    if (typeof value === "object") return Object.keys(value).length ? "" : "{}";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    throw new Error("The result information is not serialized JSON.");
}

function collapsedTokenCounters(row: InfoRow, open: boolean): [string, number][] | null {
    if (open || row.path !== "/usage/tokens" || typeof row.value !== "object" ||
        row.value === null || Array.isArray(row.value)) return null;
    const entries: [string, unknown][] = Object.entries(row.value);
    return entries.every((entry): entry is [string, number] => typeof entry[1] === "number") ? entries : null;
}

interface TokenSummaryPart {
    key: string;
    name: string;
    detail: string;
    separator: string;
}

function tokenSummaryParts(counters: readonly [string, number][]): TokenSummaryPart[] {
    const values = new Map(counters);
    const merged = new Set<string>();
    const parts: TokenSummaryPart[] = [];
    for (const [name, count] of counters) {
        const model = /^(.+)-(?:input|output)$/.exec(name)?.[1];
        const input = model ? values.get(`${model}-input`) : undefined;
        const output = model ? values.get(`${model}-output`) : undefined;
        if (model && input !== undefined && output !== undefined) {
            if (merged.has(model)) continue;
            merged.add(model);
            parts.push({ key: `${model}-input`, name: model,
                detail: ` (in ${input} / out ${output})`, separator: parts.length ? "; " : "" });
        } else parts.push({ key: name, name, detail: `: ${count}`, separator: parts.length ? "; " : "" });
    }
    return parts;
}

function InfoTokenSummary({ counters, onExpand }: { counters: readonly [string, number][]; onExpand: () => void }) {
    const parts = useMemo(() => tokenSummaryParts(counters), [counters]);
    const text = parts.map(part => `${part.separator}${part.name}${part.detail}`).join("");
    const tooltipId = useId();
    const tooltip = useRef<HTMLDivElement>(null);
    const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
    const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
    useLayoutEffect(() => {
        const popup = tooltip.current;
        const window = anchor?.ownerDocument.defaultView;
        if (!anchor || !popup || !window) return;
        const update = (): void => {
            if (!anchor.isConnected) { setAnchor(null); return; }
            const bounds = anchor.getBoundingClientRect();
            setPosition({
                left: Math.max(8, Math.min(bounds.left, window.innerWidth - popup.offsetWidth - 8)),
                top: Math.max(8, bounds.bottom + popup.offsetHeight <= window.innerHeight - 8 ?
                    bounds.bottom : bounds.top - popup.offsetHeight),
            });
        };
        const escape = (event: KeyboardEvent): void => {
            if (event.key !== "Escape") return;
            event.preventDefault(); event.stopPropagation(); setAnchor(null);
        };
        const scroll = (event: Event): void => {
            if (!(event.target instanceof Node) || !popup.contains(event.target)) setAnchor(null);
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(anchor);
        observer.observe(popup);
        window.addEventListener("resize", update);
        anchor.ownerDocument.addEventListener("scroll", scroll, true);
        anchor.ownerDocument.addEventListener("keydown", escape, true);
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", update);
            anchor.ownerDocument.removeEventListener("scroll", scroll, true);
            anchor.ownerDocument.removeEventListener("keydown", escape, true);
        };
    }, [anchor, text]);
    return <>
        <button type="button" className="cu-info-value cu-info-token-summary" aria-label="Expand token usage"
            aria-expanded={false} aria-describedby={anchor ? `${tooltipId}-content` : undefined}
            onFocus={event => setAnchor(event.currentTarget)} onBlur={() => setAnchor(null)}
            onMouseEnter={event => setAnchor(event.currentTarget)}
            onMouseLeave={event => {
                if (event.currentTarget.ownerDocument.activeElement === event.currentTarget ||
                    (event.relatedTarget instanceof Node && tooltip.current?.contains(event.relatedTarget))) return;
                setAnchor(null);
            }}
            onClick={event => {
                event.currentTarget.closest("tr")?.querySelector<HTMLButtonElement>(".cu-info-expander")?.focus({ preventScroll: true });
                onExpand();
            }}>
            <span className="cu-info-token-lines">{parts.map(part => <Fragment key={part.key}>
                {part.separator}<span className="cu-info-token-pair">
                    {part.name && <span className="cu-info-token-model">{part.name}</span>}
                    <span className="cu-info-token-count">{part.detail}</span></span>
            </Fragment>)}</span>
        </button>
        {anchor && createPortal(<div id={tooltipId} ref={tooltip} role="tooltip" aria-label="Token usage"
            className="cu-viewer-popup cu-info-token-tooltip"
            style={{ left: position?.left, top: position?.top, visibility: position ? "visible" : "hidden" }}
            onMouseLeave={event => {
                if (anchor.ownerDocument.activeElement !== anchor &&
                    !(event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget))) setAnchor(null);
            }}><span id={`${tooltipId}-content`}>{text}</span></div>,
        anchor.ownerDocument.body)}
    </>;
}

export function InfoPane({ result }: { result: unknown }) {
    const data = useMemo(() => {
        const entries = resultInfoEntries(result);
        return { entries, inspection: inspectJson(entries.map(entry => entry.value)) };
    }, [result]);
    const [fold, setFold] = useState<{ result: unknown; paths: ReadonlySet<string> }>({ result, paths: new Set() });
    const collapsed = useMemo(() => fold.result === result ? fold.paths : new Set<string>(), [fold, result]);
    const allRows = useMemo(() => data.inspection.status === "ready" ? infoRows(data.entries, new Set()) : [], [data]);
    const groupPaths = useMemo(() => allRows.filter(row => row.childCount > 0).map(row => row.path), [allRows]);
    const rows = useMemo(() => collapsed.size && data.inspection.status === "ready" ?
        infoRows(data.entries, collapsed) : allRows, [data, collapsed, allRows]);
    const settingsId = useId();
    const settingsButton = useRef<HTMLButtonElement>(null);
    const [settingsContext, setSettingsContext] = useState<{ result: unknown } | null>(null);
    const settingsOpen = settingsContext !== null && settingsContext.result === result;
    if (data.inspection.status !== "ready") return <div className="cu-state cu-error" role="alert">
        <h2>{data.inspection.status === "limit" ? "Info is too large to display" : "Info could not be displayed"}</h2>
        <p>{data.inspection.status === "invalid" ? data.inspection.message :
            "The information exceeds the Viewer JSON limit. Use the original saved result for full inspection."}</p>
    </div>;
    if (!rows.length) return <div className="cu-state"><h2>No result information</h2></div>;
    const toggle = (path: string): void => {
        const paths = new Set(collapsed);
        if (paths.has(path)) paths.delete(path); else paths.add(path);
        setFold({ result, paths });
    };
    const closeSettings = (restore: boolean): void => {
        if (restore) settingsButton.current?.focus({ preventScroll: true });
        setSettingsContext(null);
    };
    return <><div className="cu-rich-result-scroll cu-info-pane">
        <table className="cu-fields-table cu-info-table" aria-label="Result information">
            <colgroup><col style={{ width: "42%" }} /><col /></colgroup>
            <thead><tr><th scope="col">Field</th><th scope="col">Value</th></tr></thead>
            <tbody>{rows.map(row => {
                const open = !collapsed.has(row.path);
                const container = typeof row.value === "object" && row.value !== null;
                const counters = collapsedTokenCounters(row, open);
                return <tr key={row.path} data-info-path={row.path} data-info-depth={row.depth}
                    className={[container ? "is-group" : "", row.depth === 0 ? "is-info-section" : ""].filter(Boolean).join(" ") || undefined}>
                    <th scope="row"><div className="cu-info-name" style={{ paddingLeft: 8 + Math.min(row.depth, 12) * 16 }}>
                        {row.childCount ? <button type="button" className="cu-info-expander" aria-expanded={open}
                            aria-label={`${open ? "Collapse" : "Expand"} ${row.label}`} title={row.label} onClick={() => toggle(row.path)}>
                            <ViewerIcon name={open ? "down" : "right"} /><span className="cu-info-label">{row.name}</span>
                        </button> : <span className="cu-info-leaf" title={row.label}><span className="cu-info-label">{row.name}</span></span>}
                    </div></th>
                    <td>{counters?.length ? <InfoTokenSummary counters={counters} onExpand={() => toggle(row.path)} /> :
                        <div className={`cu-info-value${container ? " cu-info-summary" : ""}`}>{displayInfoValue(row.value)}</div>}</td>
                </tr>;
            })}</tbody>
        </table>
    </div>
        <footer className="cu-fields-review-footer cu-info-footer" role="group" aria-label="Info toolbar"
            onKeyDown={event => {
                if (event.key === "Escape" && settingsOpen) {
                    event.preventDefault(); event.stopPropagation(); closeSettings(true);
                }
            }}>
            <div className="cu-fields-toolbar-actions">
                <button type="button" className="cu-icon-button cu-info-settings-trigger" ref={settingsButton}
                    aria-label="Info settings" aria-haspopup="dialog" aria-expanded={settingsOpen}
                    aria-controls={settingsOpen ? `${settingsId}-settings` : undefined} title="Info settings"
                    onClick={() => setSettingsContext(settingsOpen ? null : { result })}><ViewerIcon name="settings" /></button>
            </div>
            {settingsOpen && settingsButton.current && <ExpansionSettings id={`${settingsId}-settings`} anchor={settingsButton.current}
                label="Info settings" closeLabel="Close info settings" items="groups"
                disabledReason={groupPaths.length ? null : "No groups to expand or collapse."}
                onExpansion={open => setFold({ result, paths: new Set(open ? [] : groupPaths) })}
                onClose={closeSettings} />}
        </footer>
    </>;
}
