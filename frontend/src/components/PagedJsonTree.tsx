import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent, MouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { ResultPagination } from "./ResultPagination";
import { JSON_STRING_PREVIEW_THRESHOLD } from "../model/resultLimits";
import { textBoundary } from "../markdown/model";
import { jsonSpanPreview } from "../model/jsonSpans";
import { SOURCE_POPOVER_GAP } from "../source/sourceOverlays";
import type { JsonStringSelection } from "./JsonStringDialog";

const ENTRIES_PER_PAGE = 100;
const STRING_SUMMARY_CHARACTERS = 240;

export interface JsonNodeViewState { expanded: boolean; page: number }
export type JsonTreeState = Map<string, JsonNodeViewState>;

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
    const [position, setPosition] = useState<{ left: number; top: number; above: boolean } | null>(null);
    const close = useCallback((): void => {
        setOpen(false);
        setPosition(null);
        if (owner.current?.id === id) owner.current = null;
    }, [owner, id]);
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
        const popup = tooltip.current;
        const window = trigger?.ownerDocument.defaultView;
        if (!open || !trigger || !popup || !window) return;
        const update = (): void => {
            if (!trigger.isConnected) { close(); return; }
            const bounds = trigger.getBoundingClientRect();
            const left = Math.max(8, Math.min(bounds.left, window.innerWidth - popup.offsetWidth - 8));
            const above = bounds.bottom + SOURCE_POPOVER_GAP + popup.offsetHeight > window.innerHeight - 8;
            const top = above ? bounds.top - popup.offsetHeight - SOURCE_POPOVER_GAP : bounds.bottom + SOURCE_POPOVER_GAP;
            popup.style.setProperty("--cu-arrow-left",
                `${Math.max(8, Math.min(popup.offsetWidth - 16, bounds.left - left + Math.min(18, bounds.width / 2)))}px`);
            setPosition({ left, top: Math.max(8, Math.min(top, window.innerHeight - popup.offsetHeight - 8)), above });
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
        observer.observe(popup);
        const viewport = trigger.closest(".cu-rich-result-scroll");
        if (viewport) observer.observe(viewport);
        window.addEventListener("resize", update);
        trigger.ownerDocument.addEventListener("scroll", scroll, true);
        trigger.ownerDocument.addEventListener("keydown", escape, true);
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", update);
            trigger.ownerDocument.removeEventListener("scroll", scroll, true);
            trigger.ownerDocument.removeEventListener("keydown", escape, true);
        };
    }, [open, text, close]);
    const leave = (event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>): void => {
        const trigger = anchor.current;
        if (trigger?.contains(trigger.ownerDocument.activeElement) ||
            (event.relatedTarget instanceof Node &&
                (trigger?.contains(event.relatedTarget) || tooltip.current?.contains(event.relatedTarget)))) return;
        close();
    };
    return <span ref={anchor} className="cu-json-span-trigger" aria-describedby={open ? `${id}-content` : undefined}
        onMouseEnter={show} onMouseLeave={leave} onFocus={show} onBlur={leave}>
        {children(open ? `${id}-content` : undefined)}
        {open && anchor.current && createPortal(<aside id={id} ref={tooltip} role="tooltip" aria-label="Span preview"
            className="cu-source-popover cu-viewer-popup cu-json-span-tooltip"
            data-side={position?.above ? "above" : "below"}
            style={{ left: position?.left, top: position?.top, visibility: position ? "visible" : "hidden" }}
            onMouseLeave={leave}>
            <div id={`${id}-content`} className="cu-json-span-content">{text}</div>
        </aside>, anchor.current.ownerDocument.body)}
    </span>;
}

interface JsonNodeProps {
    value: unknown;
    root: unknown;
    state: JsonTreeState;
    path: string;
    level: number;
    label?: string;
    onViewString: (selection: JsonStringSelection) => void;
}

