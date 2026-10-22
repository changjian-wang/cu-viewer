import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { ready, selectResultView } from "./viewerAssertions";
import { alive, trackSourceResources } from "./sourceResources";

declare global {
    interface Window {
        cuWordPolygons: { polygon: { x: number; y: number }[]; fill: string | CanvasGradient | CanvasPattern;
            stroke: string | CanvasGradient | CanvasPattern; lineWidth: number }[];
    }
}

async function wordPoints(page: Page) {
    return page.evaluate(() => window.cuWordPolygons.map(word => word.polygon));
}

async function checkWord(page: Page, points: { x: number; y: number }[], rotation: number, index = 0): Promise<void> {
    const box = await page.getByTestId("word-overlay").boundingBox();
    const actual = (await wordPoints(page))[index];
    if (!box || !actual) throw new Error("Rendered word geometry is unavailable.");
    for (const [position, point] of points.entries()) {
        const value = actual[position];
        if (!value) throw new Error("The drawn word vertex is missing.");
        const expected = rotation === 0 ? { x: point.x * box.width, y: point.y * box.height } :
            rotation === 90 ? { x: (1 - point.y) * box.width, y: point.x * box.height } :
            rotation === 180 ? { x: (1 - point.x) * box.width, y: (1 - point.y) * box.height } :
                { x: point.y * box.width, y: (1 - point.x) * box.height };
        expect(Math.hypot(value.x - expected.x, value.y - expected.y)).toBeLessThanOrEqual(1);
    }
}

async function upload(page: Page, input: unknown): Promise<void> {
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "synthetic-word-layer.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(input)),
    });
}

