import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createPageGeometry, GeometryError, getFitZoom, getRasterSize, getScrollablePageLayout, projectRegion, transformPoint, validateRegion } from "./geometry";
import { parseCuResult } from "../model/parseCuResult";
import type { CuPage, CuPoint, CuRegion } from "../model/types";

const defaultView = { zoom: 1, rotation: 0, pan: { x: 0, y: 0 } };
const page: CuPage = { pageNumber: 1, width: 4, height: 6 };
const sourceSize = { width: 400, height: 600 };
const region: CuRegion = {
    pageNumber: 1,
    polygon: [{ x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 3 }, { x: 1, y: 3 }],
};

function first<T>(values: readonly T[]): T {
    const value = values[0];
    if (value === undefined) throw new Error("Expected a test value.");
    return value;
}

function near(actual: CuPoint, expected: CuPoint, tolerance = 1): void {
    expect(Math.hypot(actual.x - expected.x, actual.y - expected.y)).toBeLessThanOrEqual(tolerance);
}

function manualProjection(point: CuPoint, size: { width: number; height: number }, angle: number, pan: CuPoint): CuPoint {
    const x = point.x;
    const y = point.y;
    if (angle === 0) return { x: x + pan.x, y: y + pan.y };
    if (angle === 90) return { x: size.height - y + pan.x, y: x + pan.y };
    if (angle === 180) return { x: size.width - x + pan.x, y: size.height - y + pan.y };
    return { x: y + pan.x, y: size.width - x + pan.y };
}

describe("page-aware affine geometry", () => {
    it.each([
        [0, { x: 100, y: 200 }, { width: 400, height: 600 }],
        [90, { x: 400, y: 100 }, { width: 600, height: 400 }],
        [180, { x: 300, y: 400 }, { width: 400, height: 600 }],
        [270, { x: 200, y: 300 }, { width: 600, height: 400 }],
    ] as const)("matches independently hand-derived coordinates at %i degrees", (angle, expected, displaySize) => {
        const geometry = createPageGeometry(page, sourceSize, { ...defaultView, rotation: angle });

        expect(transformPoint(geometry.matrix, { x: 1, y: 2 })).toEqual(expected);
        expect(geometry.displaySize).toEqual(displaySize);
        near(transformPoint(geometry.inverse, expected), { x: 1, y: 2 }, 1e-10);
    });

    it.each([
        [0, { x: 215, y: 391 }],
        [90, { x: 815, y: 191 }],
        [180, { x: 615, y: 791 }],
        [270, { x: 415, y: 591 }],
    ] as const)("keeps zoom and pan in CSS space at %i degrees", (angle, expected) => {
        const geometry = createPageGeometry(page, sourceSize, { zoom: 2, rotation: angle, pan: { x: 15, y: -9 } });

        expect(transformPoint(geometry.matrix, { x: 1, y: 2 })).toEqual(expected);
        near(transformPoint(geometry.inverse, expected), { x: 1, y: 2 }, 1e-10);
    });

    it("normalizes clockwise/negative rotations without using the CU text angle", () => {
        const withTextAngle = { ...page, textAngle: 35 };

        expect(createPageGeometry(withTextAngle, sourceSize, { ...defaultView, rotation: -90 }).matrix)
            .toEqual(createPageGeometry(page, sourceSize, { ...defaultView, rotation: 270 }).matrix);
        expect(createPageGeometry(page, sourceSize, { ...defaultView, rotation: 450 }).matrix)
            .toEqual(createPageGeometry(page, sourceSize, { ...defaultView, rotation: 90 }).matrix);
        expect(createPageGeometry(withTextAngle, sourceSize, defaultView).matrix)
            .toEqual(createPageGeometry(page, sourceSize, defaultView).matrix);
    });

    it("projects a region without changing its page or mutating its points", () => {
        const before = structuredClone(region);
        const geometry = createPageGeometry(page, sourceSize, defaultView);
        const projected = projectRegion(region, geometry);

        expect(projected).toEqual({
            pageNumber: 1,
            polygon: [{ x: 100, y: 200 }, { x: 200, y: 200 }, { x: 200, y: 300 }, { x: 100, y: 300 }],
        });
        expect(region).toEqual(before);
        expect(projected.polygon).not.toBe(region.polygon);
    });

    it("preserves the real A4 dimension mismatch regression at 4x instead of assuming 72 points per CU inch", () => {
        const cuPage: CuPage = { pageNumber: 4, width: 8.2639, height: 11.6806 };
        const rendered = { width: 595.275591 * (4 / 3), height: 841.889764 * (4 / 3) };
        const geometry = createPageGeometry(cuPage, rendered, { ...defaultView, zoom: 4 });
        const corner = transformPoint(geometry.matrix, { x: 8.2639, y: 11.6806 });

        near(corner, { x: 3174.803152, y: 841.889764 * (16 / 3) }, 1e-9);
        expect(Math.abs(11.6806 * 96 * 4 - corner.y)).toBeGreaterThan(4.7);
    });
});

