import { describe, expect, it } from "vitest";
import { parseCuResult } from "../model/parseCuResult";
import { defaultReviewSettings, defaultSourceCategories } from "../interaction/reviewFields";
import { popoverPosition, sourceOutlines, sourcePopoverPoints, sourceSelectionFrames, sourceWordOutlines, WORD_LAYER_COLOR } from "./sourceOverlays";

function fixture() {
    const original = {
        apiVersion: "2025-11-01", contents: [{
            kind: "document", unit: "pixel",
            pages: [{ pageNumber: 1, width: 100, height: 100 }, { pageNumber: 2, width: 100, height: 100 }],
            markdown: "Saved markdown",
            fields: {
                Name: { type: "string", valueString: "First", source: "D(1,1,2,10,5)" },
                Group: { type: "object", valueObject: {
                    Value: { type: "string", valueString: "Nested", source: "D(1,20,20,10,5);D(2,30,30,10,5)" },
                } },
                Missing: { type: "string", source: "D(1,40,40,10,5)" },
            },
            paragraphs: [{ content: "First paragraph", source: "D(1,1,2,60,10)" }, { content: "Second page", source: "D(2,1,2,60,10)" }],
            tables: [{ rowCount: 1, columnCount: 1, source: "D(1,10,50,60,30)", cells: [
                { rowIndex: 0, columnIndex: 0, content: "Cell", source: "D(1,10,50,10,10)" },
            ] }, { rowCount: 1, columnCount: 1, cells: [] }],
        }],
    };
    const content = parseCuResult(original).contents[0];
    if (!content) throw new Error("Expected overlay content.");
    return { content, original };
}

describe("Studio view-specific source outlines", () => {
    it("renders actual field regions including collapsed descendants without identity colors", () => {
        const { content, original } = fixture();
        const before = JSON.stringify(original);
        const outlines = sourceOutlines(content, "fields", 1, true);
        expect(outlines.map(item => item.field.name)).toEqual(["Name", "Value"]);
        expect(outlines.map(item => item.color)).toEqual(["#F1F3F5", "#F1F3F5"]);
        expect(sourceOutlines(content, "fields", 2, true).map(item => item.field.name)).toEqual(["Value"]);
        expect(JSON.stringify(original)).toBe(before);
    });

    it("keeps missing-field filtering in sync with the result pane", () => {
        const { content } = fixture();
        expect(sourceOutlines(content, "fields", 1, false).map(item => item.field.name)).toEqual(["Name", "Value", "Missing"]);
        const group = content.fields[1];
        if (!group) throw new Error("Expected a structured field.");
        group.hasValue = false;
        expect(sourceOutlines(content, "fields", 1, true).map(item => item.field.name)).toEqual(["Name"]);
    });

    it("hides only category fills while preserving all source geometry, keys and semantic colors", () => {
        const original = { apiVersion: "2025-11-01", contents: [{ kind: "document", unit: "pixel",
            pages: [{ pageNumber: 1, width: 100, height: 100 }], fields: {
                Normal: { type: "string", valueString: "normal", confidence: 0.9, source: "D(1,1,1,10,5)" },
                Zero: { type: "number", valueNumber: 0, confidence: 0, source: "D(1,20,1,10,5)" },
                Unknown: { type: "string", valueString: "unknown", source: "D(1,40,1,10,5)" },
                Rows: { type: "array", valueArray: [{ type: "object", valueObject: {
                    Normal: { type: "string", valueString: "normal table", confidence: 0.9, source: "D(1,1,30,10,5)" },
                    Low: { type: "string", valueString: "low table", confidence: 0.1, source: "D(1,20,30,10,5)" },
                } }] },
            } }] };
        const content = parseCuResult(original).contents[0];
        const before = JSON.stringify(original), baseline = sourceOutlines(content, "fields", 1, false);
        const categories = ["field", "lowField", "unavailable", "table", "lowTable"] as const;
        expect(baseline).toHaveLength(5);
        for (const category of categories) {
            const settings = { ...defaultReviewSettings, sourceCategories: { ...defaultSourceCategories, [category]: false } };
            const outlines = sourceOutlines(content, "fields", 1, false, settings);
            expect(outlines.map(item => item.enabled)).toEqual(categories.map(candidate => candidate !== category));
            expect(outlines.map(item => ({ ...item, enabled: true }))).toEqual(baseline);
        }
        expect(JSON.stringify(original)).toBe(before);
    });

    it("uses paragraph sources without adding raw native cells or tables to Fields", () => {
        const { content } = fixture();
        const paragraphs = sourceOutlines(content, "paragraphs", 1, true);
        expect(paragraphs.map(item => item.field.id)).toEqual(["/contents/0/paragraphs/0"]);
        expect(paragraphs[0]?.color).toBe("#F1F3F5");
        expect(sourceOutlines(content, "fields", 1, true).some(outline => outline.field.detailView === "tables")).toBe(false);
    });

    it.each(["markdown", "result", "metadata"] as const)("does not retain another tab's outlines in %s", view => {
        expect(sourceOutlines(fixture().content, view, 1, true)).toEqual([]);
    });

    it("does not invent sources for ungrounded or malformed tables", () => {
        const input = { apiVersion: "2025-11-01", contents: [{ kind: "document", unit: "pixel",
            pages: [{ pageNumber: 1, width: 100, height: 100 }],
            tables: [{ rowCount: 1, columnCount: 1, source: "bad", cells: [] }] }] };
        const model = parseCuResult(input);
        expect(sourceOutlines(model.contents[0], "fields", 1, true)).toEqual([]);
        expect(model.issues).toContainEqual(expect.objectContaining({ code: "invalid-source", path: "/contents/0/tables/0/source" }));
        expect(model.original).toBe(input);
    });
});

