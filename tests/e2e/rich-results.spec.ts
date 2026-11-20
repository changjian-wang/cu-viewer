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

for (const sample of ["pdf", "labels"]) {
    test(`Result JSON search aligns with Fields on the ${sample} demo when the pane is resized`, async ({ page }) => {
        if (sample === "labels") {
            await page.goto("/?sample=labels");
            await ready(page);
        }
        const pane = page.getByRole("region", { name: "Extraction results", exact: true });
        const toolbar = pane.getByRole("group", { name: "Result JSON toolbar", exact: true });
        const search = toolbar.getByRole("searchbox", { name: "Search result JSON", exact: true });
        const count = toolbar.getByRole("status", { name: "JSON search results", exact: true });
        const checkAlignment = async () => {
            await pane.getByRole("tab", { name: "Fields", exact: true }).click();
            const fieldsSearch = pane.getByRole("group", { name: "Fields toolbar", exact: true }).locator(".cu-search-box");
            const fields = await fieldsSearch.boundingBox();
            if (!fields) throw new Error("The Fields search box is missing.");

            await pane.getByRole("tab", { name: "Result", exact: true }).click();
            for (const query of ["", "AmountDue"]) {
                await search.fill(query);
                if (query) await expect(count).toHaveText(/^1 \/ [\d,]+$/);
                const result = await toolbar.locator(".cu-search-box").boundingBox();
                if (!result) throw new Error("The Result search box is missing.");
                expect(result.x).toBeCloseTo(fields.x, 0);
                expect(result.width).toBeCloseTo(fields.width, 0);
                const actions = toolbar.locator(".cu-json-bulk-actions");
                const last = actions.getByRole("button", { name: "Expand all", exact: true });
                await expect(last).toBeInViewport({ ratio: 1 });
                const bounds = await toolbar.boundingBox(), right = await last.boundingBox();
                if (!bounds || !right) throw new Error("The Result toolbar controls are missing.");
                expect(bounds.x + bounds.width - right.x - right.width).toBeCloseTo(fields.x - bounds.x, 0);
                if (query) {
                    const match = await count.boundingBox(), buttons = await actions.boundingBox();
                    if (!match || !buttons) throw new Error("The match count and bulk actions are missing.");
                    expect(result.x + result.width).toBeLessThan(match.x);
                    expect(match.x + match.width).toBeLessThan(buttons.x);
                }
            }
        };
        await checkAlignment();
        await page.getByRole("separator", { name: "Source and results width", exact: true }).press("End");
        await expect(toolbar).toHaveCSS("width", "440px");
        await checkAlignment();
    });
}

test("Result JSON has a direct toolbar aligned to Preview and finds a collapsed invoice field", async ({ page }) => {
    await page.goto("/?sample=labels");
    await ready(page);
    const pane = page.getByRole("region", { name: "Extraction results", exact: true });
    await pane.getByRole("tab", { name: "Result", exact: true }).click();
    const toolbar = pane.getByRole("group", { name: "Result JSON toolbar", exact: true });
    const sourceToolbar = page.getByRole("group", { name: "Source document toolbar", exact: true });
    const search = toolbar.getByRole("searchbox", { name: "Search result JSON", exact: true });
    for (const width of [1440, 1024]) {
        await page.setViewportSize({ width, height: 900 });
        const source = await sourceToolbar.boundingBox(), result = await toolbar.boundingBox();
        if (!source || !result) throw new Error("The source and JSON toolbars are not laid out.");
        expect(result.height).toBe(44);
        expect(result.y).toBeCloseTo(source.y, 0);
        expect(result.y + result.height).toBeCloseTo(source.y + source.height, 0);
        const geometry = await toolbar.evaluate(element => ({
            scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
        }));
        expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
    }

    await expect(toolbar.getByRole("button")).toHaveText(["Collapse all", "Expand all"]);
    const root = pane.locator('[data-json-path=""]');
    await toolbar.getByRole("button", { name: "Collapse all", exact: true }).click();
    await expect(root).toHaveAttribute("aria-expanded", "false");
    await search.fill("AmountDue");
    const hit = pane.locator('mark[data-json-tree-match]');
    await expect(hit).toHaveText("AmountDue");
    await expect(hit).toBeInViewport();
    await expect(search).toBeFocused();
    await expect(toolbar.getByRole("button")).toHaveText(["Collapse all", "Expand all"]);
    await expect(root).toHaveAttribute("aria-expanded", "true");
    await toolbar.getByRole("button", { name: "Collapse all", exact: true }).click();
    await pane.getByRole("tab", { name: "Fields", exact: true }).click();
    await pane.getByRole("tab", { name: "Result", exact: true }).click();
    await expect(search).toHaveValue("AmountDue");
    await expect(root).toHaveAttribute("aria-expanded", "false");
    await search.clear();
    await toolbar.getByRole("button", { name: "Expand all", exact: true }).click();
    await expect(pane.locator('[data-json-path$="/fields/AmountDue/valueObject/Amount"]')).toBeVisible();
});

