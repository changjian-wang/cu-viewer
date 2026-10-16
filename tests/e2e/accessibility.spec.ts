import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { checkPolygon, ready } from "./viewerAssertions";
import { croppedRotatedPdf } from "./pdfFixtures";

declare global {
    interface Window {
        cuCompleteClipboardWrite?: () => void;
        cuClipboardWrites?: string[];
    }
}

async function tabTo(page: Page, target: Locator): Promise<void> {
    for (let count = 0; count < 180; count++) {
        await page.keyboard.press("Tab");
        if (await target.evaluate(element => element === document.activeElement)) {
            await expect(target).toBeFocused();
            expect(await target.evaluate(element => element.matches(":focus-visible"))).toBe(true);
            return;
        }
    }
    throw new Error("The target control is not reachable in the keyboard Tab order.");
}

async function polygonBounds(page: Page) {
    const polygon = await page.getByTestId("source-overlay").locator("polygon").first().boundingBox();
    const viewport = await page.getByRole("group", { name: "Source viewport", exact: true }).boundingBox();
    if (!polygon || !viewport) throw new Error("Source region or viewport bounds are unavailable.");
    return { polygon, viewport };
}

test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await ready(page);
});

test("desktop keyboard reaches source controls, pans, validates pages and retains focus after rendering", async ({ page }) => {
    const viewport = page.getByRole("group", { name: "Source viewport", exact: true });
    await tabTo(page, viewport);
    await expect(viewport).toHaveAttribute("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight");
    const before = await page.getByTestId("rendered-page").boundingBox();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    const after = await page.getByTestId("rendered-page").boundingBox();
    if (!before || !after) throw new Error("Source frame is unavailable.");
    expect(after.x - before.x).toBeCloseTo(40, 1);
    expect(after.y - before.y).toBeCloseTo(40, 1);
    await expect(viewport).toBeFocused();
    const next = page.getByRole("button", { name: "Next page", exact: true });
    await tabTo(page, next);
    await page.keyboard.press("Enter");
    await ready(page);
    await expect(next).toBeFocused();
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("2");
    await page.keyboard.press("Shift+Tab");
    const number = page.getByRole("textbox", { name: "Page number" });
    await expect(number).toBeFocused();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("0");
    await page.keyboard.press("Enter");
    await expect(number).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("alert")).toContainText("Enter an existing page number");
    await page.keyboard.press("Control+A");
    await page.keyboard.type("1");
    await page.keyboard.press("Enter");
    await ready(page);
    await expect(number).toHaveAttribute("aria-invalid", "false");
    await expect(number).toBeFocused();
    await expect(page.getByRole("img", { name: "Rendered source page 1", exact: true })).toBeVisible();
    await number.fill("3");
    await number.press("Enter");
    await ready(page);
    await tabTo(page, next);
    await page.keyboard.press("Enter");
    await ready(page);
    await expect(number).toHaveValue("4");
    await expect(next).toBeDisabled();
    await expect(page.getByRole("button", { name: "Previous page", exact: true })).toBeFocused();
    await number.focus();
    await page.locator('[data-field-id="/contents/0/fields/AmountDue"]').hover();
    await ready(page);
    await expect(number).toHaveValue("1");
    await page.locator(".prototype-banner").hover();
    await number.fill("2");
    await number.press("Tab");
    await ready(page);
    await expect(number).toHaveValue("2");
    await expect(next).toBeFocused();
});

