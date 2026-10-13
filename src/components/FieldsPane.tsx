import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import type { CuApiVersion, CuContent, CuField, CuParseIssue } from "../internal/types";
import { displayValue, fieldColor, fieldDisplayName, fieldLabel, formatConfidence, primaryRegion } from "../internal/interaction";
import { availableResultTabs } from "../internal/resultViews";
import type { ResultView } from "../internal/resultViews";
import { unavailableSourcePageMessage } from "../internal/source";

const MarkdownPane = lazy(() => import("./MarkdownPane").then(module => ({ default: module.MarkdownPane })));
const JsonPane = lazy(() => import("./JsonPane").then(module => ({ default: module.JsonPane })));

interface FieldsPaneProps {
    result: unknown;
    apiVersion?: CuApiVersion | undefined;
    analyzerId?: string | undefined;
    content: CuContent | undefined;
    issues: CuParseIssue[];
    error: string | null;
    selected: CuField | null;
    hovered: CuField | null;
    sourceReady: boolean;
    isPageAvailable: (pageNumber: number) => boolean;
    contents: CuContent[];
    contentIndex: number;
    onContentChange: (index: number) => void;
    onHover: (field: CuField) => void;
    onLeave: (field: CuField) => void;
    onSelect: (field: CuField) => void;
    onClear: () => void;
}

