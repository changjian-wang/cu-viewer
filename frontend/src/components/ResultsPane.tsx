import { lazy, Suspense, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CuApiVersion, CuContent, CuField, CuParseIssue } from "../model/types";
import { fieldLabel, fieldRegions } from "../interaction/interaction";
import { defaultReviewSettings, copyValue, isFieldGroup } from "../interaction/reviewFields";
import { unavailableSourcePageMessage } from "../source/source";
import type { ValueWorkflow } from "../interaction/useValueWorkflow";
import type { TableFieldLocation } from "../interaction/tableFields";
import type { useReviewPreferences } from "../interaction/useReviewPreferences";
import { availableResultTabs } from "../model/resultViews";
import type { ResultView } from "../model/resultViews";
import type { LoadedSource } from "../source/source";
import { ResultTabs } from "./ResultTabs";
import { FieldsPane, initialFieldsReview } from "./FieldsPane";
import type { FieldsReviewState } from "./FieldsPane";
import { ActionMenu } from "./ActionMenu";
import { ValueDetails } from "./ValueActions";
import { revealFieldTarget } from "../interaction/fieldNavigation";

const MarkdownPane = lazy(() => import("./MarkdownPane").then(module => ({ default: module.MarkdownPane })));
const JsonPane = lazy(() => import("./JsonPane").then(module => ({ default: module.JsonPane })));
const ParagraphsPane = lazy(() => import("./ParagraphsPane").then(module => ({ default: module.ParagraphsPane })));
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
    pageNumber?: number;
    isPageAvailable: (pageNumber: number) => boolean;
    contents: CuContent[];
    contentIndex: number;
    onContentChange: (index: number) => void;
    onHover: (field: CuField, navigate?: boolean) => void;
    onLeave: (field: CuField) => void;
    onSelect: (field: CuField) => void;
    onClear: () => void;
    workflow: ValueWorkflow;
    preferences?: ReturnType<typeof useReviewPreferences>;
    selectionRequest?: number | null;
    sourceSelection?: boolean;
    sourceTableSelection?: boolean;
    tableLocation?: TableFieldLocation | null;
    tableScope?: TableFieldLocation | null;
    onShowAllFields?: () => void;
    onLocate?: (field: CuField, regionIndex: number) => void;
    onDismissPreview?: () => void;
}

