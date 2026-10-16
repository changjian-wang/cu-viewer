import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from "react";
import type { ContentUnderstandingResultViewerProps } from "./index";
import { FieldsPane } from "./components/FieldsPane";
import { SourcePane } from "./components/SourcePane";
import { fieldColor, fieldRegion, fieldRegions, initialInteraction, interaction, selectableFields } from "./internal/interaction";
import { CuResultParseError, parseCuResult } from "./internal/parseCuResult";
import type { LoadedSource } from "./internal/source";
import { hasSourcePage, loadSource, unavailableSourcePageMessage } from "./internal/source";
import type { CuField, CuParseIssue } from "./internal/types";
import { availableResultTabs } from "./internal/resultViews";
import type { ResultView } from "./internal/resultViews";
import { sourceOutlines } from "./internal/sourceOverlays";
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
    const [hideMissing, setHideMissing] = useState(true);
    const tabs = availableResultTabs(content, props.result, parsed.model?.apiVersion);
    const view = (tabs.find(tab => tab.id === requestedView) ?? tabs[0])?.id;
    useEffect(() => {
        if (view !== requestedView) setView(view);
    }, [view, requestedView]);
    const outlines = useMemo(() => sourceOutlines(content, view, state.pageNumber, hideMissing),
        [content, view, state.pageNumber, hideMissing]);
    const previewId = useId();
    const viewer = useRef<HTMLDivElement>(null);
    const previewClose = useRef<ReturnType<typeof setTimeout> | null>(null);
    const previewHeld = useRef(false);
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
    useEffect(() => {
        if (!state.hovered) return;
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === "Escape") dismissPreview();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [state.hovered, dismissPreview]);
    const [renderReady, setRenderReady] = useState(false);
    const [revealRequest, setRevealRequest] = useState<number | null>(null);
    const revealSequence = useRef(0);
    const matchingSource = sourceState?.input === props.source ? sourceState : null;
    const source = matchingSource?.source ?? null;
    useEffect(() => {
        const controller = new AbortController();
        let loaded: LoadedSource | null = null;
        setRenderReady(false);
        keepPreview();
        setRevealRequest(null);
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
        setRevealRequest(null);
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
    const hovered = state.hovered && fields.includes(state.hovered) ? state.hovered : null;
    const candidate = hovered ?? selected;
    const active = candidate && (view === "fields" ? !candidate.detailView : candidate.detailView === view) ? candidate : null;
    const pinned = selected && (view === "fields" ? !selected.detailView : selected.detailView === view) ? selected : null;
    const activeRegions = fieldRegions(active);
    const activeRegionIndex = hovered ? 0 : state.selectedRegionIndex;
    const leavePreview = (field: CuField): void => {
        keepPreview();
        if (previewHeld.current) return;
        const focused = document.activeElement;
        if (focused instanceof HTMLElement && viewer.current?.contains(focused)) {
            const item = focused.closest("[data-field-id], [data-detail-id]");
            if ((item?.getAttribute("data-field-id") ?? item?.getAttribute("data-detail-id")) === field.id) return;
        }
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
        setRevealRequest(null);
        dispatch({ type: "clear" });
        const firstPage = next.pages.find(page => isPageAvailable(page.pageNumber));
        if (firstPage) dispatch({ type: "page", pageNumber: firstPage.pageNumber });
    };
    return <div className="cu-viewer" ref={viewer}>
        <SourcePane
            key={source?.name ?? "loading"}
            source={source} loading={!matchingSource} error={matchingSource?.error ?? null}
            content={content} pageNumber={state.pageNumber} active={active} preview={Boolean(hovered)}
            pinned={pinned} pinnedRegions={fieldRegions(pinned)} pinnedRegionIndex={state.selectedRegionIndex}
            view={view} outlines={outlines} previewId={previewId}
            onPreviewEnter={() => { previewHeld.current = true; keepPreview(); }}
            onPreviewLeave={() => { previewHeld.current = false; if (hovered) leavePreview(hovered); }}
            onDismissPreview={dismissPreview}
            regions={activeRegions} regionIndex={activeRegionIndex}
            revealRequest={revealRequest}
            color={active && !active.detailView ? fieldColor(active, content?.fields ?? []) : "#0078d4"}
            onPage={pageNumber => {
                keepPreview();
                setRevealRequest(null);
                dispatch({ type: "page", pageNumber });
            }} onRenderReady={onRenderReady}
            onRegion={index => {
                if (selected) {
                    keepPreview();
                    dispatch({ type: "region", fieldId: selected.id, index, pageAvailable: available(selected, index) });
                    setRevealRequest(++revealSequence.current);
                }
            }}
        />
        <FieldsPane
            result={props.result}
            view={view} onViewChange={next => { setView(next); dismissPreview(); }}
            hideMissing={hideMissing} onHideMissingChange={setHideMissing}
            previewId={hovered && active && renderReady && available(active) &&
                activeRegions[0]?.pageNumber === state.pageNumber ? previewId : undefined}
            source={source}
            apiVersion={parsed.model?.apiVersion}
            content={content} issues={[...(parsed.model?.issues ?? []), ...sourceIssues]} error={parsed.error}
            contents={parsed.model?.contents ?? []} contentIndex={contentIndex} onContentChange={chooseContent}
            selected={selected} hovered={hovered} sourceReady={Boolean(source)} isPageAvailable={isPageAvailable}
            onHover={(field, navigate = true) => {
                keepPreview();
                previewHeld.current = false;
                dispatch({ type: "hover", field, pageAvailable: navigate && available(field) });
            }}
            onLeave={leavePreview}
            onSelect={field => {
                keepPreview();
                dispatch({ type: "select", field, pageAvailable: available(field) });
                setRevealRequest(++revealSequence.current);
            }}
            onClear={() => {
                keepPreview();
                setRevealRequest(null);
                dispatch({ type: "clear" });
            }}
        />
    </div>;
}
