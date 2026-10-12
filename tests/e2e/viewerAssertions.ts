import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

export async function ready(page: Page): Promise<void> {
    await expect(page.getByRole("button", { name: "Zoom in", exact: true })).toBeEnabled();
    await expect(page.getByTestId("rendered-page")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
}

export async function checkPolygon(page: Page, normalized: { x: number; y: number }[], rotation: number): Promise<void> {
    const coordinates = await page.getByTestId("source-overlay").locator("polygon").evaluate(element => {
        if (!(element instanceof SVGPolygonElement)) throw new Error("Expected a rendered SVG polygon.");
        const polygon = element;
        const matrix = polygon.getScreenCTM();
        if (!matrix) throw new Error("Rendered polygon has no screen transform.");
        const bounds = polygon.parentElement?.parentElement?.getBoundingClientRect();
        if (!bounds) throw new Error("The source canvas frame is unavailable.");
        return {
            bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
            points: Array.from({ length: polygon.points.numberOfItems }, (_, index) => {
                const point = polygon.points.getItem(index);
                const result = new DOMPoint(point.x, point.y).matrixTransform(matrix);
                return { x: result.x - bounds.x, y: result.y - bounds.y };
            }),
        };
    });
    for (const [index, point] of normalized.entries()) {
        const actual = coordinates.points[index];
        if (!actual) throw new Error("Missing projected point.");
        const { width, height } = coordinates.bounds;
        const expected = rotation === 0 ? { x: point.x * width, y: point.y * height } :
            rotation === 90 ? { x: (1 - point.y) * width, y: point.x * height } :
                rotation === 180 ? { x: (1 - point.x) * width, y: (1 - point.y) * height } :
                    { x: point.y * width, y: (1 - point.x) * height };
        expect(Math.hypot(actual.x - expected.x, actual.y - expected.y)).toBeLessThanOrEqual(1);
    }
}
