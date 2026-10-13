import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { MAX_JSON_CHARACTERS, MAX_JSON_VALUES } from "../../src/components/JsonPane";
import { MAX_MARKDOWN_CHARACTERS } from "../../src/components/MarkdownPane";
import { ready } from "./viewerAssertions";

const amountId = "/contents/0/fields/AmountDue/valueObject/Amount";

function syntheticResult(markdown?: string, extra: Record<string, unknown> = {}): unknown {
    const content: Record<string, unknown> = {
        kind: "document",
        unit: "pixel",
        pages: [{ pageNumber: 1, width: 1743, height: 878, angle: 0 }],
        fields: {},
    };
    if (markdown !== undefined) content.markdown = markdown;
    return {
        apiVersion: "2025-11-01",
        analyzerId: "synthetic-rich-result-verification",
        contents: [content],
        ...extra,
    };
}

async function uploadResult(page: Page, result: unknown, name: string): Promise<void> {
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name,
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(result)),
    });
}

test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await ready(page);
});

test("real Markdown and original JSON preserve source page, zoom, rotation and pinned field state", async ({ page }) => {
    const pane = page.getByRole("region", { name: "Extraction results" });
    await page.getByRole("button", { name: "Expand AmountDue", exact: true }).click();
    await pane.locator(`[data-field-id="${amountId}"]`).getByRole("button", { name: "Amount", exact: true }).click();
    await page.locator(".prototype-banner").hover();
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await ready(page);
    await page.getByRole("button", { name: "Rotate 90°", exact: true }).click();
    await ready(page);
    await page.getByRole("textbox", { name: "Page number" }).fill("4");
    await page.getByRole("textbox", { name: "Page number" }).press("Enter");
    await ready(page);
    const beforePan = await page.getByTestId("rendered-page").boundingBox();
    const sourceViewport = await page.locator(".cu-document-container").boundingBox();
    if (!beforePan || !sourceViewport) throw new Error("The source viewport is not laid out.");
    await page.mouse.move(sourceViewport.x + 24, sourceViewport.y + 24);
    await page.mouse.down();
    await page.mouse.move(sourceViewport.x + 47, sourceViewport.y + 41);
    await page.mouse.up();
    const zoom = await page.getByLabel("Zoom percentage").textContent();
    const sourceBounds = await page.getByTestId("rendered-page").boundingBox();
    if (!sourceBounds) throw new Error("The source page is not laid out.");
    expect(sourceBounds.x - beforePan.x).toBeCloseTo(23, 0);
    expect(sourceBounds.y - beforePan.y).toBeCloseTo(17, 0);

    await pane.getByRole("tab", { name: "Markdown", exact: true }).click();
    await expect(pane.getByRole("heading", { name: "INVOICE", exact: true })).toBeVisible();
    await expect(pane.getByRole("table")).toHaveCount(9);
    await expect(pane.getByRole("columnheader", { name: "SALESPERSON", exact: true })).toBeVisible();
    await expect(pane.locator(".cu-rich-result-scroll")).toHaveJSProperty("scrollLeft", 0);
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("4");
    await expect(page.getByLabel("Zoom percentage")).toHaveText(zoom ?? "");
    await expect(pane.getByRole("status")).toHaveText("Pinned: AmountDue / Amount");
    await expect(pane).toHaveScreenshot("rich-markdown.png");

    await pane.getByRole("tab", { name: "Markdown", exact: true }).press("ArrowRight");
    await expect(pane.getByRole("tab", { name: "JSON", exact: true })).toHaveAttribute("aria-selected", "true");
    const tree = pane.getByRole("tree", { name: "Original Analyze result JSON" });
    await expect(tree).toBeVisible();
    await expect(tree.locator(".cu-json-label", { hasText: "id:" })).toBeVisible();
    await expect(tree.locator(".cu-json-label", { hasText: "usage:" })).toBeVisible();
    await tree.locator(".cu-json-label", { hasText: "result:" }).click();
    await expect(tree.locator(".cu-json-label", { hasText: "analyzerId:" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("4");
    await expect(page.getByLabel("Zoom percentage")).toHaveText(zoom ?? "");
    const afterSwitchBounds = await page.getByTestId("rendered-page").boundingBox();
    expect(afterSwitchBounds?.width).toBeCloseTo(sourceBounds.width, 1);
    expect(afterSwitchBounds?.height).toBeCloseTo(sourceBounds.height, 1);
    await expect(pane).toHaveScreenshot("rich-json.png");

    await pane.getByRole("tab", { name: "Fields", exact: true }).click();
    await expect(pane.locator(`[data-field-id="${amountId}"]`).getByRole("button", { name: "Amount", exact: true }))
        .toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("4");
    await expect(page.getByLabel("Zoom percentage")).toHaveText(zoom ?? "");

    const address = pane.locator('[data-field-id="/contents/0/fields/BillingAddress"]');
    await address.getByRole("button", { name: "BillingAddress", exact: true }).click();
    await page.locator(".prototype-banner").hover();
    await page.getByRole("button", { name: "Next source region" }).click();
    await expect(page.getByRole("complementary", { name: "Source region navigation" })).toContainText("Region 2 of 2");
    await pane.getByRole("tab", { name: "Markdown", exact: true }).click();
    await pane.getByRole("tab", { name: "JSON", exact: true }).click();
    await pane.getByRole("tab", { name: "Fields", exact: true }).click();
    await expect(address.getByRole("button", { name: "BillingAddress", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("complementary", { name: "Source region navigation" })).toContainText("Region 2 of 2");
});

test("Markdown sanitizes active content while retaining headings, lists, tables and code", async ({ page }) => {
    const externalRequests: string[] = [];
    const pageErrors: string[] = [];
    page.on("request", request => {
        if (request.url().startsWith("https://example.invalid/")) externalRequests.push(request.url());
    });
    page.on("pageerror", error => pageErrors.push(error.message));
    const markdown = [
        "# Safe rich result",
        "",
        "- first",
        "- second",
        "",
        "<table><tr><th>Item</th></tr><tr><td>Surface</td></tr></table>",
        "",
        "`inline`",
        "",
        "```text",
        "code block",
        "```",
        "",
        "[safe](https://example.com/result)",
        "[unsafe](javascript:window.__cuMarkdownExecuted=true)",
        "<a href=\"javascript:window.__cuMarkdownExecuted=true\">raw unsafe</a>",
        "<script>window.__cuMarkdownExecuted = true</script>",
        "<iframe src=\"https://example.invalid/frame\"></iframe>",
        "<img src=\"https://example.invalid/tracker.png\" onerror=\"window.__cuMarkdownExecuted=true\" alt=\"receipt\">",
    ].join("\n");
    await uploadResult(page, syntheticResult(markdown), "safe-rich-result.json");

    const pane = page.getByRole("region", { name: "Extraction results" });
    await pane.getByRole("tab", { name: "Markdown", exact: true }).click();
    await expect(pane.getByRole("heading", { name: "Safe rich result" })).toBeVisible();
    await expect(pane.getByRole("listitem")).toHaveCount(2);
    await expect(pane.getByRole("table")).toContainText("Surface");
    await expect(pane.locator("pre code")).toHaveText("code block\n");
    await expect(pane.getByRole("link", { name: "safe" })).toHaveAttribute("href", "https://example.com/result");
    await expect(pane.getByRole("link", { name: /unsafe/ })).toHaveCount(0);
    await expect(pane.locator("script, iframe, img, [onerror], [onclick], a[href^='javascript:']")).toHaveCount(0);
    await expect(pane.getByText("Image omitted: receipt")).toBeVisible();
    expect(await page.evaluate(() => "__cuMarkdownExecuted" in globalThis)).toBe(false);
    expect(externalRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
});

test("missing, malformed and oversized rich results have explicit bounded states", async ({ page }, testInfo) => {
    const pane = page.getByRole("region", { name: "Extraction results" });
    await uploadResult(page, syntheticResult(), "no-markdown.json");
    await pane.getByRole("tab", { name: "Markdown", exact: true }).click();
    await expect(pane.getByRole("heading", { name: "No Markdown returned" })).toBeVisible();
    await expect(page.getByTestId("rendered-page")).toBeVisible();

    const markdownStart = Date.now();
    await uploadResult(page, syntheticResult("x".repeat(MAX_MARKDOWN_CHARACTERS + 1)), "oversized-markdown.json");
    await expect(pane.getByRole("alert")).toContainText("Markdown is too large to render");
    const markdownMilliseconds = Date.now() - markdownStart;

    const jsonStart = Date.now();
    await uploadResult(page, syntheticResult(undefined, {
        oversized: "x".repeat(MAX_JSON_CHARACTERS + 1),
    }), "oversized-json.json");
    await pane.getByRole("tab", { name: "JSON", exact: true }).click();
    await expect(pane.getByRole("alert")).toContainText("JSON is too large to render");
    const jsonMilliseconds = Date.now() - jsonStart;

    await uploadResult(page, syntheticResult(undefined, {
        oversizedValues: Array.from({ length: MAX_JSON_VALUES + 1 }, () => 0),
    }), "too-many-json-values.json");
    await expect(pane.getByRole("alert")).toContainText(`${MAX_JSON_VALUES.toLocaleString("en-US")}-value limit`);

    await uploadResult(page, {
        apiVersion: "unsupported",
        contents: [],
        rawDiagnostic: "preserved despite parser rejection",
    }, "unsupported-result.json");
    await pane.getByRole("tab", { name: "JSON", exact: true }).click();
    await expect(pane.getByRole("tree", { name: "Original Analyze result JSON" })).toBeVisible();
    await expect(pane.locator(".cu-json-label", { hasText: "rawDiagnostic:" })).toBeVisible();
    await expect(page.getByTestId("rendered-page")).toBeVisible();

    testInfo.annotations.push({
        type: "large-result-observation",
        description: `${testInfo.project.name}: Markdown ${markdownMilliseconds} ms; JSON ${jsonMilliseconds} ms. Limits: ${MAX_MARKDOWN_CHARACTERS} Markdown characters, ${MAX_JSON_CHARACTERS} JSON characters, ${MAX_JSON_VALUES} JSON values.`,
    });
});
