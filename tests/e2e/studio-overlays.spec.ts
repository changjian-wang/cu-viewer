import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { checkPolygon, expandField, ready, fitSource, rotateSource } from "./viewerAssertions";
import { reviewPdf } from "./pdfFixtures";

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
    await expect(page.getByRole("button", { name: "Missing", exact: true })).toBeVisible();
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

async function paragraphPdf(page: Page): Promise<void> {
    await page.getByLabel("Choose source file").setInputFiles({
        name: "synthetic-paragraph-interaction.pdf", mimeType: "application/pdf", buffer: reviewPdf(),
    });
    await ready(page);
    const wrapped = "D(1,60,80,120,12);D(1,60,96,160,12);D(1,60,112,100,12)";
    const blocked = "D(1,60,240,60,12);D(1,60,256,180,12)";
    const neighbor = "D(1,140,242,50,8)";
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "synthetic-paragraph-interaction.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ apiVersion: "2025-11-01", contents: [{
            kind: "document", unit: "pixel", pages: [1, 2].map(pageNumber => ({ pageNumber, width: 600, height: 800 })),
            markdown: "Original paragraph interaction fixture.",
            fields: {
                Wrapped: { type: "string", valueString: "Line A / Line B / Line C", confidence: 0.6, source: wrapped },
                Blocked: { type: "string", valueString: "Keep actual regions", source: blocked },
                Neighbor: { type: "string", source: neighbor },
            },
            paragraphs: [
                ...Array.from({ length: 30 }, (_, index) => ({ content: `Unlocated paragraph ${index + 1}` })),
                { content: "Line A / Line B / Line C", role: "sectionHeading", source: wrapped },
                { content: "Keep actual regions", source: blocked },
                { content: "Unrelated neighboring paragraph", source: neighbor },
                { content: "Source on the second page", source: "D(2,70,80,120,12)" },
            ],
        }] })),
    });
    await expect(page.getByRole("button", { name: "Wrapped", exact: true })).toBeVisible();
    await page.getByRole("combobox", { name: "Zoom", exact: true }).selectOption("100");
    await ready(page);
}

async function framePresentation(page: Page, layer: "preview-overlay" | "source-overlay") {
    return page.getByTestId(layer).locator("polygon").evaluateAll(elements => elements.map(element => {
        const style = getComputedStyle(element);
        return { points: element.getAttribute("points"), indices: element.getAttribute("data-region-indices"),
            frame: element.getAttribute("data-selection-frame"), fill: element.getAttribute("fill"),
            stroke: style.stroke, width: style.strokeWidth, dash: style.strokeDasharray };
    }));
}

async function previewPresentation(popup: Locator) {
    return popup.evaluate(element => {
        const popup = getComputedStyle(element), value = element.querySelector(".cu-flyover-value dd");
        if (!value) throw new Error("Expected the source preview value.");
        const text = getComputedStyle(value);
        return { padding: popup.padding, borderRadius: popup.borderRadius, border: popup.border,
            textColor: text.color, textSize: text.fontSize, textWeight: text.fontWeight, textLine: text.lineHeight };
    });
}

