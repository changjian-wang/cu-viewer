import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { checkPolygon, ready, rotateSource } from "./viewerAssertions";
import { alive, trackSourceResources } from "./sourceResources";

async function upload(page: Page, result: unknown): Promise<void> {
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "synthetic-detail-result.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(result)),
    });
}

test.beforeEach(async ({ page, context }) => {
    await trackSourceResources(page);
    await context.route("**/*", route => {
        const url = route.request().url();
        if (url.startsWith("http://127.0.0.1:5173/") || url.startsWith("blob:") || url.startsWith("data:")) return route.continue();
        throw new Error(`Unexpected external detail-view request: ${url}`);
    });
    await page.goto("/");
    await ready(page);
});

test("real paragraphs and source tables navigate existing results without resetting source transforms", async ({ page }) => {
    const pane = page.getByRole("region", { name: "Extraction results" });
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await ready(page);
    await rotateSource(page);
    await ready(page);
    const zoom = await page.getByLabel("Zoom percentage").textContent();
    await pane.getByRole("tab", { name: "Paragraphs", exact: true }).click();
    await expect(pane.getByRole("list", { name: "Returned paragraphs" }).getByRole("listitem")).toHaveCount(174);
    await pane.getByRole("button", { name: "Select Paragraph 1", exact: true }).press("Enter");
    await ready(page);
    await checkPolygon(page, [
        { x: 0.5753 / 8.5, y: 0.6576 / 11 }, { x: 2.3367 / 8.5, y: 0.6571 / 11 },
        { x: 2.3367 / 8.5, y: 0.8911 / 11 }, { x: 0.5753 / 8.5, y: 0.8917 / 11 },
    ], 90);
    await expect(pane.getByRole("button", { name: "Select Paragraph 1", exact: true })).toHaveAttribute("aria-pressed", "true");
    await pane.getByRole("button", { name: "Select Paragraph 143", exact: true }).click();
    await ready(page);
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("4");
    await expect(page.getByLabel("Zoom percentage")).toHaveText(zoom ?? "");

    const table = page.getByTestId("source-tables").getByRole("button", { name: "Locate Table 9 in results", exact: true });
    await table.press("Space");
    await ready(page);
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("4");
    await expect(pane.getByRole("tab", { name: "Fields", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(pane.locator(".cu-fields-review-footer")).toContainText("no corresponding extracted fields");
    await expect(pane.getByRole("tab", { name: "Tables", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Zoom percentage")).toHaveText(zoom ?? "");
    await pane.getByRole("tab", { name: "Result", exact: true }).click();
    await expect(pane.getByRole("tree", { name: "Original Analyze result JSON" })).toBeVisible();
    await pane.getByRole("tab", { name: "Fields", exact: true }).click();
    await expect(pane.locator(".cu-fields-review-footer")).toContainText("no corresponding extracted fields");
});

test.describe("source thumbnails at DPR 2", () => {
    test.use({ deviceScaleFactor: 2 });
    test("Figures and Signatures crop actual pixels and metadata remains safely copyable", async ({ page, context }) => {
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
        await page.getByLabel("Choose source file").setInputFiles(resolve("tests", "fixtures", "images", "orientation-marker.png"));
        await ready(page);
        await upload(page, {
            apiVersion: "2026-06-01-preview", analyzerId: 'saved-"analyzer"',
            contents: [{
                kind: "document", unit: "pixel", pages: [{ pageNumber: 1, width: 96, height: 64 }],
                figures: [{ id: "figure-id", kind: "chart", role: "logo", caption: { content: "Returned caption" },
                    description: "Returned description", footnotes: [{ content: "Returned footnote" }],
                    source: "D(1,0,0,48,0,48,32,0,32)" }],
                signatures: [{ id: "signature-id", role: "signature", source: "D(1,48,32,96,32,96,64,48,64)" }],
                metadata: { Zebra: "Returned first", Author: '<script>window.__bad=true</script>' },
            }],
        });
        const pane = page.getByRole("region", { name: "Extraction results" });
        await expect(pane.getByRole("tab")).toHaveText(["Figures", "Signatures", "Metadata", "Result"]);
        const figure = pane.getByRole("img", { name: "Figure 1 region 1 preview on page 1" });
        await expect(figure).toBeVisible();
        const figurePixel = await figure.evaluate(element => {
            if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected a cropped figure canvas.");
            const context = element.getContext("2d");
            if (!context) throw new Error("Thumbnail pixels are unavailable.");
            return { width: element.width, height: element.height,
                pixel: Array.from(context.getImageData(element.width / 2, element.height / 2, 1, 1).data) };
        });
        expect(figurePixel).toEqual({ width: 96, height: 64, pixel: [209, 52, 56, 255] });
        await expect(pane.getByText("Returned description", { exact: true })).toBeVisible();
        await expect(pane.getByText("Caption: Returned caption", { exact: true })).toBeVisible();
        await pane.getByRole("button", { name: "Select Figure 1", exact: true }).click();
        await checkPolygon(page, [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 0.5 }, { x: 0, y: 0.5 }], 0);

        await pane.getByRole("tab", { name: "Signatures", exact: true }).click();
        const signature = pane.getByRole("img", { name: "Signature 1 region 1 preview on page 1" });
        await expect(signature).toBeVisible();
        expect(await signature.evaluate(element => {
            if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected a signature canvas.");
            const context = element.getContext("2d");
            if (!context) throw new Error("Signature pixels are unavailable.");
            return Array.from(context.getImageData(element.width / 2, element.height / 2, 1, 1).data);
        })).toEqual([255, 170, 68, 255]);
        await pane.getByRole("button", { name: "Select Signature 1", exact: true }).press("Enter");
        await checkPolygon(page, [{ x: 0.5, y: 0.5 }, { x: 1, y: 0.5 }, { x: 1, y: 1 }, { x: 0.5, y: 1 }], 0);
        await pane.getByRole("tab", { name: "Metadata", exact: true }).click();
        await expect(pane.getByRole("rowheader")).toHaveText(["Zebra", "Author"]);
        await pane.getByRole("button", { name: "Copy metadata Author", exact: true }).click();
        await expect(pane.getByText("Copied", { exact: true })).toBeVisible();
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('<script>window.__bad=true</script>');

        await expect(pane.getByRole("tab", { name: "Code", includeHidden: true, exact: true })).toHaveCount(0);
        await expect(pane.locator("script, iframe, img, textarea")).toHaveCount(0);
        expect(await page.evaluate(() => "__bad" in window)).toBe(false);
        await expect.poll(() => alive(page)).toEqual({ workers: 0, bitmaps: 1, urls: 0 });
        await page.getByRole("button", { name: "PDF", exact: true }).click();
        await ready(page);
        await expect.poll(async () => (await alive(page)).bitmaps).toBe(0);
    });
});

test("multi-region details reach all pages and raw merged/invalid native tables remain inspectable", async ({ page }) => {
    await upload(page, {
        apiVersion: "2026-06-01-preview",
        contents: [{
            kind: "document", unit: "inch",
            pages: [{ pageNumber: 1, width: 8.5, height: 11 }, { pageNumber: 4, width: 8.2639, height: 11.6806 }],
            paragraphs: [{ content: "Synthetic cross-page paragraph",
                source: "D(1,1,1,1,1);D(1,3,1,1,1);D(4,1,1,1,1)" }],
            tables: [{
                rowCount: 2, columnCount: 2,
                cells: [{ rowIndex: 0, columnIndex: 0, columnSpan: 2, kind: "columnHeader", content: "Merged heading" },
                    { rowIndex: 1, columnIndex: 0, content: "Grounded", source: "D(4,1,1,1,1)" },
                    { rowIndex: 1, columnIndex: 1, content: "Not grounded" }],
            }],
            figures: [{ id: "pdf-figure", description: "Synthetic PDF crop", source: "D(4,0,0,8,4)" }],
        }],
    });
    const pane = page.getByRole("region", { name: "Extraction results" });
    await pane.getByRole("tab", { name: "Paragraphs", exact: true }).click();
    await pane.getByRole("button", { name: "Select Paragraph 1", exact: true }).click();
    await ready(page);
    await expect(page.getByTestId("source-overlay").locator("polygon")).toHaveCount(2);
    await page.getByRole("button", { name: "Next source region", exact: true }).click();
    await page.getByRole("button", { name: "Next source region", exact: true }).click();
    await ready(page);
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("4");
    await expect(page.getByTestId("source-overlay").locator("polygon")).toHaveCount(1);
    await pane.getByRole("tab", { name: "Figures", exact: true }).click();
    const crop = pane.getByRole("img", { name: "Figure 1 region 1 preview on page 4" });
    await expect(crop).toBeVisible();
    expect(await crop.evaluate(element => {
        if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected a cropped PDF canvas.");
        const context = element.getContext("2d");
        if (!context) throw new Error("PDF thumbnail inspection is unavailable.");
        const data = context.getImageData(0, 0, element.width, element.height).data;
        return data.some((value, index) => index % 4 !== 3 && value < 200);
    })).toBe(true);
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("4");
    await pane.getByRole("tab", { name: "Fields", exact: true }).click();
    await expect(pane.getByRole("heading", { name: "No extracted fields", exact: true })).toBeVisible();
    await expect(pane.getByRole("tab", { name: "Tables", exact: true })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("4");
    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
    await upload(page, {
        apiVersion: "2025-11-01", contents: [{ kind: "document", tables: [{
            rowCount: 1, columnCount: 2, cells: [
                { rowIndex: 0, columnIndex: 0, columnSpan: 2, content: "Merged" },
                { rowIndex: 0, columnIndex: 1, content: "Overlap" },
            ],
        }] }],
    });
    await pane.locator(".cu-issues summary").click();
    await expect(pane.locator(".cu-issues")).toContainText("spans overlap");
    await expect(pane.getByRole("table", { name: /Returned table/ })).toHaveCount(0);
    await pane.getByRole("tab", { name: "Result", exact: true }).click();
    await expect(pane.getByRole("tree", { name: "Original Analyze result JSON" })).toBeVisible();
    await expect(page.getByTestId("rendered-page")).toBeVisible();
});
