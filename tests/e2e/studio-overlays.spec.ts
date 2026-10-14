import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { checkPolygon, ready } from "./viewerAssertions";

async function synthetic(page: Page): Promise<void> {
    await page.getByLabel("Choose source file").setInputFiles(resolve("tests", "fixtures", "images", "orientation-marker.png"));
    await ready(page);
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "synthetic-studio-overlay.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({
            apiVersion: "2025-11-01", contents: [{
                kind: "document", unit: "pixel", pages: [{ pageNumber: 1, width: 96, height: 64 }],
                markdown: "# Synthetic overlay fixture",
                fields: {
                    Zero: { type: "integer", valueInteger: 0, confidence: 0, source: "D(1,5,5,20,8)" },
                    Address: { type: "string", valueString: "Returned address", source: "D(1,30,14,30,5)" },
                    Group: { type: "object", valueObject: {
                        Child: { type: "string", valueString: "Nested", source: "D(1,60,30,20,6)" },
                    } },
                    Ungrounded: { type: "string", valueString: "No invented source" },
                    Missing: { type: "string", source: "D(1,5,50,20,5)" },
                },
                paragraphs: [{ content: "First returned paragraph", role: "title", source: "D(1,5,5,25,12)" },
                    { content: "Second returned paragraph", source: "D(1,40,20,40,20)" }],
                tables: [
                    { rowCount: 1, columnCount: 1, source: "D(1,5,30,30,25)",
                        cells: [{ rowIndex: 0, columnIndex: 0, content: "First table", source: "D(1,5,30,10,5)" }] },
                    { rowCount: 1, columnCount: 1, source: "D(1,45,35,40,20)",
                        cells: [{ rowIndex: 0, columnIndex: 0, content: "Second table", source: "D(1,45,35,10,5)" }] },
                ],
            }],
        })),
    });
}

async function withinViewport(page: Page, popup: Locator): Promise<void> {
    const layout = await popup.boundingBox();
    const viewport = await page.getByRole("group", { name: "Source viewport", exact: true }).boundingBox();
    if (!layout || !viewport) throw new Error("Source preview layout is unavailable.");
    expect(layout.x).toBeGreaterThanOrEqual(viewport.x);
    expect(layout.y).toBeGreaterThanOrEqual(viewport.y);
    expect(layout.x + layout.width).toBeLessThanOrEqual(viewport.x + viewport.width);
    expect(layout.y + layout.height).toBeLessThanOrEqual(viewport.y + viewport.height);
}

test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await ready(page);
});