test("Result JSON protects the 41-page demo from bulk expansion while preserving search", async ({ page }) => {
    await page.goto("/?sample=large");
    await ready(page);
    const pane = page.getByRole("region", { name: "Extraction results", exact: true });
    await pane.getByRole("tab", { name: "Result", exact: true }).click();
    const tree = pane.getByRole("tree", { name: "Original Analyze result JSON", exact: true });
    const toolbar = pane.getByRole("group", { name: "Result JSON toolbar", exact: true });
    await expect(tree).toBeVisible();
    const before = await tree.getByRole("treeitem").count();
    await toolbar.getByRole("button", { name: "Expand all", exact: true }).click();
    await expect(pane.getByText("This result is too large to expand all at once.", { exact: false })).toBeVisible();
    await expect(tree.getByRole("treeitem")).toHaveCount(before);
    await toolbar.getByRole("searchbox", { name: "Search result JSON", exact: true }).fill("endPageNumber");
    await expect(tree.locator("mark[data-json-tree-match]")).toHaveText("endPageNumber");
    await expect(tree.getByRole("treeitem").first()).toHaveAttribute("aria-expanded", "true");
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
    await expect(tree.locator(".cu-json-label", { hasText: /^"?id"?:$/ })).toBeVisible();
    await expect(tree.locator(".cu-json-label", { hasText: /^"?usage"?:$/ })).toBeVisible();
    await tree.locator(".cu-json-label", { hasText: /^"?result"?:$/ }).click();
    await expect(tree.locator(".cu-json-label", { hasText: /^"?analyzerId"?:$/ })).toBeVisible();
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
        oversized: `${"x".repeat(4_095)}\u{1f600}${"x".repeat(MAX_JSON_CHARACTERS * 2)}original-json-tail`,
    }), "oversized-json.json");
    await pane.getByRole("tab", { name: "Result", exact: true }).click();
    await expect(pane.getByRole("tree", { name: "Original Analyze result JSON" })).toBeVisible();
    const fullText = pane.getByRole("button", { name: "View full text for /oversized", exact: true });
    await fullText.click();
    const dialog = page.getByRole("dialog", { name: "oversized", exact: true });
    const text = dialog.getByRole("region", { name: "Full JSON string", exact: true });
    await expect(text).toBeVisible();
    for (const fragment of await text.locator("pre").allTextContents()) {
        expect(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(fragment)).toBe(false);
    }
    await text.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(text).toContainText("original-json-tail");
    expect(await text.locator("pre").count()).toBeLessThan(8);
    await dialog.getByRole("button", { name: "Close full text", exact: true }).click();
    await expect(fullText).toBeFocused();
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
    await expect(pane.locator('[data-json-path="/rawDiagnostic"] > .cu-json-label')).toBeVisible();
    await expect(page.getByTestId("rendered-page")).toBeVisible();

    testInfo.annotations.push({
        type: "large-result-observation",
        description: `${testInfo.project.name}: virtual Markdown ${markdownMilliseconds} ms; paged JSON ${jsonMilliseconds} ms. Static budgets: ${MARKDOWN_STATIC_CHARACTERS} Markdown characters, ${MAX_JSON_CHARACTERS} JSON characters, ${MAX_JSON_VALUES} JSON values.`,
    });
});

