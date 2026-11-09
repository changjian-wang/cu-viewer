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

async function expectObjectEnvelope(page: Page, id: string): Promise<void> {
    const points = await page.getByTestId("result-overlay")
        .locator(`[data-outline-id="${id}"], [data-outline-id^="${id}/"]`).evaluateAll(elements => elements.flatMap(element => {
            if (!(element instanceof SVGPolygonElement)) throw new Error("Expected real object source polygons.");
            const source = element.getAttribute("points");
            if (!source) throw new Error("Object source coordinates are missing.");
            // SVGPointList rounds to float32; compare the original attribute coordinates.
            return source.trim().split(/\s+/).map(point => {
                const [x, y] = point.split(",").map(Number);
                if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
                    throw new Error("Object source coordinates must be finite.");
                }
                return { x, y };
            });
        }));
    expect(points.length).toBeGreaterThan(0);
    const left = Math.min(...points.map(point => point.x)), right = Math.max(...points.map(point => point.x));
    const top = Math.min(...points.map(point => point.y)), bottom = Math.max(...points.map(point => point.y));
    const frame = page.getByTestId("preview-overlay").locator("polygon");
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveAttribute("data-source-id", id);
    await expect(frame).toHaveAttribute("points", `${left},${top} ${right},${top} ${right},${bottom} ${left},${bottom}`);
    await expect(frame).toHaveAttribute("fill", "none");
    await expect(frame).toHaveAttribute("stroke-width", "1.8");
    await expect(frame).toHaveCSS("pointer-events", "none");
}

test("object hover shows the real AmountDue summary without expanding, navigating or replacing a pin", async ({ page }) => {
    const object = page.locator('.cu-fields-table > tbody > tr[data-field-id="/contents/0/fields/AmountDue"]');
    await page.getByRole("button", { name: "BillingAddress", exact: true }).click();
    await page.locator(".prototype-banner").hover();
    const pin = page.getByTestId("source-overlay").locator("polygon").first();
    const pinPoints = await pin.getAttribute("points");
    const frame = await page.getByTestId("rendered-page").boundingBox();
    const pageNumber = await page.getByRole("textbox", { name: "Page number", exact: true }).inputValue();
    const summary = await object.locator(".cu-summary-value").innerText();
    const sourcePoints = await page.getByTestId("result-overlay").locator("polygon")
        .evaluateAll(elements => elements.map(element => element.getAttribute("points")));
    await object.getByRole("button", { name: "AmountDue", exact: true }).hover();
    const popup = page.getByRole("tooltip", { name: "Field preview", exact: true });
    await expect(popup.locator(".cu-popover-heading")).toHaveText("AmountDue");
    await expect(popup.locator(".cu-popover-heading")).toHaveCSS("font-weight", "400");
    await expect(popup.locator(".cu-flyover-value dd")).toHaveText(summary);
    await expect(popup.locator(".cu-flyover-value dd")).toHaveText("610 USD");
    await expect(popup.locator(".cu-flyover-confidence")).toHaveCount(0);
    await expectObjectEnvelope(page, "/contents/0/fields/AmountDue");
    await expect(object.getByRole("button", { name: "AmountDue", exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect(pin).toHaveAttribute("data-source-id", "/contents/0/fields/BillingAddress");
    await expect(pin).toHaveAttribute("points", pinPoints!);
    expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(frame);
    await expect(page.getByRole("textbox", { name: "Page number", exact: true })).toHaveValue(pageNumber);
    expect(await page.getByTestId("result-overlay").locator("polygon")
        .evaluateAll(elements => elements.map(element => element.getAttribute("points")))).toEqual(sourcePoints);
    await page.locator(".prototype-banner").hover();
    await expect(popup).toHaveCount(0);
    await expect(pin).toBeVisible();
});

test("nested object previews unite only current-page sources and preserve real hits and scoped summaries", async ({ page }) => {
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "synthetic-object-preview.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ apiVersion: "2025-11-01", contents: [{
            kind: "document", unit: "inch",
            pages: [{ pageNumber: 1, width: 8.5, height: 11 }, { pageNumber: 2, width: 8.5, height: 11 }],
            fields: {
                Group: { type: "object", valueObject: {
                    A: { type: "string", valueString: "First", source: "D(1,0.8,1.5,1,0.2)" },
                    Nested: { type: "object", valueObject: {
                        B: { type: "string", valueString: "Second", source: "D(1,2.7,2.3,1,0.2)" },
                        OtherPage: { type: "string", valueString: "Other page", source: "D(2,0.8,1.5,1,0.2)" },
                    } },
                } },
                Outside: { type: "string", valueString: "Separate target", source: "D(1,1.9,2,0.4,0.2)" },
                Elsewhere: { type: "object", valueObject: {
                    Text: { type: "string", valueString: "Page two", source: "D(2,1,1,1,0.2)" },
                } },
                NoGround: { type: "object", valueObject: { Text: { type: "string", valueString: "No source" } } },
                Rows: { type: "array", valueArray: [{ type: "string", valueString: "Array item" }] },
            },
            tables: [{ rowCount: 1, columnCount: 1, source: "D(1,0.7,1.4,1.3,0.4)", cells: [] }],
        }] })),
    });
    const group = page.getByRole("button", { name: "Group", exact: true });
    const popup = page.getByRole("tooltip", { name: "Field preview", exact: true });
    const frame = await page.getByTestId("rendered-page").boundingBox();
    await group.hover();
    await expect(popup.locator(".cu-flyover-value dd")).toHaveText("First Second Other page");
    await expectObjectEnvelope(page, "/contents/0/fields/Group");
    await expect(page.getByTestId("preview-overlay").locator("polygon")).toHaveAttribute("data-region-indices", "0 1");
    const outside = page.getByTestId("result-overlay").locator('[data-outline-id="/contents/0/fields/Outside"]');
    const outsideBounds = await outside.boundingBox();
    if (!outsideBounds) throw new Error("The independent source target is unavailable.");
    expect(await page.evaluate(point => document.elementFromPoint(point.x, point.y)?.getAttribute("data-outline-id"),
        { x: outsideBounds.x + outsideBounds.width / 2, y: outsideBounds.y + outsideBounds.height / 2 }))
        .toBe("/contents/0/fields/Outside");
    for (const name of ["Elsewhere", "NoGround", "Rows"]) {
        await page.getByRole("button", { name, exact: true }).hover();
        await expect(popup).toHaveCount(0);
        await expect(page.getByTestId("preview-overlay")).toHaveCount(0);
        await expect(page.getByRole("textbox", { name: "Page number", exact: true })).toHaveValue("1");
        expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(frame);
    }
    await page.getByRole("button", { name: "Expand Group", exact: true }).click();
    await page.getByRole("button", { name: "Nested", exact: true }).hover();
    await expect(popup.locator(".cu-popover-heading")).toHaveText("Group / Nested");
    await expect(popup.locator(".cu-flyover-value dd")).toHaveText("Second Other page");
    await expectObjectEnvelope(page, "/contents/0/fields/Group/valueObject/Nested");
    await page.getByRole("button", { name: "Locate Table 1 in results", exact: true }).first().press("Enter");
    await page.getByRole("button", { name: "Collapse Group", exact: true }).click();
    await group.hover();
    await expect(popup.locator(".cu-flyover-value dd")).toHaveText("First");
    await expect(page.locator('[data-field-id="/contents/0/fields/Group"] .cu-summary-value')).toHaveText("First");
    await page.locator(".prototype-banner").hover();
    await expect(popup).toHaveCount(0);
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
    await expect(popup).toHaveCSS("pointer-events", "none");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(popup).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(popup).toHaveCount(0);
    await page.getByRole("button", { name: "Address", exact: true }).hover();
    await expect(popup.locator("dt")).toHaveText(["Value", "Confidence"]);
    await expect(popup.locator("dd")).toHaveText(["Returned address", "N/A"]);
    await page.getByRole("button", { name: "Ungrounded", exact: true }).hover();
    await expect(popup).toHaveCount(0);
    await expect(page.locator(".cu-preview-hint")).toHaveCount(0);
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

