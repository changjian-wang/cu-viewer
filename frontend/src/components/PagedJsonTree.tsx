import { useMemo, useRef, useState } from "react";
import { ResultPagination } from "./ResultPagination";

const ENTRIES_PER_PAGE = 100;
const STRING_CHARACTERS_PER_PAGE = 4_000;

interface JsonNodeProps {
    value: unknown;
    path: string;
    level: number;
    label?: string;
}

function stringBoundary(value: string, offset: number): number {
    const before = value.charCodeAt(offset - 1), after = value.charCodeAt(offset);
    return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff ? offset - 1 : offset;
}

function JsonScalar({ value, path, level, label }: JsonNodeProps) {
    const [choice, setChoice] = useState({ value, page: 0 });
    const page = choice.value === value ? choice.page : 0;
    const pages = typeof value === "string" ? Math.max(1, Math.ceil(value.length / STRING_CHARACTERS_PER_PAGE)) : 1;
    const start = typeof value === "string" ? stringBoundary(value, page * STRING_CHARACTERS_PER_PAGE) : 0;
    const end = typeof value === "string" ? stringBoundary(value, Math.min(value.length, (page + 1) * STRING_CHARACTERS_PER_PAGE)) : 0;
    const text = JSON.stringify(typeof value === "string" ? value.slice(start, end) : value);
    const style = value === null ? "null" : typeof value === "string" ? "string" : "number";
    return <li className="cu-json-node" role="treeitem" aria-level={level} data-json-path={path}>
        {label !== undefined && <span className="cu-json-label">{JSON.stringify(label)}:</span>}
        <span className={`cu-json-${style}`}>{text}</span>
        {typeof value === "string" && <ResultPagination label={`JSON string at ${path || "/"}`} page={page} pages={pages}
            summary={`Characters ${start + 1}-${end} of ${value.length}`}
            onChange={next => setChoice({ value, page: next })} />}
    </li>;
}

function JsonContainer({ value, path, level, label }: JsonNodeProps & { value: object }) {
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
                level={level + 1} {...(array ? {} : { label: child.key })} />)}
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

export function PagedJsonTree({ value }: { value: unknown }) {
    const root = useRef<HTMLUListElement>(null);
    return <>
        <div className="cu-json-notice" role="status">Large JSON result. Expand nodes to inspect the original data; long collections and strings are paged.</div>
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
            <JsonNode value={value} path="" level={1} />
        </ul>
    </>;
}