describe("multi-fragment source preview anchors", () => {
    const region = (regionIndex: number, x: number, y: number, width = 100, height = 10) => ({
        regionIndex, polygon: [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }],
    });

    it("anchors below the complete connected block regardless of source order or focused line", () => {
        const regions = [region(2, 20, 44), region(0, 20, 20), region(1, 25, 32)];
        const before = JSON.stringify(regions);
        for (const focused of [0, 1, 2]) expect(sourcePopoverPoints(regions, focused)).toEqual(regions.flatMap(item => item.polygon));
        expect(JSON.stringify(regions)).toBe(before);
    });

    it("keeps distant same-page occurrences local to the explicitly focused location", () => {
        const regions = [region(0, 20, 20), region(1, 20, 32), region(2, 400, 500)];
        expect(sourcePopoverPoints(regions, 0)).toEqual(regions.slice(0, 2).flatMap(item => item.polygon));
        expect(sourcePopoverPoints(regions, 2)).toEqual(regions[2]?.polygon);
    });

    it("joins nearby word fragments without joining a distant source on the same line", () => {
        const regions = [region(0, 20, 20), region(1, 125, 20), region(2, 400, 20)];
        expect(sourcePopoverPoints(regions, 1)).toEqual(regions.slice(0, 2).flatMap(item => item.polygon));
    });

    for (const scale of [0.25, 2]) {
        it.each([0, 90, 180, 270])(`keeps the same continuous block at zoom ${scale} and rotation %i`, rotation => {
            const regions = [region(0, 20, 20), region(1, 20, 32), region(2, 400, 500)].map(item => ({
                ...item, polygon: item.polygon.map(point => {
                    const x = point.x * scale, y = point.y * scale;
                    return rotation === 90 ? { x: -y, y: x } : rotation === 180 ? { x: -x, y: -y } :
                        rotation === 270 ? { x: y, y: -x } : { x, y };
                }),
            }));
            expect(sourcePopoverPoints(regions, 1)).toEqual(regions.slice(0, 2).flatMap(item => item.polygon));
        });
    }

    it("does not substitute another location when the focused source is on another page", () => {
        expect(sourcePopoverPoints([region(0, 20, 20)], 1)).toBeUndefined();
        expect(sourcePopoverPoints([], 0)).toBeUndefined();
    });

    it("rejects invalid source geometry instead of returning a fabricated anchor", () => {
        expect(() => sourcePopoverPoints([region(0, NaN, 20)], 0)).toThrow("finite");
        expect(() => sourcePopoverPoints([region(0, 20, 20, 0)], 0)).toThrow("positive");
    });

    describe("display-only selection frames", () => {
        it("uses one exact unpadded envelope without changing real source polygons or indices", () => {
            const regions = [region(0, 20, 20, 40), region(1, 20, 32)];
            const before = JSON.stringify(regions);
            expect(sourceSelectionFrames(regions, [])).toEqual([{
                regionIndices: [0, 1],
                polygon: [{ x: 20, y: 20 }, { x: 120, y: 20 }, { x: 120, y: 42 }, { x: 20, y: 42 }],
            }]);
            expect(JSON.stringify(regions)).toBe(before);
        });

        it("keeps distant local blocks separate instead of creating one large box", () => {
            const regions = [region(0, 20, 20), region(1, 20, 32), region(2, 400, 500), region(3, 400, 512)];
            expect(sourceSelectionFrames(regions, []).map(frame => frame.regionIndices)).toEqual([[0, 1], [2, 3]]);
        });

        it("does not enclose another field in the new blank corner of a multiline envelope", () => {
            const regions = [region(0, 20, 20, 40), region(1, 20, 32)];
            const blocker = region(0, 80, 22, 20, 8).polygon;
            expect(sourceSelectionFrames(regions, [blocker])).toEqual(regions.map(item => ({
                regionIndices: [item.regionIndex], polygon: item.polygon,
            })));
        });

        it("does not add padding toward a nearby recipient above the selected value", () => {
            const regions = [region(0, 20, 20), region(1, 20, 32)];
            const frames = sourceSelectionFrames(regions, [region(0, 20, 8, 100, 10).polygon]);
            expect(frames).toHaveLength(1);
            expect(frames[0]?.polygon[0]).toEqual({ x: 20, y: 20 });
        });

        it("does not merge nearby fragments from different columns or side-by-side sources", () => {
            for (const regions of [
                [region(0, 20, 20), region(1, 125, 32)],
                [region(0, 20, 20), region(1, 125, 20)],
            ]) expect(sourceSelectionFrames(regions, []).map(frame => frame.regionIndices)).toEqual([[0], [1]]);
        });

        for (const scale of [0.25, 2]) {
            it.each([0, 90, 180, 270])(`merges the same lines at zoom ${scale} and rotation %i`, rotation => {
                const regions = [region(0, 20, 20, 40), region(1, 20, 32)].map(item => ({
                    ...item, polygon: item.polygon.map(point => {
                        const x = point.x * scale, y = point.y * scale;
                        return rotation === 90 ? { x: -y, y: x } : rotation === 180 ? { x: -x, y: -y } :
                            rotation === 270 ? { x: y, y: -x } : { x, y };
                    }),
                }));
                const frames = sourceSelectionFrames(regions, []);
                expect(frames).toHaveLength(1);
                expect(frames[0]?.regionIndices).toEqual([0, 1]);
                const points = regions.flatMap(item => item.polygon);
                expect(frames[0]?.polygon).toEqual([
                    { x: Math.min(...points.map(point => point.x)), y: Math.min(...points.map(point => point.y)) },
                    { x: Math.max(...points.map(point => point.x)), y: Math.min(...points.map(point => point.y)) },
                    { x: Math.max(...points.map(point => point.x)), y: Math.max(...points.map(point => point.y)) },
                    { x: Math.min(...points.map(point => point.x)), y: Math.max(...points.map(point => point.y)) },
                ]);
            });
        }

        it("keeps a single source exact and rejects invalid geometry", () => {
            const single = region(4, 20, 20);
            expect(sourceSelectionFrames([single], [])).toEqual([{ regionIndices: [4], polygon: single.polygon }]);
            expect(sourceSelectionFrames([], [])).toEqual([]);
            expect(() => sourceSelectionFrames([region(0, NaN, 20)], [])).toThrow("finite");
        });
    });
});

