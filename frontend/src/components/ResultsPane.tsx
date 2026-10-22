import { lazy, Suspense, useId, useMemo, useState } from "react";
import type { CuApiVersion, CuContent, CuField, CuParseIssue } from "../model/types";
import { displayValue, fieldColor, fieldDisplayName, fieldLabel, formatConfidence, primaryRegion } from "../interaction/interaction";
import { availableResultTabs } from "../model/resultViews";
import type { ResultView } from "../model/resultViews";
import { unavailableSourcePageMessage } from "../source/source";
import type { LoadedSource } from "../source/source";
import { ResultTabs } from "./ResultTabs";

const MarkdownPane = lazy(() => import("./MarkdownPane").then(module => ({ default: module.MarkdownPane })));
const JsonPane = lazy(() => import("./JsonPane").then(module => ({ default: module.JsonPane })));
const ParagraphsPane = lazy(() => import("./ParagraphsPane").then(module => ({ default: module.ParagraphsPane })));
const TablesPane = lazy(() => import("./TablesPane").then(module => ({ default: module.TablesPane })));
const FiguresPane = lazy(() => import("./FiguresPane").then(module => ({ default: module.FiguresPane })));
const SignaturesPane = lazy(() => import("./SignaturesPane").then(module => ({ default: module.SignaturesPane })));
const MetadataPane = lazy(() => import("./MetadataPane").then(module => ({ default: module.MetadataPane })));

interface ResultsPaneProps {
    result: unknown;
    view: ResultView | undefined;
    onViewChange: (view: ResultView) => void;
    hideMissing: boolean;
    onHideMissingChange: (hideMissing: boolean) => void;
    previewId: string | undefined;
    source?: LoadedSource | null | undefined;
    apiVersion?: CuApiVersion | undefined;
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
    onHover: (field: CuField, navigate?: boolean) => void;
    onLeave: (field: CuField) => void;
    onSelect: (field: CuField) => void;
    onClear: () => void;
}

