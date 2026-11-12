import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { MAX_JSON_CHARACTERS, MAX_JSON_VALUES } from "../../frontend/src/components/JsonPane";
import { MARKDOWN_STATIC_CHARACTERS } from "../../frontend/src/components/MarkdownPane";
import { contrast, expandField, ready, rotateSource } from "./viewerAssertions";

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

test("missing and malformed results remain explicit while large content stays accessible", async ({ page }, testInfo) => {
    const pane = page.getByRole("region", { name: "Extraction results" });
    await uploadResult(page, syntheticResult(), "no-markdown.json");
    await expect(pane.getByRole("tab", { name: "Markdown", exact: true })).toHaveCount(0);
    await expect(pane.getByRole("tab", { name: "Fields", exact: true })).toHaveCount(0);
    await expect(pane.getByRole("tab", { name: "Result", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("rendered-page")).toBeVisible();

    const markdownStart = Date.now();
    await uploadResult(page, syntheticResult(`${"x".repeat(MARKDOWN_STATIC_CHARACTERS + 1)}markdown-tail`), "large-markdown.json");
    await pane.getByRole("tab", { name: "Markdown", exact: true }).click();
    const markdownScroll = pane.getByRole("region", { name: "Markdown content", exact: true });
    await expect(markdownScroll).toBeVisible();
    await markdownScroll.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(markdownScroll).toContainText("markdown-tail");
    await expect(pane.getByRole("alert")).toHaveCount(0);
    const markdownMilliseconds = Date.now() - markdownStart;

    const jsonStart = Date.now();
    await uploadResult(page, syntheticResult(undefined, {
        oversized: `${"x".repeat(MAX_JSON_CHARACTERS)}original-json-tail`,
    }), "oversized-json.json");
    await pane.getByRole("tab", { name: "Result", exact: true }).click();
    await expect(pane.getByRole("tree", { name: "Original Analyze result JSON" })).toBeVisible();
    await pane.getByRole("button", { name: "Last JSON string at /oversized page", exact: true }).click();
    await expect(pane.locator('[data-json-path="/oversized"] .cu-json-string')).toContainText("original-json-tail");
    const jsonMilliseconds = Date.now() - jsonStart;

    await uploadResult(page, syntheticResult(undefined, {
        oversizedValues: Array.from({ length: MAX_JSON_VALUES + 1 }, (_, index) =>
            index === MAX_JSON_VALUES ? "last-original-value" : index),
    }), "too-many-json-values.json");
    const array = pane.locator('[data-json-path="/oversizedValues"]');
    await array.getByRole("button", { name: "Expand JSON node", exact: true }).click();
    await expect(array.getByRole("treeitem")).toHaveCount(100);
    await array.getByRole("button", { name: "Last JSON entries at /oversizedValues page", exact: true }).click();
    await expect(array).toContainText("last-original-value");
    await expect(pane.getByRole("alert")).toHaveCount(0);

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
        description: `${testInfo.project.name}: virtual Markdown ${markdownMilliseconds} ms; paged JSON ${jsonMilliseconds} ms. Static budgets: ${MARKDOWN_STATIC_CHARACTERS} Markdown characters, ${MAX_JSON_CHARACTERS} JSON characters, ${MAX_JSON_VALUES} JSON values.`,
    });
});