export function FieldsPane(props: FieldsPaneProps) {
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [hideMissing, setHideMissing] = useState(true);
    const [requestedView, setView] = useState<ResultView | undefined>("fields");
    const tabRefs = useRef<Partial<Record<ResultView, HTMLButtonElement | null>>>({});
    const focusedTab = useRef<ResultView | undefined>(undefined);
    const tabBaseId = useId();
    const tabs = availableResultTabs(props.content, props.result, props.apiVersion, props.analyzerId);
    const activeTab = tabs.find(tab => tab.id === requestedView) ?? tabs[0];
    const view = activeTab?.id;
    useEffect(() => {
        if (view === requestedView) return;
        setView(view);
        if (focusedTab.current === requestedView && view) tabRefs.current[view]?.focus();
    }, [view, requestedView]);
    const visibleFields = (props.content?.fields ?? []).filter(field => !hideMissing || field.hasValue);
    const selectView = (next: ResultView): void => {
        setView(next);
        tabRefs.current[next]?.focus();
    };
    const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, current: ResultView): void => {
        const views = tabs.map(tab => tab.id);
        const currentIndex = views.indexOf(current);
        let nextIndex: number | undefined;
        if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % views.length;
        else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + views.length) % views.length;
        else if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = views.length - 1;
        if (nextIndex === undefined) return;
        event.preventDefault();
        const next = views[nextIndex];
        if (next) selectView(next);
    };
    const renderField = (field: CuField, depth: number) => {
        if (hideMissing && !field.hasValue) return null;
        const group = field.children.length > 0;
        const closed = !expanded.has(field.id);
        const color = fieldColor(field, props.content?.fields ?? []);
        const region = primaryRegion(field);
        const displayName = fieldDisplayName(field);
        const pageAvailable = region ? props.isPageAvailable(region.pageNumber) : false;
        const selected = props.selected?.id === field.id || (group && closed && props.selected?.id.startsWith(`${field.id}/`));
        const children = field.children.filter(child => !hideMissing || child.hasValue);
        return <div className={depth === 0 ? "cu-field-block" : "cu-nested-field-block"} key={field.id}>
            <div
                className={`cu-field${group ? " is-group" : ""}${depth > 0 ? " is-nested" : ""}${selected ? " is-selected" : ""}${props.hovered?.id === field.id ? " is-hovered" : ""}`}
                style={{ paddingLeft: `${depth === 0 ? 14 : 36 + Math.min(depth - 1, 7) * 16}px` }}
                data-field-id={field.id}
                data-field-depth={depth}
                data-field-type={field.type}
                onMouseEnter={() => props.onHover(field)}
                onMouseLeave={() => props.onLeave(field)}
            >
                <div className="cu-field-heading">
                    {depth === 0 && <span className="cu-dot" aria-hidden="true"
                        style={{ background: region ? color : "transparent", borderColor: region ? color : "#0078d4" }} />}
                    <button type="button" className="cu-field-name" aria-pressed={props.selected?.id === field.id}
                        title={region ? fieldLabel(field) : `${fieldLabel(field)} · No source region`}
                        onClick={() => props.onSelect(field)}>{displayName}</button>
                    {depth === 0 && region && <button
                        type="button" className="cu-page-badge" disabled={!props.sourceReady || !pageAvailable}
                        aria-label={`Locate ${displayName} on page ${region.pageNumber}`}
                        title={!props.sourceReady ? "Source is not ready for navigation." :
                            !pageAvailable ? unavailableSourcePageMessage(region.pageNumber) : undefined}
                        onClick={() => props.onSelect(field)}
                    >p.{region.pageNumber}</button>}
                    <span className="cu-field-spacer" />
                    {field.confidence !== undefined && <span className="cu-confidence" title="Confidence supplied by the service">
                        {formatConfidence(field.confidence)}
                    </span>}
                    {group && <button
                        type="button" className="cu-expand" aria-label={`${closed ? "Expand" : "Collapse"} ${displayName}`}
                        aria-expanded={!closed}
                        onClick={() => setExpanded(current => {
                            const next = new Set(current);
                            if (closed) next.add(field.id);
                            else next.delete(field.id);
                            return next;
                        })}
                    ><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                        <path d={closed ? "M4 6 8 10 12 6" : "M4 10 8 6 12 10"} fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                    </svg></button>}
                </div>
                {!group && <div className={`cu-field-value${!field.hasValue ? " is-missing" : ""}`} onClick={() => props.onSelect(field)}>{displayValue(field)}</div>}
            </div>
            {group && !closed && (children.length ? children.map(child => renderField(child, depth + 1)) :
                <div className="cu-hidden-child-note">No returned values. Turn off Hide missing fields to inspect missing entries.</div>)}
        </div>;
    };
    const panelId = `${tabBaseId}-panel`;
    const contentSelector = props.contents.length > 1 && <label className="cu-content-selector">Content
        <select aria-label="Result content" value={props.contentIndex} onChange={event => props.onContentChange(Number(event.target.value))}>
            {props.contents.map((content, index) => <option key={content.id} value={index}>
                {index + 1}: {content.kind}{content.startPageNumber ? ` · p. ${content.startPageNumber}` : ""}
            </option>)}
        </select>
    </label>;
    const tab = (name: ResultView, label: string) => <button
        key={name}
        ref={element => { tabRefs.current[name] = element; }}
        id={`${tabBaseId}-${name}`}
        type="button"
        role="tab"
        aria-controls={panelId}
        aria-selected={view === name}
        tabIndex={view === name ? 0 : -1}
        className={view === name ? "is-active" : undefined}
        onClick={() => selectView(name)}
        onKeyDown={event => onTabKeyDown(event, name)}
        onFocus={() => { focusedTab.current = name; }}
        onBlur={() => { focusedTab.current = undefined; }}
    >{label}</button>;
    return <section className="cu-fields-pane" aria-label="Extraction results">
        {contentSelector}
        <header className="cu-result-tabs" role="tablist" aria-label="Result views">
            {tabs.map(value => tab(value.id, value.label))}
        </header>
        <span className="cu-visually-hidden" role="status">{props.selected ? `Pinned: ${fieldLabel(props.selected)}` : "No field selected"}</span>
        <div
            id={panelId}
            role="tabpanel"
            aria-labelledby={view ? `${tabBaseId}-${view}` : undefined}
            aria-label={view ? undefined : "Result status"}
            tabIndex={0}
            className="cu-result-panel"
        >
            {props.error && <div className="cu-state cu-error" role="alert">
                <h2>Result could not be read</h2><p>{props.error}</p>
            </div>}
            {!props.error && !props.content && <div className="cu-state">
                <h2>No extracted fields</h2><p>The source can still be inspected. Inspect the original data in Result.</p>
            </div>}
            {props.issues.length > 0 && <details className="cu-issues"><summary>{props.issues.length} result warnings</summary>
                <ul>{props.issues.map((issue, index) => <li key={index}><strong>{issue.code}</strong>: {issue.message} <code>{issue.path}</code></li>)}</ul>
            </details>}
            {view === "fields" && <>
                <div className="cu-fields-options">
                    <span>Hide missing fields</span>
                    <button type="button" role="switch" aria-label="Hide missing fields" aria-checked={hideMissing}
                        className="cu-hide-missing-switch" disabled={!props.content || Boolean(props.error)}
                        onClick={() => {
                            const next = !hideMissing;
                            setHideMissing(next);
                            if (next && ((props.selected && !props.selected.hasValue) || (props.hovered && !props.hovered.hasValue))) props.onClear();
                        }}
                    ><span /></button>
                </div>
                {visibleFields.length ? <div className="cu-fields-scroll">{visibleFields.map(field => renderField(field, 0))}</div> :
                    <div className="cu-state"><h2>No returned fields</h2><p>Turn off Hide missing fields to inspect missing values.</p></div>}
            </>}
            {view === "markdown" && <Suspense fallback={<div className="cu-state" role="status">Loading Markdown view…</div>}>
                <MarkdownPane markdown={props.content?.markdown} />
            </Suspense>}
            {view === "result" && <Suspense fallback={<div className="cu-state" role="status">Loading Result view…</div>}>
                <JsonPane value={props.result} />
            </Suspense>}
            {view && view !== "fields" && view !== "markdown" && view !== "result" && <div className="cu-state" role="status">
                <h2>{activeTab?.label} view is not implemented yet</h2>
                <p>{view === "code" ? "SDK sample rendering is scheduled for the next batch." :
                    "The returned data is available in Result. Detailed rendering is scheduled for the next batch."}</p>
            </div>}
        </div>
        <footer className="cu-results-footer">
            {view === "fields" && "Field colors link to source regions. Confidence is supplied by CU, not an accuracy judgment."}
            {view === "markdown" && "Rendered from content.markdown. Unsafe markup, URLs and remote images are not rendered."}
            {view === "result" && "Original input JSON. The root starts expanded; nested objects and arrays can be opened as needed."}
            {view && view !== "fields" && view !== "markdown" && view !== "result" && "Tab availability is implemented; this view's renderer is not yet implemented."}
        </footer>
    </section>;
}