test("hidden field descriptions do not overflow the desktop and Result scrolls independently of Source", async ({ page }) => {
    const viewport = page.getByRole("group", { name: "Source viewport", exact: true });
    const before = await page.getByTestId("rendered-page").boundingBox();
    const fieldScroll = page.locator(".cu-fields-scroll");
    await fieldScroll.evaluate(element => { element.scrollTop = element.scrollHeight; });
    expect(await fieldScroll.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    const after = await page.getByTestId("rendered-page").boundingBox();
    expect(after).toEqual(before);
    expect(await viewport.evaluate(element => element.scrollTop)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(1000);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.getByRole("button", { name: "VendorName", exact: true }))
        .toHaveAccessibleDescription(/CONTOSO LTD.*Confidence/);
});

test("keyboard operates field expansion and value selection with truthful accessible descriptions", async ({ page }) => {
    const expand = page.getByRole("button", { name: "Expand AmountDue", exact: true });
    await tabTo(page, expand);
    await page.keyboard.press("Enter");
    const collapse = page.getByRole("button", { name: "Collapse AmountDue", exact: true });
    await expect(collapse).toBeFocused();
    await expect(collapse).toHaveAttribute("aria-expanded", "true");
    const controls = await collapse.getAttribute("aria-controls");
    if (!controls) throw new Error("Expanded field has no controlled child region.");
    expect(await page.evaluate(id => Boolean(document.getElementById(id)), controls)).toBe(true);
    const value = page.getByRole("button", { name: "Select value of AmountDue / Amount", exact: true });
    await tabTo(page, value);
    await expect(value).toHaveAccessibleDescription(/610.*Confidence 34\.10%/);
    await page.keyboard.press("Space");
    await ready(page);
    await expect(value).toBeFocused();
    await expect(value).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("source-overlay")).toBeVisible();
    await expect(page.getByRole("button", { name: "BillingAddress", exact: true }))
        .toHaveAccessibleDescription(/123 Bill St, Redmond WA, 98052.*Confidence 31\.70%/);
    await page.getByRole("button", { name: "Collapse AmountDue", exact: true }).press("Enter");
    await expect(page.locator('[data-field-id="/contents/0/fields/AmountDue"]')).toHaveClass(/is-selected/);
});

