import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { fitSource, ready, rotateSource, selectResultView } from "./viewerAssertions";
import { alive, trackSourceResources } from "./sourceResources";

async function upload(page: Page, input: unknown): Promise<void> {
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "synthetic-ocr-retention.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(input)),
    });
}

function synthetic() {
    return { apiVersion: "2026-06-01-preview", analyzerId: "synthetic-ocr-retention", contents: [{
        kind: "document", unit: "pixel",
        pages: [{ pageNumber: 1, width: 96, height: 64, words: [
            { content: "WORD_ONLY", confidence: 0.3, source: "D(1,5,5,20,8)" },
            { content: "WORD_SECOND", confidence: 0.99, source: "D(1,40,20,60,19,61,27,41,28)" },
            { content: "DUPLICATE", source: "D(1,5,5,25,5,25,13,5,13)" },
        ] }],
        fields: { Field: { type: "string", valueString: "Returned field", source: "D(1,5,5,20,8)" },
            Missing: { type: "string", source: "D(1,5,40,20,8)" } },
        markdown: "# Saved word fixture",
        paragraphs: [{ content: "Returned paragraph", source: "D(1,5,5,55,23)" }],
        tables: [{ rowCount: 1, columnCount: 1, source: "D(1,5,35,45,20)",
            cells: [{ rowIndex: 0, columnIndex: 0, content: "Cell", source: "D(1,5,35,10,5)" }] }],
        figures: [{ id: "synthetic-figure", source: "D(1,60,40,20,15)" }],
        signatures: [{ id: "synthetic-signature", source: "D(1,40,45,10,10)" }],
        metadata: { Title: "Synthetic OCR fixture, not a service result" },
    }] };
}

async function marker(page: Page): Promise<void> {
    await page.getByLabel("Choose source file").setInputFiles(resolve("tests", "fixtures", "images", "orientation-marker.png"));
    await ready(page);
}

async function originalWords(page: Page): Promise<void> {
    await selectResultView(page.getByRole("region", { name: "Extraction results" }), "Result");
    const tree = page.getByRole("tree", { name: "Original Analyze result JSON" });
    await expect(tree).toBeVisible();
    for (let count = 0; count < 40 && await tree.getByRole("button", { name: "Expand JSON node" }).count(); count++) {
        await tree.getByRole("button", { name: "Expand JSON node" }).first().click();
    }
    await expect(tree).toContainText("WORD_ONLY");
    await expect(tree).toContainText("WORD_SECOND");
    await expect(tree).toContainText("DUPLICATE");
    await expect(tree).toContainText("D(1,5,5,20,8)");
}

test.beforeEach(async ({ page }) => {
    await trackSourceResources(page);
    await page.goto("/");
    await ready(page);
});

