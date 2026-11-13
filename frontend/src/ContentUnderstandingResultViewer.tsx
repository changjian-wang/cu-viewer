import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { ContentUnderstandingResultViewerProps } from "./index";
import { ResultsPane } from "./components/ResultsPane";
import { SourcePane } from "./components/SourcePane";
import { ResizeHandle } from "./components/ResizeHandle";
import { fieldRegion, fieldRegions, initialInteraction, interaction, isFieldGroup, selectableFields } from "./interaction/interaction";
import { CuResultParseError, parseCuResult } from "./model/parseCuResult";
import { parseLabels } from "./model/parseLabels";
import { compareFields } from "./model/fieldComparison";
import { inspectJson, validateLargeJson } from "./model/resultLimits";
import type { JsonValidation } from "./model/resultLimits";
import type { LoadedSource } from "./source/source";
import { hasSourcePage, loadSource, unavailableSourcePageMessage } from "./source/source";
import type { CuField, CuParseIssue } from "./model/types";
import { availableResultTabs, isFieldView } from "./model/resultViews";
import type { ResultView } from "./model/resultViews";
import { sourceOutlines } from "./source/sourceOverlays";
import { useReviewPreferences } from "./interaction/useReviewPreferences";
import { useValueWorkflow } from "./interaction/useValueWorkflow";
import { matchTableFields, tableFieldIds } from "./interaction/tableFields";
import type { TableFieldLocation } from "./interaction/tableFields";
import "./styles.css";