test("dynamic tabs have one keyboard stop, correct panel links and keyboard-operable detail and Result controls", async ({ page }) => {
    const pane = page.getByRole("region", { name: "Extraction results" });
    const fields = pane.getByRole("tab", { name: "Fields", exact: true });
    await tabTo(page, fields);
    await page.keyboard.press("ArrowRight");
    const markdown = pane.getByRole("tab", { name: "Markdown", exact: true });
    await expect(markdown).toBeFocused();
    await expect(pane.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
    await expect(pane.getByRole("heading", { name: "INVOICE", exact: true })).toBeVisible();
    expect(await pane.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(await markdown.getAttribute("id"));
    expect(await markdown.getAttribute("aria-controls")).toBe(await pane.getByRole("tabpanel").getAttribute("id"));
    await page.keyboard.press("ArrowRight");
    await expect(pane.getByRole("tab", { name: "Paragraphs", exact: true })).toBeFocused();
    const paragraph = pane.getByRole("button", { name: "Select Paragraph 1", exact: true });
    await tabTo(page, paragraph);
    await expect(paragraph).toHaveAccessibleDescription(/CONTOSO LTD.*Page 1/);
    await page.keyboard.press("Enter");
    await ready(page);
    await expect(paragraph).toBeFocused();
    await expect(paragraph).toHaveAttribute("aria-pressed", "true");
    await pane.getByRole("tab", { name: "Paragraphs", exact: true }).press("End");
    await expect(pane.getByRole("tab", { name: "Result", exact: true })).toBeFocused();
    await expect(pane.getByRole("tree", { name: "Original Analyze result JSON" })).toBeVisible();
    await tabTo(page, pane.getByRole("tabpanel"));
});

test("selecting visible targets avoids movement, selecting hidden targets centers only the necessary axis", async ({ page }) => {
    const target = page.getByRole("button", { name: "BillingAddress", exact: true });
    const first = await page.getByTestId("rendered-page").boundingBox();
    await target.press("Enter");
    await ready(page);
    const visible = await page.getByTestId("rendered-page").boundingBox();
    if (!first || !visible) throw new Error("Source frame bounds unavailable.");
    expect(visible.x).toBeCloseTo(first.x, 1);
    expect(visible.y).toBeCloseTo(first.y, 1);
    const zoom = await page.getByLabel("Zoom percentage").textContent();
    const viewport = page.getByRole("group", { name: "Source viewport", exact: true });
    await viewport.focus();
    for (let step = 0; step < 25; step++) await page.keyboard.press("ArrowLeft");
    const hidden = await page.getByTestId("rendered-page").boundingBox();
    if (!hidden) throw new Error("Panned source bounds unavailable.");
    await target.press("Enter");
    await expect.poll(async () => {
        const { polygon, viewport } = await polygonBounds(page);
        return Math.abs(polygon.x + polygon.width / 2 - viewport.x - viewport.width / 2);
    }).toBeLessThanOrEqual(1);
    const revealed = await page.getByTestId("rendered-page").boundingBox();
    expect(revealed?.y).toBeCloseTo(hidden.y, 1);
    expect(revealed?.width).toBeCloseTo(hidden.width, 1);
    expect(revealed?.height).toBeCloseTo(hidden.height, 1);
    await expect(page.getByLabel("Zoom percentage")).toHaveText(zoom ?? "");
    await expect(target).toBeFocused();
    await viewport.focus();
    await page.keyboard.press("ArrowRight");
    const manual = await page.getByTestId("rendered-page").boundingBox();
    expect(manual?.x).toBeCloseTo((revealed?.x ?? 0) + 40, 1);
    await page.getByRole("textbox", { name: "Page number" }).fill("4");
    await page.getByRole("textbox", { name: "Page number" }).press("Enter");
    await ready(page);
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("4");
    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
});

test("source region boundaries move focus to an enabled adjacent region control", async ({ page }) => {
    const field = page.getByRole("button", { name: "BillingAddress", exact: true });
    await field.focus();
    await page.keyboard.press("Enter");
    const next = page.getByRole("button", { name: "Next source region", exact: true });
    const previous = page.getByRole("button", { name: "Previous source region", exact: true });
    await tabTo(page, next);
    await page.keyboard.press("Enter");
    await expect(next).toBeDisabled();
    await expect(previous).toBeFocused();
    await page.keyboard.press("Space");
    await expect(previous).toBeDisabled();
    await expect(next).toBeFocused();
});

test("cross-page selection and region navigation preserve the exact zoom and viewer rotation from both fit modes", async ({ page }) => {
    await page.getByLabel("Choose source file").setInputFiles({
        name: "synthetic-cropped-rotated.pdf", mimeType: "application/pdf", buffer: croppedRotatedPdf(),
    });
    await ready(page);
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "synthetic-cross-page-reveal.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({
            apiVersion: "2025-11-01", contents: [{ kind: "document", unit: "pixel",
                pages: [{ pageNumber: 1, width: 300, height: 200 }, { pageNumber: 2, width: 240, height: 360 }],
                fields: {
                    Target: { type: "string", valueString: "Synthetic second-page region", source: "D(2,40,80,50,30)" },
                    Regions: { type: "string", valueString: "Synthetic cross-page regions", source: "D(1,20,30,30,20);D(2,40,80,50,30)" },
                } }],
        })),
    });
    await page.getByRole("button", { name: "Rotate 90°", exact: true }).press("Enter");
    await ready(page);
    const paper = page.getByTestId("rendered-page");
    for (const fit of ["Fit page", "Fit width"]) {
        const number = page.getByRole("textbox", { name: "Page number" });
        await number.fill("1");
        await number.press("Enter");
        await ready(page);
        await page.getByRole("button", { name: fit, exact: true }).press("Enter");
        await ready(page);
        const zoom = await paper.evaluate(element => Number.parseFloat(element.style.width) / 200);
        const target = page.getByRole("button", { name: "Target", exact: true });
        await target.focus();
        await page.keyboard.press("Enter");
        await ready(page);
        await expect(number).toHaveValue("2");
        // CSSOM width serialization must not introduce a visible zoom change.
        expect(Math.abs(await paper.evaluate(element => Number.parseFloat(element.style.width)) - zoom * 360)).toBeLessThan(1 / 64);
        await expect(target).toBeFocused();
        await checkPolygon(page, [{ x: 40 / 240, y: 80 / 360 }, { x: 90 / 240, y: 80 / 360 },
            { x: 90 / 240, y: 110 / 360 }, { x: 40 / 240, y: 110 / 360 }], 90);
        const regions = page.getByRole("button", { name: "Regions", exact: true });
        await regions.focus();
        await page.keyboard.press("Enter");
        await ready(page);
        await expect(number).toHaveValue("1");
        expect(Math.abs(await paper.evaluate(element => Number.parseFloat(element.style.width)) - zoom * 200)).toBeLessThan(1 / 64);
        const next = page.getByRole("button", { name: "Next source region", exact: true });
        await next.focus();
        await page.keyboard.press("Enter");
        await ready(page);
        await expect(number).toHaveValue("2");
        expect(Math.abs(await paper.evaluate(element => Number.parseFloat(element.style.width)) - zoom * 360)).toBeLessThan(1 / 64);
        await expect(page.getByRole("button", { name: "Previous source region", exact: true })).toBeFocused();
    }
});