for (const dpr of [1, 2]) {
    test.describe(`Paragraphs PDF field interaction parity at DPR ${dpr}`, () => {
        test.use({ deviceScaleFactor: dpr, reducedMotion: "reduce" });
        for (const rotation of [0, 90]) {
            test(`paragraph PDF hover/pin/clear uses Fields frames and preview styles at rotation ${rotation}`, async ({ page }) => {
                await paragraphPdf(page);
                if (rotation) await rotateSource(page);
                const viewport = page.getByRole("group", { name: "Source viewport", exact: true });
                const pane = page.getByRole("region", { name: "Extraction results" });
                const fieldParts = page.getByTestId("result-overlay")
                    .locator('polygon[data-outline-id="/contents/0/fields/Wrapped"]');
                await fieldParts.last().hover();
                await expect(page.getByTestId("preview-overlay").locator("polygon")).toHaveCount(1);
                const fieldsFrames = await framePresentation(page, "preview-overlay");
                expect(fieldsFrames[0]).toMatchObject({ indices: "0 1 2", frame: "merged", fill: "none", width: "1.8px", dash: "none" });
                const fieldStyle = await previewPresentation(page.getByRole("tooltip", { name: "Field preview", exact: true }));
                const canvas = page.getByTestId("source-canvas");
                const pixels = await canvas.evaluate(element => {
                    if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected a PDF canvas.");
                    return element.toDataURL();
                });
                await pane.getByRole("tab", { name: "Paragraphs", exact: true }).click();
                const paragraph = pane.getByRole("button", { name: "Select Paragraph 31", exact: true });
                const scroll = pane.locator(".cu-rich-result-scroll");
                await scroll.evaluate(element => { element.scrollTop = 0; });
                const before = await viewport.evaluate(element => ({ top: element.scrollTop, left: element.scrollLeft }));
                const paragraphParts = page.getByTestId("result-overlay")
                    .locator('polygon[data-outline-id="/contents/0/paragraphs/30"]');
                await paragraphParts.last().hover();
                const popup = page.getByRole("tooltip", { name: "Paragraph preview", exact: true });
                await expect(popup.locator("dt")).toHaveText(["Content"]);
                await expect(popup.locator("dd")).toHaveText(["Line A / Line B / Line C"]);
                await expect(popup.locator(".cu-flyover-confidence")).toHaveCount(0);
                await expect(paragraph).toHaveAttribute("aria-pressed", "false");
                await expect(page.getByTestId("source-overlay")).toHaveCount(0);
                await expect(scroll).toHaveJSProperty("scrollTop", 0);
                expect(await viewport.evaluate(element => ({ top: element.scrollTop, left: element.scrollLeft }))).toEqual(before);
                await expect(page.getByRole("textbox", { name: "Page number", exact: true })).toHaveValue("1");
                expect(await framePresentation(page, "preview-overlay")).toEqual(fieldsFrames);
                expect(await previewPresentation(popup)).toEqual(fieldStyle);
                await withinViewport(page, popup);
                expect(await canvas.evaluate(element => {
                    if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected a PDF canvas.");
                    return element.toDataURL();
                })).toBe(pixels);
                await paragraphParts.last().click();
                await expect(paragraph).toHaveAttribute("aria-pressed", "true");
                await expect(viewport).toBeFocused();
                await expect(page.getByTestId("source-overlay").locator("polygon")).toHaveCount(1);
                const selected = await framePresentation(page, "source-overlay");
                expect(selected[0]).toMatchObject({ points: fieldsFrames[0]?.points, indices: "0 1 2", frame: "merged", fill: "none", width: "1.8px", dash: "none" });
                await expect.poll(() => scroll.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
                const visible = await scroll.boundingBox(), target = await paragraph.boundingBox();
                if (!visible || !target) throw new Error("Expected a visible linked paragraph.");
                expect(target.y).toBeGreaterThanOrEqual(visible.y + 7);
                expect(target.y + target.height).toBeLessThanOrEqual(visible.y + visible.height - 7);
                await scroll.evaluate(element => { element.scrollTop = 123; });
                await paragraphParts.first().hover();
                await expect(scroll).toHaveJSProperty("scrollTop", 123);
                await expect(paragraph).toHaveAttribute("aria-pressed", "true");
                await pane.getByRole("tab", { name: "Markdown", exact: true }).click();
                await pane.getByRole("tab", { name: "Paragraphs", exact: true }).click();
                await expect(scroll).toHaveJSProperty("scrollTop", 123);
                await expect(paragraph).toHaveAttribute("aria-pressed", "true");
                await viewport.press("Escape");
                await expect(paragraph).toHaveAttribute("aria-pressed", "false");
                await expect(page.getByTestId("source-overlay")).toHaveCount(0);
                await expect(page.getByTestId("preview-overlay")).toHaveCount(0);
                await expect(popup).toHaveCount(0);
                if (rotation === 0) {
                    await paragraphParts.last().click();
                    await expect(page.getByTestId("source-overlay").locator("polygon")).toHaveCount(1);
                    const first = await paragraphParts.first().boundingBox(), second = await paragraphParts.nth(1).boundingBox();
                    if (!first || !second) throw new Error("Expected the real multiline paragraph sources.");
                    await page.mouse.click(first.x + Math.min(first.width, second.width) / 2,
                        (first.y + first.height + second.y) / 2);
                    await expect(paragraph).toHaveAttribute("aria-pressed", "false");
                    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
                    await expect(page.getByTestId("preview-overlay")).toHaveCount(0);
                }
            });
        }

        test("paragraph PDF selection keeps obstruction-safe Fields frames and does not expand real hit regions", async ({ page }) => {
            await paragraphPdf(page);
            const pane = page.getByRole("region", { name: "Extraction results" });
            const fieldParts = page.getByTestId("result-overlay")
                .locator('polygon[data-outline-id="/contents/0/fields/Blocked"]');
            await fieldParts.first().hover();
            await expect(page.getByTestId("preview-overlay").locator("polygon")).toHaveCount(2);
            const fieldsFrames = await framePresentation(page, "preview-overlay");
            await pane.getByRole("tab", { name: "Paragraphs", exact: true }).click();
            const paragraph = pane.getByRole("button", { name: "Select Paragraph 32", exact: true });
            const parts = page.getByTestId("result-overlay")
                .locator('polygon[data-outline-id="/contents/0/paragraphs/31"]');
            await parts.first().hover();
            await expect(page.getByTestId("preview-overlay").locator("polygon")).toHaveCount(2);
            expect(await framePresentation(page, "preview-overlay")).toEqual(fieldsFrames);
            expect(fieldsFrames.map(frame => frame.frame)).toEqual(["region", "region"]);
            await parts.last().click();
            await expect(paragraph).toHaveAttribute("aria-pressed", "true");
            await expect(page.getByTestId("source-overlay").locator("polygon")).toHaveCount(2);
            const first = await parts.first().boundingBox(), last = await parts.last().boundingBox();
            if (!first || !last) throw new Error("Expected actual paragraph source regions.");
            await page.mouse.click(first.x + first.width / 2, (first.y + first.height + last.y) / 2);
            await expect(paragraph).toHaveAttribute("aria-pressed", "false");
            await expect(page.getByTestId("source-overlay")).toHaveCount(0);
            await expect(page.getByTestId("preview-overlay")).toHaveCount(0);
            await expect(page.getByRole("tooltip", { name: "Paragraph preview", exact: true })).toHaveCount(0);
        });
    });
}

test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await ready(page);
});

