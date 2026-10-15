import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCuResult } from "./parseCuResult";
import { sourceWordOutlines } from "./sourceOverlays";

function result(words: unknown, apiVersion = "2025-11-01") {
    return { apiVersion, contents: [{
        kind: "document", unit: "pixel", fields: {},
        pages: [{ pageNumber: 1, width: 100, height: 100, words },
            { pageNumber: 2, width: 100, height: 100 }],
    }] };
}

describe("CU page word sources", () => {
    it.each(["2025-11-01", "2026-06-01-preview"])("maps %s words without requiring extracted fields", apiVersion => {
        const raw = result([{ content: "WORD_ONLY", confidence: 0.3, source: "D(1,10,20,30,10)" }], apiVersion);
        const before = JSON.stringify(raw);
        const model = parseCuResult({ status: "Succeeded", result: raw });
        const page = model.contents[0]?.pages[0];
        expect(page?.words).toEqual([{ id: "/contents/0/pages/0/words/0", content: "WORD_ONLY",
            region: { pageNumber: 1, polygon: [{ x: 10, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 30 }, { x: 10, y: 30 }] } }]);
        expect(model.contents[0]?.fields).toEqual([]);
        expect(model.issues).toEqual([]);
        expect(JSON.stringify(raw)).toBe(before);
    });

    it("preserves frozen caller words, including empty text, instead of writing normalized polygons into them", () => {
        const word = Object.freeze({ content: "", source: "D(1,10,20,40,20,40,30,10,30)", confidence: 0 });
        const words = Object.freeze([word]);
        const raw = result(words);
        const model = parseCuResult(raw);
        expect(model.original).toBe(raw);
        expect(model.contents[0]?.pages[0]?.words?.[0]?.content).toBe("");
        expect(sourceWordOutlines(model.contents[0]?.pages[0])).toHaveLength(1);
        expect(Object.keys(word)).toEqual(["content", "source", "confidence"]);
        expect(word.source).toBe("D(1,10,20,40,20,40,30,10,30)");
    });

    it.each([undefined, null, []])("keeps missing or empty word data optional", words => {
        const model = parseCuResult(result(words));
        expect(model.issues).toEqual([]);
        expect(sourceWordOutlines(model.contents[0]?.pages[0])).toEqual([]);
    });

    it("retains word text without inventing geometry when source is absent", () => {
        const model = parseCuResult(result([{ content: "Ungrounded" }]));
        expect(model.contents[0]?.pages[0]?.words).toEqual([{ id: "/contents/0/pages/0/words/0", content: "Ungrounded" }]);
        expect(sourceWordOutlines(model.contents[0]?.pages[0])).toEqual([]);
        expect(model.issues).toEqual([]);
    });

    it("reports malformed word containers and text at their original paths while preserving valid fields", () => {
        const raw = result([null, { content: 7, source: "D(1,10,20,30,10)" }, { content: "Valid", source: "D(1,10,20,30,10)" }]);
        const model = parseCuResult(raw);
        expect(model.contents[0]?.pages[0]?.words?.map(word => word.id)).toEqual(["/contents/0/pages/0/words/2"]);
        expect(model.issues.map(issue => issue.path)).toEqual(["/contents/0/pages/0/words/0", "/contents/0/pages/0/words/1/content"]);
        const invalid = parseCuResult(result({ content: "Not an array" }));
        expect(invalid.issues).toContainEqual(expect.objectContaining({ code: "invalid-content-detail", path: "/contents/0/pages/0/words" }));
        expect(invalid.original).toBeTruthy();
    });

    it("rejects malformed, out-of-bounds and cross-page word sources with explicit warnings", () => {
        const model = parseCuResult({ status: "Succeeded", result: result([
            { content: "Bad", source: "bad" }, { content: "Outside", source: "D(1,95,10,20,10)" },
            { content: "Wrong page", source: "D(2,10,20,30,10)" }, { content: "Missing page", source: "D(3,10,20,30,10)" },
        ]) });
        expect(sourceWordOutlines(model.contents[0]?.pages[0])).toEqual([]);
        expect(model.issues.map(issue => issue.code)).toEqual(["invalid-source", "source-out-of-bounds", "source-page-mismatch", "missing-source-page"]);
        expect(model.issues.every(issue => issue.path.startsWith("/result/contents/0/pages/0/words/"))).toBe(true);
        expect(model.contents[0]?.pages[0]?.words?.map(word => word.content)).toEqual(["Bad", "Outside", "Wrong page", "Missing page"]);
    });

    it("uses the first word source region, matching Studio, and groups identical polygons only once", () => {
        const model = parseCuResult(result([
            { content: "First", source: "D(1,10,20,30,10);D(1,50,50,20,10)" },
            { content: "Duplicate", confidence: 0.99, source: "D(1,10,20,40,20,40,30,10,30)" },
        ]));
        const outlines = sourceWordOutlines(model.contents[0]?.pages[0]);
        expect(outlines).toHaveLength(1);
        expect(outlines[0]?.key).toBe("/contents/0/pages/0/words/0");
        expect(outlines[0]?.region.polygon[2]).toEqual({ x: 40, y: 30 });
        expect(model.issues).toEqual([]);
    });

    it("requires verified units and dimensions rather than fabricating a yellow region", () => {
        const raw = result([{ content: "Geometry unavailable", source: "D(1,10,20,30,10)" }]);
        const page = raw.contents[0]?.pages[0];
        if (!page) throw new Error("Expected the first page.");
        page.width = 0;
        page.height = 0;
        const model = parseCuResult(raw);
        expect(model.issues.map(issue => issue.code)).toEqual(["invalid-page-dimensions", "unavailable-source-geometry"]);
        expect(sourceWordOutlines(model.contents[0]?.pages[0])).toEqual([]);
    });

    it.each([
        ["mixed-financial-docs", [197, 95, 106, 140]],
        ["receipt", [39]],
    ] as const)("maps every saved %s page word without adding warnings or changing input", (filename, counts) => {
        const raw: unknown = JSON.parse(readFileSync(resolve("tests", "fixtures", `${filename}.cu.json`), "utf8"));
        const before = JSON.stringify(raw);
        const model = parseCuResult(raw);
        const pages = model.contents[0]?.pages;
        expect(pages?.map(page => page.words?.length)).toEqual(counts);
        expect(pages?.map(page => sourceWordOutlines(page).length)).toEqual(counts);
        expect(model.issues).toEqual([]);
        expect(model.original).toBe(raw);
        expect(JSON.stringify(raw)).toBe(before);
    });
});