test("long names wrap and clipped previews retain complete values in persistent readable and copyable details", async ({ page }) => {
    await synthetic(page);
    const text = "Returned value. ".repeat(800);
    const name = "LongFieldNameWithoutSpaces".repeat(4);
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "synthetic-long-preview.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({
            apiVersion: "2025-11-01", contents: [{ kind: "document", unit: "pixel",
                pages: [{ pageNumber: 1, width: 96, height: 64 }],
                fields: { [name]: { type: "string", valueString: text, source: "D(1,40,30,40,6)" } } }],
        })),
    });
    await page.locator(".prototype-banner").click();
    const field = page.getByRole("button", { name, exact: true });
    await field.hover();
    const popup = page.getByRole("tooltip", { name: "Field preview" });
    await expect(popup.locator(".cu-flyover-value dd")).toHaveText(text);
    await withinViewport(page, popup);
    expect(await popup.locator(".cu-flyover-body").evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    await expect(popup.locator(".cu-flyover-body")).toHaveCSS("overflow-y", "hidden");
    await expect(popup.locator(".cu-popover-heading")).toHaveText(name);
    expect(await popup.locator(".cu-popover-heading").evaluate(element => element.clientHeight)).toBeGreaterThan(30);
    const region = await page.getByTestId("preview-overlay").locator("polygon").boundingBox();
    const bounds = await popup.boundingBox();
    if (!region || !bounds) throw new Error("Long preview bounds are unavailable.");
    expect(bounds.y + bounds.height <= region.y || bounds.y >= region.y + region.height ||
        bounds.x + bounds.width <= region.x || bounds.x >= region.x + region.width).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(1000);
    await page.evaluate(() => {
        let copied = "";
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
            writeText: (value: string) => { copied = value; return Promise.resolve(); }, readText: () => Promise.resolve(copied),
        } });
    });
    await field.press("F2");
    const details = page.getByRole("region", { name: "Full value and confidence" });
    await expect(details.getByLabel("Full extracted value")).toHaveText(text);
    await details.getByRole("button", { name: "Copy full value" }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(text);
    await page.keyboard.press("Escape");
    await expect(details).toHaveCount(0);
});

