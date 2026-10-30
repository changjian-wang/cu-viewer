import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

const SOURCE_READY_TIMEOUT_MS = 15000;

export async function ready(page: Page): Promise<void> {
    await expect(page.getByRole("group", { name: "Source viewport", exact: true }))
        .toHaveAttribute("aria-disabled", "false", { timeout: SOURCE_READY_TIMEOUT_MS });
    await expect(page.getByTestId("rendered-page")).toBeVisible({ timeout: SOURCE_READY_TIMEOUT_MS });
    await expect(page.getByRole("alert")).toHaveCount(0);
}

export async function fitSource(page: Page, mode: "page" | "width"): Promise<void> {
    await page.getByRole("combobox", { name: "Zoom", exact: true }).selectOption(mode);
    await ready(page);
}

export async function locateGroup(page: Page, fieldId: string): Promise<void> {
    const row = page.locator(`.cu-fields-table > tbody > tr[data-field-id="${fieldId}"]`);
    await row.hover();
    await row.locator(".cu-page-badge").click();
}

export async function expandField(page: Page, name: string): Promise<void> {
    const button = page.getByRole("button", { name, exact: true });
    await expect(button).toHaveAttribute("aria-expanded", /^(true|false)$/);
    if (await button.getAttribute("aria-expanded") === "false") await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
}

export async function rotateSource(page: Page): Promise<void> {
    await page.getByRole("button", { name: "Rotate 90°", exact: true }).click();
    await ready(page);
}

export async function selectResultView(pane: Locator, name: string): Promise<void> {
    const tab = pane.getByRole("tab", { name, exact: true });
    if (await tab.isVisible()) await tab.click();
    else {
        const more = pane.getByRole("button", { name: "More result views", exact: true });
        if (await more.getAttribute("aria-expanded") !== "true") await more.click();
        await pane.getByRole("menuitem", { name, exact: true }).click();
    }
    await expect(tab).toHaveAttribute("aria-selected", "true");
}

export async function checkPolygon(page: Page, normalized: { x: number; y: number }[], rotation: number,
    polygon: Locator = page.getByTestId("source-overlay").locator("polygon")): Promise<void> {
    const coordinates = await polygon.evaluate(element => {
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
