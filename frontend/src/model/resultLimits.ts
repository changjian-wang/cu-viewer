export const MAX_JSON_CHARACTERS = 500_000;
export const MAX_JSON_VALUES = 20_000;
export const JSON_STRING_PREVIEW_THRESHOLD = 4_000;

export type JsonInspection =
    | { status: "ready"; characters: number; values: number; hasLongStrings: boolean }
    | { status: "limit"; characters?: number; values?: number }
    | { status: "invalid"; message: string };

export type JsonValidation =
    | { status: "ready" }
    | { status: "invalid"; message: string }
    | { status: "cancelled" };

function* jsonChildren(value: object): Generator<unknown> {
    if (Array.isArray(value)) {
        const array: readonly unknown[] = value;
        for (let index = 0; index < array.length; index++) yield array[index];
    } else {
        for (const key of Object.keys(value)) {
            const child: unknown = Reflect.get(value, key);
            yield child;
        }
    }
}

export async function validateLargeJson(value: unknown, signal: AbortSignal): Promise<JsonValidation> {
    type Frame = { kind: "value"; value: unknown } | { kind: "children"; value: object; children: Iterator<unknown> };
    const stack: Frame[] = [{ kind: "value", value }];
    const active = new WeakSet<object>();
    let deadline = performance.now() + 8;
    let steps = 0;
    while (stack.length) {
        if (signal.aborted) return { status: "cancelled" };
        const frame = stack.pop();
        if (!frame) break;
        if (frame.kind === "children") {
            const next = frame.children.next();
            if (next.done) active.delete(frame.value);
            else stack.push(frame, { kind: "value", value: next.value });
        } else {
            const current = frame.value;
            if (typeof current === "number" && !Number.isFinite(current)) {
                return { status: "invalid", message: "The result contains a non-finite number and is not serialized JSON." };
            }
            if (current !== null && typeof current === "object") {
                const prototype: unknown = Object.getPrototypeOf(current);
                if (!Array.isArray(current) && prototype !== Object.prototype && prototype !== null) {
                    return { status: "invalid", message: "The result contains an object that is not serialized JSON." };
                }
                if (active.has(current)) return { status: "invalid", message: "The result contains a circular reference." };
                active.add(current);
                stack.push({ kind: "children", value: current, children: jsonChildren(current) });
            } else if (current !== null && !["string", "number", "boolean"].includes(typeof current)) {
                return { status: "invalid", message: `The result contains a non-JSON ${typeof current} value.` };
            }
        }
        if (++steps % 256 === 0 && performance.now() >= deadline) {
            await new Promise<void>(resolve => setTimeout(resolve, 0));
            deadline = performance.now() + 8;
        }
    }
    return signal.aborted ? { status: "cancelled" } : { status: "ready" };
}

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
    let hasLongStrings = false;
    try {
        const serialized = JSON.stringify(value, (_key, nested: unknown) => {
            values += 1;
            if (typeof nested === "string" && nested.length > JSON_STRING_PREVIEW_THRESHOLD) hasLongStrings = true;
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
        return { status: "ready", characters: serialized.length, values, hasLongStrings };
    } catch (error) {
        if (error instanceof JsonLimitError) return { status: "limit", characters: error.characters, values: error.values };
        return {
            status: "invalid",
            message: error instanceof Error ? error.message : "The supplied result could not be inspected as JSON.",
        };
    }
}