export function ResultsPane(props: ResultsPaneProps) {
    const [review, setReview] = useState(() => initialFieldsReview(props.content?.fields ?? [], props.preferences?.order ?? {}));
    const [localSettings, setLocalSettings] = useState({ ...defaultReviewSettings });
    const { hideMissing, view } = props;
    const settings = props.preferences?.settings ?? localSettings;
    const restoringFocus = useRef(false);
    const panel = useRef<HTMLDivElement>(null);
    const scrollPositions = useMemo(() => new Map<string, { top: number; left: number }>(), [props.workflow.context]);
    const tableScroll = useMemo(() => new Map<string, number>(), [props.workflow.context]);
    const copyContext = useMemo(() => ({}), [props.workflow.context, props.workflow.generation]);
    const fieldsReveal = useRef<number | null>(null);
    const tableViewRequest = useRef<number | null>(null);
    const skipFieldsRestore = useRef<number | null>(null);
    const scopeSnapshot = useRef<{
        expanded: FieldsReviewState["expanded"]; focused: string | null;
        position: { top: number; left: number }; arrays: Map<string, number>;
    } | null>(null);
    const pendingScopeRestore = useRef<typeof scopeSnapshot.current>(null);
    const fieldsContext = useRef(props.workflow.context);
    if (fieldsContext.current !== props.workflow.context) {
        fieldsContext.current = props.workflow.context; fieldsReveal.current = null;
        tableViewRequest.current = null; skipFieldsRestore.current = null;
        scopeSnapshot.current = null; pendingScopeRestore.current = null;
    }
    if (props.tableScope && !scopeSnapshot.current) {
        pendingScopeRestore.current = null;
        const scroll = panel.current?.querySelector<HTMLElement>(".cu-fields-scroll");
        const arrays = new Map(tableScroll);
        panel.current?.querySelectorAll<HTMLElement>("[data-array-id]").forEach(element => {
            if (element.dataset.arrayId) arrays.set(element.dataset.arrayId, element.scrollLeft);
        });
        scopeSnapshot.current = { expanded: new Set(review.expanded), focused: review.focused, arrays,
            position: scroll ? { top: scroll.scrollTop, left: scroll.scrollLeft } :
                scrollPositions.get("fields:0") ?? { top: 0, left: 0 } };
    } else if (!props.tableScope && scopeSnapshot.current) {
        const snapshot = scopeSnapshot.current;
        scopeSnapshot.current = null;
        tableScroll.clear();
        snapshot.arrays.forEach((value, key) => tableScroll.set(key, value));
        scrollPositions.set("fields:0", snapshot.position);
        pendingScopeRestore.current = props.sourceSelection ? null : snapshot;
        // Restore base expansion before Fields can consume a fresh source-selection request.
        setReview({ ...review, expanded: snapshot.expanded, focused: snapshot.focused });
    }
    const tabBaseId = useId();
    const tabs = useMemo(() => availableResultTabs(props.content, props.result, props.apiVersion),
        [props.content, props.result, props.apiVersion]);
    const activeTab = tabs.find(tab => tab.id === view);
    useEffect(() => {
        setReview(initialFieldsReview(props.content?.fields ?? [], props.preferences?.order ?? {}));
    }, [props.workflow.context]);
    const restoreFieldFocus = (field: CuField, trigger?: HTMLElement): void => {
        const controls = [...(panel.current?.querySelectorAll<HTMLElement>("[data-review-focus]") ?? [])];
        const direct = trigger?.isConnected ? trigger : controls.find(item => item.dataset.reviewFocus === field.id);
        const element = direct ?? controls.filter(item => field.id.startsWith(`${item.dataset.reviewFocus}/`)).at(-1) ??
            panel.current?.querySelector<HTMLInputElement>('input[type="search"]');
        restoringFocus.current = true;
        element?.focus({ preventScroll: true });
        const viewport = !direct && element?.closest<HTMLElement>(".cu-fields-scroll");
        if (viewport && element) revealFieldTarget(element, viewport);
        restoringFocus.current = false;
    };
    const closeMenu = (restore: boolean): void => {
        if (restore && props.workflow.menu) restoreFieldFocus(props.workflow.menu.field, props.workflow.menu.trigger);
        props.workflow.closeMenu();
    };
    const openMenu = (field: CuField, trigger: HTMLElement): void => {
        if (props.onDismissPreview) props.onDismissPreview(); else props.onLeave(field);
        props.workflow.openMenu(field, trigger);
    };
    const changeView = (next: ResultView): void => {
        panel.current?.querySelectorAll<HTMLElement>(".cu-fields-scroll, .cu-rich-result-scroll, .cu-table-scroll").forEach((element, index) => {
            scrollPositions.set(`${view}:${index}`, { top: element.scrollTop, left: element.scrollLeft });
        });
        panel.current?.querySelectorAll<HTMLElement>("[data-array-id]").forEach(element => {
            if (element.dataset.arrayId) tableScroll.set(element.dataset.arrayId, element.scrollLeft);
        });
        props.onViewChange(next);
    };
    useLayoutEffect(() => {
        const request = props.selectionRequest;
        if (!props.sourceTableSelection || !props.tableLocation || !request || request === tableViewRequest.current) return;
        tableViewRequest.current = request;
        if (view !== "fields") {
            skipFieldsRestore.current = request;
            changeView("fields");
        }
    }, [props.selectionRequest, props.sourceTableSelection, props.tableLocation, view]);
    useLayoutEffect(() => {
        const element = panel.current;
        if (!element || !view) return;
        if (view === "fields" && skipFieldsRestore.current === props.selectionRequest && skipFieldsRestore.current !== null) {
            skipFieldsRestore.current = null;
            return;
        }
        let observer: MutationObserver | undefined;
        const restore = (): boolean => {
            const targets = element.querySelectorAll<HTMLElement>(".cu-fields-scroll, .cu-rich-result-scroll, .cu-table-scroll");
            targets.forEach((scroll, index) => {
                const position = scrollPositions.get(`${view}:${index}`);
                if (position) { scroll.scrollTop = position.top; scroll.scrollLeft = position.left; }
            });
            if (targets.length) observer?.disconnect();
            return targets.length > 0;
        };
        if (!restore()) {
            observer = new MutationObserver(restore);
            observer.observe(element, { childList: true, subtree: true });
        }
        return () => observer?.disconnect();
    }, [view, scrollPositions]);
    useLayoutEffect(() => {
        const snapshot = pendingScopeRestore.current, scroll = panel.current?.querySelector<HTMLElement>(".cu-fields-scroll");
        if (!snapshot || props.tableScope || !scroll) return;
        pendingScopeRestore.current = null;
        scroll.scrollTop = snapshot.position.top; scroll.scrollLeft = snapshot.position.left;
        scroll.querySelectorAll<HTMLElement>("[data-array-id]").forEach(element => {
            if (element.dataset.arrayId) element.scrollLeft = snapshot.arrays.get(element.dataset.arrayId) ?? 0;
        });
    });
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
        <ResultTabs tabs={tabs} view={view} baseId={tabBaseId} panelId={panelId} onViewChange={changeView} />
        <span className="cu-visually-hidden" role="status">{props.selected ? `Pinned: ${fieldLabel(props.selected)}` : "No field selected"}</span>
        <div
            id={panelId}
            role="tabpanel"
            aria-labelledby={view ? `${tabBaseId}-${view}` : undefined}
            aria-label={view ? undefined : "Result status"}
            tabIndex={0}
            className="cu-result-panel"
            ref={panel}
            onScrollCapture={event => {
                if (!(event.target instanceof HTMLElement)) return;
                const elements = [...event.currentTarget.querySelectorAll(".cu-fields-scroll, .cu-rich-result-scroll, .cu-table-scroll")];
                const index = elements.indexOf(event.target);
                if (index >= 0) scrollPositions.set(`${view}:${index}`, { top: event.target.scrollTop, left: event.target.scrollLeft });
            }}
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
            {view === "fields" && props.content && <FieldsPane fields={props.content.fields} settings={settings}
                onSettings={props.preferences?.changeSettings ?? setLocalSettings}
                order={props.preferences?.order ?? {}} onOrder={props.preferences?.changeOrder ?? (() => {})}
                orderReadOnly={props.preferences?.orderReadOnly ?? true}
                review={review} setReview={setReview} hideMissing={hideMissing} onHideMissing={next => {
                    props.onHideMissingChange(next);
                    if (next && props.selected && !props.selected.hasValue && !isFieldGroup(props.selected)) props.onClear();
                    else if (next && props.hovered && !props.hovered.hasValue) props.onDismissPreview?.();
                }}
                selected={props.selected} hovered={props.hovered} workflow={props.workflow} menuId={`${tabBaseId}-value-menu`}
                onMenu={openMenu} onHover={props.onHover} onLeave={props.onLeave} onSelect={props.onSelect}
                sourceReady={props.sourceReady} pageNumber={props.pageNumber ?? 1} isPageAvailable={props.isPageAvailable}
                restoringFocus={restoringFocus} tableScroll={tableScroll} selectionRequest={props.selectionRequest ?? null} handledReveal={fieldsReveal}
                sourceSelection={(props.sourceSelection || props.sourceTableSelection) ?? false} tableLocation={props.tableLocation ?? null}
                tableSelection={props.sourceTableSelection ?? false} tableScope={props.tableScope ?? null}
                onShowAllFields={props.onShowAllFields}
                orderControlled={props.preferences?.controlled ?? false} preferenceError={Boolean(props.preferences?.storageError)} />}
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
                {view === "figures" && props.content && <FiguresPane figures={props.content.figures ?? []}
                    content={props.content} source={props.source ?? null} selected={props.selected} onSelect={props.onSelect} />}
                {view === "signatures" && props.content && <SignaturesPane signatures={props.content.signatures ?? []}
                    content={props.content} source={props.source ?? null} selected={props.selected} onSelect={props.onSelect} />}
                {view === "metadata" && <MetadataPane metadata={props.content?.metadata ?? {}} copyContext={copyContext} />}
            </Suspense>}
        </div>
        <ValueDetails workflow={props.workflow} threshold={settings.threshold} onClose={() => {
            if (props.workflow.inspected) restoreFieldFocus(props.workflow.inspected);
            props.workflow.closeDetails();
        }} />
        {props.workflow.feedback && <div className={`cu-copy-feedback${props.workflow.feedback.status === "error" ? " cu-inline-error" : ""}`}
            role={props.workflow.feedback.status === "error" ? "alert" : "status"}>
            {props.workflow.feedback.message}
            {props.workflow.feedback.status === "error" && <pre tabIndex={0}>{copyValue(props.workflow.feedback.field)}</pre>}
        </div>}
        {props.workflow.menu && <ActionMenu id={`${tabBaseId}-value-menu`} label="Value actions" kind="value"
            anchor={props.workflow.menu.trigger} onClose={closeMenu}
            actions={[
                ...(fieldRegions(props.workflow.menu.field).length ?
                    [...new Set(fieldRegions(props.workflow.menu.field).map(region => region.pageNumber))].map(pageNumber => ({
                        label: `Locate on page ${pageNumber}`,
                        icon: "locate" as const,
                        disabled: !props.sourceReady || !props.isPageAvailable(pageNumber),
                        title: !props.sourceReady ? "Source is not ready for navigation." :
                            !props.isPageAvailable(pageNumber) ? unavailableSourcePageMessage(pageNumber) : undefined,
                        run: () => {
                            const field = props.workflow.menu?.field;
                            if (field) {
                                const index = fieldRegions(field).findIndex(region => region.pageNumber === pageNumber);
                                if (props.onLocate) props.onLocate(field, index); else props.onSelect(field);
                            }
                        },
                    })) : [{ label: "No source region", icon: "locate" as const, disabled: true, run: () => {} }]),
                { label: "View full value and confidence", icon: "info", run: () => { if (props.workflow.menu) props.workflow.inspect(props.workflow.menu.field); } },
                { label: "Copy value", icon: "copy", disabled: !props.workflow.menu.field.hasValue,
                    run: () => { if (props.workflow.menu) void props.workflow.copy(props.workflow.menu.field); } },
            ]} />}
        {view !== "fields" && <footer className="cu-results-footer">
            {view === "markdown" && "Rendered from content.markdown. Unsafe markup, URLs and remote images are not rendered."}
            {view === "result" && "Original input JSON. The root starts expanded; nested objects and arrays can be opened as needed."}
            {["paragraphs", "figures", "signatures"].includes(view ?? "") &&
                "Select a returned item to locate its source. All regions on the active source page are highlighted; region controls reach other pages."}
            {view === "metadata" && "Returned string metadata. Values and property order are preserved."}
        </footer>}
    </section>;
}
