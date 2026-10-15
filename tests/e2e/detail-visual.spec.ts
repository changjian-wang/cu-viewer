import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { ready } from "./viewerAssertions";

test.use({
    viewport: { width: 1600, height: 1040 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
    launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] },
});
test.skip(process.platform !== "win32", "Visual references use Windows Segoe UI with installed Chrome/Edge.");
test.skip(process.env.CU_VERIFY_PRODUCT_SCREENSHOTS === "false", "Hosted functional runs do not approve or rewrite visual references.");

test.beforeEach(async ({ page, context }) => {
    await context.route("**/*", route => {
        const url = route.request().url();
        if (url.startsWith("http://127.0.0.1:5173/") || url.startsWith("blob:") || url.startsWith("data:")) return route.continue();
        throw new Error(`Unexpected external visual request: ${url}`);
    });
    await page.goto("/");
    await ready(page);
});

async function snapshot(page: Page, name: string): Promise<void> {
    await page.locator(".prototype-banner").click({ position: { x: 10, y: 10 } });
    await page.evaluate(async () => { await document.fonts.ready; });
    await expect(page).toHaveScreenshot(name, { fullPage: true });
}

test("real Paragraphs and native Tables preserve the product layout and source-linked selection", async ({ page }) => {
    const pane = page.getByRole("region", { name: "Extraction results" });
    await pane.getByRole("tab", { name: "Paragraphs", exact: true }).click();
    await pane.getByRole("button", { name: "Select Paragraph 1", exact: true }).click();
    await ready(page);
    await expect(page.getByTestId("source-overlay")).toBeVisible();
    await snapshot(page, "detail-paragraphs.png");
    await pane.getByRole("tab", { name: "Tables", exact: true }).click();
    await pane.getByRole("button", { name: "Select Table 1, row 1, column 1", exact: true }).click();
    await ready(page);
    await expect(pane.getByRole("table")).toHaveCount(1);
    await expect(pane.locator(".cu-table-navigation")).toContainText("1 of 9");
    await snapshot(page, "detail-tables.png");
});

test("Figures, Signatures and Metadata have reviewed source previews and safe read-only values", async ({ page }) => {
    await page.getByLabel("Choose source file").setInputFiles(resolve("tests", "fixtures", "images", "orientation-marker.png"));
    await ready(page);
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "synthetic-visual-preview.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({
            apiVersion: "2026-06-01-preview", analyzerId: "synthetic-visual-preview",
            contents: [{
                kind: "document", unit: "pixel", pages: [{ pageNumber: 1, width: 96, height: 64 }],
                figures: [{ id: "synthetic-figure", kind: "chart", role: "logo",
                    caption: { content: "Synthetic figure, not a service result" }, description: "Source crop from the licensed test marker.",
                    footnotes: [{ content: "Fixture-only visual evidence." }], source: "D(1,0,0,48,0,48,32,0,32)" }],
                signatures: [{ id: "synthetic-signature", role: "signature",
                    source: "D(1,48,32,96,32,96,64,48,64)" }],
                metadata: { Title: "Synthetic preview fixture", Author: "Contoso", Note: "Not a CU Analyze response." },
            }],
        })),
    });
    const pane = page.getByRole("region", { name: "Extraction results" });
    await expect(pane.getByRole("img", { name: "Figure 1 region 1 preview on page 1" })).toBeVisible();
    await pane.getByRole("button", { name: "Select Figure 1", exact: true }).click();
    await snapshot(page, "detail-figures.png");
    await pane.getByRole("tab", { name: "Signatures", exact: true }).click();
    await expect(pane.getByRole("img", { name: "Signature 1 region 1 preview on page 1" })).toBeVisible();
    await pane.getByRole("button", { name: "Select Signature 1", exact: true }).click();
    await snapshot(page, "detail-signatures.png");
    await pane.getByRole("tab", { name: "Metadata", exact: true }).click();
    await expect(pane.getByRole("table", { name: "Returned metadata" })).toBeVisible();
    await snapshot(page, "detail-metadata.png");
});

test("Python, C# and JavaScript read-only SDK examples retain syntax highlighting and copy controls", async ({ page }) => {
    const pane = page.getByRole("region", { name: "Extraction results" });
    await pane.getByRole("tab", { name: "Code", exact: true }).click();
    for (const [language, filename] of [
        ["Python", "detail-code-python.png"], ["C#", "detail-code-csharp.png"], ["JavaScript", "detail-code-javascript.png"],
    ]) {
        if (!language || !filename) throw new Error("Visual code-language mapping is missing.");
        await pane.getByRole("button", { name: language, exact: true }).click();
        await expect(pane.getByLabel(`${language} SDK sample`)).toBeVisible();
        await expect(pane.getByRole("button", { name: "Copy SDK sample", exact: true })).toBeVisible();
        await snapshot(page, filename);
    }
});

test("right-side Fields and Paragraphs hover show their distinct Studio source previews", async ({ page }) => {
    const pane = page.getByRole("region", { name: "Extraction results" });
    await page.locator(".prototype-banner").click({ position: { x: 10, y: 10 } });
    await pane.getByRole("button", { name: "BillingAddress", exact: true }).hover();
    const fieldPreview = page.getByRole("tooltip", { name: "Field preview" });
    await expect(fieldPreview).toBeVisible();
    await expect(fieldPreview.locator("dt")).toHaveText(["Value", "Confidence"]);
    await page.evaluate(async () => { await document.fonts.ready; });
    await expect(page).toHaveScreenshot("studio-field-popover.png", { fullPage: true });
    await pane.getByRole("tab", { name: "Paragraphs", exact: true }).click();
    await pane.getByRole("button", { name: "Select Paragraph 1", exact: true }).hover();
    const paragraphPreview = page.getByRole("tooltip", { name: "Paragraph preview" });
    await expect(paragraphPreview).toBeVisible();
    await expect(paragraphPreview.locator("dt")).toHaveText(["Content"]);
    await page.evaluate(async () => { await document.fonts.ready; });
    await expect(page).toHaveScreenshot("studio-paragraph-popover.png", { fullPage: true });
});

test("source table icons show row/column counts and open the Studio-style readonly Table modal", async ({ page }) => {
    const marker = page.getByRole("button", { name: "Open Table 3", exact: true });
    await page.locator(".prototype-banner").click({ position: { x: 10, y: 10 } });
    await marker.hover();
    await expect(page.getByRole("tooltip", { name: "Table preview" })).toContainText("Rows:");
    await expect(page.getByRole("tooltip", { name: "Table preview" })).toContainText("Columns: 2");
    await page.evaluate(async () => { await document.fonts.ready; });
    await expect(page).toHaveScreenshot("studio-table-marker-hover.png", { fullPage: true });
    await marker.click();
    const dialog = page.getByRole("dialog", { name: "Table", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("table")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close table" })).toBeVisible();
    await page.evaluate(async () => { await document.fonts.ready; });
    await expect(page).toHaveScreenshot("studio-table-dialog.png", { fullPage: true });
});

test("Markdown keeps the permanent yellow OCR word layer while hiding tab-specific polygon outlines", async ({ page }) => {
    await page.getByRole("tab", { name: "Markdown", exact: true }).click();
    await expect(page.getByRole("heading", { name: "INVOICE", exact: true })).toBeVisible();
    await expect(page.getByTestId("word-overlay")).toHaveAttribute("data-word-count", "197");
    await expect(page.getByTestId("result-overlay")).toHaveCount(0);
    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
    await expect(page.getByTestId("table-markers")).toBeVisible();
    await snapshot(page, "studio-words-markdown.png");
});
