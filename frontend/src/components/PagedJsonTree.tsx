import { useMemo, useRef, useState } from "react";
import { ResultPagination } from "./ResultPagination";
import { JSON_STRING_PREVIEW_THRESHOLD } from "../model/resultLimits";
import { textBoundary } from "../markdown/model";
import type { JsonStringSelection } from "./JsonStringDialog";

const ENTRIES_PER_PAGE = 100;
const STRING_SUMMARY_CHARACTERS = 240;

interface JsonNodeProps {
    value: unknown;
    path: string;
    level: number;
    label?: string;
    onViewString: (selection: JsonStringSelection) => void;
}

function JsonScalar({ value, path, level, label, onViewString }: JsonNodeProps) {
    const long = typeof value === "string" && value.length > JSON_STRING_PREVIEW_THRESHOLD;
    const text = JSON.stringify(long ? value.slice(0, textBoundary(value, STRING_SUMMARY_CHARACTERS)) : value);
    const style = value === null ? "null" : typeof value === "string" ? "string" : "number";
    return <li className="cu-json-node" role="treeitem" aria-level={level} data-json-path={path}>
        {label !== undefined && <span className="cu-json-label">{JSON.stringify(label)}:</span>}
        <span className={`cu-json-${style}`}>{text}</span>
        {long && <><span aria-hidden="true">{"\u2026"}</span><span className="cu-json-string-actions">
            <span>{value.length.toLocaleString("en-US")} characters</span>
            <button type="button" aria-label={`View full text for ${path || "/"}`} aria-haspopup="dialog"
                onClick={event => onViewString({ value, path, label, trigger: event.currentTarget })}>View Full Text</button>
        </span></>}
    </li>;
}

function JsonContainer({ value, path, level, label, onViewString }: JsonNodeProps & { value: object }) {
    const [choice, setChoice] = useState({ value, expanded: level === 1, page: 0 });
    const expanded = choice.value === value ? choice.expanded : level === 1;
    const array = Array.isArray(value);
    const keys = useMemo(() => expanded && !array ? Object.keys(value) : [], [value, expanded, array]);
    const count = array ? value.length : keys.length;
    const pages = Math.max(1, Math.ceil(count / ENTRIES_PER_PAGE));
    const page = Math.min(choice.value === value ? choice.page : 0, pages - 1);
    const start = page * ENTRIES_PER_PAGE, end = Math.min(count, start + ENTRIES_PER_PAGE);
    const children = expanded ? Array.from({ length: end - start }, (_, offset) => {
        const key = array ? String(start + offset) : keys[start + offset];
        if (key === undefined) throw new Error("The JSON entry is unavailable.");
        const child: unknown = Reflect.get(value, key);
        return { key, value: child, path: `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}` };
    }) : [];
    const toggle = (open: boolean): void => setChoice({ value, expanded: open, page: choice.value === value ? choice.page : 0 });
    return <li className="cu-json-node" role="treeitem" aria-level={level} aria-expanded={expanded} data-json-path={path}>
        <button type="button" className="cu-json-toggle" aria-label={expanded ? "Collapse JSON node" : "Expand JSON node"}
            aria-expanded={expanded} onClick={() => toggle(!expanded)}
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
        {expanded && <ul className="cu-json-children" role="group">
            {children.map(child => <JsonNode key={child.key} value={child.value} path={child.path}
                level={level + 1} onViewString={onViewString} {...(array ? {} : { label: child.key })} />)}
        </ul>}
        {expanded && <ResultPagination label={`JSON entries at ${path || "/"}`} page={page} pages={pages}
            summary={`Entries ${start + 1}-${end} of ${count}`}
            onChange={next => setChoice({ value, expanded: true, page: next })} />}
        <span>{array ? "]" : "}"}</span>
    </li>;
}

function JsonNode(props: JsonNodeProps) {
    return typeof props.value === "object" && props.value !== null
        ? <JsonContainer {...props} value={props.value} />
        : <JsonScalar {...props} />;
}

export function PagedJsonTree({ value, onViewString }: { value: unknown; onViewString: (selection: JsonStringSelection) => void }) {
    const root = useRef<HTMLUListElement>(null);
    return <>
        <div className="cu-json-notice" role="status">Expand nodes to inspect the original data. Collections are paged; long strings open in a full-text viewer.</div>
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
            <JsonNode value={value} path="" level={1} onViewString={onViewString} />
        </ul>
    </>;
}
