import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { ContentUnderstandingResultViewerProps } from "./index";
import { ResultsPane } from "./components/ResultsPane";
import { SourcePane } from "./components/SourcePane";
import { ResizeHandle } from "./components/ResizeHandle";
import { fieldRegion, fieldRegions, initialInteraction, interaction, selectableFields } from "./interaction/interaction";
import { CuResultParseError, parseCuResult } from "./model/parseCuResult";
import type { LoadedSource } from "./source/source";
import { hasSourcePage, loadSource, unavailableSourcePageMessage } from "./source/source";
import type { CuField, CuParseIssue } from "./model/types";
import { availableResultTabs } from "./model/resultViews";
import type { ResultView } from "./model/resultViews";
import { sourceOutlines } from "./source/sourceOverlays";
import { useReviewPreferences } from "./interaction/useReviewPreferences";
import { useValueWorkflow } from "./interaction/useValueWorkflow";
import { matchTableFields, tableFieldIds } from "./interaction/tableFields";
import type { TableFieldLocation } from "./interaction/tableFields";
import "./styles.css";

export function ContentUnderstandingResultViewer(props: ContentUnderstandingResultViewerProps) {
    const parsed = useMemo(() => {
        try {
            return { model: parseCuResult(props.result), error: null };
        } catch (error) {
            if (!(error instanceof CuResultParseError)) throw error;
            return { model: null, error: `${error.message} (${error.code}${error.path ? ` at ${error.path}` : ""})` };
        }
    }, [props.result]);
    const [contentChoice, setContentChoice] = useState<{ result: unknown; index: number }>({ result: props.result, index: 0 });
    const contentIndex = contentChoice.result === props.result ? contentChoice.index : 0;
    const content = parsed.model?.contents[contentIndex];
    const fields = useMemo(() => selectableFields(content), [content]);
    const [sourceState, setSourceState] = useState<{
        input: ContentUnderstandingResultViewerProps["source"]; source: LoadedSource | null; error: string | null;
    } | null>(null);
    const [state, dispatch] = useReducer(interaction, initialInteraction);
    const [requestedView, setView] = useState<ResultView | undefined>("fields");
    const [hideMissing, setHideMissing] = useState(false);
    const preferences = useReviewPreferences(props, content, parsed.model?.apiVersion, parsed.model?.analyzerId);
    const context = useMemo(() => ({}), [props.source, props.result, content]);
    const workflow = useValueWorkflow(context);
    const tabs = availableResultTabs(content, props.result, parsed.model?.apiVersion);
    const view = (tabs.find(tab => tab.id === requestedView) ?? tabs[0])?.id;
    useEffect(() => {
        if (view !== requestedView) setView(view);
    }, [view, requestedView]);
    const outlines = useMemo(() => sourceOutlines(content, view, state.pageNumber, hideMissing, preferences.settings),
        [content, view, state.pageNumber, hideMissing, preferences.settings]);
    const previewId = useId();
    const viewer = useRef<HTMLDivElement>(null);
    const previewClose = useRef<ReturnType<typeof setTimeout> | null>(null);
    const previewHeld = useRef(false);
    const previewOrigin = useRef<"pointer" | "focus">("pointer");
    const keepPreview = useCallback(() => {
        if (previewClose.current !== null) clearTimeout(previewClose.current);
        previewClose.current = null;
    }, []);
    const dismissPreview = useCallback(() => {
        keepPreview();
        previewHeld.current = false;
        dispatch({ type: "dismiss-preview" });
    }, [keepPreview]);
    useEffect(() => () => keepPreview(), [keepPreview]);
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
    const matchingSource = sourceState?.input === props.source ? sourceState : null;
    const source = matchingSource?.source ?? null;
    useEffect(() => {
        const controller = new AbortController();
        let loaded: LoadedSource | null = null;
        setRenderReady(false);
        keepPreview();
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
    }, [props.source, keepPreview]);
    useEffect(() => {
        dispatch({ type: "clear" });
        keepPreview();
        setReveal(null);
    }, [props.result, keepPreview]);
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
    const active = candidate && (view === "fields" ? !candidate.detailView || candidate === tableLocation?.table : candidate.detailView === view) ? candidate : null;
    const pinned = selected && (view === "fields" ? !selected.detailView || selected === tableLocation?.table : selected.detailView === view) ? selected : null;
    const activeRegions = fieldRegions(active);
    const activeRegionIndex = hovered ? state.hoveredRegionIndex ??
        Math.max(0, activeRegions.findIndex(region => region.pageNumber === state.pageNumber)) : state.selectedRegionIndex;
    const leavePreview = (field: CuField): void => {
        keepPreview();
        if (previewHeld.current) return;
        const focused = viewer.current?.ownerDocument.activeElement;
        const item = focused?.closest("[data-review-focus], [data-outline-id]");
        if (previewOrigin.current === "focus" && viewer.current?.contains(focused ?? null) &&
            (item?.getAttribute("data-review-focus") ?? item?.getAttribute("data-outline-id")) === field.id) return;
        previewClose.current = setTimeout(() => {
            previewClose.current = null;
            dispatch({ type: "leave", fieldId: field.id, restorePageAvailable: available(selected) });
        }, 150);
    };
    const chooseContent = (index: number): void => {
        const next = parsed.model?.contents[index];
        if (!next) throw new Error("The chosen result content does not exist.");
        setContentChoice({ result: props.result, index });
        keepPreview();
        setReveal(null);
        dispatch({ type: "clear" });
        workflow.clear();
        const firstPage = next.pages.find(page => isPageAvailable(page.pageNumber));
        if (firstPage) dispatch({ type: "page", pageNumber: firstPage.pageNumber });
    };
    const selectField = (field: CuField, regionIndex?: number, origin: "source" | "source-table" | "results" = "results", revealSource = false): void => {
        if (origin !== "source-table" && !(tableLocation &&
            ((tableLocation.focused && origin === "results") || tableFieldIds(tableLocation.match).has(field.id)))) setTableLocation(null);
        keepPreview();
        previewHeld.current = false;
        if (origin === "source-table") workflow.clear();
        else workflow.select(field);
        const regions = fieldRegions(field);
        const currentIndex = regions.findIndex(region => region.pageNumber === state.pageNumber && isPageAvailable(region.pageNumber));
        const index = regionIndex ?? Math.max(0, currentIndex >= 0 ? currentIndex : regions.findIndex(region => isPageAvailable(region.pageNumber)));
        dispatch({ type: "select", field, regionIndex: index, pageAvailable: available(field, index) });
        setReveal({ sequence: ++revealSequence.current, origin, revealSource });
    };
    const selectTable = (field: CuField, index: number, revealSource = false): void => {
        if (!content) throw new Error("Source table navigation requires a current result content.");
        const match = matchTableFields(content, field);
        setTableLocation({ context, table: field, match, focused: match.targets.length > 0 });
        selectField(field, index, "source-table", revealSource);
    };
    const clearSelection = (): void => {
        keepPreview(); workflow.clear(); setReveal(null); setTableLocation(null); dispatch({ type: "clear" });
    };
    const previewField = (field: CuField, regionIndex?: number, origin: "pointer" | "focus" = "pointer"): void => {
        keepPreview(); previewHeld.current = false;
        previewOrigin.current = origin;
        if (!workflow.menuOpen.current) dispatch({ type: "hover", field, pageAvailable: false,
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
            pinned={pinned} pinnedRegions={fieldRegions(pinned)} pinnedRegionIndex={state.selectedRegionIndex}
            hasSelection={Boolean(selected)}
            view={view} outlines={outlines} previewId={previewId}
            onPreviewEnter={() => { previewHeld.current = true; keepPreview(); }}
            onPreviewLeave={() => { previewHeld.current = false; if (hovered) leavePreview(hovered); }}
            onDismissPreview={dismissPreview}
            regions={activeRegions} regionIndex={activeRegionIndex}
            revealRequest={reveal?.origin === "source-table" && !reveal.revealSource ? null : revealRequest}
            onHover={(field, index, keyboard) => previewField(field, index, keyboard ? "focus" : "pointer")}
            onLeave={leavePreview} onSelect={(field, index) => selectField(field, index, "source")} onClear={clearSelection}
            onSelectTable={selectTable}
            settings={preferences.settings} onSettings={preferences.changeSettings}
            onResetLayout={() => preferences.changeSettings({ ...preferences.settings, paneRatio: 0.58, fieldRatio: 0.46 })}
            onPage={pageNumber => {
                keepPreview();
                setReveal(null);
                dispatch({ type: "page", pageNumber });
            }} onRenderReady={onRenderReady}
            onRegion={index => {
                if (selected) {
                    if (content?.tables?.some(table => table.field === selected)) { selectTable(selected, index, true); return; }
                    keepPreview();
                    dispatch({ type: "region", fieldId: selected.id, index, pageAvailable: available(selected, index) });
                    setReveal({ sequence: ++revealSequence.current, origin: "source" });
                }
            }}
        />
        <ResizeHandle label="Source and results width" className="cu-pane-resizer"
            value={Math.max(570, Math.min(width - 448, (width - 8) * preferences.settings.paneRatio))}
            min={570} max={width - 448} step={24} defaultValue={(width - 8) * 0.58}
            onChange={next => preferences.changeSettings({ ...preferences.settings, paneRatio: next / (width - 8) })} />
        <ResultsPane
            result={props.result}
            view={view} onViewChange={next => { setView(next); dismissPreview(); }}
            hideMissing={hideMissing} onHideMissingChange={setHideMissing}
            workflow={workflow} preferences={preferences} selectionRequest={revealRequest}
            sourceSelection={reveal?.origin === "source"} sourceTableSelection={reveal?.origin === "source-table"}
            tableLocation={tableLocation} tableScope={tableLocation?.focused ? tableLocation : null}
            onShowAllFields={() => setTableLocation(current => current ? { ...current, focused: false } : current)} onLocate={selectField}
            previewId={hovered && active && renderReady && available(active) &&
                activeRegions[0]?.pageNumber === state.pageNumber ? previewId : undefined}
            source={source}
            apiVersion={parsed.model?.apiVersion}
            content={content} issues={[...(parsed.model?.issues ?? []), ...sourceIssues]} error={parsed.error}
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