test("all eight views retain OCR data without a permanent yellow layer or source-resource churn", async ({ page }) => {
    await marker(page);
    await upload(page, synthetic());
    await page.getByRole("button", { name: "Field", exact: true }).press("Enter");
    const sourceBounds = await page.getByTestId("rendered-page").boundingBox();
    const resources = await alive(page);
    for (const name of ["Fields", "Markdown", "Paragraphs", "Figures", "Signatures", "Metadata", "Result"]) {
        await selectResultView(page.getByRole("region", { name: "Extraction results" }), name);
        await expect(page.getByTestId("word-overlay")).toHaveCount(0);
        expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(sourceBounds);
        expect(await alive(page)).toEqual(resources);
    }
    await originalWords(page);
    await selectResultView(page.getByRole("region", { name: "Extraction results" }), "Fields");
    await page.getByRole("switch", { name: "Hide missing fields" }).click();
    await expect(page.getByRole("button", { name: "Field", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("word-overlay")).toHaveCount(0);
});

test("unextracted OCR does not tint the page and annotation/settings changes never repaint original pixels", async ({ page }) => {
    await marker(page);
    const source = page.getByTestId("source-canvas");
    const pixels = await source.evaluate(canvas => {
        if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Expected the original source canvas.");
        return canvas.toDataURL();
    });
    const input = synthetic();
    Reflect.deleteProperty(input.contents[0]!, "fields");
    await upload(page, input);
    await expect(page.getByTestId("result-overlay")).toHaveCount(0);
    await expect(page.getByTestId("word-overlay")).toHaveCount(0);
    await page.getByRole("button", { name: "Highlighting settings", exact: true }).click();
    await page.getByRole("switch", { name: "Show field highlights" }).uncheck();
    await page.getByRole("switch", { name: "Highlight low confidences" }).uncheck();
    await page.getByRole("button", { name: "Close highlighting settings", exact: true }).click();
    expect(await source.evaluate(canvas => {
        if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Expected the unchanged source canvas.");
        return canvas.toDataURL();
    })).toBe(pixels);
    await originalWords(page);
});

test("real PDF/PNG replacement and failure never restore stale OCR geometry", async ({ page }) => {
    for (const number of [1, 2, 3, 4]) {
        await page.getByRole("textbox", { name: "Page number" }).fill(String(number));
        await page.getByRole("textbox", { name: "Page number" }).press("Enter");
        await ready(page);
        await expect(page.getByTestId("word-overlay")).toHaveCount(0);
    }
    await page.getByRole("button", { name: "Receipt PNG", exact: true }).click();
    await ready(page);
    await expect(page.getByTestId("word-overlay")).toHaveCount(0);
    await page.getByLabel("Choose source file").setInputFiles({
        name: "corrupt.pdf", mimeType: "application/pdf", buffer: Buffer.from("corrupt"),
    });
    await expect(page.getByRole("heading", { name: "Source could not be displayed" })).toBeVisible();
    await expect(page.getByTestId("word-overlay")).toHaveCount(0);
    await expect.poll(() => alive(page)).toEqual({ workers: 0, bitmaps: 0, urls: 0 });
});

test("malformed OCR warnings remain path-specific while valid fields stay inspectable", async ({ page }) => {
    await marker(page);
    await upload(page, { apiVersion: "2025-11-01", contents: [{ kind: "document", unit: "pixel",
        pages: [{ pageNumber: 1, width: 96, height: 64, words: [
            { content: "Invalid", source: "bad" }, { content: "Outside", source: "D(1,95,10,20,10)" },
            { content: "Valid", source: "D(1,5,5,20,8)" },
        ] }], fields: { Keep: { type: "string", valueString: "Still inspectable" } } }] });
    await expect(page.getByTestId("word-overlay")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Keep", exact: true })).toBeVisible();
    await page.locator(".cu-issues summary").click();
    await expect(page.locator(".cu-issues")).toContainText("/contents/0/pages/0/words/0/source");
    await expect(page.locator(".cu-issues")).toContainText("source-out-of-bounds");
});

test("content replacement and pending decoding do not resurrect OCR paint", async ({ page }) => {
    await marker(page);
    await upload(page, { apiVersion: "2025-11-01", contents: [
        { kind: "document", unit: "pixel", pages: [{ pageNumber: 1, width: 96, height: 64,
            words: [{ content: "First", source: "D(1,5,5,20,8)" }] }], fields: { First: { type: "string", valueString: "First content" } } },
        { kind: "document", unit: "pixel", pages: [{ pageNumber: 1, width: 96, height: 64,
            words: [{ content: "Second", source: "D(1,40,20,20,8)" }] }], fields: { Second: { type: "string", valueString: "Second content" } } },
    ] });
    await page.getByRole("combobox", { name: "Result content" }).selectOption("1");
    await expect(page.getByRole("button", { name: "Second", exact: true })).toBeVisible();
    await expect(page.getByTestId("word-overlay")).toHaveCount(0);
    await page.evaluate(() => { window.cuHoldImageDecode = true; });
    try {
        await page.getByRole("button", { name: "Receipt PNG", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Loading source..." })).toBeVisible();
        await expect(page.getByTestId("word-overlay")).toHaveCount(0);
    } finally { await page.evaluate(() => window.cuReleaseImageDecode()); }
    await ready(page);
    await expect(page.getByTestId("word-overlay")).toHaveCount(0);
});

test.describe("OCR retention at DPR 2", () => {
    test.use({ deviceScaleFactor: 2 });
    test("quarter turns, fit/zoom/pan and resizing keep OCR unpainted without new source resources", async ({ page }) => {
        await marker(page);
        await upload(page, synthetic());
        const resources = await alive(page);
        for (let turn = 0; turn < 4; turn++) {
            if (turn) await rotateSource(page);
            await fitSource(page, turn % 2 ? "width" : "page");
            await page.getByRole("combobox", { name: "Zoom", exact: true }).selectOption("100");
            await ready(page);
            await page.getByRole("button", { name: "Zoom in", exact: true }).click();
            await ready(page);
            await expect(page.getByTestId("word-overlay")).toHaveCount(0);
            await page.getByRole("group", { name: "Source viewport", exact: true }).press("ArrowRight");
            expect(await alive(page)).toEqual(resources);
        }
        await page.setViewportSize({ width: 1100, height: 800 });
        await ready(page);
        await expect(page.getByTestId("word-overlay")).toHaveCount(0);
    });
});