test("Result long strings preserve colored JSON escapes across fragments and restore tree focus, scroll and source selection", async ({ page }) => {
    const prefix = '# Not a rendered heading\r\n\t"quoted" C:\\fixtures\\sample\n\n';
    const tagged = `${prefix}${"x".repeat(4_094 - (JSON.stringify(prefix).length - 1))}<table title="2 > 1">A</table><!-- PageBreak -->`;
    const raw = `${tagged}${"y".repeat(8_191 - (JSON.stringify(tagged).length - 1))}\n${"Raw text remains literal.\n".repeat(1_500)}\n` +
        '<img src="https://example.invalid/never-load"><script>window.__rawXss = true</script>\n\u{1f600}RAW_END';
    await uploadResult(page, {
        apiVersion: "2025-11-01", contents: [{ kind: "document", unit: "inch",
            pages: [{ pageNumber: 1, width: 8.5, height: 11 }],
            markdown: raw, fields: { Anchor: { type: "string", valueString: "Keep selection", source: "D(1,1,1,2,1)" } } }],
    }, "raw-string-viewer.json");
    const pane = page.getByRole("region", { name: "Extraction results", exact: true });
    await pane.getByRole("button", { name: "Anchor", exact: true }).click();
    await ready(page);
    await pane.getByRole("tab", { name: "Result", exact: true }).click();
    for (const path of ["/contents", "/contents/0"]) {
        await pane.locator(`[data-json-path="${path}"]`).getByRole("button", { name: "Expand JSON node", exact: true }).click();
    }
    const node = pane.locator('[data-json-path="/contents/0/markdown"]');
    expect((await node.locator(".cu-json-string").textContent())?.length).toBeLessThan(300);
    await expect(node.getByRole("group", { name: /pagination/ })).toHaveCount(0);
    const trigger = node.getByRole("button", { name: "View full text for /contents/0/markdown", exact: true });
    await trigger.scrollIntoViewIfNeeded();
    const scroll = pane.locator(".cu-rich-result-scroll").first();
    const position = await scroll.evaluate(element => ({ top: element.scrollTop, left: element.scrollLeft }));
    await page.evaluate(() => {
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
            writeText: (value: string): Promise<void> => { Reflect.set(globalThis, "__rawCopiedText", value); return Promise.resolve(); },
        } });
    });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "markdown", exact: true });
    const text = dialog.getByRole("region", { name: "Full JSON string", exact: true });
    await expect(text).toBeFocused();
    await expect(text).toContainText(JSON.stringify(raw).slice(0, 200));
    const displayed = (await text.locator("pre").allTextContents()).join("");
    expect(displayed).not.toContain("\n");
    expect(displayed).not.toContain("\t");
    expect(displayed).toContain("\\n");
    expect(displayed).toContain("\\t");
    expect(displayed).toContain('\\"');
    expect(displayed).toContain("\\\\");
    const first = text.locator('pre[data-index="0"]');
    const second = text.locator('pre[data-index="1"]');
    await expect(first.locator(".cu-json-syntax-tag")).toHaveText("<t");
    await expect(second.locator(".cu-json-syntax-tag").first()).toHaveText("able title=");
    await expect(second.locator(".cu-json-syntax-tag").filter({ hasText: "2 > 1" })).toHaveText("2 > 1");
    const tagColor = await first.locator(".cu-json-syntax-tag").evaluate(element => getComputedStyle(element).color);
    const escapeColor = await first.locator(".cu-json-syntax-escape").first().evaluate(element => getComputedStyle(element).color);
    const background = await dialog.evaluate(element => getComputedStyle(element).backgroundColor);
    expect(tagColor).not.toBe(escapeColor);
    expect(contrast(tagColor, background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(escapeColor, background)).toBeGreaterThanOrEqual(4.5);
    await second.scrollIntoViewIfNeeded();
    await expect(second.locator(".cu-json-syntax-escape").last()).toHaveText("\\");
    await expect(text.locator('pre[data-index="2"] .cu-json-syntax-escape').first()).toHaveText("n");
    await expect(dialog.getByRole("heading", { name: "Not a rendered heading", exact: true })).toHaveCount(0);
    await expect(dialog.locator("img, script")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Copy full text", exact: true }).click();
    expect(await page.evaluate(() => {
        const copied: unknown = Reflect.get(globalThis, "__rawCopiedText");
        return typeof copied === "string" ? copied : null;
    })).toBe(raw);
    await text.focus();
    await text.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(text).toContainText("RAW_END");
    expect(await text.locator("pre").count()).toBeLessThan(8);
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("searchbox", { name: "Search full text", exact: true })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Close full text", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await scroll.evaluate(element => ({ top: element.scrollTop, left: element.scrollLeft }))).toEqual(position);
    await pane.getByRole("tab", { name: "Fields", exact: true }).click();
    await expect(pane.getByRole("button", { name: "Anchor", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("source-overlay")).toBeVisible();
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
    await expect(pane.locator('[data-json-path="/usage"] > .cu-json-toggle')).toBeVisible();
    await pane.locator('[data-json-path="/result"] > .cu-json-toggle').click();
    await expect(pane.locator('[data-json-path="/result/futureProperty"]')).toBeVisible();
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