function JsonScalar({ value, root, path, level, label, onViewString }: JsonNodeProps) {
    const hint = useMemo(() => jsonSpanPreview(root, path), [root, path, value]);
    const long = typeof value === "string" && value.length > JSON_STRING_PREVIEW_THRESHOLD;
    const text = JSON.stringify(long ? value.slice(0, textBoundary(value, STRING_SUMMARY_CHARACTERS)) : value);
    const style = value === null ? "null" : typeof value === "string" ? "string" : "number";
    const content = (descriptionId?: string) => <>
        {label !== undefined && <span className="cu-json-label">{JSON.stringify(label)}:</span>}
        <span className={`cu-json-${style}`} aria-describedby={descriptionId}>{text}</span>
        {long && <><span aria-hidden="true">{"\u2026"}</span><span className="cu-json-string-actions">
            <span>{value.length.toLocaleString("en-US")} characters</span>
            <button type="button" aria-label={`View full text for ${path || "/"}`} aria-haspopup="dialog"
                onClick={event => onViewString({ value, path, label, trigger: event.currentTarget })}>View Full Text</button>
        </span></>}
    </>;
    return <li className="cu-json-node" role="treeitem" aria-level={level} data-json-path={path} aria-description={hint}>
        {hint === undefined ? content() : <JsonSpanTooltip text={hint}>{content}</JsonSpanTooltip>}
    </li>;
}

function JsonContainer({ value, root, state, path, level, label, onViewString }: JsonNodeProps & { value: object }) {
    const cached = state.get(path) ?? { expanded: level === 1, page: 0 };
    const [choice, setChoice] = useState({ state, node: cached });
    const current = choice.state === state ? choice.node : cached;
    const hint = useMemo(() => jsonSpanPreview(root, path), [root, path, value]);
    const expanded = current.expanded;
    const array = Array.isArray(value);
    const keys = useMemo(() => expanded && !array ? Object.keys(value) : [], [value, expanded, array]);
    const count = array ? value.length : keys.length;
    const pages = Math.max(1, Math.ceil(count / ENTRIES_PER_PAGE));
    const page = Math.min(current.page, pages - 1);
    const start = page * ENTRIES_PER_PAGE, end = Math.min(count, start + ENTRIES_PER_PAGE);
    const children = expanded ? Array.from({ length: end - start }, (_, offset) => {
        const key = array ? String(start + offset) : keys[start + offset];
        if (key === undefined) throw new Error("The JSON entry is unavailable.");
        const child: unknown = Reflect.get(value, key);
        return { key, value: child, path: `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}` };
    }) : [];
    const choose = (node: JsonNodeViewState): void => { state.set(path, node); setChoice({ state, node }); };
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
            {label !== undefined && <span className="cu-json-label">{JSON.stringify(label)}:</span>}
        </button>
        <span>{array ? "[" : "{"}{expanded ? "" : "..."}</span>
    </>;
    return <li className="cu-json-node" role="treeitem" aria-level={level} aria-expanded={expanded} data-json-path={path}
        aria-description={hint}>
        {hint === undefined ? heading() : <JsonSpanTooltip text={hint}>{heading}</JsonSpanTooltip>}
        {expanded && <ul className="cu-json-children" role="group">
            {children.map(child => <JsonNode key={child.key} value={child.value} path={child.path}
                root={root} state={state} level={level + 1} onViewString={onViewString} {...(array ? {} : { label: child.key })} />)}
        </ul>}
        {expanded && <ResultPagination label={`JSON entries at ${path || "/"}`} page={page} pages={pages}
            summary={`Entries ${start + 1}-${end} of ${count}`}
            onChange={next => choose({ expanded: true, page: next })} />}
        <span>{array ? "]" : "}"}</span>
    </li>;
}

function JsonNode(props: JsonNodeProps) {
    return typeof props.value === "object" && props.value !== null
        ? <JsonContainer {...props} value={props.value} />
        : <JsonScalar {...props} />;
}

export function PagedJsonTree({ value, state, onViewString }: {
    value: unknown; state: JsonTreeState; onViewString: (selection: JsonStringSelection) => void;
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
            <JsonNode value={value} root={value} state={state} path="" level={1} onViewString={onViewString} />
        </ul>
    </SpanPreviewContext.Provider>;
}