describe("real CU fixture transformation matrix", () => {
    const scenarios = [
        { name: "pdf", filename: "mixed-financial-docs.cu.json", id: "/contents/0/fields/AmountDue/valueObject/Amount", width: 816, height: 1056 },
        { name: "png", filename: "receipt.cu.json", id: "/contents/0/fields/MerchantName", width: 1743, height: 878 },
    ];
    const cases = scenarios.flatMap(scenario =>
        [0.5, 1, 2, 4].flatMap(zoom =>
            [0, 90, 180, 270].flatMap(angle =>
                [1, 0.75].flatMap(resize =>
                    [{ x: 0, y: 0 }, { x: 37, y: -21 }].flatMap(pan =>
                        [1, 2].map(dpr => ({ ...scenario, zoom, angle, resize, pan, dpr })),
                    ),
                ),
            ),
        ),
    );

    it.each(cases)("$name zoom=$zoom rotation=$angle resize=$resize DPR=$dpr pan=$pan", testCase => {
        const raw: unknown = JSON.parse(readFileSync(resolve("tests", "fixtures", testCase.filename), "utf8"));
        const model = parseCuResult(raw);
        const content = first(model.contents);
        const stack = content.fields.slice();
        let field;
        while (stack.length > 0) {
            const current = stack.pop();
            if (!current) break;
            if (current.id === testCase.id) {
                field = current;
                break;
            }
            stack.push(...current.children);
        }
        if (!field) throw new Error("A real source field is missing.");
        const sourceRegion = first(field.regions);
        const cuPage = content.pages.find(value => value.pageNumber === sourceRegion.pageNumber);
        if (!cuPage || cuPage.width === undefined || cuPage.height === undefined) throw new Error("Real page dimensions are missing.");
        const native = { width: testCase.width * testCase.resize, height: testCase.height * testCase.resize };
        const geometry = createPageGeometry(cuPage, native, {
            zoom: testCase.zoom, rotation: testCase.angle, pan: testCase.pan,
        });
        const projected = projectRegion(sourceRegion, geometry);
        for (const [index, cuPoint] of sourceRegion.polygon.entries()) {
            const actual = projected.polygon[index];
            if (!actual) throw new Error("Projected vertex is missing.");
            const independent = manualProjection({
                x: cuPoint.x / cuPage.width * native.width * testCase.zoom,
                y: cuPoint.y / cuPage.height * native.height * testCase.zoom,
            }, { width: native.width * testCase.zoom, height: native.height * testCase.zoom }, testCase.angle, testCase.pan);
            near(actual, independent);
            near(transformPoint(geometry.inverse, actual), cuPoint, 1e-9);
        }
        expect(getRasterSize(geometry.displaySize, testCase.dpr)).toEqual({
            width: Math.ceil(geometry.displaySize.width * testCase.dpr),
            height: Math.ceil(geometry.displaySize.height * testCase.dpr),
        });
    });
});