function synthetic() {
    return { apiVersion: "2026-06-01-preview", analyzerId: "synthetic-word-layer", contents: [{
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

test.beforeEach(async ({ page }) => {
    await trackSourceResources(page);
    await page.addInitScript(() => {
        window.cuWordPolygons = [];
        const paths = new WeakMap<CanvasRenderingContext2D, { x: number; y: number }[]>();
        const prototype = CanvasRenderingContext2D.prototype;
        /* eslint-disable @typescript-eslint/unbound-method -- Originals are explicitly call/apply-bound below. */
        const clear = prototype.clearRect, begin = prototype.beginPath, move = prototype.moveTo,
            line = prototype.lineTo, stroke = prototype.stroke;
        const strokeWithoutPath: (this: CanvasRenderingContext2D) => void = prototype.stroke;
        /* eslint-enable @typescript-eslint/unbound-method */
        prototype.clearRect = function (...args) {
            if (this.canvas.dataset.testid === "word-overlay") window.cuWordPolygons = [];
            clear.apply(this, args);
        };
        prototype.beginPath = function () {
            if (this.canvas.dataset.testid === "word-overlay") paths.set(this, []);
            begin.call(this);
        };
        prototype.moveTo = function (x, y) { paths.get(this)?.push({ x, y }); move.call(this, x, y); };
        prototype.lineTo = function (x, y) { paths.get(this)?.push({ x, y }); line.call(this, x, y); };
        prototype.stroke = function (path?: Path2D) {
            const polygon = paths.get(this);
            if (polygon) window.cuWordPolygons.push({ polygon: polygon.slice(), fill: this.fillStyle,
                stroke: this.strokeStyle, lineWidth: this.lineWidth });
            if (path) stroke.call(this, path);
            else strokeWithoutPath.call(this);
        };
    });
    await page.goto("/");
    await ready(page);
});

test("yellow OCR words persist beneath all eight result tabs independently of selection and missing-field filtering", async ({ page }) => {
    await marker(page);
    await upload(page, synthetic());
    const words = page.getByTestId("word-overlay");
    await expect(words).toHaveAttribute("data-word-count", "2");
    await expect(words).toHaveAttribute("aria-hidden", "true");
    await expect(words).toHaveCSS("pointer-events", "none");
    expect(await page.evaluate(() => window.cuWordPolygons.map(word => word.lineWidth))).toEqual([1, 1]);
    const color = await words.evaluate(element => {
        if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected the OCR word canvas.");
        const context = element.getContext("2d");
        if (!context) throw new Error("Word pixels are unavailable.");
        return Array.from(context.getImageData(Math.floor(element.width * 15 / 96), Math.floor(element.height * 9 / 64), 1, 1).data);
    });
    expect(color[0]).toBeGreaterThanOrEqual(249);
    expect(color[0]).toBeLessThanOrEqual(252);
    expect(color[1]).toBe(255);
    expect(color[2]).toBeGreaterThanOrEqual(126);
    expect(color[2]).toBeLessThanOrEqual(130);
    expect(color[3]).toBe(64);
    const element = await words.elementHandle();
    if (!element) throw new Error("The persistent word layer is unavailable.");
    const points = await wordPoints(page);
    const sourceBounds = await page.getByTestId("rendered-page").boundingBox();
    const resources = await alive(page);
    await page.getByRole("button", { name: "Field", exact: true }).press("Enter");
    await page.locator(".prototype-banner").click();
    expect(await words.evaluate(wordLayer => {
        const result = wordLayer.parentElement?.querySelector('[data-testid="result-overlay"]');
        return Boolean(result && (wordLayer.compareDocumentPosition(result) & Node.DOCUMENT_POSITION_FOLLOWING));
    })).toBe(true);
    for (const name of ["Fields", "Markdown", "Paragraphs", "Tables", "Figures", "Signatures", "Metadata", "Result"]) {
        await selectResultView(page.getByRole("region", { name: "Extraction results" }), name);
        await expect(words).toBeVisible();
        expect(await words.evaluate((current, initial) => current === initial, element)).toBe(true);
        expect(await wordPoints(page)).toEqual(points);
        expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(sourceBounds);
        expect(await alive(page)).toEqual(resources);
    }
    await page.getByRole("tab", { name: "Fields", exact: true }).click();
    await page.getByRole("switch", { name: "Hide missing fields" }).click();
    await expect(words).toHaveAttribute("data-word-count", "2");
    await expect(page.getByRole("button", { name: "Field", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("words without extracted fields still have the fixed yellow color and the source canvas itself remains unchanged", async ({ page }) => {
    await marker(page);
    const pixels = await page.getByTestId("source-canvas").evaluate(element => {
        if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected the unchanged source canvas.");
        return element.toDataURL();
    });
    const input = synthetic();
    const content = input.contents[0];
    if (!content) throw new Error("Expected word fixture content.");
    Reflect.deleteProperty(content, "fields");
    await upload(page, input);
    await expect(page.getByRole("tab", { name: "Fields", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("word-overlay")).toHaveAttribute("data-word-count", "2");
    expect(await page.getByTestId("source-canvas").evaluate(element => {
        if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected the unchanged source canvas.");
        return element.toDataURL();
    })).toBe(pixels);
    await selectResultView(page.getByRole("region", { name: "Extraction results" }), "Result");
    await expect(page.getByRole("tree", { name: "Original Analyze result JSON" })).toBeVisible();
    await expect(page.getByTestId("result-overlay")).toHaveCount(0);
    await expect(page.getByTestId("word-overlay")).toHaveAttribute("data-word-count", "2");
});

test("real saved PDF and receipt words are page-scoped and stale yellow geometry disappears on input failure or replacement", async ({ page }) => {
    const words = page.getByTestId("word-overlay");
    for (const [number, count] of [[1, 197], [2, 95], [3, 106], [4, 140]] as const) {
        const input = page.getByRole("textbox", { name: "Page number" });
        await input.fill(String(number));
        await input.press("Enter");
        await ready(page);
        await expect(words).toHaveAttribute("data-word-count", String(count));
        await expect(words).toHaveAttribute("data-page-number", String(number));
    }
    await page.getByRole("button", { name: "Receipt PNG", exact: true }).click();
    await ready(page);
    await expect(words).toHaveAttribute("data-word-count", "39");
    await page.getByLabel("Choose source file").setInputFiles({
        name: "corrupt.pdf", mimeType: "application/pdf", buffer: Buffer.from("corrupt"),
    });
    await expect(page.getByRole("heading", { name: "Source could not be displayed" })).toBeVisible();
    await expect(words).toHaveCount(0);
    await expect.poll(() => alive(page)).toEqual({ workers: 0, bitmaps: 0, urls: 0 });
    await page.getByRole("button", { name: "Receipt PNG", exact: true }).click();
    await ready(page);
    await expect(words).toHaveAttribute("data-word-count", "39");
    await upload(page, { apiVersion: "2025-11-01", contents: [{ kind: "document", unit: "pixel",
        pages: [{ pageNumber: 1, width: 1743, height: 878 }], fields: { Keep: { type: "string", valueString: "No OCR words" } } }] });
    await expect(words).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Keep", exact: true })).toBeVisible();
});

test("malformed word sources show path-specific warnings, retain valid field data and never become fabricated yellow regions", async ({ page }) => {
    await marker(page);
    await upload(page, { apiVersion: "2025-11-01", contents: [{ kind: "document", unit: "pixel",
        pages: [{ pageNumber: 1, width: 96, height: 64, words: [
            { content: "Invalid", source: "bad" }, { content: "Outside", source: "D(1,95,10,20,10)" },
            { content: "Valid", source: "D(1,5,5,20,8)" },
        ] }], fields: { Keep: { type: "string", valueString: "Still inspectable" } } }] });
    await expect(page.getByTestId("word-overlay")).toHaveAttribute("data-word-count", "1");
    expect((await wordPoints(page)).length).toBe(1);
    await expect(page.getByRole("button", { name: "Keep", exact: true })).toBeVisible();
    await page.locator(".cu-issues summary").click();
    await expect(page.locator(".cu-issues")).toContainText("/contents/0/pages/0/words/0/source");
    await expect(page.locator(".cu-issues")).toContainText("source-out-of-bounds");
});

test("content changes replace the word collection and pending source decoding never shows the previous yellow layer", async ({ page }) => {
    await marker(page);
    await upload(page, { apiVersion: "2025-11-01", contents: [
        { kind: "document", unit: "pixel", pages: [{ pageNumber: 1, width: 96, height: 64,
            words: [{ content: "First", source: "D(1,5,5,20,8)" }] }],
        fields: { First: { type: "string", valueString: "First content" } } },
        { kind: "document", unit: "pixel", pages: [{ pageNumber: 1, width: 96, height: 64,
            words: [{ content: "Second", source: "D(1,40,20,20,8)" }] }],
        fields: { Second: { type: "string", valueString: "Second content" } } },
    ] });
    const words = page.getByTestId("word-overlay");
    await expect(words).toHaveAttribute("data-content-id", "/contents/0");
    const points = await wordPoints(page);
    await page.getByRole("combobox", { name: "Result content" }).selectOption("1");
    await expect(words).toHaveAttribute("data-content-id", "/contents/1");
    expect(await wordPoints(page)).not.toEqual(points);
    await page.evaluate(() => { window.cuHoldImageDecode = true; });
    try {
        await page.getByRole("button", { name: "Receipt PNG", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Loading source..." })).toBeVisible();
        await expect(words).toHaveCount(0);
    } finally {
        await page.evaluate(() => window.cuReleaseImageDecode());
    }
    await ready(page);
    await expect(words).toHaveAttribute("data-word-count", "39");
});

test.describe("word projection at DPR 2", () => {
    test.use({ deviceScaleFactor: 2 });
    test("yellow words align through all quarter turns, fit/zoom/pan and viewport resizing with no new source resources", async ({ page }) => {
        await marker(page);
        await upload(page, synthetic());
        const resources = await alive(page);
        const points = [{ x: 5 / 96, y: 5 / 64 }, { x: 25 / 96, y: 5 / 64 },
            { x: 25 / 96, y: 13 / 64 }, { x: 5 / 96, y: 13 / 64 }];
        for (let rotation = 0; rotation < 360; rotation += 90) {
            if (rotation) {
                await page.getByRole("button", { name: "Rotate 90°", exact: true }).click();
                await ready(page);
            }
            for (const name of ["Fit page", "Fit width", "Zoom in", "Zoom out"]) {
                await page.getByRole("button", { name, exact: true }).click();
                await ready(page);
                await checkWord(page, points, rotation);
                await checkWord(page, [{ x: 40 / 96, y: 20 / 64 }, { x: 60 / 96, y: 19 / 64 },
                    { x: 61 / 96, y: 27 / 64 }, { x: 41 / 96, y: 28 / 64 }], rotation, 1);
            }
            await page.getByRole("group", { name: "Source viewport", exact: true }).focus();
            await page.keyboard.press("ArrowRight");
            await page.keyboard.press("ArrowDown");
            await checkWord(page, points, rotation);
            expect(await alive(page)).toEqual(resources);
        }
        await page.setViewportSize({ width: 1100, height: 800 });
        await ready(page);
        await checkWord(page, points, 270);
    });
});