test("active tabs switch complete current-page outlines, retain direct table targets and preserve source state", async ({ page }) => {
    await synthetic(page);
    const pane = page.getByRole("region", { name: "Extraction results" });
    const outlines = page.getByTestId("result-overlay");
    await expect(outlines).toHaveAttribute("data-result-view", "fields");
    await expect(outlines.locator("polygon")).toHaveCount(4);
    expect(await outlines.locator("polygon").evaluateAll(elements => elements.map(element => element.getAttribute("fill"))))
        .toEqual(["#FCE8E6", "#F1F3F5", "#F1F3F5", "#F1F3F5"]);
    await expect(page.getByTestId("source-tables").getByRole("button")).toHaveCount(2);
    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
    await pane.getByRole("button", { name: "Zero", exact: true }).press("Enter");
    const paper = await page.getByTestId("rendered-page").boundingBox();
    const zoom = await page.getByLabel("Zoom percentage").textContent();
    if (!paper || zoom === null) throw new Error("Source state is unavailable.");
    await pane.getByRole("tab", { name: "Markdown", exact: true }).click();
    await expect(pane.getByRole("heading", { name: "Synthetic overlay fixture" })).toBeVisible();
    await expect(outlines).toHaveCount(0);
    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
    await expect(page.getByTestId("source-tables").getByRole("button")).toHaveCount(2);
    await pane.getByRole("tab", { name: "Paragraphs", exact: true }).click();
    await expect(outlines).toHaveAttribute("data-result-view", "paragraphs");
    await expect(outlines.locator("polygon")).toHaveCount(2);
    expect(await outlines.locator("polygon").evaluateAll(elements => elements.map(element => element.getAttribute("fill"))))
        .toEqual(["#F1F3F5", "#F1F3F5"]);
    await expect(pane.getByRole("tab", { name: "Tables", exact: true })).toHaveCount(0);
    await checkPolygon(page, [{ x: 5 / 96, y: 30 / 64 }, { x: 35 / 96, y: 30 / 64 },
        { x: 35 / 96, y: 55 / 64 }, { x: 5 / 96, y: 55 / 64 }], 0,
    page.getByTestId("source-tables").locator('[data-table-id="/contents/0/tables/0"]'));
    await pane.getByRole("tab", { name: "Result", exact: true }).click();
    await expect(pane.getByRole("tree", { name: "Original Analyze result JSON" })).toBeVisible();
    await expect(outlines).toHaveCount(0);
    await expect(page.getByTestId("table-markers")).toHaveCount(0);
    await expect(page.getByTestId("source-tables").getByRole("button")).toHaveCount(2);
    await pane.getByRole("tab", { name: "Fields", exact: true }).click();
    await expect(pane.getByRole("button", { name: "Zero", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Zoom percentage")).toHaveText(zoom);
    expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(paper);
    await expect(pane.getByRole("switch", { name: "Hide missing fields" })).toHaveCount(0);
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
    await expect(popup.locator("dd")).toHaveText(["0", "0.00"]);
    await expect(popup.locator(".cu-popover-heading")).toHaveText("Zero");
    await expect(zero).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("result-overlay").locator("polygon")).toHaveCount(4);
    expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(before);
    await withinViewport(page, popup);
    const target = await page.getByTestId("preview-overlay").locator("polygon").boundingBox();
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
    await expect(popup.locator("dt")).toHaveText(["Value", "Confidence"]);
    await expect(popup.locator("dd")).toHaveText(["Returned address", "N/A"]);
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
    await expect(popup).toContainText("First returned paragraph");
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
    await expect(popup.locator(".cu-flyover-value dd")).toHaveText(text);
    await withinViewport(page, popup);
    expect(await popup.locator(".cu-flyover-body").evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    const region = await page.getByTestId("preview-overlay").locator("polygon").boundingBox();
    const bounds = await popup.boundingBox();
    if (!region || !bounds) throw new Error("Long preview bounds are unavailable.");
    expect(bounds.y + bounds.height <= region.y || bounds.y >= region.y + region.height ||
        bounds.x + bounds.width <= region.x || bounds.x >= region.x + region.width).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(1000);
    await popup.hover();
    await popup.locator(".cu-flyover-body").evaluate(element => { element.scrollTop = element.scrollHeight; });
    expect(await popup.locator(".cu-flyover-body").evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
    await expect(popup).toHaveCount(0);
});

test("unmapped source tables report their missing Fields association without changing zoom", async ({ page }) => {
    await synthetic(page);
    const pane = page.getByRole("region", { name: "Extraction results" });
    const zoom = await page.getByLabel("Zoom percentage").textContent();
    if (zoom === null) throw new Error("Zoom is unavailable.");
    const target = page.getByTestId("source-tables").getByRole("button", { name: "Locate Table 2 in results", exact: true });
    await target.press("Enter");
    await expect(pane.getByRole("tab", { name: "Fields", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(pane.locator(".cu-fields-status")).toContainText("no corresponding extracted fields");
    await expect(target).toBeFocused();
    await checkPolygon(page, [{ x: 45 / 96, y: 35 / 64 }, { x: 85 / 96, y: 35 / 64 },
        { x: 85 / 96, y: 55 / 64 }, { x: 45 / 96, y: 55 / 64 }], 0);
    await pane.getByRole("tab", { name: "Markdown", exact: true }).click();
    await pane.getByRole("tab", { name: "Fields", exact: true }).click();
    await expect(pane.locator(".cu-fields-status")).toContainText("no corresponding extracted fields");
    await expect(page.getByLabel("Zoom percentage")).toHaveText(zoom);
});

test("returning to the same zoom redraws tilted CU outlines without retaining the previous scale's raster cache", async ({ page }) => {
    await expandField(page, "AmountDue");
    await page.locator('[data-field-id="/contents/0/fields/AmountDue/valueObject/Amount"]')
        .getByRole("button", { name: "Amount", exact: true }).click();
    await page.locator(".prototype-banner").click({ position: { x: 10, y: 10 } });
    const frame = page.getByTestId("result-overlay");
    const points = await frame.locator('[data-outline-id="/contents/0/fields/ServiceAddress"]').first().getAttribute("points");
    const before = await frame.screenshot();
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await ready(page);
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    await ready(page);
    await fitSource(page, "page");
    for (let turn = 0; turn < 4; turn++) {
        await rotateSource(page);
        await ready(page);
        await fitSource(page, "width");
        await ready(page);
        await fitSource(page, "page");
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
                await rotateSource(page);
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
        await page.getByRole("combobox", { name: "Zoom", exact: true }).selectOption("100");
        await ready(page);
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
