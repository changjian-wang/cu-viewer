import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { MAX_JSON_CHARACTERS, MAX_JSON_VALUES } from "../../frontend/src/components/JsonPane";
import { MAX_MARKDOWN_CHARACTERS } from "../../frontend/src/components/MarkdownPane";
import { expandField, ready, rotateSource } from "./viewerAssertions";

const amountId = "/contents/0/fields/AmountDue/valueObject/Amount";
const verifyProductScreenshots = process.env.CU_VERIFY_PRODUCT_SCREENSHOTS !== "false";

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

async function expectSourceKeyVisible(link: Locator): Promise<void> {
    await expect.poll(() => link.evaluate(element => {
        const key = element.closest(".cu-json-line")?.querySelector(".cu-json-label");
        const scroll = element.closest(".cu-rich-result-scroll");
        if (!key || !scroll) throw new Error("The clicked JSON key is unavailable.");
        const bounds = key.getBoundingClientRect(), viewport = scroll.getBoundingClientRect();
        return bounds.left >= viewport.left && bounds.right <= viewport.right &&
            bounds.top >= viewport.top && bounds.bottom <= viewport.bottom;
    })).toBe(true);
}

test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await ready(page);
});

test("real Markdown and original JSON preserve source page, zoom, rotation and pinned field state", async ({ page }) => {
    const pane = page.getByRole("region", { name: "Extraction results" });
    await expandField(page, "AmountDue");
    await pane.locator(`[data-field-id="${amountId}"]`).getByRole("button", { name: "Amount", exact: true }).click();
    await page.locator(".prototype-banner").hover();
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await ready(page);
    await rotateSource(page);
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
    if (verifyProductScreenshots) await expect(pane).toHaveScreenshot("rich-markdown.png");

    await pane.getByRole("tab", { name: "Result", exact: true }).click();
    await expect(pane.getByRole("tab", { name: "Result", exact: true })).toHaveAttribute("aria-selected", "true");
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
    if (verifyProductScreenshots) await expect(pane).toHaveScreenshot("rich-json.png");

    await pane.getByRole("tab", { name: "Fields", exact: true }).click();
    await expect(pane.locator(`[data-field-id="${amountId}"]`).getByRole("button", { name: "Amount", exact: true }))
        .toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("4");
    await expect(page.getByLabel("Zoom percentage")).toHaveText(zoom ?? "");

    const address = pane.locator('[data-field-id="/contents/0/fields/BillingAddress"]');
    await address.getByRole("button", { name: "BillingAddress", exact: true }).click();
    await page.locator(".prototype-banner").hover();
    await page.getByTestId("result-overlay").locator('polygon[data-outline-id="/contents/0/fields/BillingAddress"]').nth(1).press("Enter");
    const selectedFrame = page.getByTestId("source-overlay").locator("polygon");
    const addressPoints = await selectedFrame.getAttribute("points");
    if (!addressPoints) throw new Error("The selected address frame is missing.");
    await pane.getByRole("tab", { name: "Markdown", exact: true }).click();
    await pane.getByRole("tab", { name: "Result", exact: true }).click();
    await pane.getByRole("tab", { name: "Fields", exact: true }).click();
    await expect(address.getByRole("button", { name: "BillingAddress", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(selectedFrame).toHaveAttribute("points", addressPoints);
});

test("JSON key search locates repeated paths without filtering values and fits the narrow Result toolbar", async ({ page }) => {
    await uploadResult(page, {
        apiVersion: "2025-11-01",
        contents: [{
            kind: "document", unit: "pixel", pages: [{ pageNumber: 1, width: 1743, height: 878 }],
            fields: {
                Nested: { type: "object", valueObject: {
                    "a/b~": { type: "string", valueString: "source", source: "D(1,100,120,200,40)" },
                } },
                Items: { type: "array", valueArray: [
                    { type: "string", valueString: "Retained array value", source: "D(1,350,120,100,40)" },
                ] },
            },
        }],
        rawOnly: "This value contains source but is not a matching key.",
    }, "searchable-original-result.json");
    const pane = page.getByRole("region", { name: "Extraction results" });
    await pane.getByRole("tab", { name: "Result", exact: true }).click();
    const search = pane.getByRole("searchbox", { name: "Search JSON keys" });
    const position = pane.getByLabel("Current JSON key position");
    await expect(pane.locator(".cu-results-footer")).toHaveCount(0);
    await expect(pane.getByText(/Original input JSON\./)).toHaveCount(0);
    const zoom = await page.getByLabel("Zoom percentage").textContent();
    const source = await page.getByTestId("rendered-page").elementHandle();
    if (!source) throw new Error("The loaded source is unavailable.");
    await search.fill("SOURCE");
    await expect(position).toHaveText("1 / 2 keys");
    await expect(pane.locator(".cu-json-match")).toHaveCount(2);
    await expect(pane.getByText("rawOnly:", { exact: true })).toBeVisible();
    await expect(pane.getByText('"source"', { exact: true })).toBeVisible();
    await search.press("Enter");
    await expect(position).toHaveText("2 / 2 keys");
    await expect(search).toBeFocused();
    const second = pane.locator('[data-json-path="/contents/0/fields/Items/valueArray/0/source"]');
    await expect(second).toHaveAttribute("aria-selected", "true");
    const visible = await second.locator(":scope > .cu-json-line > .cu-json-label").evaluate(element => {
        const scroll = element.closest(".cu-rich-result-scroll");
        if (!scroll) throw new Error("The JSON scroll container is unavailable.");
        const target = element.getBoundingClientRect(), viewport = scroll.getBoundingClientRect();
        return target.left >= viewport.left && target.right <= viewport.right &&
            target.top >= viewport.top && target.bottom <= viewport.bottom;
    });
    expect(visible).toBe(true);
    await pane.getByRole("button", { name: "Next JSON key" }).click();
    await expect(position).toHaveText("1 / 2 keys");
    await pane.getByRole("button", { name: "Previous JSON key" }).click();
    await expect(position).toHaveText("2 / 2 keys");
    await search.fill("not-a-returned-key");
    await expect(pane.getByRole("status").filter({ hasText: "No matching JSON keys." })).toBeVisible();
    await expect(pane.getByRole("button", { name: "Next JSON key" })).toBeDisabled();
    await search.fill("fields");
    await expect(position).toHaveText("1 / 1 keys");
    await expect(page.getByLabel("Zoom percentage")).toHaveText(zoom ?? "");
    expect(await page.getByTestId("rendered-page").evaluate((element, original) => element === original, source)).toBe(true);

    await page.locator(".cu-viewer").evaluate(element => {
        if (!(element instanceof HTMLElement)) throw new Error("The viewer layout is unavailable.");
        element.style.gridTemplateColumns = "570px 8px 440px";
    });
    const footer = pane.getByRole("group", { name: "Result toolbar" });
    await expect(pane).toHaveCSS("width", "440px");
    const bounds = await footer.boundingBox(), input = await search.boundingBox();
    const navigation = await pane.getByRole("group", { name: "JSON key navigation" }).boundingBox();
    const settings = await pane.getByRole("button", { name: "Result settings" }).boundingBox();
    const sourceToolbar = await page.getByRole("group", { name: "Source document toolbar" }).boundingBox();
    if (!bounds || !input || !navigation || !settings || !sourceToolbar) throw new Error("Toolbar layout is unavailable.");
    expect(bounds.height).toBe(44);
    expect(bounds.y + bounds.height).toBeCloseTo(sourceToolbar.y + sourceToolbar.height, 1);
    expect(input.x + input.width).toBeLessThanOrEqual(navigation.x);
    expect(navigation.x + navigation.width).toBeLessThanOrEqual(settings.x);
    expect(settings.x + settings.width).toBeLessThanOrEqual(bounds.x + bounds.width);
});

test("JSON settings expand and collapse the complete tree without changing the pinned PDF source", async ({ page }) => {
    await uploadResult(page, {
        id: "saved-operation", status: "Succeeded",
        result: {
            apiVersion: "2025-11-01",
            contents: [{ kind: "document", unit: "pixel", pages: [{ pageNumber: 1, width: 1743, height: 878 }],
                fields: { Name: { type: "string", valueString: "Saved field", source: "D(1,100,120,200,40)" } } }],
        },
        usage: { documentPagesStandard: 1, tokens: { input: 123, output: 4 } },
        rawOnly: { items: [{ deep: { value: "Reached all JSON levels" } }] },
    }, "json-expansion-settings.json");
    const pane = page.getByRole("region", { name: "Extraction results" });
    await pane.getByRole("tab", { name: "Result", exact: true }).click();
    const search = pane.getByRole("searchbox", { name: "Search JSON keys" });
    await search.fill("source");
    await pane.getByRole("button", { name: "Locate source /result/contents/0/fields/Name/source", exact: true }).click();
    const frame = page.getByTestId("source-overlay").locator("polygon");
    await expect(frame).toHaveCount(1);
    const points = await frame.getAttribute("points"), zoom = await page.getByLabel("Zoom percentage").textContent();
    if (!points) throw new Error("The pinned source region is unavailable.");
    await search.fill("");
    const position = await pane.getByLabel("Current JSON key position").textContent();
    const trigger = pane.getByRole("button", { name: "Result settings", exact: true });
    await trigger.click();
    const dialog = pane.getByRole("dialog", { name: "Result settings", exact: true });
    await expect(dialog.getByRole("button", { name: "Collapse all JSON", exact: true })).toBeFocused();
    await dialog.getByRole("button", { name: "Expand all JSON", exact: true }).click();
    const tree = pane.getByRole("tree", { name: "Original Analyze result JSON" });
    await expect(tree.getByText('"Reached all JSON levels"', { exact: true })).toBeVisible();
    await expect(tree.getByRole("button", { name: "Expand JSON node", exact: true })).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Collapse all JSON", exact: true }).click();
    for (const name of ["JSON root", "result", "usage", "tokens"]) {
        await expect(tree.getByRole("treeitem", { name, exact: true })).toHaveAttribute("aria-expanded", "true");
    }
    await expect(tree.getByRole("treeitem", { name: "contents", exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect(tree.locator('[data-json-path^="/result/contents/"]')).toHaveCount(0);
    await expect(tree.getByRole("treeitem", { name: "input", exact: true })).toBeVisible();
    await expect(tree.getByRole("treeitem", { name: "output", exact: true })).toBeVisible();
    await expect(tree.getByText('"Reached all JSON levels"', { exact: true })).toBeVisible();
    await expect(pane.getByLabel("Current JSON key position")).toHaveText(position ?? "");
    await expect(frame).toHaveAttribute("points", points);
    await expect(page.getByLabel("Zoom percentage")).toHaveText(zoom ?? "");
    await expect(dialog).toBeVisible();
    await dialog.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(frame).toHaveAttribute("points", points);
    await search.fill("deep");
    await trigger.click();
    await expect(dialog.getByRole("button", { name: "Collapse all JSON", exact: true })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Expand all JSON", exact: true })).toBeDisabled();
    await page.getByRole("heading", { name: "CU Viewer", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(search).toHaveValue("deep");
});

test("JSON source links locate exact regions across contents without leaving Result or resetting zoom", async ({ page }) => {
    const pane = page.getByRole("region", { name: "Extraction results" });
    await pane.getByRole("tab", { name: "Result", exact: true }).click();
    await pane.getByRole("searchbox", { name: "Search JSON keys" }).fill("source");
    const billing = pane.getByRole("button", { name: "Locate source /result/contents/0/fields/BillingAddress/source", exact: true });
    await billing.click();
    await expectSourceKeyVisible(billing);
    await uploadResult(page, {
        apiVersion: "2025-11-01",
        contents: [
            { kind: "document", unit: "pixel", pages: [{ pageNumber: 1, width: 1743, height: 878 }],
                fields: { First: { type: "string", valueString: "First field", source: "D(1,100,120,200,40)" } } },
            { kind: "document", unit: "pixel", pages: [{ pageNumber: 2, width: 1743, height: 878 }],
                paragraphs: [{ content: "Second-content source", source:
                    "D(2,100.12345,120.12345,300.12345,120.12345,300.12345,160.12345,100.12345,160.12345);" +
                    "D(2,350.12345,120.12345,450.12345,120.12345,450.12345,160.12345,350.12345,160.12345)" }] },
        ],
    }, "cross-content-json-sources.json");
    await pane.getByRole("tab", { name: "Result", exact: true }).click();
    await pane.getByRole("searchbox", { name: "Search JSON keys" }).fill("source");
    await page.getByRole("combobox", { name: "Zoom", exact: true }).selectOption({ label: "150%" });
    await ready(page);
    const zoom = await page.getByLabel("Zoom percentage").textContent();
    const link = pane.getByRole("button", { name: "Locate source /contents/1/paragraphs/0/source", exact: true });
    await link.press("Enter");
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("2");
    await ready(page);
    await expect(pane.getByRole("tab", { name: "Result", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(pane.getByRole("combobox", { name: "Result content" })).toHaveValue("1");
    await expect(page.getByLabel("Zoom percentage")).toHaveText(zoom ?? "");
    await expect(link).toBeFocused();
    await expectSourceKeyVisible(link);
    const frames = page.getByTestId("source-overlay").locator("polygon");
    await expect(frames).toHaveCount(2);
    for (const [index, frame] of (await frames.all()).entries()) {
        await expect(frame).toHaveAttribute("data-source-id", "/json/contents/1/paragraphs/0/source");
        await expect(frame).toHaveAttribute("data-region-index", String(index));
    }
    const targetVisible = await frames.first().evaluate(element => {
        const viewport = element.closest(".cu-document-container");
        if (!viewport) throw new Error("The source viewport is unavailable.");
        const region = element.getBoundingClientRect(), bounds = viewport.getBoundingClientRect();
        return region.width > 0 && region.height > 0 && region.left >= bounds.left && region.right <= bounds.right &&
            region.top >= bounds.top && region.bottom <= bounds.bottom;
    });
    expect(targetVisible).toBe(true);
    await page.getByRole("button", { name: "Previous page", exact: true }).click();
    await ready(page);
    await expect(frames).toHaveCount(0);
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await ready(page);
    await expect(frames).toHaveCount(2);
    await link.focus();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
    await expect(pane.getByRole("searchbox", { name: "Search JSON keys" })).toHaveValue("source");
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
    await expect(pane.getByRole("tab", { name: "Markdown", exact: true })).toHaveCount(0);
    await expect(pane.getByRole("tab", { name: "Fields", exact: true })).toHaveCount(0);
    await expect(pane.getByRole("tab", { name: "Result", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("rendered-page")).toBeVisible();

    const markdownStart = Date.now();
    await uploadResult(page, syntheticResult("x".repeat(MAX_MARKDOWN_CHARACTERS + 1)), "oversized-markdown.json");
    await pane.getByRole("tab", { name: "Markdown", exact: true }).click();
    await expect(pane.getByRole("alert")).toContainText("Markdown is too large to render");
    const markdownMilliseconds = Date.now() - markdownStart;

    const jsonStart = Date.now();
    await uploadResult(page, syntheticResult(undefined, {
        oversized: "x".repeat(MAX_JSON_CHARACTERS + 1),
    }), "oversized-json.json");
    await pane.getByRole("tab", { name: "Result", exact: true }).click();
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
    await pane.getByRole("tab", { name: "Result", exact: true }).click();
    await expect(pane.getByRole("tree", { name: "Original Analyze result JSON" })).toBeVisible();
    await expect(pane.locator(".cu-json-label", { hasText: "rawDiagnostic:" })).toBeVisible();
    await expect(page.getByTestId("rendered-page")).toBeVisible();

    testInfo.annotations.push({
        type: "large-result-observation",
        description: `${testInfo.project.name}: Markdown ${markdownMilliseconds} ms; JSON ${jsonMilliseconds} ms. Limits: ${MAX_MARKDOWN_CHARACTERS} Markdown characters, ${MAX_JSON_CHARACTERS} JSON characters, ${MAX_JSON_VALUES} JSON values.`,
    });
});

test("GA and Preview derive Studio tabs from selected content without changing the source or inventing renderers", async ({ page }) => {
    const pane = page.getByRole("region", { name: "Extraction results" });
    await expect(pane.getByRole("tab", { includeHidden: true })).toHaveText(["Fields", "Markdown", "Paragraphs", "Info", "Result"]);
    await expect(pane.locator('[role="tab"][disabled]')).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: /version/i })).toHaveCount(0);

    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await ready(page);
    await rotateSource(page);
    await ready(page);
    const zoom = await page.getByLabel("Zoom percentage").textContent();
    const bounds = await page.getByTestId("rendered-page").boundingBox();
    if (!bounds) throw new Error("The source frame is unavailable.");

    await uploadResult(page, {
        status: "Succeeded",
        result: {
            apiVersion: "2026-06-01-preview",
            analyzerId: "synthetic-preview-tabs",
            futureProperty: { retained: false },
            contents: [{
                kind: "document", unit: "pixel",
                pages: [{ pageNumber: 1, width: 1743, height: 878 }],
                fields: { False: { type: "boolean", valueBoolean: false } },
                markdown: "# Synthetic Preview tabs",
                paragraphs: [{ content: "Synthetic paragraph" }],
                tables: [{ rowCount: 1, columnCount: 1, cells: [{ rowIndex: 0, columnIndex: 0, content: "Synthetic cell" }] }],
                figures: [{ id: "synthetic-figure" }],
                signatures: [{ id: "synthetic-signature" }],
                metadata: { Author: "Synthetic metadata" },
            }, {
                kind: "document", fields: {}, markdown: " \n",
                paragraphs: [], tables: [], figures: null, signatures: [], metadata: {},
            }],
        },
        usage: { units: 0 },
    }, "synthetic-preview-tabs.json");
    await expect(pane.getByRole("tab", { includeHidden: true })).toHaveText([
        "Fields", "Markdown", "Paragraphs", "Figures", "Signatures", "Info", "Result",
    ]);
    await pane.getByRole("tab", { name: "Fields", exact: true }).press("End");
    await expect(pane.getByRole("tab", { name: "Result", exact: true })).toBeFocused();
    await expect(pane.getByRole("tree", { name: "Original Analyze result JSON" })).toBeVisible();
    await expect(pane.locator(".cu-json-label", { hasText: "usage:" })).toBeVisible();
    await pane.locator(".cu-json-label", { hasText: "result:" }).click();
    await expect(pane.locator(".cu-json-label", { hasText: "futureProperty:" })).toBeVisible();
    await pane.getByRole("tab", { name: "Result", exact: true }).press("ArrowLeft");
    await expect(pane.getByRole("table", { name: "Result information" })).toBeVisible();
    await expect(page.getByLabel("Zoom percentage")).toHaveText(zoom ?? "");
    const afterSwitch = await page.getByTestId("rendered-page").boundingBox();
    expect(afterSwitch?.width).toBeCloseTo(bounds.width, 1);
    expect(afterSwitch?.height).toBeCloseTo(bounds.height, 1);
    expect(afterSwitch?.x).toBeCloseTo(bounds.x, 1);
    expect(afterSwitch?.y).toBeCloseTo(bounds.y, 1);

    await page.getByRole("combobox", { name: "Result content" }).focus();
    await page.getByRole("combobox", { name: "Result content" }).selectOption("1");
    await expect(pane.getByRole("tab")).toHaveText(["Info", "Result"]);
    await expect(pane.getByRole("tab", { name: "Info", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("combobox", { name: "Result content" })).toBeFocused();
    await page.getByRole("combobox", { name: "Result content" }).selectOption("0");
    await expect(pane.getByRole("tab", { name: "Info", exact: true })).toHaveAttribute("aria-selected", "true");

    await page.getByRole("button", { name: "Receipt PNG", exact: true }).click();
    await ready(page);
    await expect(pane.getByRole("tab", { includeHidden: true })).toHaveText(["Fields", "Markdown", "Paragraphs", "Info", "Result"]);
    await expect(pane.getByRole("tab", { name: "Figures", exact: true })).toHaveCount(0);
    await expect(pane.getByRole("tab", { name: "Signatures", exact: true })).toHaveCount(0);
});

test("malformed detail values produce visible warnings while valid fields and original Result remain inspectable", async ({ page }) => {
    await uploadResult(page, {
        apiVersion: "2026-06-01-preview",
        contents: [{
            kind: "document",
            fields: { Name: { type: "string", valueString: "Retained field" } },
            paragraphs: "not an array",
            metadata: { Invalid: 42 },
        }],
    }, "synthetic-malformed-details.json");
    const pane = page.getByRole("region", { name: "Extraction results" });
    await expect(pane.getByRole("tab")).toHaveText(["Fields", "Info", "Result"]);
    await expect(pane.locator(".cu-field-value")).toHaveText("Retained field");
    await pane.locator(".cu-issues summary").click();
    await expect(pane.locator(".cu-issues")).toContainText("invalid-content-detail");
    await expect(pane.locator(".cu-issues")).toContainText("/contents/0/metadata/Invalid");
    await pane.getByRole("tab", { name: "Info", exact: true }).click();
    await expect(pane.getByRole("table", { name: "Result information", exact: true }).getByText("42", { exact: true })).toBeVisible();
    await pane.getByRole("tab", { name: "Result", exact: true }).click();
    await expect(pane.getByRole("tree", { name: "Original Analyze result JSON" })).toBeVisible();
    await expect(page.getByTestId("rendered-page")).toBeVisible();
});
