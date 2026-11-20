const CHECKPOINT_INTERVAL = 256;

export interface TextRange { start: number; end: number }
export interface TextSearchIndex {
    pattern: string;
    count: number;
    checkpoints: readonly number[];
}

export function literalTextPattern(query: string): string {
    return query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function indexLiteralText(text: string, query: string, signal?: AbortSignal): Promise<TextSearchIndex> {
    signal?.throwIfAborted();
    const pattern = literalTextPattern(query);
    const checkpoints: number[] = [];
    if (!query) return { pattern, count: 0, checkpoints };
    const expression = new RegExp(pattern, "giu");
    let count = 0, deadline = performance.now() + 8;
    for (let match = expression.exec(text); match; match = expression.exec(text)) {
        if (count % CHECKPOINT_INTERVAL === 0) checkpoints.push(match.index);
        count++;
        if (count % 1024 === 0) {
            signal?.throwIfAborted();
            if (performance.now() >= deadline) {
                await new Promise<void>(resolve => setTimeout(resolve, 0));
                deadline = performance.now() + 8;
            }
        }
    }
    signal?.throwIfAborted();
    return { pattern, count, checkpoints };
}

export function indexedTextMatch(text: string, index: TextSearchIndex, ordinal: number): TextRange {
    if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= index.count) throw new RangeError("Search match is out of range.");
    const checkpoint = Math.floor(ordinal / CHECKPOINT_INTERVAL);
    const expression = new RegExp(index.pattern, "giu");
    expression.lastIndex = index.checkpoints[checkpoint]!;
    let match: RegExpExecArray | null = null;
    for (let cursor = checkpoint * CHECKPOINT_INTERVAL; cursor <= ordinal; cursor++) match = expression.exec(text);
    if (!match) throw new Error("The indexed text match is unavailable.");
    return { start: match.index, end: match.index + match[0].length };
}

export function visibleTextMatches(text: string, index: TextSearchIndex, start: number, end: number): TextRange[] {
    if (!index.count) return [];
    let left = 0, right = index.checkpoints.length;
    while (left < right) {
        const middle = Math.floor((left + right) / 2);
        if (index.checkpoints[middle]! <= start) left = middle + 1; else right = middle;
    }
    const expression = new RegExp(index.pattern, "giu");
    expression.lastIndex = index.checkpoints[Math.max(0, left - 1)]!;
    const matches: TextRange[] = [];
    for (let match = expression.exec(text); match && match.index < end; match = expression.exec(text)) {
        const stop = match.index + match[0].length;
        if (stop > start) matches.push({ start: match.index, end: stop });
    }
    return matches;
}
