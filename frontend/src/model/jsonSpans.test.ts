import { describe, expect, it } from "vitest";
import { jsonSpanPreview, sliceEncodedSpan } from "./jsonSpans";

describe("original Markdown span previews", () => {
    it("resolves each encoding without splitting emoji or multibyte characters", () => {
        const text = "A😀中$610.00Z";
        expect(sliceEncodedSpan(text, 3, 7, "codePoint")).toBe("$610.00");
        expect(sliceEncodedSpan(text, 4, 7, "utf16")).toBe("$610.00");
        expect(sliceEncodedSpan(text, 8, 7, "utf8")).toBe("$610.00");
        expect(sliceEncodedSpan(text, 1, 1)).toBe("😀");
        expect(sliceEncodedSpan(text, 3, 0)).toBe("");
        for (const [offset, length, encoding] of [[2, 1, "utf16"], [2, 2, "utf8"], [-1, 1, "codePoint"],
            [0, 100, "codePoint"], [0.1, 1, "utf16"], [0, 1, "unknown"]] as const) {
            expect(() => sliceEncodedSpan(text, offset, length, encoding)).toThrow(RangeError);
        }
    });

    it("uses the original content, inherited encoding and escaped field paths in flat and wrapped results", () => {
        const result = { stringEncoding: "codePoint", contents: [
            { markdown: "Wrong document", fields: {} },
            { markdown: "😀$610.00", fields: { "a/b~": { spans: [{ offset: 1, length: 7 }] } } },
        ] };
        const path = "/contents/1/fields/a~1b~0/spans";
        const before = JSON.stringify(result);
        expect(jsonSpanPreview(result, path)).toBe("$610.00");
        expect(jsonSpanPreview({ result }, `/result${path}/0`)).toBe("$610.00");
        expect(JSON.stringify(result)).toBe(before);
        expect(jsonSpanPreview(result, "/contents/0/fields/a~1b~0/spans")).toContain("span entry is missing");
    });

    it("reports missing Markdown and invalid spans, and bounds aggregate and long previews explicitly", () => {
        const value = { contents: [{ markdown: "x".repeat(900), fields: {
            Long: { spans: [{ offset: 0, length: 900 }] },
            Many: { spans: Array.from({ length: 4 }, () => ({ offset: 0, length: 1 })) },
            Invalid: { spans: [{ offset: 899, length: 2 }] },
        } }] };
        expect(jsonSpanPreview(value, "/contents/0/fields/Long/spans")).toContain("[Preview shortened]");
        expect(jsonSpanPreview(value, "/contents/0/fields/Many/spans")).toContain("Showing 3 of 4 spans");
        expect(jsonSpanPreview(value, "/contents/0/fields/Invalid/spans/0")).toContain("Span exceeds");
        expect(jsonSpanPreview({ contents: [{}] }, "/contents/0/fields/Value/spans")).toContain("no Markdown");
        expect(jsonSpanPreview(value, "/fields/spans")).toBeUndefined();
    });
});
