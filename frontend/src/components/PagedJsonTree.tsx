import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ResultPagination } from "./ResultPagination";
import { JSON_STRING_PREVIEW_THRESHOLD } from "../model/resultLimits";
import { textBoundary } from "../markdown/model";
import { isJsonContainer, jsonChildPath, JSON_ENTRIES_PER_PAGE } from "../model/jsonTree";
import type { JsonNodeViewState, JsonSearchMatch, JsonTreeViewState } from "../model/jsonTree";
import { jsonSpanPreview } from "../model/jsonSpans";
import { SOURCE_POPOVER_GAP } from "../source/sourceOverlays";
import type { JsonStringSelection } from "./JsonStringDialog";

const STRING_SUMMARY_CHARACTERS = 240;

interface SpanPreviewOwner { current: { id: string; close: () => void } | null }
const SpanPreviewContext = createContext<SpanPreviewOwner | null>(null);

function JsonSpanTooltip({ text, children }: {
    text: string; children: (descriptionId?: string) => ReactNode;
}) {
    const owner = useContext(SpanPreviewContext);
    if (!owner) throw new Error("Span previews require a JSON tree.");
    const id = useId();
    const anchor = useRef<HTMLSpanElement>(null);
    const tooltip = useRef<HTMLElement>(null);
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState<{ left: number; top: number; side: "right" | "above" | "below" } | null>(null);
    const close = useCallback((): void => {
        setOpen(false);
        setPosition(null);
        if (owner.current?.id === id) owner.current = null;
    }, [owner, id]);
    const leave = useCallback((event: { type: string; relatedTarget: EventTarget | null }): void => {
        const trigger = anchor.current;
        if (!trigger || trigger.contains(trigger.ownerDocument.activeElement)) return;
        const area = event.type === "blur" ? trigger : trigger.parentElement;
        if (event.relatedTarget instanceof Node &&
            (area?.contains(event.relatedTarget) || tooltip.current?.contains(event.relatedTarget))) return;
        close();
    }, [close]);
    const show = (): void => {
        if (owner.current?.id !== id) owner.current?.close();
        owner.current = { id, close };
        setOpen(true);
    };
    useEffect(() => () => {
        if (owner.current?.id === id) owner.current = null;
    }, [owner, id]);
    useLayoutEffect(() => {
        const trigger = anchor.current;
        const span = trigger?.parentElement;
        const popup = tooltip.current;
        const window = trigger?.ownerDocument.defaultView;
        if (!open || !trigger || !span || !popup || !window) return;
        const viewport = trigger.closest(".cu-rich-result-scroll");
        const update = (): void => {
            if (!trigger.isConnected) { close(); return; }
            const bounds = trigger.getBoundingClientRect();
            popup.style.removeProperty("--cu-span-content-height");
            let height = popup.offsetHeight;
            const width = popup.offsetWidth;
            // JSON rows fill the pane; measure the text so the preview clears the expanded metadata.
            const textRange = trigger.ownerDocument.createRange();
            let textRight = bounds.right;
            for (const row of span.querySelectorAll('[data-json-path$="/offset"], [data-json-path$="/length"]')) {
                textRange.selectNodeContents(row);
                textRight = Math.max(textRight, textRange.getBoundingClientRect().right);
            }
            const rightLeft = Math.max(8, textRight + SOURCE_POPOVER_GAP);
            if (rightLeft + width <= window.innerWidth - 8) {
                const center = bounds.top + bounds.height / 2;
                const top = Math.max(8, Math.min(center - height / 2, window.innerHeight - height - 8));
                popup.style.setProperty("--cu-span-arrow-top", `${Math.max(4, Math.min(height - 12, center - top - 4))}px`);
                setPosition({ left: rightLeft, top, side: "right" });
                return;
            }
            // The expanded node includes the offset/length rows below the trigger.
            const belowTop = Math.max(bounds.bottom, span.getBoundingClientRect().bottom) + SOURCE_POPOVER_GAP;
            const aboveBottom = bounds.top - SOURCE_POPOVER_GAP;
            const belowSpace = window.innerHeight - 8 - belowTop, aboveSpace = aboveBottom - 8;
            const above = height > belowSpace && aboveSpace > belowSpace;
            const availableHeight = Math.floor(above ? aboveSpace : belowSpace);
            if (height > availableHeight) {
                const borders = height - popup.clientHeight;
                popup.style.setProperty("--cu-span-content-height", `${Math.max(0, availableHeight - borders)}px`);
                height = popup.offsetHeight;
                if (height > availableHeight) { setPosition(null); return; }
            }
            const left = Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8));
            const top = above ? aboveBottom - height : belowTop;
            popup.style.setProperty("--cu-arrow-left",
                `${Math.max(8, Math.min(width - 16, bounds.left - left + Math.min(18, bounds.width / 2)))}px`);
            setPosition({ left, top, side: above ? "above" : "below" });
        };
        const scroll = (event: Event): void => {
            if (!(event.target instanceof Node) || !popup.contains(event.target)) close();
        };
        const escape = (event: KeyboardEvent): void => {
            if (event.key !== "Escape") return;
            event.preventDefault(); event.stopPropagation(); close();
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(trigger);
        observer.observe(span);
        observer.observe(popup);
        if (viewport) observer.observe(viewport);
        span.addEventListener("mouseleave", leave);
        window.addEventListener("resize", update);
        trigger.ownerDocument.addEventListener("scroll", scroll, true);
        trigger.ownerDocument.addEventListener("keydown", escape, true);
        return () => {
            observer.disconnect();
            span.removeEventListener("mouseleave", leave);
            window.removeEventListener("resize", update);
            trigger.ownerDocument.removeEventListener("scroll", scroll, true);
            trigger.ownerDocument.removeEventListener("keydown", escape, true);
        };
    }, [open, text, close, leave]);
    return <span ref={anchor} className="cu-json-span-trigger" aria-describedby={open ? `${id}-content` : undefined}
        onMouseEnter={show} onFocus={show} onBlur={leave}>
        {children(open ? `${id}-content` : undefined)}
        {open && anchor.current && createPortal(<aside id={id} ref={tooltip} role="tooltip" aria-label="Span preview"
            className="cu-source-popover cu-viewer-popup cu-json-span-tooltip"
            data-side={position?.side}
            style={{ left: position?.left, top: position?.top, visibility: position ? "visible" : "hidden" }}
            onMouseLeave={leave}>
            <div id={`${id}-content`} className="cu-json-span-content">{text}</div>
        </aside>, anchor.current.ownerDocument.body)}
    </span>;
}