export function ResultsPane(props: ResultsPaneProps) {
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const { hideMissing, view } = props;
    const [tableChoice, setTableChoice] = useState<{ tables: CuContent["tables"]; index: number } | null>(null);
    const tabBaseId = useId();
    const tabs = useMemo(() => availableResultTabs(props.content, props.result, props.apiVersion),
        [props.content, props.result, props.apiVersion]);
    const activeTab = tabs.find(tab => tab.id === view);
    const tableIndex = tableChoice?.tables === props.content?.tables ? tableChoice?.index ?? 0 : 0;
    const visibleFields = (props.content?.fields ?? []).filter(field => !hideMissing || field.hasValue);
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
        const valueId = `${tabBaseId}-value-${encodeURIComponent(field.id)}`;
        const confidenceId = `${tabBaseId}-confidence-${encodeURIComponent(field.id)}`;
        const childrenId = `${tabBaseId}-children-${encodeURIComponent(field.id)}`;
        const description = props.previewId && props.hovered?.id === field.id && props.sourceReady && region && pageAvailable ?
            `${props.previewId}-content` : [group ? undefined : valueId, field.confidence === undefined ? undefined : confidenceId].filter(Boolean).join(" ") || undefined;
        return <div className={depth === 0 ? "cu-field-block" : "cu-nested-field-block"} key={field.id}>
            <div
                className={`cu-field${group ? " is-group" : ""}${depth > 0 ? " is-nested" : ""}${selected ? " is-selected" : ""}${props.hovered?.id === field.id ? " is-hovered" : ""}`}
                style={{ paddingLeft: `${depth === 0 ? 14 : 36 + Math.min(depth - 1, 7) * 16}px` }}
                data-field-id={field.id}
                data-field-depth={depth}
                data-field-type={field.type}
                onMouseEnter={() => props.onHover(field)}
                onMouseLeave={() => props.onLeave(field)}
                onFocus={event => {
                    if (!event.currentTarget.contains(event.relatedTarget)) props.onHover(field, false);
                }}
                onBlur={event => {
                    if (!event.currentTarget.contains(event.relatedTarget)) props.onLeave(field);
                }}
            >
                <div className="cu-field-heading">
                    {depth === 0 && <span className="cu-dot" aria-hidden="true"
                        style={{ background: region ? color : "transparent", borderColor: region ? color : "#0078d4" }} />}
                    <button type="button" className="cu-field-name" aria-pressed={props.selected?.id === field.id}
                        aria-describedby={description}
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
                    {field.confidence !== undefined && <span id={confidenceId} className="cu-visually-hidden">
                        Confidence {formatConfidence(field.confidence)}
                    </span>}
                    {group && <button
                        type="button" className="cu-expand" aria-label={`${closed ? "Expand" : "Collapse"} ${displayName}`}
                        aria-expanded={!closed}
                        aria-controls={closed ? undefined : childrenId}
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
                {!group && <button type="button" className={`cu-field-value${!field.hasValue ? " is-missing" : ""}`}
                    aria-label={`Select value of ${fieldLabel(field)}`} aria-describedby={description}
                    aria-pressed={props.selected?.id === field.id} onClick={() => props.onSelect(field)}>
                    <span id={valueId}>{displayValue(field)}</span>
                </button>}
            </div>
            {group && !closed && <div id={childrenId}>{children.length ? children.map(child => renderField(child, depth + 1)) :
                <div className="cu-hidden-child-note">No returned values. Turn off Hide missing fields to inspect missing entries.</div>}</div>}
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
    return <section className="cu-fields-pane" aria-label="Extraction results">
        {contentSelector}
        <ResultTabs tabs={tabs} view={view} baseId={tabBaseId} panelId={panelId} onViewChange={props.onViewChange} />
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
                            props.onHideMissingChange(next);
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
            {view && view !== "fields" && view !== "markdown" && view !== "result" && <Suspense
                fallback={<div className="cu-state" role="status">Loading {activeTab?.label} view…</div>}>
                {view === "paragraphs" && <ParagraphsPane paragraphs={props.content?.paragraphs ?? []}
                    selected={props.selected} hovered={props.hovered} previewId={props.previewId}
                    onHover={props.onHover} onLeave={props.onLeave} onSelect={props.onSelect} />}
                {view === "tables" && <TablesPane tables={props.content?.tables ?? []}
                    index={tableIndex} onTableChange={index => {
                        const table = props.content?.tables?.[index];
                        if (!table) throw new Error("The chosen table does not exist.");
                        setTableChoice({ tables: props.content?.tables, index });
                        props.onSelect(table.field);
                    }} selected={props.selected} onSelect={props.onSelect} />}
                {view === "figures" && props.content && <FiguresPane figures={props.content.figures ?? []}
                    content={props.content} source={props.source ?? null} selected={props.selected} onSelect={props.onSelect} />}
                {view === "signatures" && props.content && <SignaturesPane signatures={props.content.signatures ?? []}
                    content={props.content} source={props.source ?? null} selected={props.selected} onSelect={props.onSelect} />}
                {view === "metadata" && <MetadataPane metadata={props.content?.metadata ?? {}} />}
            </Suspense>}
        </div>
        <footer className="cu-results-footer">
            {view === "fields" && "Field colors link to source regions. Confidence is supplied by CU, not an accuracy judgment."}
            {view === "markdown" && "Rendered from content.markdown. Unsafe markup, URLs and remote images are not rendered."}
            {view === "result" && "Original input JSON. The root starts expanded; nested objects and arrays can be opened as needed."}
            {["paragraphs", "tables", "figures", "signatures"].includes(view ?? "") &&
                "Select a returned item to locate its source. All regions on the active source page are highlighted; region controls reach other pages."}
            {view === "metadata" && "Returned string metadata. Values and property order are preserved."}
        </footer>
    </section>;
}