test("keyboard copying retains focus while pending and never steals focus back from another control", async ({ page }) => {
    const value = "Returned first";
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "synthetic-copy-metadata.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({
            apiVersion: "2026-06-01-preview",
            contents: [{ kind: "document", metadata: { First: value, Second: "Returned second" } }],
        })),
    });
    const copy = page.getByRole("button", { name: "Copy metadata First", exact: true });
    await tabTo(page, copy);
    await page.evaluate(() => {
        window.cuClipboardWrites = [];
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
            writeText(value: string) {
                window.cuClipboardWrites?.push(value);
                return new Promise<void>(resolve => { window.cuCompleteClipboardWrite = resolve; });
            },
        } });
    });
    await page.keyboard.press("Enter");
    await expect(copy).toHaveAttribute("aria-disabled", "true");
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(copy).toBeFocused();
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => window.cuClipboardWrites)).toEqual([value]);
    await page.evaluate(() => {
        if (!window.cuCompleteClipboardWrite) throw new Error("No clipboard write is pending.");
        window.cuCompleteClipboardWrite();
    });
    await expect(copy).toHaveAttribute("aria-disabled", "false");
    await expect(copy).toBeFocused();
    await expect(page.getByRole("status").filter({ hasText: /^Copied$/ })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(copy).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Tab");
    const second = page.getByRole("button", { name: "Copy metadata Second", exact: true });
    await expect(second).toBeFocused();
    await page.evaluate(() => {
        if (!window.cuCompleteClipboardWrite) throw new Error("No clipboard write is pending.");
        window.cuCompleteClipboardWrite();
    });
    await expect(copy).toHaveAttribute("aria-disabled", "false");
    await expect(second).toBeFocused();
});

test.describe("conditional reveal at DPR 2", () => {
    test.use({ deviceScaleFactor: 2 });
    test("preserves zoom and quarter-turn geometry while revealing a target after each rotation", async ({ page }) => {
        await page.getByLabel("Choose source file").setInputFiles(resolve("tests", "fixtures", "images", "orientation-marker.png"));
        await ready(page);
        await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
            name: "synthetic-reveal.json", mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify({
                apiVersion: "2025-11-01", contents: [{ kind: "document", unit: "pixel",
                    pages: [{ pageNumber: 1, width: 96, height: 64 }],
                    fields: { Target: { type: "string", valueString: "Synthetic region", source: "D(1,12,8,12,8)" } } }],
            })),
        });
        const target = page.getByRole("button", { name: "Target", exact: true });
        for (let rotation = 0; rotation < 360; rotation += 90) {
            if (rotation > 0) {
                await page.getByRole("button", { name: "Rotate 90°", exact: true }).press("Enter");
                await ready(page);
            }
            const zoom = await page.getByLabel("Zoom percentage").textContent();
            const viewport = page.getByRole("group", { name: "Source viewport", exact: true });
            await viewport.focus();
            for (let step = 0; step < 35; step++) {
                await page.keyboard.press("ArrowLeft");
                await page.keyboard.press("ArrowUp");
            }
            await target.press("Enter");
            await expect.poll(async () => {
                const { polygon, viewport } = await polygonBounds(page);
                return Math.max(Math.abs(polygon.x + polygon.width / 2 - viewport.x - viewport.width / 2),
                    Math.abs(polygon.y + polygon.height / 2 - viewport.y - viewport.height / 2));
            }).toBeLessThanOrEqual(1);
            await expect(page.getByLabel("Zoom percentage")).toHaveText(zoom ?? "");
            await checkPolygon(page, [{ x: 12 / 96, y: 8 / 64 }, { x: 24 / 96, y: 8 / 64 },
                { x: 24 / 96, y: 16 / 64 }, { x: 12 / 96, y: 16 / 64 }], rotation);
        }
    });
});