interface JsonNodeProps {
    value: unknown;
    root: unknown;
    state: JsonTreeViewState;
    match: JsonSearchMatch | null;
    path: string;
    level: number;
    label?: string;
    onViewString: (selection: JsonStringSelection) => void;
}

function matchingText(text: string | undefined, match: JsonSearchMatch | null, excerpt = false): ReactNode {
    if (!match) return text;
    const { start, end } = match.range;
    if (!excerpt) {
        return <>{text?.slice(0, start)}<mark className="cu-json-find-match is-current" data-json-tree-match="true">
            {match.literal.slice(start, end)}</mark>{text?.slice(end)}</>;
    }
    const literal = match.literal;
    const from = textBoundary(literal, Math.max(0, start - 60));
    const hitEnd = textBoundary(literal, Math.min(end, start + STRING_SUMMARY_CHARACTERS));
    const to = textBoundary(literal, Math.min(literal.length, hitEnd + 60));
    return <>{from > 0 ? "\u2026" : ""}{literal.slice(from, start)}
        <mark className="cu-json-find-match is-current" data-json-tree-match="true">{literal.slice(start, hitEnd)}</mark>
        {literal.slice(hitEnd, to)}{to < literal.length ? "\u2026" : ""}</>;
}

function JsonLabel({ label, match }: { label: string; match: JsonSearchMatch | null }) {
    return <span className="cu-json-label">{matchingText(JSON.stringify(label), match)}:</span>;
}

function JsonScalar({ value, root, path, level, label, match, onViewString }: JsonNodeProps) {
    const hint = useMemo(() => jsonSpanPreview(root, path), [root, path, value]);
    const long = typeof value === "string" && value.length > JSON_STRING_PREVIEW_THRESHOLD;
    const text = JSON.stringify(long ? value.slice(0, textBoundary(value, STRING_SUMMARY_CHARACTERS)) : value);
    const style = value === null ? "null" : typeof value === "string" ? "string" : "number";
    const active = match?.path === path ? match : null;
    const valueMatch = active?.part === "value" ? active : null;
    const excerpt = long && valueMatch !== null && valueMatch.range.end >= (text?.length ?? 0);
    const content = (descriptionId?: string) => <>
        {label !== undefined && <JsonLabel label={label} match={active?.part === "key" ? active : null} />}
        <span className={`cu-json-${style}`} aria-describedby={descriptionId}>
            {matchingText(text, valueMatch, excerpt)}
        </span>
        {long && <>{!excerpt && <span aria-hidden="true">{"\u2026"}</span>}<span className="cu-json-string-actions">
            <span>{value.length.toLocaleString("en-US")} characters</span>
            <button type="button" aria-label={`View full text for ${path || "/"}`} aria-haspopup="dialog"
                onClick={event => onViewString({ value, path, label, trigger: event.currentTarget })}>View Full Text</button>
        </span></>}
    </>;
    return <li className="cu-json-node" role="treeitem" aria-level={level} data-json-path={path} aria-description={hint}>
        {hint === undefined ? content() : <JsonSpanTooltip text={hint}>{content}</JsonSpanTooltip>}
    </li>;
}

