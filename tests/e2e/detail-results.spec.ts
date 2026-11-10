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
        const origin = new URL(test.info().project.use.baseURL ?? "http://127.0.0.1:5173").origin;
        if (url.startsWith(`${origin}/`) || url.startsWith("blob:") || url.startsWith("data:")) return route.continue();
        throw new Error(`Unexpected external detail-view request: ${url}`);
    });
    await page.goto("/");
    await ready(page);
});

test("Info settings match Fields and bulk actions preserve the source and Fields state", async ({ page }) => {
    await upload(page, {
        apiVersion: "2026-06-01-preview",
        contents: [{ kind: "document", fields: { Sample: { type: "object", valueObject: {
            Value: { type: "string", valueString: "Field value" },
        } } }, metadata: { nested: { Author: "Returned author" } } }],
        usage: { tokens: { "Model-input": 0, "Model-output": 947 } },
        infos: [{ detail: { message: "Returned information" } }],
        warnings: [{ target: { message: "Returned warning" } }],
    });
    const pane = page.getByRole("region", { name: "Extraction results", exact: true });
    await pane.getByRole("tab", { name: "Fields", exact: true }).click();
    await expect(pane.getByRole("button", { name: "Expand Sample", exact: true })).toBeVisible();
    const fieldGear = pane.getByRole("button", { name: "Fields settings", exact: true });
    const gearSize = await fieldGear.evaluate(element => {
        const box = element.getBoundingClientRect();
        return { width: box.width, height: box.height };
    });
    await fieldGear.click();
    const fieldsPanel = pane.getByRole("dialog", { name: "Fields settings", exact: true });
    const panelStyle = await fieldsPanel.evaluate(element => {
        const style = getComputedStyle(element);
        return { width: style.width, fontSize: style.fontSize, radius: style.borderRadius };
    });
    const fieldAction = fieldsPanel.getByRole("button", { name: "Collapse all object fields", exact: true });
    await fieldAction.hover();
    const actionStyle = await fieldAction.evaluate(element => {
        const style = getComputedStyle(element);
        return { fontSize: style.fontSize, background: style.backgroundColor, height: element.getBoundingClientRect().height };
    });
    await page.keyboard.press("Escape");
    const source = await page.getByTestId("rendered-page").boundingBox();
    await pane.getByRole("tab", { name: "Info", exact: true }).click();
    await expect(pane.locator(".cu-results-footer")).toHaveCount(0);
    await expect(pane.getByText("All content metadata, usage, infos and warnings, in that order. All groups start expanded.", { exact: true })).toHaveCount(0);
    const toolbar = pane.getByRole("group", { name: "Info toolbar", exact: true });
    await expect(toolbar).toHaveCSS("height", "44px");
    const gear = toolbar.getByRole("button", { name: "Info settings", exact: true });
    expect(await gear.evaluate(element => {
        const box = element.getBoundingClientRect();
        return { width: box.width, height: box.height };
    })).toEqual(gearSize);
    await gear.hover();
    await expect(pane.getByRole("dialog", { name: "Info settings", exact: true })).toHaveCount(0);
    await gear.click();
    const settings = pane.getByRole("dialog", { name: "Info settings", exact: true });
    await expect(settings).toHaveCSS("width", panelStyle.width);
    await expect(settings).toHaveCSS("font-size", panelStyle.fontSize);
    await expect(settings).toHaveCSS("border-radius", panelStyle.radius);
    await expect(settings.getByRole("switch")).toHaveCount(0);
    await expect(settings.getByRole("button", { name: "Reset Field Order", exact: true })).toHaveCount(0);
    const collapse = settings.getByRole("button", { name: "Collapse all groups", exact: true });
    const expand = settings.getByRole("button", { name: "Expand all groups", exact: true });
    await expect(collapse).toBeFocused();
    await collapse.hover();
    await expect(collapse).toHaveCSS("font-size", actionStyle.fontSize);
    await expect(collapse).toHaveCSS("background-color", actionStyle.background);
    expect(await collapse.evaluate(element => element.getBoundingClientRect().height)).toBe(actionStyle.height);
    const table = pane.getByRole("table", { name: "Result information", exact: true });
    const groupCount = await table.locator(".cu-info-expander").count();
    await collapse.press("Space");
    await expect(settings).toBeVisible();
    await expect(collapse).toBeFocused();
    await expect(table.getByRole("rowheader")).toHaveText(["metadata", "usage", "infos", "warnings"]);
    await expand.press("Enter");
    await expect(table.locator(".cu-info-expander")).toHaveCount(groupCount);
    await expect(table.locator('.cu-info-expander[aria-expanded="false"]')).toHaveCount(0);
    await expect(table.getByText("Returned warning", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(settings).toHaveCount(0);
    await expect(gear).toBeFocused();
    await gear.press("Space");
    await settings.getByRole("button", { name: "Close info settings", exact: true }).click();
    await expect(gear).toBeFocused();
    await gear.click();
    await table.getByText("Returned author", { exact: true }).click();
    await expect(settings).toHaveCount(0);
    await expect(gear).not.toBeFocused();
    await gear.click();
    await pane.getByRole("tab", { name: "Fields", exact: true }).focus();
    await expect(settings).toHaveCount(0);
    await pane.getByRole("tab", { name: "Fields", exact: true }).click();
    await expect(pane.getByRole("button", { name: "Expand Sample", exact: true })).toBeVisible();
    expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(source);
});

test("Info settings keep empty-container actions disabled in the narrow pane without hover highlighting", async ({ page }) => {
    await page.setViewportSize({ width: 1030, height: 900 });
    await upload(page, { apiVersion: "2025-11-01", contents: [], usage: null, infos: [], warnings: [] });
    const pane = page.getByRole("region", { name: "Extraction results", exact: true });
    const gear = pane.getByRole("button", { name: "Info settings", exact: true });
    await gear.click();
    const settings = pane.getByRole("dialog", { name: "Info settings", exact: true });
    const close = settings.getByRole("button", { name: "Close info settings", exact: true });
    await expect(close).toBeFocused();
    for (const name of ["Collapse all groups", "Expand all groups"]) {
        const action = settings.getByRole("button", { name, exact: true });
        await expect(action).toBeDisabled();
        const background = await action.evaluate(element => getComputedStyle(element).backgroundColor);
        await action.hover();
        await expect(action).toHaveCSS("background-color", background);
    }
    await close.press("Escape");
    await expect(settings).toHaveCount(0);
    await expect(gear).toBeFocused();
    await expect(pane.getByRole("table", { name: "Result information", exact: true }).getByRole("rowheader"))
        .toHaveText(["usage", "infos", "warnings"]);
    await expect(pane.locator(".cu-results-footer")).toHaveCount(0);
});

test("Info typography matches Fields, readable labels stay compact and long values remain complete", async ({ page }) => {
    const field = page.locator('tr[data-field-id="/contents/0/fields/BillingAddressRecipient"]');
    const reference = await field.evaluate(row => {
        const name = row.querySelector(".cu-field-name"), value = row.querySelector(".cu-field-value");
        if (!name || !value) throw new Error("The reference Fields row is unavailable.");
        const n = getComputedStyle(name), v = getComputedStyle(value);
        return { nameSize: n.fontSize, valueSize: v.fontSize, valueWeight: v.fontWeight, valueColor: v.color };
    });
    const longName = "LongMetadataKey".repeat(8), longValue = "Full information remains readable. ".repeat(30);
    await upload(page, {
        apiVersion: "2026-06-01-preview",
        contents: [{ kind: "document", metadata: { language: "en-US", [longName]: "Returned value" } }],
        usage: { tokens: { input: 0 } }, infos: [{ message: longValue }], warnings: [],
    });
    const table = page.getByRole("table", { name: "Result information", exact: true });
    await expect(table).toBeVisible();
    const metadata = table.locator('tr[data-info-path="$metadata"] .cu-info-expander');
    await expect(metadata).toHaveText("metadata");
    await expect(metadata).toHaveCSS("font-size", reference.nameSize);
    await expect(metadata).toHaveCSS("font-weight", "600");
    await expect(metadata).toHaveCSS("line-height", "20px");
    await expect(table.locator('tr[data-info-path="/contents/0/metadata"] .cu-info-expander')).toHaveText("contents[0]");
    await expect(table.locator('tr[data-info-path="/contents/0/metadata"] .cu-info-expander')).toHaveCSS("font-weight", "500");
    await expect(table.getByRole("button", { name: "Collapse usage.tokens", exact: true })).toHaveCSS("font-weight", "500");
    const leaf = table.locator('tr[data-info-path="/contents/0/metadata/language"]');
    await expect(leaf.locator(".cu-info-leaf")).toHaveCSS("font-size", reference.nameSize);
    await expect(leaf.locator(".cu-info-leaf")).toHaveCSS("font-weight", "400");
    await expect(leaf.locator(".cu-info-value")).toHaveCSS("font-size", reference.valueSize);
    await expect(leaf.locator(".cu-info-value")).toHaveCSS("font-weight", reference.valueWeight);
    await expect(leaf.locator(".cu-info-value")).toHaveCSS("color", reference.valueColor);
    const infos = table.locator('tr[data-info-path="/infos"]');
    await expect(infos.locator(".cu-info-value")).toHaveText("1 item");
    await expect(infos.locator(".cu-info-value")).toHaveCSS("font-size", "11px");
    await expect(table.locator('tr[data-info-path="/infos/0"] .cu-info-label')).toHaveText("item 1");
    const warning = table.locator('tr[data-info-path="/warnings"]');
    await expect(warning).toHaveClass(/is-info-section/);
    await expect(warning.getByRole("button")).toHaveCount(0);
    await expect(warning.locator(".cu-info-value")).toHaveText("[]");
    await page.setViewportSize({ width: 1030, height: 900 });
    const longLabel = table.getByText(longName, { exact: true });
    expect(await longLabel.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
    await expect(longLabel.locator("..")).toHaveAttribute("title", `metadata.contents[0].${longName}`);
    const message = table.locator('tr[data-info-path="/infos/0/message"] .cu-info-value');
    await expect(message).toHaveText(longValue.trim());
    expect(await message.evaluate(element => element.clientHeight)).toBeGreaterThan(32);
    expect(await table.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await expect(table.getByRole("button", { name: /^Copy/ })).toHaveCount(0);
});

test("Info shows all content metadata, usage, infos and warnings in order with every level expanded", async ({ page }) => {
    const raw = {
        status: "Succeeded",
        result: {
            apiVersion: "2026-06-01-preview",
            contents: [{ kind: "document", metadata: { Title: "First document" } },
                { kind: "document", metadata: { Title: "Second document" } }],
            infos: [{ code: "Details", message: "Returned information" }],
            warnings: [{ code: "Review", message: "Returned warning", target: null }],
        },
        usage: { pages: 0, tokens: [{ input: 24, reused: false }], empty: "" },
    };
    const source = await page.getByTestId("rendered-page").boundingBox();
    await upload(page, raw);
    const pane = page.getByRole("region", { name: "Extraction results", exact: true });
    await expect(pane.getByRole("tab", { name: "Metadata", exact: true, includeHidden: true })).toHaveCount(0);
    await expect(pane.getByRole("tab", { name: "Info", exact: true })).toHaveAttribute("aria-selected", "true");
    const table = pane.getByRole("table", { name: "Result information", exact: true });
    await expect(table.getByRole("columnheader")).toHaveText(["Field", "Value"]);
    await expect(table.locator('tbody > tr[data-info-depth="0"] > th')).toHaveText([
        "metadata", "usage", "infos", "warnings",
    ]);
    await expect(table.locator('tbody > tr[data-info-depth="1"] > th').filter({ hasText: /^contents\[/ }))
        .toHaveText(["contents[0]", "contents[1]"]);
    await expect(table.getByRole("button", { name: /^Expand / })).toHaveCount(0);
    await expect(table.getByText("First document", { exact: true })).toBeVisible();
    await expect(table.getByText("Second document", { exact: true })).toBeVisible();
    await expect(table.getByText("24", { exact: true })).toBeVisible();
    await expect(table.getByText("false", { exact: true })).toBeVisible();
    await expect(table.getByText('"" (empty string)', { exact: true })).toBeVisible();
    await expect(table.getByText("Returned warning", { exact: true })).toBeVisible();
    await expect(table.locator('tr[data-info-path="/result/infos/0"] .cu-info-label')).toHaveText("item 1");
    await expect(table.locator('tr[data-info-path="/result/warnings/0"] .cu-info-label')).toHaveText("item 1");
    await page.getByRole("combobox", { name: "Result content", exact: true }).selectOption("1");
    await expect(table.getByText("First document", { exact: true })).toBeVisible();
    await table.getByRole("button", { name: "Collapse metadata.contents[0]", exact: true }).press("Enter");
    await expect(table.getByText("First document", { exact: true })).toHaveCount(0);
    await expect(table.getByText("Second document", { exact: true })).toBeVisible();
    await table.getByRole("button", { name: "Collapse metadata", exact: true }).press("Space");
    await expect(table.getByText("contents[1]", { exact: true })).toHaveCount(0);
    await expect(table.getByText("0", { exact: true })).toBeVisible();
    await table.getByRole("button", { name: "Expand metadata", exact: true }).press("Enter");
    await expect(table.getByRole("button", { name: "Expand metadata.contents[0]", exact: true })).toBeVisible();
    await table.getByRole("button", { name: "Expand metadata.contents[0]", exact: true }).press("Enter");
    await expect(table.getByText("First document", { exact: true })).toBeVisible();
    await table.getByRole("button", { name: "Collapse usage.tokens", exact: true }).press("Enter");
    await expect(table.getByText("24", { exact: true })).toHaveCount(0);
    await table.getByRole("button", { name: "Expand usage.tokens", exact: true }).press("Space");
    await expect(table.getByText("24", { exact: true })).toBeVisible();
    await expect(table.getByRole("button", { name: /^Copy/ })).toHaveCount(0);
    await expect(table.locator(".cu-copy-control")).toHaveCount(0);
    expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(source);
    await upload(page, { apiVersion: "2025-11-01", contents: [], usage: { pages: 0 }, infos: [], warnings: [] });
    await expect(pane.getByRole("tab")).toHaveText(["Info", "Result"]);
    await expect(pane.getByRole("heading", { name: "No extracted fields", exact: true })).toHaveCount(0);
    await expect(pane.locator('tr[data-info-path="/infos"] > td')).toContainText("[]");
});

test("collapsed token usage summarizes counters, previews complete text and expands with keyboard focus intact", async ({ page }) => {
    const tokens = { "gpt-5.2-input": 10526, "gpt-5.2-output": 947, "OriginalCase/Model~input": 0 };
    const text = "gpt-5.2 (in 10526 / out 947); OriginalCase/Model~input: 0";
    await upload(page, { contents: [{ kind: "document" }], usage: { pages: 1, tokens } });
    const table = page.getByRole("table", { name: "Result information", exact: true });
    const expander = table.getByRole("button", { name: "Collapse usage.tokens", exact: true });
    await expander.press("Enter");
    const summary = table.getByRole("button", { name: "Expand token usage", exact: true });
    await expect(summary).toHaveText(text);
    expect(await table.locator('tr[data-info-path="/usage/tokens"]').evaluate(element => element.getBoundingClientRect().height))
        .toBe(await table.locator('tr[data-info-path="/usage/pages"]').evaluate(element => element.getBoundingClientRect().height));
    await expect(table.locator('tr[data-info-path^="/usage/tokens/"]')).toHaveCount(0);
    await page.keyboard.press("Tab");
    await expect(summary).toBeFocused();
    const popup = page.getByRole("tooltip", { name: "Token usage", exact: true });
    await expect(popup).toHaveText(text);
    await expect(summary).toHaveAccessibleDescription(text);
    await page.keyboard.press("Escape");
    await expect(popup).toHaveCount(0);
    await expect(summary).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(table.getByRole("button", { name: "Collapse usage.tokens", exact: true })).toBeFocused();
    await expect(table.getByRole("button", { name: "Expand token usage", exact: true })).toHaveCount(0);
    await expect(table.locator('tr[data-info-path="/usage/tokens/gpt-5.2-input"] > td')).toHaveText("10526");
    await expect(table.locator('tr[data-info-path="/usage/tokens/gpt-5.2-output"] > td')).toHaveText("947");
    await expect(table.locator('tr[data-info-path="/usage/tokens/OriginalCase~1Model~0input"] > td')).toHaveText("0");
});

test("collapsed token usage keeps one normal-height row with long models, multiple models and oversized counters", async ({ page }) => {
    const models = Array.from({ length: 12 }, (_, index) => ({
        name: `OriginalCase/${"very-long-model-name-".repeat(8)}${index}`, input: 10526 + index, output: 947 + index,
    }));
    const tokens = Object.fromEntries(models.flatMap(({ name, input, output }): [string, number][] =>
        [[`${name}-input`, input], [`${name}-output`, output]]));
    const text = models.map(({ name, input, output }) => `${name} (in ${input} / out ${output})`).join("; ");
    await upload(page, { contents: [{ kind: "document" }], usage: { pages: 1, tokens } });
    const table = page.getByRole("table", { name: "Result information", exact: true });
    await table.getByRole("button", { name: "Collapse usage.tokens", exact: true }).press("Enter");
    const summary = table.getByRole("button", { name: "Expand token usage", exact: true });
    for (const width of [1030, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const layout = await summary.locator(".cu-info-token-lines").evaluate(element => {
            const bounds = element.getBoundingClientRect();
            const counts = [...element.querySelectorAll(".cu-info-token-count")].filter(count => {
                const box = count.getBoundingClientRect();
                return box.top >= bounds.top && box.bottom <= bounds.bottom + 1;
            });
            return { height: bounds.height, clipped: element.scrollHeight > element.clientHeight,
                lineClamp: getComputedStyle(element).webkitLineClamp,
                modelClipped: [...element.querySelectorAll(".cu-info-token-model")].some(model => model.scrollWidth > model.clientWidth),
                visibleCounts: counts.length,
                completeCounts: counts.every(count => {
                    const box = count.getBoundingClientRect();
                    return box.top >= bounds.top && box.bottom <= bounds.bottom + 1 &&
                        box.left >= bounds.left && box.right <= bounds.right - 8 &&
                        count.scrollWidth - count.clientWidth <= 1;
                }) };
        });
        expect(layout.height).toBeLessThanOrEqual(20);
        expect(layout.clipped).toBe(true);
        expect(layout.lineClamp).toBe("1");
        expect(layout.modelClipped).toBe(true);
        expect(layout.visibleCounts).toBeGreaterThan(0);
        expect(layout.completeCounts).toBe(true);
        expect(await table.locator('tr[data-info-path="/usage/tokens"]').evaluate(element => element.getBoundingClientRect().height))
            .toBe(await table.locator('tr[data-info-path="/usage/pages"]').evaluate(element => element.getBoundingClientRect().height));
        expect(await table.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    }
    await summary.hover();
    const popup = page.getByRole("tooltip", { name: "Token usage", exact: true });
    await expect(popup).toHaveText(text);
    const popupLayout = await popup.boundingBox();
    expect(popupLayout).not.toBeNull();
    expect(popupLayout!.x).toBeGreaterThanOrEqual(8);
    expect(popupLayout!.x + popupLayout!.width).toBeLessThanOrEqual(1432);
    expect(popupLayout!.y + popupLayout!.height).toBeLessThanOrEqual(892);
    await popup.hover();
    await expect(popup).toBeVisible();
    await page.mouse.wheel(0, 160);
    await expect(popup).toBeVisible();
    await page.mouse.move(10, 10);
    await expect(popup).toHaveCount(0);
    await page.setViewportSize({ width: 1030, height: 900 });
    const large = Number.MAX_SAFE_INTEGER;
    await upload(page, { contents: [{ kind: "document" }], usage: { pages: 1,
        tokens: { "Long-Model-input": large, "Long-Model-output": large } } });
    await table.getByRole("button", { name: "Collapse usage.tokens", exact: true }).press("Enter");
    const counter = summary.locator(".cu-info-token-count");
    await expect(counter).toHaveCSS("text-overflow", "ellipsis");
    expect(await counter.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
    expect(await table.locator('tr[data-info-path="/usage/tokens"]').evaluate(element => element.getBoundingClientRect().height))
        .toBe(await table.locator('tr[data-info-path="/usage/pages"]').evaluate(element => element.getBoundingClientRect().height));
    expect(await table.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await summary.focus();
    await expect(summary).toHaveAccessibleDescription(`Long-Model (in ${large} / out ${large})`);
});

test("Paragraphs toolbar matches Fields and searches and navigates matching paragraphs without replacing manual folds", async ({ page }) => {
    const pane = page.getByRole("region", { name: "Extraction results", exact: true });
    const reference = await pane.getByRole("group", { name: "Fields toolbar", exact: true }).evaluate(element => {
        const style = getComputedStyle(element);
        return { height: style.height, border: style.borderTopColor };
    });
    await upload(page, { apiVersion: "2026-06-01-preview", contents: [{ kind: "document", unit: "inch",
        pages: [{ pageNumber: 1, width: 8.5, height: 11 }, { pageNumber: 4, width: 8.2639, height: 11.6806 }],
        paragraphs: [{ content: "Alpha first", source: "D(1,1,1,1,1)" },
            { content: "Beta", source: "D(1,2,2,1,1)" },
            { content: "Alpha last", source: "D(4,1,1,1,1)" }],
    }] });
    const toolbar = pane.getByRole("group", { name: "Paragraphs toolbar", exact: true });
    await expect(toolbar).toHaveCSS("height", reference.height);
    await expect(toolbar).toHaveCSS("border-top-color", reference.border);
    await expect(pane.locator(".cu-results-footer")).toHaveCount(0);
    await expect(pane.getByText("Select a returned item to locate its source.", { exact: false })).toHaveCount(0);
    const list = pane.getByRole("list", { name: "Returned paragraphs", exact: true });
    await list.getByRole("button", { name: "Collapse Page 1", exact: true }).click();
    const search = toolbar.getByRole("searchbox", { name: "Search paragraphs", exact: true });
    await search.fill("ALPHA");
    await expect(list.getByRole("button", { name: /^Select Paragraph / })).toHaveCount(2);
    await expect(list.locator(".cu-paragraph-index")).toHaveText(["1", "3"]);
    await expect(list.getByRole("button", { name: "Collapse Page 1", exact: true })).toBeDisabled();
    const position = toolbar.getByLabel("Current paragraph position", { exact: true });
    await expect(position).toHaveText("\u2014 / 2 paragraphs");
    await toolbar.getByRole("button", { name: "Next paragraph", exact: true }).click();
    await ready(page);
    await expect(position).toHaveText("1 / 2 paragraphs");
    await expect(list.getByRole("button", { name: "Select Paragraph 1", exact: true })).toBeFocused();
    await toolbar.getByRole("button", { name: "Next paragraph", exact: true }).click();
    await ready(page);
    await expect(position).toHaveText("2 / 2 paragraphs");
    await expect(page.getByRole("textbox", { name: "Page number", exact: true })).toHaveValue("4");
    await toolbar.getByRole("button", { name: "Next paragraph", exact: true }).click();
    await ready(page);
    await expect(position).toHaveText("1 / 2 paragraphs");
    await toolbar.getByRole("button", { name: "Previous paragraph", exact: true }).click();
    await ready(page);
    await expect(position).toHaveText("2 / 2 paragraphs");
    const gear = toolbar.getByRole("button", { name: "Paragraphs settings", exact: true });
    await gear.click();
    const settings = pane.getByRole("dialog", { name: "Paragraphs settings", exact: true });
    await expect(settings).toHaveCSS("width", "260px");
    await expect(settings.getByRole("button", { name: "Collapse all pages", exact: true })).toBeDisabled();
    await expect(settings.getByRole("button", { name: "Expand all pages", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(gear).toBeFocused();
    await search.fill("not returned");
    await expect(pane.getByRole("heading", { name: "No matching paragraphs", exact: true })).toBeVisible();
    await expect(position).toHaveText("\u2014 / 0 paragraphs");
    await expect(toolbar.getByRole("button", { name: "Next paragraph", exact: true })).toBeDisabled();
    await expect(toolbar.getByRole("button", { name: "Previous paragraph", exact: true })).toBeDisabled();
    await pane.getByRole("button", { name: "Clear search", exact: true }).click();
    await expect(list.getByRole("button", { name: "Expand Page 1", exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect(list.getByRole("button", { name: "Select Paragraph 1", exact: true })).toHaveCount(0);
    await expect(position).toHaveText("3 / 3 paragraphs");
    for (const width of [1440, 1030]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await toolbar.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    }
});

test("Paragraphs bulk page settings preserve pinning and navigation and filtered source requests", async ({ page }) => {
    await page.getByRole("tab", { name: "Paragraphs", exact: true }).click();
    const pane = page.getByRole("region", { name: "Extraction results", exact: true });
    const list = pane.getByRole("list", { name: "Returned paragraphs", exact: true });
    await list.getByRole("button", { name: "Select Paragraph 64", exact: true }).press("Enter");
    await ready(page);
    const toolbar = pane.getByRole("group", { name: "Paragraphs toolbar", exact: true });
    const gear = toolbar.getByRole("button", { name: "Paragraphs settings", exact: true });
    await gear.click();
    const settings = pane.getByRole("dialog", { name: "Paragraphs settings", exact: true });
    const collapse = settings.getByRole("button", { name: "Collapse all pages", exact: true });
    await expect(collapse).toBeFocused();
    await collapse.press("Space");
    await expect(settings).toBeVisible();
    await expect(list.locator(".cu-paragraph-row")).toHaveCount(0);
    await expect(pane.getByRole("status")).toContainText("Pinned: Paragraph 64");
    await page.keyboard.press("Escape");
    await expect(gear).toBeFocused();
    await toolbar.getByRole("button", { name: "Next paragraph", exact: true }).click();
    await ready(page);
    await expect(list.getByRole("button", { name: "Select Paragraph 65", exact: true })).toBeFocused();
    await expect(toolbar.getByLabel("Current paragraph position", { exact: true })).toHaveText("65 / 174 paragraphs");
    await expect(list.getByRole("button", { name: "Expand Page 1", exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect(list.getByRole("button", { name: "Collapse Page 2", exact: true })).toHaveAttribute("aria-expanded", "true");
    const search = toolbar.getByRole("searchbox", { name: "Search paragraphs", exact: true });
    await search.fill("Paragraph 1");
    const source = page.getByRole("button", { name: "Select source of Paragraph 66, region 1", exact: true });
    await source.press("Enter");
    await expect(source).toBeFocused();
    await expect(search).toHaveValue("Paragraph 1");
    await expect(pane.locator(".cu-paragraph-status")).toContainText("hidden by the current search");
    await search.fill("");
    await expect(pane.locator(".cu-paragraph-status")).toHaveCount(0);
    await list.getByRole("button", { name: "Collapse Page 2", exact: true }).click();
    await expect(list.getByRole("button", { name: "Select Paragraph 66", exact: true })).toHaveCount(0);
    await gear.click();
    await settings.getByRole("button", { name: "Expand all pages", exact: true }).click();
    await expect(list.locator(".cu-paragraph-row")).toHaveCount(174);
    await settings.getByRole("button", { name: "Close paragraph settings", exact: true }).click();
    await expect(gear).toBeFocused();
});

test("paragraph page folds support keyboard control and reopen only for a new explicit source selection", async ({ page }) => {
    await page.getByRole("tab", { name: "Paragraphs", exact: true }).click();
    const pane = page.getByRole("region", { name: "Extraction results", exact: true });
    const list = pane.getByRole("list", { name: "Returned paragraphs", exact: true });
    await expect(list.getByRole("listitem")).toHaveCount(174);
    const first = list.getByRole("heading", { name: "Page 1", exact: true }).getByRole("button");
    expect(await list.getByRole("heading", { name: "Page 1", exact: true }).evaluate(element => element.getBoundingClientRect().height)).toBe(33);
    await first.press("Enter");
    await expect(first).toHaveAttribute("aria-expanded", "false");
    await expect(first).toBeFocused();
    await expect(list.getByRole("button", { name: "Select Paragraph 1", exact: true })).toHaveCount(0);
    await expect(list.getByRole("button", { name: "Select Paragraph 64", exact: true }).locator(".cu-paragraph-index")).toHaveText("64");
    await first.press("Space");
    await expect(list.getByRole("button", { name: "Select Paragraph 1", exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "Page number", exact: true }).fill("2");
    await page.getByRole("textbox", { name: "Page number", exact: true }).press("Enter");
    await ready(page);
    await list.getByRole("button", { name: "Collapse Page 1", exact: true }).click();
    await list.getByRole("button", { name: "Collapse Page 2", exact: true }).click();
    await expect(list.getByRole("button", { name: "Select Paragraph 64", exact: true })).toHaveCount(0);
    const source = page.getByRole("button", { name: "Select source of Paragraph 64, region 1", exact: true });
    await source.press("Enter");
    await expect(source).toBeFocused();
    await expect(list.getByRole("button", { name: "Collapse Page 2", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(list.getByRole("button", { name: "Expand Page 1", exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect(list.getByRole("button", { name: "Select Paragraph 64", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(list.getByRole("button", { name: "Select Paragraph 64", exact: true })).toBeInViewport();
    const frame = await page.getByTestId("rendered-page").boundingBox();
    await list.getByRole("button", { name: "Collapse Page 2", exact: true }).click();
    await expect(list.getByRole("button", { name: "Select Paragraph 64", exact: true })).toHaveCount(0);
    await expect(pane.getByRole("status")).toContainText("Pinned: Paragraph 64");
    expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(frame);
    const nextSource = page.getByRole("button", { name: "Select source of Paragraph 65, region 1", exact: true });
    await nextSource.hover();
    await expect(list.getByRole("button", { name: "Expand Page 2", exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect(pane.getByRole("status")).toContainText("Pinned: Paragraph 64");
    await nextSource.press("Enter");
    await expect(nextSource).toBeFocused();
    await expect(list.getByRole("button", { name: "Collapse Page 2", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(list.getByRole("button", { name: "Select Paragraph 65", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(list.getByRole("button", { name: "Select Paragraph 65", exact: true })).toBeInViewport();
    await expect(list.getByRole("button", { name: "Expand Page 1", exact: true })).toHaveAttribute("aria-expanded", "false");
    await upload(page, { apiVersion: "2025-11-01", contents: [{ kind: "document", unit: "inch",
        pages: [{ pageNumber: 1, width: 8.5, height: 11 }],
        paragraphs: [{ content: "New result starts expanded", source: "D(1,1,1,1,1)" }],
    }] });
    await expect(list.getByRole("button", { name: "Collapse Page 1", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(list.getByRole("button", { name: "Select Paragraph 1", exact: true })).toContainText("New result starts expanded");
});

test("compact paragraphs preserve full long text and consecutive page groups at narrow widths", async ({ page }) => {
    const long = `${Array.from({ length: 80 }, (_, index) => `Full paragraph line ${index + 1} remains readable.`).join("\n")}\nFULL END`;
    const unbroken = "unbroken".repeat(160);
    await upload(page, {
        apiVersion: "2026-06-01-preview", contents: [{ kind: "document", unit: "inch",
            pages: [{ pageNumber: 1, width: 8.5, height: 11 }, { pageNumber: 4, width: 8.2639, height: 11.6806 }],
            paragraphs: [
                { content: "Short paragraph", role: "title", source: "D(1,1,1,1,1)" },
                { content: "Second short paragraph", source: "D(1,2,2,1,1)" },
                { content: long, role: "sectionHeading", source: "D(1,1,1,1,1);D(4,1,1,1,1);D(1,3,1,1,1)" },
                { content: unbroken },
                { content: "", source: "D(1,3,3,1,1)" },
            ],
        }],
    });
    const list = page.getByRole("list", { name: "Returned paragraphs", exact: true });
    await expect(list.getByRole("listitem")).toHaveCount(5);
    await expect(list.getByRole("heading")).toHaveText(["Page 1", "Pages 1, 4", "No source region", "Page 1"]);
    const heading = list.getByRole("heading").first();
    await expect(heading).toHaveCSS("font-size", "12.5px");
    await expect(heading).toHaveCSS("font-weight", "600");
    await expect(heading).toHaveCSS("color", "rgb(36, 52, 71)");
    await expect(heading).toHaveCSS("background-color", "rgb(246, 248, 251)");
    await expect(heading).toHaveCSS("border-bottom-width", "1px");
    const short = list.getByRole("button", { name: "Select Paragraph 1", exact: true });
    const longRow = list.getByRole("button", { name: "Select Paragraph 3", exact: true });
    const longBody = longRow.locator(".cu-paragraph-content");
    const unbrokenBody = list.getByRole("button", { name: "Select Paragraph 4", exact: true }).locator(".cu-paragraph-content");
    expect(await longBody.textContent()).toBe(long);
    expect(await unbrokenBody.textContent()).toBe(unbroken);
    await expect(longRow).toHaveAccessibleDescription(/Page 1, 4.*3 regions.*sectionHeading/);
    await expect(list.getByRole("button", { name: "Select Paragraph 5", exact: true })).toContainText('"" (empty string)');
    for (const width of [1440, 1030]) {
        await page.setViewportSize({ width, height: 900 });
        const height = await short.evaluate(element => element.getBoundingClientRect().height);
        expect(height).toBeGreaterThanOrEqual(32);
        expect(height).toBeLessThanOrEqual(36);
        expect(await heading.evaluate(element => element.getBoundingClientRect().height)).toBe(height);
        expect(await heading.evaluate(element => element.getBoundingClientRect().width))
            .toBe(await short.evaluate(element => element.getBoundingClientRect().width));
        await expect(short).toHaveCSS("border-radius", "0px");
        await expect(short).toHaveCSS("border-top-width", "0px");
        const layout = await longBody.evaluate(element => {
            const row = element.closest("button"), viewport = element.closest(".cu-rich-result-scroll");
            const index = row?.querySelector(".cu-paragraph-index");
            if (!row || !viewport || !index) throw new Error("Paragraph layout is unavailable.");
            const bounds = element.getBoundingClientRect();
            return { bodyHeight: bounds.height, viewportHeight: viewport.clientHeight,
                fullHeight: element.scrollHeight - element.clientHeight <= 1,
                aligned: Math.abs(bounds.top - index.getBoundingClientRect().top) <= 1,
                horizontalOverflow: viewport.scrollWidth - viewport.clientWidth };
        });
        expect(layout.bodyHeight).toBeGreaterThan(layout.viewportHeight);
        expect(layout.fullHeight).toBe(true);
        expect(layout.aligned).toBe(true);
        expect(layout.horizontalOverflow).toBeLessThanOrEqual(1);
        const documentHeight = await page.evaluate(() => ({
            scrollHeight: document.documentElement.scrollHeight, viewportHeight: window.innerHeight,
        }));
        expect(documentHeight.scrollHeight - documentHeight.viewportHeight).toBeLessThanOrEqual(1);
        expect(await unbrokenBody.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
        await expect(longBody).toHaveCSS("max-height", "none");
        await expect(longBody).toHaveCSS("white-space", "pre-wrap");
    }
});

test("compact paragraphs keep the real page-four long paragraph complete and source-linked", async ({ page }) => {
    await page.getByRole("tab", { name: "Paragraphs", exact: true }).click();
    const list = page.getByRole("list", { name: "Returned paragraphs", exact: true });
    await expect(list.getByRole("listitem")).toHaveCount(174);
    const first = list.getByRole("button", { name: "Select Paragraph 1", exact: true });
    expect(await first.evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(36);
    const paragraph = list.getByRole("button", { name: "Select Paragraph 170", exact: true });
    const body = paragraph.locator(".cu-paragraph-content");
    const text = await body.textContent();
    if (!text || text.length < 100) throw new Error("The page-four long-paragraph fixture is unavailable.");
    await paragraph.click();
    await ready(page);
    await expect(page.getByRole("textbox", { name: "Page number", exact: true })).toHaveValue("4");
    await expect(paragraph).toHaveAttribute("aria-pressed", "true");
    await expect(paragraph).toHaveAccessibleDescription(/Page 4/);
    for (const width of [1440, 1030]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await body.textContent()).toBe(text);
        expect(await body.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(40);
        expect(await body.evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
        expect(await list.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    }
    const selected = await paragraph.evaluate(element => getComputedStyle(element).backgroundColor);
    await paragraph.hover();
    await expect(paragraph).toHaveCSS("background-color", selected);
    const next = list.getByRole("button", { name: "Select Paragraph 171", exact: true });
    await next.press("Space");
    await ready(page);
    await expect(next).toBeFocused();
    await expect(next).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("textbox", { name: "Page number", exact: true })).toHaveValue("4");
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
    await expect(pane.locator(".cu-fields-status")).toContainText("no corresponding extracted fields");
    await expect(pane.getByRole("tab", { name: "Tables", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Zoom percentage")).toHaveText(zoom ?? "");
    await pane.getByRole("tab", { name: "Result", exact: true }).click();
    await expect(pane.getByRole("tree", { name: "Original Analyze result JSON" })).toBeVisible();
    await pane.getByRole("tab", { name: "Fields", exact: true }).click();
    await expect(pane.locator(".cu-fields-status")).toContainText("no corresponding extracted fields");
});

test.describe("source thumbnails at DPR 2", () => {
    test.use({ deviceScaleFactor: 2 });
    test("Figures and Signatures crop actual pixels and Info displays metadata safely without copy controls", async ({ page }) => {
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
        await expect(pane.getByRole("tab")).toHaveText(["Figures", "Signatures", "Info", "Result"]);
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
        await pane.getByRole("tab", { name: "Info", exact: true }).click();
        await expect(pane.getByRole("rowheader")).toHaveText(["metadata", "contents[0]", "Zebra", "Author"]);
        await expect(pane.getByText('<script>window.__bad=true</script>', { exact: true })).toBeVisible();
        await expect(pane.getByRole("button", { name: /^Copy/ })).toHaveCount(0);

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
    await expect(page.getByTestId("result-overlay").locator("polygon")).toHaveCount(2);
    await expect(page.getByTestId("source-overlay").locator("polygon")).toHaveAttribute("data-region-indices", "0 1");
    await page.getByRole("textbox", { name: "Page number" }).fill("4");
    await page.getByRole("textbox", { name: "Page number" }).press("Enter");
    await ready(page);
    await pane.getByRole("button", { name: "Select Paragraph 1", exact: true }).click();
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
    await expect(pane.getByRole("tab", { name: "Fields", exact: true })).toHaveCount(0);
    await pane.getByRole("tab", { name: "Result", exact: true }).click();
    await expect(pane.getByRole("tree", { name: "Original Analyze result JSON" })).toBeVisible();
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
