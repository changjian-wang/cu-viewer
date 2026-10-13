import { useMemo } from "react";
import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";

export const MAX_JSON_CHARACTERS = 500_000;
export const MAX_JSON_VALUES = 20_000;

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

type JsonInspection =
    | { status: "ready"; characters: number; values: number }
    | { status: "limit"; characters?: number; values?: number }
    | { status: "invalid"; message: string };

class JsonLimitError extends Error {
    constructor(
        readonly characters: number,
        readonly values: number,
    ) {
        super("JSON result exceeds the viewer limit.");
    }
}

function inspectJson(value: unknown): JsonInspection {
    let values = 0;
    try {
        const serialized = JSON.stringify(value, (_key, nested: unknown) => {
            values += 1;
            if (typeof nested === "string" && nested.length > MAX_JSON_CHARACTERS) {
                throw new JsonLimitError(nested.length, values);
            }
            if (typeof nested === "number") {
                if (!Number.isFinite(nested)) throw new TypeError("The result contains a non-finite number and is not serialized JSON.");
            } else if (typeof nested === "undefined" || typeof nested === "function" || typeof nested === "symbol" || typeof nested === "bigint") {
                throw new TypeError(`The result contains a non-JSON ${typeof nested} value.`);
            }
            if (values > MAX_JSON_VALUES) {
                throw new JsonLimitError(0, values);
            }
            return nested;
        });
        if (serialized === undefined) return { status: "invalid", message: "The supplied result is not a JSON value." };
        if (serialized.length > MAX_JSON_CHARACTERS) {
            return { status: "limit", characters: serialized.length, values };
        }
        return { status: "ready", characters: serialized.length, values };
    } catch (error) {
        if (error instanceof JsonLimitError) {
            return { status: "limit", characters: error.characters, values: error.values };
        }
        return {
            status: "invalid",
            message: error instanceof Error ? error.message : "The supplied result could not be inspected as JSON.",
        };
    }
}

interface JsonPaneProps {
    value: unknown;
}

export function JsonPane({ value }: JsonPaneProps) {
    const inspection = useMemo(() => inspectJson(value), [value]);
    if (inspection.status === "limit") {
        const exceeded = inspection.values !== undefined && inspection.values > MAX_JSON_VALUES
            ? `${inspection.values.toLocaleString("en-US")} values exceeds the ${MAX_JSON_VALUES.toLocaleString("en-US")}-value limit`
            : `${inspection.characters?.toLocaleString("en-US") ?? "The result size"} exceeds the ${MAX_JSON_CHARACTERS.toLocaleString("en-US")}-character limit`;
        return <div className="cu-state cu-result-limit" role="alert">
            <h2>JSON is too large to render</h2>
            <p>{exceeded}. Use the original saved result for full inspection.</p>
        </div>;
    }
    if (inspection.status === "invalid") {
        return <div className="cu-state cu-error" role="alert">
            <h2>JSON could not be displayed</h2>
            <p>{inspection.message}</p>
        </div>;
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