test("large CU Markdown reaches its last page and preserves that page across result tabs", async ({ page }) => {
    const pane = page.getByRole("region", { name: "Extraction results" });
    const markdown = Array.from({ length: 41 }, (_, index) =>
        `# Large page ${index + 1}\n\n${"Saved document text.\n\n".repeat(80)}\n\n<table><tr><td>Page ${index + 1} cell</td></tr></table>\n`)
        .join("\n<!-- PageBreak -->\n\n");
    await page.getByRole("textbox", { name: "Page number", exact: true }).fill("4");
    await page.getByRole("textbox", { name: "Page number", exact: true }).press("Enter");
    await ready(page);
    await uploadResult(page, syntheticResult(markdown), "large-paged-markdown.json");
    await pane.getByRole("tab", { name: "Markdown", exact: true }).click();
    await expect(pane.getByRole("heading", { name: "Large page 1", exact: true })).toBeVisible();
    await expect(pane.locator(".cu-markdown table")).toHaveCount(1);
    const pagination = pane.getByRole("group", { name: "Markdown pagination", exact: true });
    await expect(pane.locator(".cu-results-footer")).toHaveCount(0);
    await expect(pagination.getByRole("button")).toHaveCount(2);
    const input = pagination.getByRole("textbox", { name: "Markdown page number", exact: true });
    for (const viewport of [{ width: 1030, height: 760 }, { width: 1440, height: 1000 }]) {
        await page.setViewportSize(viewport);
        await ready(page);
        const bar = await pagination.boundingBox();
        const source = await page.getByRole("group", { name: "Source document toolbar", exact: true }).boundingBox();
        const paneBounds = await pane.boundingBox();
        const controls = await pagination.locator(".cu-page-controls").boundingBox();
        if (!bar || !source || !paneBounds || !controls) throw new Error("The document toolbars are not laid out.");
        expect(bar.height).toBe(44);
        expect(Math.abs(bar.y + bar.height - source.y - source.height)).toBeLessThanOrEqual(1);
        expect(Math.abs(controls.x + controls.width / 2 - paneBounds.x - paneBounds.width / 2)).toBeLessThanOrEqual(1);
        for (const control of [page.getByRole("textbox", { name: "Page number", exact: true }), input]) {
            await pane.getByRole("tab", { name: "Markdown", exact: true }).focus();
            await page.locator(".prototype-banner").hover();
            await expect(control).toBeEnabled();
            const bounds = await control.boundingBox();
            const normal = await control.evaluate(element => {
                const style = getComputedStyle(element);
                const toolbar = element.closest(".cu-source-view-toolbar");
                if (!toolbar) throw new Error("The page input toolbar is unavailable.");
                const color = style.boxShadow.match(/rgba?\([^)]+\)/)?.[0];
                const offset = style.boxShadow.replace(/rgba?\([^)]+\)/, "").match(/-?[\d.]+px/g)?.[1];
                if (!color || offset === undefined || !style.boxShadow.includes("inset")) throw new Error("The page input hairline is unavailable.");
                return { color, shadow: style.boxShadow, offset,
                    lineHeight: Math.abs(Number.parseFloat(offset)), background: getComputedStyle(toolbar).backgroundColor,
                    fill: style.backgroundColor, frame: [style.borderTopColor, style.borderRightColor, style.borderBottomColor, style.borderLeftColor] };
            });
            expect(normal.lineHeight).toBeGreaterThan(0);
            expect(normal.lineHeight).toBeLessThan(1);
            expect(normal.fill).toBe("rgba(0, 0, 0, 0)");
            expect(normal.frame.every(color => color === "rgba(0, 0, 0, 0)")).toBe(true);
            expect(contrast(normal.color, normal.background)).toBeGreaterThanOrEqual(3);
            await control.hover();
            expect(await control.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe(normal.shadow);
            expect(await control.evaluate(element => getComputedStyle(element).boxShadow)).toContain(normal.offset);
            expect(await control.boundingBox()).toEqual(bounds);
            await control.click();
            await expect(control).toBeFocused();
            await expect(control).toHaveCSS("outline-style", "none");
            expect(await control.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe(normal.shadow);
            await control.press("Tab");
            const next = control === input
                ? pagination.getByRole("button", { name: "Next Markdown page", exact: true })
                : page.getByRole("button", { name: "Next page", exact: true });
            await expect(next).toBeFocused();
            await expect(next).toHaveCSS("outline-style", "solid");
            expect(await next.evaluate(element => Number.parseFloat(getComputedStyle(element).outlineWidth))).toBeGreaterThanOrEqual(2);
            await page.keyboard.press("Shift+Tab");
            await expect(control).toBeFocused();
            await expect(control).toHaveCSS("outline-style", "none");
            const focusColors = await control.evaluate(element => {
                const style = getComputedStyle(element);
                const line = style.boxShadow.match(/rgba?\([^)]+\)/)?.[0];
                if (!line) throw new Error("The focused page input hairline is unavailable.");
                return { line, caret: style.caretColor };
            });
            expect(focusColors.line).not.toBe(normal.color);
            expect(contrast(focusColors.line, normal.background)).toBeGreaterThanOrEqual(3);
            expect(contrast(focusColors.caret, normal.background)).toBeGreaterThanOrEqual(4.5);
            expect(await control.evaluate(element => getComputedStyle(element).boxShadow)).toContain(normal.offset);
            expect(await control.boundingBox()).toEqual(bounds);
        }
        const scroll = pane.locator(".cu-rich-result-scroll");
        expect(await scroll.evaluate(element => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0);
        await scroll.evaluate(element => { element.scrollTop = element.scrollHeight; });
        expect(await pagination.boundingBox()).toEqual(bar);
    }
    await input.fill("41");
    await input.press("Enter");
    await expect(pane.getByRole("heading", { name: "Large page 41", exact: true })).toBeVisible();
    await expect(pane.getByRole("table")).toContainText("Page 41 cell");
    await expect(page.getByRole("textbox", { name: "Page number", exact: true })).toHaveValue("4");
    await pane.getByRole("tab", { name: "Result", exact: true }).click();
    await pane.getByRole("tab", { name: "Markdown", exact: true }).click();
    await expect(pane.getByRole("heading", { name: "Large page 41", exact: true })).toBeVisible();
    await expect(pane.getByRole("alert")).toHaveCount(0);
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