function JsonContainer({ value, root, state, path, level, label, match, onViewString }: JsonNodeProps & { value: object }) {
    const cached = state.nodes.get(path) ?? { page: 0 };
    const [choice, setChoice] = useState({ state, node: cached });
    const current = choice.state === state ? choice.node : cached;
    const hint = useMemo(() => jsonSpanPreview(root, path), [root, path, value]);
    const expanded = current.expanded ?? (state.expansion === "expanded" || (state.expansion === "root" && level === 1));
    const array = Array.isArray(value);
    const keys = useMemo(() => expanded && !array ? Object.keys(value) : [], [value, expanded, array]);
    const count = array ? value.length : keys.length;
    const pages = Math.max(1, Math.ceil(count / JSON_ENTRIES_PER_PAGE));
    const page = Math.min(current.page, pages - 1);
    const start = page * JSON_ENTRIES_PER_PAGE, end = Math.min(count, start + JSON_ENTRIES_PER_PAGE);
    const children = expanded ? Array.from({ length: end - start }, (_, offset) => {
        const key = array ? String(start + offset) : keys[start + offset];
        if (key === undefined) throw new Error("The JSON entry is unavailable.");
        const child: unknown = Reflect.get(value, key);
        return { key, value: child, path: jsonChildPath(path, key) };
    }) : [];
    const choose = (node: JsonNodeViewState): void => { state.nodes.set(path, node); setChoice({ state, node }); };
    const toggle = (open: boolean): void => choose({ expanded: open, page: current.page });
    const heading = (descriptionId?: string) => <>
        <button type="button" className="cu-json-toggle" aria-label={expanded ? "Collapse JSON node" : "Expand JSON node"}
            aria-expanded={expanded} aria-description={hint} aria-describedby={descriptionId} onClick={() => toggle(!expanded)}
            onKeyDown={event => {
                if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                    event.preventDefault();
                    toggle(event.key === "ArrowRight");
                }
            }}>
            <span className={`cu-json-expander ${expanded ? "cu-json-collapse" : "cu-json-expand"}`} aria-hidden="true" />
            {label !== undefined && <JsonLabel label={label} match={match?.path === path && match.part === "key" ? match : null} />}
        </button>
        <span>{array ? "[" : "{"}{expanded ? "" : "..."}</span>
    </>;
    return <li className="cu-json-node" role="treeitem" aria-level={level} aria-expanded={expanded} data-json-path={path}
        aria-description={hint}>
        {hint === undefined ? heading() : <JsonSpanTooltip text={hint}>{heading}</JsonSpanTooltip>}
        {expanded && <ul className="cu-json-children" role="group">
            {children.map(child => <JsonNode key={child.key} value={child.value} path={child.path}
                root={root} state={state} match={match} level={level + 1} onViewString={onViewString} {...(array ? {} : { label: child.key })} />)}
        </ul>}
        {expanded && <ResultPagination label={`JSON entries at ${path || "/"}`} page={page} pages={pages}
            summary={`Entries ${start + 1}-${end} of ${count}`}
            onChange={next => choose({ expanded: true, page: next })} />}
        <span>{array ? "]" : "}"}</span>
    </li>;
}

function JsonNode(props: JsonNodeProps) {
    return isJsonContainer(props.value)
        ? <JsonContainer {...props} value={props.value} />
        : <JsonScalar {...props} />;
}

export function PagedJsonTree({ value, state, match, onViewString }: {
    value: unknown; state: JsonTreeViewState; match: JsonSearchMatch | null; onViewString: (selection: JsonStringSelection) => void;
}) {
    const root = useRef<HTMLUListElement>(null);
    const previewOwner = useRef<SpanPreviewOwner["current"]>(null);
    return <SpanPreviewContext.Provider value={previewOwner}>
        <div className="cu-json-notice" role="status">Expand nodes to inspect the original data. Collections are paged; hover spans for their Markdown text. Long strings open in a full-text viewer.</div>
        <ul ref={root} className="cu-json-tree cu-json-paged" role="tree" aria-label="Original Analyze result JSON"
            onKeyDown={event => {
                if (!(event.target instanceof HTMLElement) || !event.target.matches(".cu-json-toggle") ||
                    !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
                const controls = [...(root.current?.querySelectorAll<HTMLButtonElement>(".cu-json-toggle") ?? [])];
                const current = controls.findIndex(control => control === event.target);
                if (current < 0) return;
                event.preventDefault();
                const index = event.key === "Home" ? 0 : event.key === "End" ? controls.length - 1 :
                    (current + (event.key === "ArrowUp" ? -1 : 1) + controls.length) % controls.length;
                controls[index]?.focus();
            }}>
            <JsonNode value={value} root={value} state={state} match={match} path="" level={1} onViewString={onViewString} />
        </ul>
    </SpanPreviewContext.Provider>;
}
