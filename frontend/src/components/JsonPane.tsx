import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { inspectJson, validateLargeJson } from "../model/resultLimits";
import type { JsonValidation } from "../model/resultLimits";
import { PagedJsonTree } from "./PagedJsonTree";
import type { JsonTreeState } from "./PagedJsonTree";
import { JsonStringDialog } from "./JsonStringDialog";
import type { JsonStringSelection } from "./JsonStringDialog";

export { MAX_JSON_CHARACTERS, MAX_JSON_VALUES } from "../model/resultLimits";

export interface JsonPaneState {
    nodes: JsonTreeState;
    scroll: { top: number; left: number };
    validation: JsonValidation | null;
}

interface JsonPaneProps {
    value: unknown;
    viewState?: JsonPaneState;
}

export function JsonPane({ value, viewState }: JsonPaneProps) {
    const inspection = useMemo(() => inspectJson(value), [value]);
    const ownState = useMemo<JsonPaneState>(() => ({ nodes: new Map(), scroll: { top: 0, left: 0 }, validation: null }), [value]);
    const state = viewState ?? ownState;
    const viewport = useRef<HTMLDivElement | null>(null);
    const attach = useCallback((element: HTMLDivElement | null): void => {
        if (viewport.current) state.scroll = { top: viewport.current.scrollTop, left: viewport.current.scrollLeft };
        viewport.current = element;
        if (element) { element.scrollTop = state.scroll.top; element.scrollLeft = state.scroll.left; }
    }, [state]);
    const [stringChoice, setStringChoice] = useState<{ root: unknown; selection: JsonStringSelection } | null>(null);
    const onViewString = useCallback((selection: JsonStringSelection): void => setStringChoice({ root: value, selection }), [value]);
    const closeString = useCallback((): void => setStringChoice(null), []);
    const [largeInspection, setLargeInspection] = useState<{ value: unknown; validation: JsonValidation } | null>(null);
    useEffect(() => {
        if (inspection.status !== "limit" || state.validation?.status === "ready" || state.validation?.status === "invalid") return;
        const controller = new AbortController();
        void validateLargeJson(value, controller.signal).then(validation => {
            if (!controller.signal.aborted) { state.validation = validation; setLargeInspection({ value, validation }); }
        }).catch((error: unknown) => {
            if (!controller.signal.aborted) setLargeInspection({ value, validation: {
                status: "invalid", message: error instanceof Error ? error.message : "The supplied result could not be inspected as JSON.",
            } });
        });
        return () => controller.abort();
    }, [inspection, value, state]);
    if (stringChoice && stringChoice.root !== value) setStringChoice(null);
    const validation = state.validation ?? (largeInspection && largeInspection.value === value ? largeInspection.validation : null);
    const error = inspection.status === "invalid" ? inspection.message :
        inspection.status === "limit" && validation?.status === "invalid" ? validation.message : null;
    if (error) {
        return <div className="cu-state cu-error" role="alert">
            <h2>JSON could not be displayed</h2>
            <p>{error}</p>
        </div>;
    }
    if (inspection.status === "limit" && validation?.status !== "ready") {
        return <div className="cu-state" role="status">Validating large JSON without blocking the viewer...</div>;
    }
    return <><div className="cu-rich-result-scroll" ref={attach} onScroll={event => {
        state.scroll = { top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft };
    }}><PagedJsonTree value={value} state={state.nodes} onViewString={onViewString} /></div>
        {stringChoice && stringChoice.root === value && <JsonStringDialog key={stringChoice.selection.path}
            selection={stringChoice.selection} onClose={closeString} />}
    </>;
}