describe("scroll-safe page placement", () => {
    it("keeps the existing centered horizontal inset and top inset without a positioned camera", () => {
        expect(getScrollablePageLayout({ width: 200, height: 400 }, { width: 800, height: 600 }, null)).toEqual({
            paper: { x: 300, y: 30 }, scroll: { x: 0, y: 0 }, stage: { width: 800, height: 600 },
        });
    });

    it("represents the reported negative zoom offset as native scroll, not a clipped page", () => {
        expect(getScrollablePageLayout({ width: 1224, height: 1584 }, { width: 555, height: 678 },
            { x: -327, y: -445.5 })).toEqual({
            paper: { x: 0, y: 0.5 }, scroll: { x: 327, y: 446 }, stage: { width: 1288, height: 1644 },
        });
    });

    it.each([{ x: -900, y: -800 }, { x: 900, y: 800 }, { x: -37, y: 21 }, { x: 37, y: -21 },
        { x: -327.123456, y: 445.56789 }])(
        "keeps every page edge and requested camera position reachable at $x,$y", position => {
            for (const display of [{ width: 200, height: 100 }, { width: 1224, height: 1584 }]) {
                for (const viewport of [{ width: 570, height: 540 }, { width: 1040, height: 900 }]) {
                    const layout = getScrollablePageLayout(display, viewport, position, 120);
                    expect(layout.paper.x).toBeGreaterThanOrEqual(0);
                    expect(layout.paper.y).toBeGreaterThanOrEqual(0);
                    expect(layout.paper.x + display.width).toBeLessThanOrEqual(layout.stage.width);
                    expect(layout.paper.y + display.height + 120).toBeLessThanOrEqual(layout.stage.height);
                    expect(layout.scroll.x).toBeLessThanOrEqual(layout.stage.width - viewport.width);
                    expect(layout.scroll.y).toBeLessThanOrEqual(layout.stage.height - viewport.height);
                    expect(layout.paper.x - layout.scroll.x).toBe(position.x);
                    expect(layout.paper.y - layout.scroll.y).toBe(position.y);
                }
            }
        });

    it("does not shift an explicit camera when native scrollbars change available space", () => {
        const position = { x: 42, y: -51 }, display = { width: 800, height: 1000 };
        const before = getScrollablePageLayout(display, { width: 570, height: 700 }, position);
        const after = getScrollablePageLayout(display, { width: 555, height: 685 }, position);
        expect(after.paper).toEqual(before.paper);
        expect(after.scroll).toEqual(before.scroll);
    });

    it("keeps required scroll space independent from disappearing cross-axis scrollbars", () => {
        const display = { width: 528, height: 408 }, frame = { width: 1039.359375, height: 719 };
        const position = { x: 61.7744, y: -4.8334 };
        const withBars = getScrollablePageLayout(display, { width: 1024.359375, height: 704 }, position, 0, frame);
        const withoutBars = getScrollablePageLayout(display, frame, position, 0, frame);
        expect(withBars.stage.height).toBe(724);
        expect(withoutBars.stage.height).toBe(724);
        expect(withBars.paper).toEqual(withoutBars.paper);
        expect(withBars.scroll).toEqual(withoutBars.scroll);
    });

    it("supports the empty initial source frame and rejects invalid layout coordinates", () => {
        expect(getScrollablePageLayout({ width: 0, height: 0 }, { width: 570, height: 700 }, null).stage)
            .toEqual({ width: 570, height: 700 });
        expect(() => getScrollablePageLayout({ width: -1, height: 10 }, sourceSize, null)).toThrow(GeometryError);
        expect(() => getScrollablePageLayout(sourceSize, sourceSize, { x: NaN, y: 0 })).toThrow(GeometryError);
        expect(() => getScrollablePageLayout(sourceSize, sourceSize, null, -1)).toThrow(GeometryError);
    });
});