describe("source-anchored preview placement", () => {
    const viewport = { width: 600, height: 400 }, popup = { width: 330, height: 100 };
    it("places the complete card below, aligned to the source left edge", () => {
        expect(popoverPosition({ x: 50, y: 200, width: 100, height: 20 }, viewport, popup)).toEqual({ x: 50, y: 232 });
    });

    describe("persistent OCR word layer", () => {
        it("uses the color verified in Studio code independently of field colors or selected tabs", () => {
            expect(WORD_LAYER_COLOR).toBe("#FAFF7F40");
            const content = fixture().content;
            const page = content.pages[0];
            if (!page) throw new Error("Expected the first page.");
            page.words = [{ id: "/contents/0/pages/0/words/0", content: "Not a field",
                region: { pageNumber: 1, polygon: [{ x: 1, y: 2 }, { x: 11, y: 2 }, { x: 11, y: 7 }, { x: 1, y: 7 }] } }];
            const before = sourceWordOutlines(page);
            content.fields = [];
            expect(sourceOutlines(content, "fields", 1, true)).toEqual([]);
            expect(sourceOutlines(content, "markdown", 1, false)).toEqual([]);
            expect(sourceWordOutlines(page)).toEqual(before);
            expect(sourceWordOutlines(content.pages[1])).toEqual([]);
        });
    });
    it("flips below at the top edge and clamps to the viewport", () => {
        expect(popoverPosition({ x: 500, y: 0, width: 50, height: 20 }, viewport, popup)).toEqual({ x: 262, y: 32 });
    });
    it("does not flip above or beside a source without enough below-value space", () => {
        expect(popoverPosition({ x: 0, y: 0, width: 100, height: 400 }, viewport, popup)).toBeNull();
    });
    it("absorbs browser subpixel rounding without clipping or overlapping the source", () => {
        expect(popoverPosition({ x: 50, y: 260.000004, width: 100, height: 20 }, viewport, popup)).toEqual({ x: 50, y: 292 });
    });
    it("does not display a preview anchored entirely outside the visible viewport", () => {
        expect(popoverPosition({ x: -200, y: 20, width: 100, height: 20 }, viewport, popup)).toBeNull();
    });
    it("rejects invalid layout instead of returning a successful position", () => {
        expect(() => popoverPosition({ x: NaN, y: 0, width: 10, height: 10 }, viewport, popup)).toThrow("finite");
        expect(() => popoverPosition({ x: 0, y: 0, width: 10, height: 10 }, { width: 0, height: 100 }, popup)).toThrow("finite");
    });
});
