import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import type { ContentUnderstandingResultViewerProps } from "./index";
import { FieldsPane } from "./components/FieldsPane";
import { SourcePane } from "./components/SourcePane";
import { fieldColor, fieldRegion, fieldRegions, initialInteraction, interaction, selectableFields } from "./internal/interaction";
import { CuResultParseError, parseCuResult } from "./internal/parseCuResult";
import type { LoadedSource } from "./internal/source";
import { hasSourcePage, loadSource, unavailableSourcePageMessage } from "./internal/source";
import type { CuField, CuParseIssue } from "./internal/types";
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
    const [renderReady, setRenderReady] = useState(false);
    const matchingSource = sourceState?.input === props.source ? sourceState : null;
    const source = matchingSource?.source ?? null;
    useEffect(() => {
        const controller = new AbortController();
        let loaded: LoadedSource | null = null;
        setRenderReady(false);
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
    useEffect(() => dispatch({ type: "clear" }), [props.result]);
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
    const active = hovered ?? selected;
    const activeRegions = fieldRegions(active);
    const activeRegionIndex = hovered ? 0 : state.selectedRegionIndex;
    const chooseContent = (index: number): void => {
        const next = parsed.model?.contents[index];
        if (!next) throw new Error("The chosen result content does not exist.");
        setContentChoice({ result: props.result, index });
        dispatch({ type: "clear" });
        const firstPage = next.pages.find(page => isPageAvailable(page.pageNumber));
        if (firstPage) dispatch({ type: "page", pageNumber: firstPage.pageNumber });
    };
    return <div className="cu-viewer">
        <SourcePane
            key={source?.name ?? "loading"}
            source={source} loading={!matchingSource} error={matchingSource?.error ?? null}
            content={content} pageNumber={state.pageNumber} active={active} preview={Boolean(hovered)}
            regions={activeRegions} regionIndex={activeRegionIndex}
            color={active && !active.detailView ? fieldColor(active, content?.fields ?? []) : "#0078d4"}
            onPage={pageNumber => dispatch({ type: "page", pageNumber })} onRenderReady={onRenderReady}
            onRegion={index => {
                if (selected) dispatch({ type: "region", fieldId: selected.id, index, pageAvailable: available(selected, index) });
            }}
        />
        <FieldsPane
            result={props.result}
            source={source}
            apiVersion={parsed.model?.apiVersion} analyzerId={parsed.model?.analyzerId}
            content={content} issues={[...(parsed.model?.issues ?? []), ...sourceIssues]} error={parsed.error}
            contents={parsed.model?.contents ?? []} contentIndex={contentIndex} onContentChange={chooseContent}
            selected={selected} hovered={hovered} sourceReady={Boolean(source && renderReady)} isPageAvailable={isPageAvailable}
            onHover={field => dispatch({ type: "hover", field, pageAvailable: available(field) })}
            onLeave={field => dispatch({ type: "leave", fieldId: field.id, restorePageAvailable: available(selected) })}
            onSelect={field => dispatch({ type: "select", field, pageAvailable: available(field) })}
            onClear={() => dispatch({ type: "clear" })}
        />
    </div>;
}