test("keyboard selection retains only the focused preview and still explicitly navigates to its source", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "keyboard-preview-selection.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ apiVersion: "2025-11-01", contents: [{
            kind: "document", unit: "inch", pages: [{ pageNumber: 1, width: 8.5, height: 11 }, { pageNumber: 2, width: 8.5, height: 11 }],
            fields: { Focused: { type: "string", valueString: "Second page", source: "D(2,0.7,2,2,0.25)" } },
        }] })),
    });
    const field = page.getByRole("button", { name: "Focused", exact: true });
    await field.focus();
    await expect(page.getByRole("textbox", { name: "Page number", exact: true })).toHaveValue("1");
    await field.press("Enter");
    await ready(page);
    await expect(page.getByRole("textbox", { name: "Page number", exact: true })).toHaveValue("2");
    await expect(field).toBeFocused();
    const popup = page.getByRole("tooltip", { name: "Field preview", exact: true });
    await expect(popup).toContainText("Second page");
    await page.getByRole("searchbox", { name: "Search fields or values", exact: true }).focus();
    await expect(popup).toHaveCount(0);
    await expect(field).toHaveAttribute("aria-pressed", "true");
});

test("pointer previews dismiss with the clock paused and never resurrect the selected field", async ({ page }) => {
    await synthetic(page);
    const zero = page.getByRole("button", { name: "Zero", exact: true });
    const popup = page.getByRole("tooltip", { name: "Field preview", exact: true });
    await zero.click();
    await page.locator(".prototype-banner").hover();
    await expect(popup).toHaveCount(0);
    await zero.hover();
    await expect(popup).toBeVisible();
    const time = new Date();
    await page.clock.install({ time });
    await page.clock.pauseAt(new Date(time.getTime() + 1000));
    await page.locator(".prototype-banner").hover();
    await expect(popup).toHaveCount(0);
    await expect(zero).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("source-overlay")).toBeVisible();
    await page.clock.resume();
});

test("the purple preview is pointer-transparent and immediately exposes another source field behind it", async ({ page }) => {
    await synthetic(page);
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "synthetic-overlapping-preview.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ apiVersion: "2025-11-01", contents: [{
            kind: "document", unit: "pixel", pages: [{ pageNumber: 1, width: 96, height: 64 }],
            fields: {
                First: { type: "string", valueString: "First value", confidence: 0.2, source: "D(1,5,5,20,8)" },
                Second: { type: "string", valueString: "Second value", source: "D(1,5,14,20,8)" },
            },
        }] })),
    });
    await page.locator(".prototype-banner").click();
    const regions = page.getByTestId("result-overlay");
    await regions.locator('[data-outline-id="/contents/0/fields/First"]').hover();
    const popup = page.getByRole("tooltip", { name: "Field preview", exact: true });
    await expect(popup).toBeVisible();
    await expect(popup).toHaveCSS("pointer-events", "none");
    await expect(popup.locator(".cu-popover-heading")).toHaveCSS("background-color", "rgb(229, 218, 255)");
    await expect(popup.locator(".cu-popover-heading")).toHaveCSS("color", "rgb(76, 29, 149)");
    await expect(popup.locator(".cu-popover-heading")).toHaveCSS("font-size", "12.5px");
    await expect(popup.locator(".cu-flyover-value")).toHaveCSS("color", "rgb(36, 52, 71)");
    await expect(popup.locator(".cu-flyover-value")).toHaveCSS("font-size", "12.5px");
    await expect(popup.locator(".cu-flyover-confidence")).toHaveCSS("font-size", "11px");
    expect(await popup.evaluate(element => getComputedStyle(element, "::before").backgroundColor)).toBe("rgb(229, 218, 255)");
    const box = await popup.boundingBox();
    const second = await regions.locator('[data-outline-id="/contents/0/fields/Second"]').boundingBox();
    if (!box || !second) throw new Error("Expected both the preview and the underlying source field.");
    const left = Math.max(box.x, second.x), right = Math.min(box.x + box.width, second.x + second.width);
    const top = Math.max(box.y, second.y), bottom = Math.min(box.y + box.height, second.y + second.height);
    expect(right - left).toBeGreaterThan(0);
    expect(bottom - top).toBeGreaterThan(0);
    const point = { x: (left + right) / 2, y: (top + bottom) / 2 };
    expect(await page.evaluate(point => document.elementFromPoint(point.x, point.y)
        ?.closest("[data-outline-id]")?.getAttribute("data-outline-id"), point)).toBe("/contents/0/fields/Second");
    await page.mouse.move(point.x, point.y);
    await expect(popup.locator(".cu-popover-heading")).toHaveText("Second");
    await expect(popup.locator(".cu-flyover-value dd")).toHaveText("Second value");
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