describe("fit, raster and explicit geometry errors", () => {
    it("fits the rotated page into an available viewport without clamping zoom", () => {
        const source = { width: 100, height: 200 };

        expect(getFitZoom(source, { width: 300, height: 300 }, 0, "page")).toBe(1.5);
        expect(getFitZoom(source, { width: 300, height: 300 }, 0, "width")).toBe(3);
        expect(getFitZoom(source, { width: 300, height: 100 }, 90, "page")).toBe(1);
        expect(getFitZoom(source, { width: 300, height: 100 }, 90, "width")).toBe(1.5);
    });

    it("uses backing pixels independently from overlay CSS pixels", () => {
        const geometry = createPageGeometry(page, sourceSize, defaultView);
        const projected = projectRegion(region, geometry);

        expect(getRasterSize(geometry.displaySize, 1)).toEqual({ width: 400, height: 600 });
        expect(getRasterSize(geometry.displaySize, 2)).toEqual({ width: 800, height: 1200 });
        expect(getRasterSize({ width: 100.1, height: 200.1 }, 1.5)).toEqual({ width: 151, height: 301 });
        expect(projectRegion(region, geometry)).toEqual(projected);
    });

    it.each([undefined, 0, -1, NaN, Infinity])("rejects missing or invalid CU dimensions %s", width => {
        const input: CuPage = { pageNumber: 1, height: 6 };
        if (width !== undefined) input.width = width;
        expect(() => createPageGeometry(input, sourceSize, defaultView)).toThrow(GeometryError);
    });

    it.each([0, -1, NaN, Infinity])("rejects invalid zoom %s", zoom => {
        expect(() => createPageGeometry(page, sourceSize, { ...defaultView, zoom })).toThrow(GeometryError);
    });

    it.each([1, 45, 90.5, NaN, Infinity])("rejects unsupported rotation %s", angle => {
        expect(() => createPageGeometry(page, sourceSize, { ...defaultView, rotation: angle })).toThrow(GeometryError);
    });

    it("rejects nonfinite pan, points and transforms instead of producing fake coordinates", () => {
        expect(() => createPageGeometry(page, sourceSize, { ...defaultView, pan: { x: NaN, y: 0 } })).toThrow(GeometryError);
        const geometry = createPageGeometry(page, sourceSize, defaultView);
        expect(() => transformPoint(geometry.matrix, { x: Infinity, y: 0 })).toThrow(GeometryError);
        expect(() => transformPoint({ ...geometry.matrix, a: NaN }, { x: 1, y: 1 })).toThrow(GeometryError);
        expect(() => createPageGeometry(page, sourceSize, { ...defaultView, zoom: Number.MIN_VALUE })).toThrow(GeometryError);
    });

    it("rejects mismatched pages, out-of-bounds polygons and degenerate regions", () => {
        expect(() => validateRegion({ ...region, pageNumber: 2 }, page)).toThrow(GeometryError);
        expect(() => validateRegion({ ...region, polygon: [
            { x: -1, y: 0 }, region.polygon[1], region.polygon[2], region.polygon[3],
        ] }, page)).toThrow(GeometryError);
        expect(() => validateRegion({ pageNumber: 1, polygon: [
            { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 4 },
        ] }, page)).toThrow(GeometryError);
    });

    it.each([0, -1, NaN, Infinity])("rejects invalid raster DPR %s", dpr => {
        expect(() => getRasterSize(sourceSize, dpr)).toThrow(GeometryError);
    });

    it("rejects invalid page numbers, raster sizes and empty available viewports", () => {
        expect(() => createPageGeometry({ ...page, pageNumber: 0 }, sourceSize, defaultView)).toThrow(GeometryError);
        expect(() => getRasterSize({ width: Number.MAX_VALUE, height: 1 }, 2)).toThrow(GeometryError);
        expect(() => getFitZoom(sourceSize, { width: 0, height: 100 }, 0, "page")).toThrow(GeometryError);
    });
});