export function ContentUnderstandingResultViewer(props: ContentUnderstandingResultViewerProps) {
    const [sourceState, setSourceState] = useState<{
        input: ContentUnderstandingResultViewerProps["source"]; source: LoadedSource | null; error: string | null;
    } | null>(null);
    const matchingSource = sourceState?.input === props.source ? sourceState : null;
    const source = matchingSource?.source ?? null;
    const parsed = useMemo(() => {
        if (props.result === undefined) return { model: null, error: null };
        try {
            return { model: parseCuResult(props.result), error: null };
        } catch (error) {
            if (!(error instanceof CuResultParseError)) throw error;
            return { model: null, error: `${error.message} (${error.code}${error.path ? ` at ${error.path}` : ""})` };
        }
    }, [props.result, props.labels]);
    const labelInspection = useMemo(() => props.labels === undefined ? null : inspectJson(props.labels), [props.labels]);
    const [labelValidation, setLabelValidation] = useState<{ input: unknown; result: JsonValidation } | null>(null);
    const validatedLabels = labelValidation?.input === props.labels ? labelValidation?.result : null;
    const labelPending = labelInspection?.status === "limit" && validatedLabels?.status !== "ready" && validatedLabels?.status !== "invalid";
    useEffect(() => {
        if (labelInspection?.status !== "limit") return;
        const controller = new AbortController();
        void validateLargeJson(props.labels, controller.signal).then(result => {
            if (!controller.signal.aborted) setLabelValidation({ input: props.labels, result });
        }).catch((failure: unknown) => {
            if (!controller.signal.aborted) setLabelValidation({ input: props.labels, result: {
                status: "invalid", message: failure instanceof Error ? failure.message : String(failure),
            } });
        });
        return () => controller.abort();
    }, [props.labels, labelInspection]);
    const labelData = useMemo(() => {
        if (labelInspection?.status === "invalid") return { model: null, error: labelInspection.message };
        if (validatedLabels?.status === "invalid") return { model: null, error: validatedLabels.message };
        if (labelPending) return { model: null, error: null };
        if (props.labels === undefined || !matchingSource) return { model: null, error: null };
        try {
            return { model: parseLabels(props.labels, source, true), error: null };
        } catch (error) {
            if (!(error instanceof CuResultParseError)) throw error;
            return { model: null, error: `${error.message} (${error.code}${error.path ? ` at ${error.path}` : ""})` };
        }
    }, [props.labels, matchingSource, source, labelInspection, labelPending, validatedLabels]);
    const [contentChoice, setContentChoice] = useState<{ result: unknown; index: number }>({ result: props.result, index: 0 });
    const contentIndex = contentChoice.result === props.result ? contentChoice.index : 0;
    const analysisContent = parsed.model?.contents[contentIndex];
    const [state, dispatch] = useReducer(interaction, initialInteraction);
    const [requestedView, setView] = useState<ResultView | undefined>("fields");
    const hasLabels = props.labels !== undefined;
    const boundLabels = hasLabels && contentIndex === 0;
    const tabs = availableResultTabs(analysisContent, props.result, parsed.model?.apiVersion, boundLabels);
    const view = (tabs.find(tab => tab.id === requestedView) ?? tabs[0])?.id;
    const comparison = useMemo(() => boundLabels && labelData.model ?
        compareFields(labelData.model.content.fields, analysisContent?.fields ?? [], Boolean(analysisContent?.fieldsDeclared)) : undefined,
    [boundLabels, labelData.model, analysisContent]);
    const referenceMode = boundLabels && !comparison?.comparable;
    const fieldContent = useMemo(() => comparison?.comparable && analysisContent ?
        { ...analysisContent, fields: comparison.fields } : boundLabels ? labelData.model?.content : analysisContent,
    [comparison, analysisContent, boundLabels, labelData.model]);
    const activeLabel = view === "fields" && (referenceMode || (state.hovered ?? state.selected)?.origin === "label");
    const content = activeLabel ? labelData.model?.content : analysisContent;
    const fields = useMemo(() => [...selectableFields(analysisContent),
        ...(boundLabels ? selectableFields(labelData.model?.content) : [])], [analysisContent, boundLabels, labelData.model]);
    const preferences = useReviewPreferences(boundLabels ? { source: props.source } : props, fieldContent,
        boundLabels ? undefined : parsed.model?.apiVersion, boundLabels ? undefined : parsed.model?.analyzerId);
    const context = useMemo(() => ({}), [props.source, props.result, props.labels, analysisContent, labelData.model]);
    const workflow = useValueWorkflow(context);
    useEffect(() => {
        if (view !== requestedView) setView(view);
    }, [view, requestedView]);
    const outlineContent = view === "fields" && referenceMode ? labelData.model?.content : analysisContent;
    const outlines = useMemo(() => sourceOutlines(outlineContent, view, state.pageNumber, false, preferences.settings, comparison),
        [outlineContent, view, state.pageNumber, preferences.settings, comparison]);
    const previewId = useId();
    const viewer = useRef<HTMLDivElement>(null);
    const previewOrigin = useRef<"pointer" | "focus">("pointer");
    const dismissPreview = useCallback(() => {
        dispatch({ type: "dismiss-preview" });
    }, []);
    const [width, setWidth] = useState(1280);
    useLayoutEffect(() => {
        const element = viewer.current;
        if (!element) return;
        const update = (): void => setWidth(Math.max(1018, element.clientWidth));
        update();
        const observer = new ResizeObserver(update);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    const [renderReady, setRenderReady] = useState(false);
    const [reveal, setReveal] = useState<{ sequence: number; origin: "source" | "source-table" | "results"; revealSource?: boolean } | null>(null);
    const [tableLocationState, setTableLocation] = useState<(TableFieldLocation & { context: object; focused: boolean }) | null>(null);
    const revealRequest = reveal?.sequence ?? null;
    const revealSequence = useRef(0);
    useEffect(() => {
        const controller = new AbortController();
        let loaded: LoadedSource | null = null;
        setRenderReady(false);
        setReveal(null);
        dispatch({ type: "clear" });
        dispatch({ type: "page", pageNumber: 1 });
        void loadSource(props.source, controller.signal).then(value => {
            loaded = value;
            if (controller.signal.aborted) {
                void value.dispose().catch((error: unknown) => console.error("Obsolete source disposal failed.", error));
                return;
            }
            setSourceState({ input: props.source, source: value, error: null });
        }).catch((error: unknown) => {
            if (controller.signal.aborted) return;
            setSourceState({ input: props.source, source: null, error: error instanceof Error ? error.message : String(error) });
        });
        return () => {
            controller.abort();
            if (loaded) void loaded.dispose().catch((error: unknown) => console.error("Source disposal failed.", error));
        };
    }, [props.source]);
    useEffect(() => {
        dispatch({ type: "clear" });
        setReveal(null);
    }, [props.result, props.labels]);
    const onRenderReady = useCallback((ready: boolean) => setRenderReady(ready), []);
    const isPageAvailable = (pageNumber: number | undefined): boolean => hasSourcePage(source?.pages, pageNumber);
    const available = (field: CuField | null, regionIndex = 0): boolean =>
        isPageAvailable(fieldRegion(field, regionIndex)?.pageNumber);
    const sourceIssues: CuParseIssue[] = source && content ? content.pages.flatMap((page, index) =>
        isPageAvailable(page.pageNumber) ? [] : [{
            code: "unavailable-source-page",
            path: `${content.id}/pages/${index}`,
            message: unavailableSourcePageMessage(page.pageNumber),
        }]) : [];
    const selected = state.selected && fields.includes(state.selected) ? state.selected : null;
    const tableLocation = tableLocationState?.context === context ? tableLocationState : null;
    const hovered = state.hovered && fields.includes(state.hovered) ? state.hovered : null;
    const candidate = hovered ?? selected;
    const active = candidate && (isFieldView(view) ? !candidate.detailView || candidate === tableLocation?.table : candidate.detailView === view) ? candidate : null;
    const pinned = selected && (isFieldView(view) ? !selected.detailView || selected === tableLocation?.table : selected.detailView === view) ? selected : null;
    const activeRegions = fieldRegions(active);
    const activeRegionIndex = hovered ? state.hoveredRegionIndex ??
        Math.max(0, activeRegions.findIndex(region => region.pageNumber === state.pageNumber)) : state.selectedRegionIndex;
    const leavePreview = (field: CuField): void => {
        const focused = viewer.current?.ownerDocument.activeElement;
        const item = focused?.closest("[data-review-focus], [data-outline-id]");
        if (previewOrigin.current === "focus" && viewer.current?.contains(focused ?? null) &&
            (item?.getAttribute("data-review-focus") ?? item?.getAttribute("data-outline-id")) === field.id) return;
        dispatch({ type: "leave", fieldId: field.id, restorePageAvailable: available(selected) });
    };
    const chooseContent = (index: number): void => {
        const next = parsed.model?.contents[index];
        if (!next) throw new Error("The chosen result content does not exist.");
        setContentChoice({ result: props.result, index });
        setReveal(null);
        dispatch({ type: "clear" });
        workflow.clear();
        const firstPage = next.pages.find(page => isPageAvailable(page.pageNumber));
        if (firstPage) dispatch({ type: "page", pageNumber: firstPage.pageNumber });
    };
    const selectField = (field: CuField, regionIndex?: number, origin: "source" | "source-table" | "results" = "results", revealSource = false): void => {
        if (origin !== "source-table" && !(tableLocation &&
            ((tableLocation.focused && origin === "results") || tableFieldIds(tableLocation.match).has(field.id)))) setTableLocation(null);
        if (origin === "source-table") workflow.clear();
        else workflow.select(field);
        const regions = fieldRegions(field);
        const currentIndex = regions.findIndex(region => region.pageNumber === state.pageNumber && isPageAvailable(region.pageNumber));
        const index = regionIndex ?? Math.max(0, currentIndex >= 0 ? currentIndex : regions.findIndex(region => isPageAvailable(region.pageNumber)));
        const focused = viewer.current?.ownerDocument.activeElement;
        const item = focused?.closest("[data-review-focus], [data-outline-id]");
        const retainPreview = Boolean(!isFieldGroup(field) && focused?.matches(":focus-visible") &&
            viewer.current?.contains(focused) &&
            (item?.getAttribute("data-review-focus") ?? item?.getAttribute("data-outline-id")) === field.id);
        if (retainPreview) previewOrigin.current = "focus";
        dispatch({ type: "select", field, regionIndex: index, pageAvailable: available(field, index), retainPreview });
        setReveal({ sequence: ++revealSequence.current, origin, revealSource });
    };
    const selectTable = (field: CuField, index: number, revealSource = false): void => {
        if (!content) throw new Error("Source table navigation requires a current result content.");
        const match = matchTableFields(content, field);
        setTableLocation({ context, table: field, match, focused: match.targets.length > 0 });
        selectField(field, index, "source-table", revealSource);
    };
    const clearSelection = (): void => {
        workflow.clear(); setReveal(null); setTableLocation(null); dispatch({ type: "clear" });
    };
    const previewField = (field: CuField, regionIndex?: number, origin: "pointer" | "focus" = "pointer"): void => {
        previewOrigin.current = origin;
        if (!workflow.menuOpen.current) dispatch({ type: "hover", field, pageAvailable: false, groupPreview: field.origin === "label",
            ...(regionIndex === undefined ? {} : { regionIndex }) });
    };
    const handleEscape = (): void => {
        if (workflow.menu) workflow.closeMenu();
        else if (workflow.inspected) workflow.closeDetails();
        else clearSelection();
    };
    const escapeAction = useRef(handleEscape);
    escapeAction.current = handleEscape;
    useEffect(() => {
        const element = viewer.current;
        if (!element) return;
        const escape = (event: KeyboardEvent): void => {
            if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || !element.matches(":hover")) return;
            if (event.target instanceof Element && event.target.closest(".cu-viewer, dialog[open], [role='menu']")) return;
            event.preventDefault(); escapeAction.current();
        };
        element.ownerDocument.addEventListener("keydown", escape);
        return () => element.ownerDocument.removeEventListener("keydown", escape);
    }, []);
    const layout: CSSProperties & { "--cu-pane-ratio": number } = { "--cu-pane-ratio": preferences.settings.paneRatio };
    return <div className="cu-viewer" ref={viewer} style={layout} onKeyDown={event => {
        if (event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing ||
            (event.target instanceof Element && event.target.closest("dialog[open]"))) return;
        event.preventDefault();
        handleEscape();
    }}>
        {preferences.error && <div className="cu-preference-error cu-inline-error" role="alert">{preferences.error}
            {preferences.storageError ? <button type="button" onClick={preferences.reset}>Reset browser preferences</button> :
                <span>Update fieldOrder or defaultFieldOrder in the host.</span>}</div>}
        <SourcePane
            key={source?.name ?? "loading"}
            source={source} loading={!matchingSource} error={matchingSource?.error ?? null}
            content={content} pageNumber={state.pageNumber} active={active} preview={Boolean(hovered)}
            pinned={pinned} pinnedRegions={fieldRegions(pinned)}
            hasSelection={Boolean(selected)}
            view={view} outlines={outlines} previewId={previewId}
            comparison={view === "fields" ? comparison : undefined} referenceMode={view === "fields" && referenceMode}
            onDismissPreview={dismissPreview}
            regions={activeRegions} regionIndex={activeRegionIndex}
            summaryFieldIds={tableLocation?.focused ? tableFieldIds(tableLocation.match) : undefined}
            revealRequest={reveal?.origin === "source-table" && !reveal.revealSource ? null : revealRequest}
            onHover={(field, index, keyboard) => previewField(field, index, keyboard ? "focus" : "pointer")}
            onLeave={leavePreview} onSelect={(field, index) => selectField(field, index, "source")} onClear={clearSelection}
            onSelectTable={selectTable}
            settings={preferences.settings} onSettings={preferences.changeSettings}
            onPage={pageNumber => {
                setReveal(null);
                dispatch({ type: "page", pageNumber });
            }} onRenderReady={onRenderReady}
        />
        <ResizeHandle label="Source and results width" className="cu-pane-resizer"
            value={Math.max(570, Math.min(width - 448, (width - 8) * preferences.settings.paneRatio))}
            min={570} max={width - 448} step={24} defaultValue={(width - 8) * 0.58}
            onChange={next => preferences.changeSettings({ ...preferences.settings, paneRatio: next / (width - 8) })} />
        <ResultsPane
            result={props.result}
            hasLabels={hasLabels} labelContent={labelData.model?.content} labelLoading={hasLabels && (!matchingSource || labelPending)}
            fieldContent={fieldContent} comparison={comparison} referenceMode={referenceMode}
            warning={boundLabels && parsed.error ? `Comparison unavailable: ${parsed.error}. Showing reference labels without comparison.` :
                hasLabels && contentIndex > 0 ? "Labels are associated with the first result content. This content is not compared." : null}
            view={view} onViewChange={next => { setView(next); dismissPreview(); }}
            workflow={workflow} preferences={preferences} selectionRequest={revealRequest}
            sourceSelection={reveal?.origin === "source"} sourceTableSelection={reveal?.origin === "source-table"}
            tableLocation={tableLocation} tableScope={tableLocation?.focused ? tableLocation : null}
            onShowAllFields={() => setTableLocation(current => current ? { ...current, focused: false } : current)} onLocate={selectField}
            previewId={hovered && active && renderReady && available(active) &&
                activeRegions.some(region => region.pageNumber === state.pageNumber) ? previewId : undefined}
            source={source}
            apiVersion={parsed.model?.apiVersion}
            content={analysisContent} issues={[...(boundLabels ? labelData.model?.issues ?? [] : []), ...(parsed.model?.issues ?? []), ...sourceIssues]}
            error={boundLabels ? labelData.error : parsed.error}
            contents={parsed.model?.contents ?? []} contentIndex={contentIndex} onContentChange={chooseContent}
            selected={selected} hovered={hovered} sourceReady={Boolean(source)} isPageAvailable={isPageAvailable}
            pageNumber={state.pageNumber}
            onHover={(field, navigate) => previewField(field, undefined, navigate === false ? "focus" : "pointer")} onDismissPreview={dismissPreview}
            onLeave={leavePreview}
            onSelect={selectField}
            onClear={clearSelection}
        />
    </div>;
}
