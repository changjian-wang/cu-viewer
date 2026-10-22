import { describe, expect, it } from "vitest";
import { createPageGeometry, GeometryError, getRevealOffset, projectRegion } from "./geometry";
import type { CuRegion } from "../model/types";

describe("conditional source viewport reveal", () => {
    const viewport = { width: 400, height: 300 };
    it("does not move a region already fully visible, including exact viewport edges", () => {
        expect(getRevealOffset([{ x: 10, y: 20 }, { x: 390, y: 280 }], viewport)).toEqual({ x: 0, y: 0 });
        expect(getRevealOffset([{ x: 0, y: 0 }, { x: 400, y: 300 }], viewport)).toEqual({ x: 0, y: 0 });
    });

    it("centers only the axis outside the viewport", () => {
        expect(getRevealOffset([{ x: 420, y: 20 }, { x: 460, y: 60 }], viewport)).toEqual({ x: -240, y: 0 });
        expect(getRevealOffset([{ x: 10, y: -40 }, { x: 50, y: -20 }], viewport)).toEqual({ x: 0, y: 180 });
        expect(getRevealOffset([{ x: -60, y: 350 }, { x: -20, y: 390 }], viewport)).toEqual({ x: 240, y: -220 });
    });

    it("centers oversized regions without inventing a fit or zoom change", () => {
        expect(getRevealOffset([{ x: -100, y: -50 }, { x: 700, y: 450 }], viewport)).toEqual({ x: -100, y: -50 });
        expect(getRevealOffset([{ x: -100, y: -50 }, { x: 500, y: 350 }], viewport)).toEqual({ x: 0, y: 0 });
    });

    it("handles large region collections without spreading points into function arguments", () => {
        const points = Array.from({ length: 150_000 }, (_, index) => ({ x: 420 + index % 40, y: 20 }));
        expect(getRevealOffset(points, viewport)).toEqual({ x: -239.5, y: 0 });
    });

    it.each([0, 90, 180, 270])("uses projected quarter-turn coordinates at rotation %s", rotation => {
        const region: CuRegion = { pageNumber: 1, polygon: [{ x: 10, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 40 }, { x: 10, y: 40 }] };
        const geometry = createPageGeometry({ pageNumber: 1, width: 100, height: 100 },
            { width: 400, height: 400 }, { zoom: 2, rotation, pan: { x: 0, y: 0 } });
        const projected = projectRegion(region, geometry).polygon.map(point => ({ x: point.x - 1200, y: point.y - 1200 }));
        const offset = getRevealOffset(projected, viewport);
        const revealed = projected.map(point => ({ x: point.x + offset.x, y: point.y + offset.y }));
        expect((Math.min(...revealed.map(point => point.x)) + Math.max(...revealed.map(point => point.x))) / 2).toBe(200);
        expect((Math.min(...revealed.map(point => point.y)) + Math.max(...revealed.map(point => point.y))) / 2).toBe(150);
        expect(geometry.displaySize).toEqual({ width: 800, height: 800 });
    });

    it("rejects absent regions, nonfinite points and invalid viewport sizes explicitly", () => {
        expect(() => getRevealOffset([], viewport)).toThrow(GeometryError);
        expect(() => getRevealOffset([{ x: NaN, y: 0 }], viewport)).toThrow(GeometryError);
        expect(() => getRevealOffset([{ x: 0, y: 0 }], { width: 0, height: 10 })).toThrow(GeometryError);
    });
});
