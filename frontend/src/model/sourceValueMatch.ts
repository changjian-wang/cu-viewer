import { createSpanSlicer } from "./jsonSpans";

const wordCharacter = /[\p{L}\p{M}\p{N}_]/u;
const wordBoundaryRequired = /[\p{Script=Latin}\p{N}]/u;

function normalizedText(text: string): string {
    return text.normalize("NFKC").toLowerCase().replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\s+/g, " ").trim();
}

function sourceText(markdown: string): string {
    return normalizedText(markdown.replace(/<!--[\s\S]*?-->|<\/?[a-z][^<>]*>/gi, " ")
        .replace(/&(?:nbsp|#160|#xa0);/gi, " ").replace(/&amp;/gi, "&"));
}

function containsText(text: string, value: string): boolean {
    const startBoundary = wordBoundaryRequired.test(value[0] ?? "");
    const endBoundary = wordBoundaryRequired.test(value.at(-1) ?? "");
    for (let index = text.indexOf(value); index >= 0; index = text.indexOf(value, index + 1)) {
        if ((!startBoundary || !wordCharacter.test(text[index - 1] ?? "")) &&
            (!endBoundary || !wordCharacter.test(text[index + value.length] ?? ""))) return true;
    }
    return false;
}

function sourceNumbers(text: string): Set<number> {
    const numbers = new Set<number>();
    for (const match of text.matchAll(/[+-]?(?:\p{Sc} ?[+-]?)?(?:\d+(?:[.,]\d+)*|\.\d+)(?:e[+-]?\d+)?/gu)) {
        const index = match.index;
        const raw = match[0];
        const end = index + raw.length;
        if (wordCharacter.test(text[index - 1] ?? "") || wordCharacter.test(text[end] ?? "")) continue;
        const token = raw.replace(/\p{Sc} ?/u, "");
        const normalized = /^[+-]?(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/.test(token)
            ? token.replaceAll(",", "")
            : /^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+),\d+(?:e[+-]?\d+)?$/.test(token)
                ? token.replaceAll(".", "").replace(",", ".") : undefined;
        if (normalized === undefined) continue;
        const number = Number(normalized);
        if (!Number.isFinite(number)) continue;
        const accounting = text[index - 1] === "(" && text[end] === ")" && /\p{Sc}/u.test(raw);
        numbers.add(accounting ? -Math.abs(number) : number);
    }
    return numbers;
}

const months = ["january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"];

function dateKey(year: number, month: number, day: number): string {
    return `${year}-${month}-${day}`;
}

function sourceDates(text: string): Set<string> {
    const dates = new Set<string>();
    const add = (year: number, month: number, day: number): void => {
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) dates.add(dateKey(year, month, day));
    };
    for (const match of text.matchAll(/\b(\d{4}|\d{1,2})([./-])(\d{1,2})\2(\d{4}|\d{1,2})\b/g)) {
        const [, first, , second, last] = match;
        if (first?.length === 4 && last && last.length <= 2) add(Number(first), Number(second), Number(last));
        if (last?.length === 4 && first && first.length <= 2) {
            // Either ordering may be a valid normalization when no locale was declared.
            add(Number(last), Number(first), Number(second));
            add(Number(last), Number(second), Number(first));
        }
    }
    for (const match of text.matchAll(/\b(?:([a-z]+)\.? (\d{1,2}),? (\d{4})|(\d{1,2}) ([a-z]+)\.? (\d{4}))\b/g)) {
        const month = match[1] ?? match[5];
        const index = months.findIndex(name => month === name || month === name.slice(0, 3));
        if (index >= 0) add(Number(match[3] ?? match[6]), index + 1, Number(match[2] ?? match[4]));
    }
    return dates;
}

export function sourceValueMatcher(markdown: string, encoding: unknown) {
    const body = sourceText(markdown);
    if (!/[\p{L}\p{N}]/u.test(body)) return undefined;
    const slice = createSpanSlicer(markdown, encoding);
    const textMatches = new Map<string, boolean>();
    let numbers: Set<number> | undefined;
    let dates: Set<string> | undefined;

    return (type: string, value: unknown, spans: unknown): boolean => {
        const text = typeof value === "string" ? normalizedText(value) : "";
        const date = type === "date" && /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
        const key = date ? dateKey(Number(date[1]), Number(date[2]), Number(date[3])) : undefined;
        const number = (type === "number" || type === "integer") && typeof value === "number" ? value : undefined;
        const literal = type === "string" && /[\p{L}\p{N}]/u.test(text);
        if (!literal && key === undefined && number === undefined) return false;

        const fragments: string[] = [];
        const ranges: readonly unknown[] = Array.isArray(spans) ? spans : [];
        for (const span of ranges) {
            if (!span || typeof span !== "object" || !("offset" in span) || !("length" in span) ||
                typeof span.offset !== "number" || typeof span.length !== "number" || span.length <= 0) continue;
            try {
                fragments.push(slice(span.offset, span.length));
            } catch (error) {
                // A bad range is not evidence; the Result span preview reports the validation error.
                if (!(error instanceof RangeError)) throw error;
            }
        }
        const evidence = fragments.length ? sourceText(fragments.join(" ")) : "";
        if (number !== undefined) return !sourceNumbers(evidence).has(number) && !(numbers ??= sourceNumbers(body)).has(number);
        if (key !== undefined) return !sourceDates(evidence).has(key) && !(dates ??= sourceDates(body)).has(key);
        if (containsText(evidence, text)) return false;
        let matches = textMatches.get(text);
        if (matches === undefined) {
            matches = containsText(body, text);
            textMatches.set(text, matches);
        }
        return !matches;
    };
}
