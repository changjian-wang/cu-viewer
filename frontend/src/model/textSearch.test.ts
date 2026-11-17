import { describe, expect, it } from "vitest";
import { indexedTextMatch, indexLiteralText, visibleTextMatches } from "./textSearch";

describe("literal full-text search", () => {
    it("matches case-insensitively without interpreting regex syntax or changing Unicode offsets", async () => {
        const text = 'İ😀 [a+b] \\n [A+B]';
        const index = await indexLiteralText(text, "[a+b]");
        expect(index.count).toBe(2);
        for (const ordinal of [0, 1]) {
            const match = indexedTextMatch(text, index, ordinal);
            expect(text.slice(match.start, match.end).toLowerCase()).toBe("[a+b]");
        }
        expect((await indexLiteralText(text, String.raw`\n`)).count).toBe(1);
        expect((await indexLiteralText(text, "")).count).toBe(0);
    });

    it("keeps a sparse index while finding late matches and exact fragment-crossing ranges", async () => {
        const text = "aa".repeat(5_000) + "NEEDLE";
        const index = await indexLiteralText(text, "aa");
        expect(index.count).toBe(5_000);
        expect(index.checkpoints.length).toBeLessThan(30);
        expect(indexedTextMatch(text, index, 4_999)).toEqual({ start: 9_998, end: 10_000 });
        expect(visibleTextMatches(text, index, 4_097, 4_101)).toEqual([
            { start: 4_096, end: 4_098 }, { start: 4_098, end: 4_100 }, { start: 4_100, end: 4_102 },
        ]);
        const crossing = await indexLiteralText("x".repeat(4_094) + "needle", "NEEDLE");
        expect(visibleTextMatches("x".repeat(4_094) + "needle", crossing, 4_096, 8_192))
            .toEqual([{ start: 4_094, end: 4_100 }]);
    });

    it("cancels obsolete indexing and reports no-match results without stale positions", async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(indexLiteralText("text", "t", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
        const index = await indexLiteralText("text", "missing");
        expect(index.count).toBe(0);
        expect(visibleTextMatches("text", index, 0, 4)).toEqual([]);
        expect(() => indexedTextMatch("text", index, 0)).toThrow(RangeError);
    });
});
