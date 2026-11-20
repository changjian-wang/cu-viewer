import { indexedTextMatch, indexLiteralText, literalTextPattern } from "./textSearch";
import type { TextRange, TextSearchIndex } from "./textSearch";

export const JSON_ENTRIES_PER_PAGE = 100;
const MAX_BULK_JSON_NODES = 10_000;
const MAX_BULK_JSON_DEPTH = 64;

export interface JsonNodeViewState { expanded?: boolean; page: number }
export interface JsonTreeViewState {
    nodes: Map<string, JsonNodeViewState>;
    expansion: "root" | "collapsed" | "expanded";
}

interface JsonLocation { parent: JsonLocation | null; key: string; index: number }
interface JsonEntry { value: unknown; label?: string; location: JsonLocation | null; depth: number }
type SearchPart = "key" | "value";

interface JsonSearchEntry {
    location: JsonLocation | null;
    part: SearchPart;
    literal: string;
    index: TextSearchIndex;
    end: number;
}

export interface JsonSearchIndex { count: number; entries: readonly JsonSearchEntry[] }
export interface JsonSearchMatch {
    path: string;
    part: SearchPart;
    literal: string;
    range: TextRange;
    ancestors: readonly { path: string; page: number }[];
}

export function jsonChildPath(path: string, key: string): string {
    return `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
}

export function isJsonContainer(value: unknown): value is object {
    return value !== null && typeof value === "object";
}

function* children(value: object, parent: JsonLocation | null, depth: number): Generator<JsonEntry> {
    const keys = Array.isArray(value) ? null : Object.keys(value);
    const count = keys?.length ?? (Array.isArray(value) ? value.length : 0);
    for (let index = 0; index < count; index++) {
        const key = keys ? keys[index]! : String(index);
        const child: unknown = Reflect.get(value, key);
        yield { value: child, location: { parent, key, index }, depth, ...(keys ? { label: key } : {}) };
    }
}

function* walkJson(value: unknown): Generator<JsonEntry> {
    yield { value, location: null, depth: 1 };
    if (!isJsonContainer(value)) return;
    const stack = [children(value, null, 2)];
    while (stack.length) {
        const next = stack.at(-1)!.next();
        if (next.done) { stack.pop(); continue; }
        const entry = next.value;
        yield entry;
        if (isJsonContainer(entry.value)) stack.push(children(entry.value, entry.location, entry.depth + 1));
    }
}

export function canExpandJsonTree(value: unknown): boolean {
    let count = 0;
    // Include off-page branches so a later page change cannot bypass the bulk render budget.
    for (const entry of walkJson(value)) if (++count > MAX_BULK_JSON_NODES || entry.depth > MAX_BULK_JSON_DEPTH) return false;
    return true;
}

export async function indexJsonSearch(value: unknown, query: string, signal: AbortSignal): Promise<JsonSearchIndex> {
    signal.throwIfAborted();
    const entries: JsonSearchEntry[] = [];
    if (!query) return { count: 0, entries };
    const expression = new RegExp(literalTextPattern(query), "iu");
    let count = 0, visited = 0, deadline = performance.now() + 8;
    for (const entry of walkJson(value)) {
        const parts: [SearchPart, string][] = [];
        if (entry.label !== undefined) parts.push(["key", JSON.stringify(entry.label)]);
        if (!isJsonContainer(entry.value)) {
            const literal = JSON.stringify(entry.value);
            if (literal === undefined) throw new Error("A value in the result is not JSON.");
            parts.push(["value", literal]);
        }
        for (const [part, literal] of parts) {
            if (!expression.test(literal)) continue;
            const index = await indexLiteralText(literal, query, signal);
            count += index.count;
            entries.push({ location: entry.location, part, literal, index, end: count });
        }
        if (++visited % 128 === 0 && performance.now() >= deadline) {
            signal.throwIfAborted();
            await new Promise<void>(resolve => setTimeout(resolve, 0));
            deadline = performance.now() + 8;
        }
    }
    signal.throwIfAborted();
    return { count, entries };
}

export function jsonSearchMatch(index: JsonSearchIndex, position: number): JsonSearchMatch {
    let first = 0, last = index.entries.length;
    while (first < last) {
        const middle = Math.floor((first + last) / 2);
        if (index.entries[middle]!.end <= position) first = middle + 1; else last = middle;
    }
    const entry = index.entries[first];
    if (!entry || position < 0) throw new RangeError("JSON search match is out of range.");
    const trail: JsonLocation[] = [];
    for (let location = entry.location; location; location = location.parent) trail.push(location);
    let path = "";
    const ancestors = trail.reverse().map(({ key, index: childIndex }) => {
        const ancestor = { path, page: Math.floor(childIndex / JSON_ENTRIES_PER_PAGE) };
        path = jsonChildPath(path, key);
        return ancestor;
    });
    const range = indexedTextMatch(entry.literal, entry.index, position - (entry.end - entry.index.count));
    return { path, part: entry.part, literal: entry.literal, range, ancestors };
}