test("active tabs switch complete current-page outlines, retain table markers and preserve source state", async ({ page }) => {
    await synthetic(page);
    const pane = page.getByRole("region", { name: "Extraction results" });
    const outlines = page.getByTestId("result-overlay");
    await expect(outlines).toHaveAttribute("data-result-view", "fields");
    await expect(outlines.locator("polygon")).toHaveCount(3);
    expect(await outlines.locator("polygon").evaluateAll(elements => elements.map(element => element.getAttribute("stroke"))))
        .toEqual(["#d13438", "#ffaa44", "#8cbd18"]);
    await expect(page.getByTestId("table-markers").getByRole("button")).toHaveCount(2);
    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
    await pane.getByRole("button", { name: "Zero", exact: true }).press("Enter");
    const paper = await page.getByTestId("rendered-page").boundingBox();
    const zoom = await page.getByLabel("Zoom percentage").textContent();
    if (!paper || zoom === null) throw new Error("Source state is unavailable.");
    await pane.getByRole("tab", { name: "Markdown", exact: true }).click();
    await expect(pane.getByRole("heading", { name: "Synthetic overlay fixture" })).toBeVisible();
    await expect(outlines).toHaveCount(0);
    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
    await expect(page.getByTestId("table-markers").getByRole("button")).toHaveCount(2);
    await pane.getByRole("tab", { name: "Paragraphs", exact: true }).click();
    await expect(outlines).toHaveAttribute("data-result-view", "paragraphs");
    await expect(outlines.locator("polygon")).toHaveCount(2);
    expect(await outlines.locator("polygon").evaluateAll(elements => elements.map(element => element.getAttribute("stroke"))))
        .toEqual(["#0078d4", "#0078d4"]);
    await pane.getByRole("tab", { name: "Tables", exact: true }).click();
    await expect(outlines).toHaveAttribute("data-result-view", "tables");
    await expect(outlines.locator("polygon")).toHaveCount(2);
    await expect(pane.getByRole("table")).toHaveCount(1);
    await expect(pane.locator(".cu-table-navigation")).toContainText("1 of 2");
    await checkPolygon(page, [{ x: 5 / 96, y: 30 / 64 }, { x: 35 / 96, y: 30 / 64 },
        { x: 35 / 96, y: 55 / 64 }, { x: 5 / 96, y: 55 / 64 }], 0,
    outlines.locator('[data-outline-id="/contents/0/tables/0"]'));
    await pane.getByRole("tab", { name: "Result", exact: true }).click();
    await expect(pane.getByRole("tree", { name: "Original Analyze result JSON" })).toBeVisible();
    await expect(outlines).toHaveCount(0);
    await expect(page.getByTestId("table-markers")).toHaveCount(0);
    await pane.getByRole("tab", { name: "Fields", exact: true }).click();
    await expect(pane.getByRole("button", { name: "Zero", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Zoom percentage")).toHaveText(zoom);
    expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(paper);
    await pane.getByRole("switch", { name: "Hide missing fields" }).click();
    await expect(outlines.locator("polygon")).toHaveCount(4);
});

test("right-side field hover opens a source-anchored value/confidence preview without changing selection or hiding other boxes", async ({ page }) => {
    await synthetic(page);
    const zero = page.getByRole("button", { name: "Zero", exact: true });
    await page.locator(".prototype-banner").click();
    const before = await page.getByTestId("rendered-page").boundingBox();
    await zero.hover();
    const popup = page.getByRole("tooltip", { name: "Field preview", exact: true });
    await expect(popup).toBeVisible();
    await expect(popup.locator("dt")).toHaveText(["Value", "Confidence"]);
    await expect(popup.locator("dd")).toHaveText(["0", "0.00%"]);
    await expect(popup.locator(".cu-popover-heading")).toHaveText("Zero");
    await expect(zero).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("result-overlay").locator("polygon")).toHaveCount(3);
    expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(before);
    await withinViewport(page, popup);
    const target = await page.getByTestId("source-overlay").locator("polygon").boundingBox();
    const box = await popup.boundingBox();
    if (!target || !box) throw new Error("Source preview anchor bounds are unavailable.");
    expect(box.x + box.width <= target.x || box.x >= target.x + target.width ||
        box.y + box.height <= target.y || box.y >= target.y + target.height).toBe(true);
    await popup.hover();
    await page.waitForTimeout(200);
    await expect(popup).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(popup).toHaveCount(0);
    await page.getByRole("button", { name: "Address", exact: true }).hover();
    await expect(popup.locator("dt")).toHaveText(["Value"]);
    await expect(popup.locator("dd")).toHaveText(["Returned address"]);
    await page.getByRole("button", { name: "Ungrounded", exact: true }).hover();
    await expect(popup).toHaveCount(0);
    await expect(page.locator(".cu-preview-hint")).toContainText("no source region");
});

test("paragraph hover and focus show only Content, preserve pinning and dismiss on exit, Escape or tab changes", async ({ page }) => {
    await synthetic(page);
    const pane = page.getByRole("region", { name: "Extraction results" });
    await pane.getByRole("tab", { name: "Paragraphs", exact: true }).click();
    const paragraph = pane.getByRole("button", { name: "Select Paragraph 1", exact: true });
    const second = pane.getByRole("button", { name: "Select Paragraph 2", exact: true });
    await paragraph.press("Enter");
    await page.locator(".prototype-banner").click();
    await second.hover();
    const popup = page.getByRole("tooltip", { name: "Paragraph preview", exact: true });
    await expect(popup.locator("dt")).toHaveText(["Content"]);
    await expect(popup.locator("dd")).toHaveText(["Second returned paragraph"]);
    await expect(second).toHaveClass(/is-hovered/);
    await expect(paragraph).toHaveAttribute("aria-pressed", "true");
    await expect(second).toHaveAttribute("aria-pressed", "false");
    await withinViewport(page, popup);
    await page.locator(".prototype-banner").hover();
    await expect(popup).toHaveCount(0);
    await expect(paragraph).toHaveAttribute("aria-pressed", "true");
    await second.focus();
    await expect(popup).toBeVisible();
    await expect(second).toHaveAccessibleDescription(/Second returned paragraph.*Page 1/);
    await page.locator(".prototype-banner").hover();
    await expect(popup).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(popup).toHaveCount(0);
    await pane.getByRole("tab", { name: "Markdown", exact: true }).click();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await expect(page.getByTestId("result-overlay")).toHaveCount(0);
});

test("long returned preview text scrolls inside a bounded popover without expanding the page or covering its target", async ({ page }) => {
    await synthetic(page);
    const text = "Returned value. ".repeat(800);
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "synthetic-long-preview.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({
            apiVersion: "2025-11-01", contents: [{ kind: "document", unit: "pixel",
                pages: [{ pageNumber: 1, width: 96, height: 64 }],
                fields: { Long: { type: "string", valueString: text, source: "D(1,40,30,40,6)" } } }],
        })),
    });
    await page.locator(".prototype-banner").click();
    await page.getByRole("button", { name: "Long", exact: true }).hover();
    const popup = page.getByRole("tooltip", { name: "Field preview" });
    await expect(popup.locator("dd")).toHaveText(text);
    await withinViewport(page, popup);
    expect(await popup.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    const region = await page.getByTestId("source-overlay").locator("polygon").boundingBox();
    const bounds = await popup.boundingBox();
    if (!region || !bounds) throw new Error("Long preview bounds are unavailable.");
    expect(bounds.y + bounds.height <= region.y || bounds.y >= region.y + region.height ||
        bounds.x + bounds.width <= region.x || bounds.x >= region.x + region.width).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(1000);
    await popup.hover();
    await popup.evaluate(element => { element.scrollTop = element.scrollHeight; });
    expect(await popup.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
    await expect(popup).toHaveCount(0);
});

