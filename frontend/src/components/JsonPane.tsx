import { useEffect, useMemo, useState } from "react";
import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";
import { inspectJson, validateLargeJson } from "../model/resultLimits";
import type { JsonValidation } from "../model/resultLimits";
import { PagedJsonTree } from "./PagedJsonTree";

export { MAX_JSON_CHARACTERS, MAX_JSON_VALUES } from "../model/resultLimits";

const jsonStyles = {
    ...defaultStyles,
    container: "cu-json-tree",
    childFieldsContainer: "cu-json-children",
    basicChildStyle: "cu-json-node",
    collapseIcon: "cu-json-expander cu-json-collapse",
    expandIcon: "cu-json-expander cu-json-expand",
    collapsedContent: "cu-json-collapsed",
    label: "cu-json-label",
    clickableLabel: "cu-json-label cu-json-clickable-label",
    nullValue: "cu-json-null",
    undefinedValue: "cu-json-undefined",
    numberValue: "cu-json-number",
    stringValue: "cu-json-string",
    booleanValue: "cu-json-boolean",
    otherValue: "cu-json-other",
    punctuation: "cu-json-punctuation",
    stringifyStringValues: true,
    ariaLables: {
        collapseJson: "Collapse JSON node",
        expandJson: "Expand JSON node",
    },
};

interface JsonPaneProps {
    value: unknown;
}

export function JsonPane({ value }: JsonPaneProps) {
    const inspection = useMemo(() => inspectJson(value), [value]);
    const [largeInspection, setLargeInspection] = useState<{ value: unknown; validation: JsonValidation } | null>(null);
    useEffect(() => {
        if (inspection.status !== "limit") return;
        const controller = new AbortController();
        void validateLargeJson(value, controller.signal).then(validation => {
            if (!controller.signal.aborted) setLargeInspection({ value, validation });
        }).catch((error: unknown) => {
            if (!controller.signal.aborted) setLargeInspection({ value, validation: {
                status: "invalid", message: error instanceof Error ? error.message : "The supplied result could not be inspected as JSON.",
            } });
        });
        return () => controller.abort();
    }, [inspection, value]);
    const validation = largeInspection && largeInspection.value === value ? largeInspection.validation : null;
    const error = inspection.status === "invalid" ? inspection.message :
        inspection.status === "limit" && validation?.status === "invalid" ? validation.message : null;
    if (error) {
        return <div className="cu-state cu-error" role="alert">
            <h2>JSON could not be displayed</h2>
            <p>{error}</p>
        </div>;
    }
    if (inspection.status === "limit") {
        return validation?.status === "ready" ? <div className="cu-rich-result-scroll"><PagedJsonTree value={value} /></div> :
            <div className="cu-state" role="status">Validating large JSON without blocking the viewer...</div>;
    }
    if (typeof value !== "object" || value === null) {
        return <div className="cu-rich-result-scroll">
            <pre className="cu-json-scalar">{JSON.stringify(value)}</pre>
        </div>;
    }
    return <div className="cu-rich-result-scroll">
        <JsonView
            data={value}
            style={jsonStyles}
            shouldExpandNode={collapseAllNested}
            clickToExpandNode
            aria-label="Original Analyze result JSON"
        />
    </div>;
}