test("desktop Source/Result stay side-by-side with minimum widths and scrolling in narrow containers", async ({ page }) => {
    const workspace = page.locator(".prototype-workspace");
    await workspace.evaluate(element => { element.style.width = "640px"; element.style.alignSelf = "flex-start"; });
    await ready(page);
    const embedded = await page.locator(".cu-viewer").evaluate(element => {
        const source = element.querySelector(".cu-source-pane")?.getBoundingClientRect();
        const result = element.querySelector(".cu-fields-pane")?.getBoundingClientRect();
        if (!source || !result) throw new Error("Embedded desktop panes are unavailable.");
        return { width: element.clientWidth, scrollWidth: element.scrollWidth,
            source: { y: source.y, width: source.width }, result: { y: result.y, width: result.width } };
    });
    expect(embedded.source.width).toBeGreaterThanOrEqual(400);
    expect(embedded.result.width).toBeGreaterThanOrEqual(330);
    expect(embedded.result.y).toBeCloseTo(embedded.source.y, 1);
    expect(embedded.scrollWidth).toBeGreaterThan(embedded.width);
    await workspace.evaluate(element => { element.style.width = ""; element.style.alignSelf = ""; });
    await page.setViewportSize({ width: 640, height: 900 });
    await ready(page);
    const layout = await page.locator(".cu-viewer").evaluate(element => {
        const source = element.querySelector(".cu-source-pane")?.getBoundingClientRect();
        const result = element.querySelector(".cu-fields-pane")?.getBoundingClientRect();
        if (!source || !result) throw new Error("Desktop panes are unavailable.");
        return { width: element.clientWidth, scrollWidth: element.scrollWidth,
            source: { x: source.x, y: source.y, width: source.width },
            result: { x: result.x, y: result.y, width: result.width } };
    });
    expect(layout.source.width).toBeGreaterThanOrEqual(400);
    expect(layout.result.width).toBeGreaterThanOrEqual(330);
    expect(layout.result.y).toBeCloseTo(layout.source.y, 1);
    expect(layout.result.x).toBeGreaterThan(layout.source.x + layout.source.width);
    expect(layout.scrollWidth).toBeGreaterThan(layout.width);
    await page.getByRole("tab", { name: "Fields", exact: true }).press("End");
    await expect(page.getByRole("tab", { name: "Result", exact: true })).toBeFocused();
    await expect(page.getByRole("tree", { name: "Original Analyze result JSON" })).toBeVisible();
    expect(await page.locator(".cu-viewer").evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    const viewer = await page.locator(".cu-viewer").boundingBox();
    const result = await page.getByRole("tab", { name: "Result", exact: true }).boundingBox();
    if (!viewer || !result) throw new Error("Focused result tab bounds are unavailable.");
    expect(result.x).toBeGreaterThanOrEqual(viewer.x);
    expect(result.x + result.width).toBeLessThanOrEqual(viewer.x + viewer.width);
});
