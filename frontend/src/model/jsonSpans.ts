import { textBoundary } from "../markdown/model";

function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isJsonSpanPath(path: string): boolean {
    return /^\/(?:result\/)?contents\/(?:0|[1-9]\d*)\/(?:[^/]+\/)*spans(?:\/(?:0|[1-9]\d*))?$/.test(path);
}

export function sliceEncodedSpan(text: string, offset: number, length: number, encoding: unknown = "codePoint"): string {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 ||
        !Number.isSafeInteger(offset + length)) throw new RangeError("Span offset and length must be nonnegative safe integers.");
    if (encoding !== "codePoint" && encoding !== "utf16" && encoding !== "utf8") {
        throw new RangeError("Unsupported stringEncoding; expected codePoint, utf16 or utf8.");
    }
    const end = offset + length;
    if (encoding === "utf16" || (encoding === "codePoint" && !/[\ud800-\udbff]/.test(text)) ||
        (encoding === "utf8" && !/[^\t\n\r -~]/.test(text))) {
        if (end > text.length) throw new RangeError("Span exceeds the content Markdown.");
        if (textBoundary(text, offset) !== offset || textBoundary(text, end) !== end) {
            throw new RangeError("Span boundary splits a Unicode character.");
        }
        return text.slice(offset, end);
    }
    let units = 0, cursor = 0, start: number | undefined;
    for (const character of text) {
        if (units === offset) start = cursor;
        if (units === end) break;
        const code = character.codePointAt(0)!;
        if (encoding === "utf8" && code >= 0xd800 && code <= 0xdfff) {
            throw new RangeError("UTF-8 spans cannot reference an unpaired surrogate.");
        }
        units += encoding === "codePoint" ? 1 : code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
        cursor += character.length;
        if ((units > offset && start === undefined) || units > end) throw new RangeError("Span boundary splits a Unicode character.");
    }
    if (units === offset) start = cursor;
    if (units !== end || start === undefined) throw new RangeError("Span exceeds the content Markdown.");
    return text.slice(start, cursor);
}

export function jsonSpanPreview(root: unknown, path: string): string | undefined {
    if (!isJsonSpanPath(path) || !record(root)) return undefined;
    const keys = path.slice(1).split("/").map(key => key.replaceAll("~1", "/").replaceAll("~0", "~"));
    const wrapped = keys[0] === "result";
    const result = wrapped ? root.result : root;
    if (!record(result) || !Array.isArray(result.contents)) return "Span preview unavailable: no content collection.";
    const content: unknown = result.contents[Number(keys[wrapped ? 2 : 1])];
    if (!record(content) || typeof content.markdown !== "string") return "Span preview unavailable: no Markdown for this content.";
    const markdown = content.markdown;
    let value: unknown = root;
    for (const key of keys) {
        if (value === null || typeof value !== "object" || !Object.hasOwn(value, key)) {
            return "Span preview unavailable: span entry is missing.";
        }
        value = Reflect.get(value, key);
    }
    const spans: readonly unknown[] = Array.isArray(value) ? value : [value];
    if (!spans.length) return "No spans were returned.";
    // Content Understanding defaults to codePoint when stringEncoding is omitted.
    const encoding = result.stringEncoding === undefined ? "codePoint" : result.stringEncoding;
    try {
        if (encoding !== "codePoint" && encoding !== "utf16" && encoding !== "utf8") {
            throw new RangeError("Unsupported stringEncoding; expected codePoint, utf16 or utf8.");
        }
        const previews = spans.slice(0, 3).map(span => {
            if (!record(span) || typeof span.offset !== "number" || typeof span.length !== "number") {
                throw new RangeError("Span must contain numeric offset and length.");
            }
            const text = sliceEncodedSpan(markdown, span.offset, span.length, encoding);
            const preview = text.slice(0, textBoundary(text, Math.min(512, text.length)));
            return `${text.length ? preview : "(empty span)"}${
                preview.length < text.length ? "\n[Preview shortened]" : ""}`;
        });
        if (spans.length > 3) previews.push(`Showing 3 of ${spans.length} spans; hover an individual entry for its text.`);
        return previews.join("\n\n");
    } catch (error) {
        if (error instanceof RangeError) return `Span preview unavailable: ${error.message}`;
        throw error;
    }
}
