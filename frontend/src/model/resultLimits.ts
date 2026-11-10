export const MAX_JSON_CHARACTERS = 500_000;
export const MAX_JSON_VALUES = 20_000;

export type JsonInspection =
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

export function inspectJson(value: unknown): JsonInspection {
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
            if (values > MAX_JSON_VALUES) throw new JsonLimitError(0, values);
            return nested;
        });
        if (serialized === undefined) return { status: "invalid", message: "The supplied result is not a JSON value." };
        if (serialized.length > MAX_JSON_CHARACTERS) return { status: "limit", characters: serialized.length, values };
        return { status: "ready", characters: serialized.length, values };
    } catch (error) {
        if (error instanceof JsonLimitError) return { status: "limit", characters: error.characters, values: error.values };
        return {
            status: "invalid",
            message: error instanceof Error ? error.message : "The supplied result could not be inspected as JSON.",
        };
    }
}