test("current-table navigation shows one native grid and locates whole-table source without changing zoom", async ({ page }) => {
    await synthetic(page);
    const pane = page.getByRole("region", { name: "Extraction results" });
    await pane.getByRole("tab", { name: "Tables", exact: true }).click();
    const zoom = await page.getByLabel("Zoom percentage").textContent();
    if (zoom === null) throw new Error("Zoom is unavailable.");
    const next = pane.getByRole("button", { name: "Next table", exact: true });
    await next.focus();
    await page.keyboard.press("Enter");
    await expect(pane.getByRole("table", { name: "Returned table 2" })).toBeVisible();
    await expect(pane.getByRole("table")).toHaveCount(1);
    await expect(pane.getByRole("button", { name: "Previous table", exact: true })).toBeFocused();
    await expect(pane.locator(".cu-table-navigation")).toContainText("2 of 2");
    await expect(page.getByTestId("result-overlay").locator("polygon")).toHaveCount(2);
    await checkPolygon(page, [{ x: 45 / 96, y: 35 / 64 }, { x: 85 / 96, y: 35 / 64 },
        { x: 85 / 96, y: 55 / 64 }, { x: 45 / 96, y: 55 / 64 }], 0);
    await pane.getByRole("tab", { name: "Markdown", exact: true }).click();
    await pane.getByRole("tab", { name: "Tables", exact: true }).click();
    await expect(pane.locator(".cu-table-navigation")).toContainText("2 of 2");
    await expect(page.getByLabel("Zoom percentage")).toHaveText(zoom);
});

test("returning to the same zoom redraws tilted CU outlines without retaining the previous scale's raster cache", async ({ page }) => {
    await page.getByRole("button", { name: "Expand AmountDue", exact: true }).click();
    await page.getByRole("button", { name: "Amount", exact: true }).click();
    await page.locator(".prototype-banner").click({ position: { x: 10, y: 10 } });
    const frame = page.getByTestId("result-overlay");
    const points = await frame.locator('[data-outline-id="/contents/0/fields/ServiceAddress"]').first().getAttribute("points");
    const before = await frame.screenshot();
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await ready(page);
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    await ready(page);
    await page.getByRole("button", { name: "Fit page", exact: true }).click();
    for (let turn = 0; turn < 4; turn++) {
        await page.getByRole("button", { name: "Rotate 90°", exact: true }).click();
        await ready(page);
        await page.getByRole("button", { name: "Fit width", exact: true }).click();
        await ready(page);
        await page.getByRole("button", { name: "Fit page", exact: true }).click();
        await ready(page);
    }
    await page.locator(".prototype-banner").click({ position: { x: 10, y: 10 } });
    expect(await frame.locator('[data-outline-id="/contents/0/fields/ServiceAddress"]').first().getAttribute("points")).toBe(points);
    expect(Buffer.compare(before, await frame.screenshot())).toBe(0);
});

test.describe("Studio outlines at DPR 2", () => {
    test.use({ deviceScaleFactor: 2 });
    test("whole-page boxes align through all rotations and previews remain inside resized/scrolled viewports", async ({ page }) => {
        await synthetic(page);
        const field = page.getByRole("button", { name: "Address", exact: true });
        const polygon = page.getByTestId("result-overlay").locator('[data-outline-id="/contents/0/fields/Address"]');
        for (let rotation = 0; rotation < 360; rotation += 90) {
            if (rotation) {
                await page.getByRole("button", { name: "Rotate 90°", exact: true }).click();
                await ready(page);
            }
            await checkPolygon(page, [{ x: 30 / 96, y: 14 / 64 }, { x: 60 / 96, y: 14 / 64 },
                { x: 60 / 96, y: 19 / 64 }, { x: 30 / 96, y: 19 / 64 }], rotation, polygon);
            await field.hover();
            const popup = page.getByRole("tooltip", { name: "Field preview" });
            await expect(popup).toBeVisible();
            await withinViewport(page, popup);
            await page.setViewportSize({ width: 1100, height: 800 });
            await ready(page);
            await expect(popup).toBeVisible();
            await withinViewport(page, popup);
            await page.locator(".prototype-banner").hover();
            await expect(popup).toHaveCount(0);
        }
        await page.getByRole("button", { name: "Zoom in", exact: true }).click();
        await ready(page);
        await field.hover();
        await page.getByRole("group", { name: "Source viewport", exact: true }).evaluate(element => { element.scrollTop = 20; });
        const popup = page.getByRole("tooltip", { name: "Field preview" });
        await expect(popup).toBeVisible();
        await withinViewport(page, popup);
        await page.getByRole("group", { name: "Source viewport", exact: true }).focus();
        await page.keyboard.press("ArrowRight");
        await expect(popup).toHaveCount(0);
    });
});
