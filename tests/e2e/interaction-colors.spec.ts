import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { fieldRow, line1Id, loadReviewFixture, recipientId } from "./uiRedesignFixtures";
import { expandField, locateGroup, ready } from "./viewerAssertions";

test.use({ reducedMotion: "reduce" });

const hover = "rgb(238, 231, 255)", selected = "rgb(229, 218, 255)", related = "rgb(248, 245, 255)";
const hoverStroke = "rgb(140, 112, 194)", selectedStroke = "rgb(91, 33, 182)";
const row = (page: Page, id: string) => page.locator(`.cu-fields-table > tbody > tr${fieldRow(id)}`);
const source = (page: Page, id: string, index = 0) =>
    page.getByTestId("result-overlay").locator(`polygon[data-outline-id="${id}"][data-region-index="${index}"]`);
const pin = (page: Page) => page.getByTestId("source-overlay").locator("polygon").first();
const preview = (page: Page) => page.getByTestId("preview-overlay").locator("polygon").first();

function contrast(first: string, second: string): number {
    const luminance = (text: string): number => {
        const parts = text.match(/[\d.]+/g);
        if (!parts || parts.length < 3) throw new Error("Expected an RGB color.");
        const values = parts.slice(0, 3).map(Number).map(value => value / 255)
            .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
        return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722;
    };
    const colors = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (colors[0]! + 0.05) / (colors[1]! + 0.05);
}

async function expectReadable(score: Locator): Promise<void> {
    await expect(score).toHaveCSS("color", "rgb(82, 98, 118)");
    const colors = await score.evaluate(element => ({
        text: getComputedStyle(element).color,
        background: getComputedStyle(element.parentElement!).backgroundColor,
    }));
    expect(contrast(colors.text, colors.background)).toBeGreaterThanOrEqual(4.5);
}

test("UI-48/51 source hover and pin have distinct violet outlines with linked Fields and unchanged confidence colors", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await page.getByRole("button", { name: "3 columns", exact: true }).click();
    const billing = "/contents/0/fields/BillingAddress", shipping = "/contents/0/fields/ShippingAddress";
    const chip = row(page, billing).locator(".cu-value-chip");
    const beforeChip = await chip.evaluate(element => ({
        color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor,
    }));
    const fills = await source(page, billing).getAttribute("fill");
    await row(page, shipping).locator(".cu-field-name").click();
    await expect(pin(page)).toHaveCSS("stroke", selectedStroke);
    await expect(row(page, shipping)).toHaveCSS("background-color", selected);
    const frame = await page.getByTestId("rendered-page").boundingBox();
    await source(page, billing, 1).hover();
    await expect(preview(page)).toHaveCSS("stroke", hoverStroke);
    await expect(preview(page)).toHaveAttribute("data-region-indices", "0 1");
    await expect(preview(page)).toHaveCSS("stroke-dasharray", "none");
    await expect(pin(page)).toHaveCSS("stroke", selectedStroke);
    await expect(row(page, billing)).toHaveCSS("background-color", hover);
    await expect(row(page, shipping)).toHaveCSS("background-color", selected);
    await expectReadable(row(page, billing).locator(".cu-confidence"));
    await expectReadable(row(page, shipping).locator(".cu-confidence"));
    expect(await chip.evaluate(element => ({
        color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor,
    }))).toEqual(beforeChip);
    expect(await source(page, billing).getAttribute("fill")).toBe(fills);
    await expect(page.locator(".cu-flyover-value dd")).toHaveCSS("color", "rgb(30, 58, 42)");
    await expect(page.locator(".cu-flyover-confidence dd")).toHaveCSS("color", "rgb(155, 28, 28)");
    await expect(row(page, shipping).locator(".cu-field-name")).toHaveAttribute("aria-pressed", "true");
    await expect(row(page, billing).locator(".cu-field-name")).toHaveAttribute("aria-pressed", "false");
    expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(frame);
});

test("UI-48 hovering the current field or selected descendants never fades the fixed selection", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const id = "/contents/0/fields/BillingAddress";
    await row(page, id).locator(".cu-field-name").click();
    await source(page, id, 1).hover();
    await expect(pin(page)).toHaveCSS("stroke", selectedStroke);
    await expect(page.getByTestId("preview-overlay")).toHaveCount(0);
    await expect(row(page, id)).toHaveCSS("background-color", selected);
    await loadReviewFixture(page);
    await locateGroup(page, "/contents/0/fields/CustomerAddress");
    await source(page, line1Id).hover();
    await expect(page.getByTestId("preview-overlay")).toHaveCount(0);
    await expect(pin(page)).toHaveCSS("stroke", selectedStroke);
    await expect(row(page, line1Id)).toHaveCSS("background-color", selected);
    await expect(row(page, "/contents/0/fields/CustomerAddress")).toHaveCSS("background-color", selected);
});

test("UI-48 collapsed ancestors receive source hover without expanding and keep selected-proxy priority", async ({ page }) => {
    await loadReviewFixture(page);
    const id = "/contents/0/fields/CustomerAddress";
    await page.getByRole("button", { name: "Collapse CustomerAddress", exact: true }).click();
    await page.getByRole("button", { name: "InvoiceId", exact: true }).click();
    const frame = await page.getByTestId("rendered-page").boundingBox();
    await source(page, line1Id).hover();
    await expect(row(page, id)).toHaveClass(/is-hovered/);
    await expect(row(page, id)).toHaveCSS("background-color", hover);
    await expect(page.getByRole("button", { name: "CustomerAddress", exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("button", { name: "InvoiceId", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(frame);
    await source(page, line1Id).press("Enter");
    await page.getByRole("button", { name: "Collapse CustomerAddress", exact: true }).click();
    await expect(row(page, id)).toHaveClass(/is-selection-proxy/);
    await source(page, "/contents/0/fields/CustomerAddress/valueObject/City").focus();
    await expect(row(page, id)).toHaveCSS("background-color", selected);
    await expect(page.getByRole("button", { name: "CustomerAddress", exact: true })).toHaveAttribute("aria-expanded", "false");
});

test("UI-48 array-cell hover and whole-group selection preserve neighbors, opaque indices and low chips", async ({ page }) => {
    await loadReviewFixture(page);
    await expandField(page, "LineItems");
    const array = "/contents/0/fields/LineItems";
    const first = `${array}/valueArray/0/valueObject/Column1`, second = `${array}/valueArray/0/valueObject/Column2`;
    const grid = page.getByRole("table", { name: "LineItems values", exact: true });
    const cell = (id: string) => grid.locator(`td:has(.cu-cell-content${fieldRow(id)})`);
    await cell(first).locator(".cu-cell-value").click();
    await source(page, second).hover();
    await expect(cell(first)).toHaveCSS("background-color", selected);
    await expect(cell(second)).toHaveCSS("background-color", hover);
    await expect(grid.locator(".is-location-row")).toHaveCSS("background-color", related);
    await expect(grid.locator(".is-location-column")).toHaveCSS("background-color", related);
    await expect(grid.locator(":scope > tbody > tr > td").nth(2)).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(cell(first).locator(".cu-value-chip")).toHaveCSS("background-color", "rgb(255, 232, 236)");
    await expect(cell(first).locator(".cu-value-chip")).toHaveCSS("color", "rgb(155, 28, 28)");
    await expect(cell(first).locator(".cu-cell-value")).toHaveAttribute("aria-pressed", "true");
    await expect(cell(second).locator(".cu-cell-value")).toHaveAttribute("aria-pressed", "false");
    await locateGroup(page, array);
    await source(page, second).hover();
    await expect(cell(second)).toHaveCSS("background-color", selected);
    await expect(page.getByTestId("preview-overlay")).toHaveCount(0);
    await expect(pin(page)).toHaveCSS("stroke", selectedStroke);
    const index = grid.locator(":scope > tbody > tr > th").first();
    await expect(index).toHaveCSS("background-color", selected);
    await expect(index).toHaveCSS("color", "rgb(82, 98, 118)");
    await expect(index).toHaveCSS("position", "sticky");
    expect(await index.evaluate(element => element.getBoundingClientRect().width)).toBeCloseTo(29, 1);
});

test("UI-48 related ranges stay pale while hover and the actual current value remain distinguishable", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await page.getByRole("button", { name: "3 columns", exact: true }).click();
    await page.getByTestId("source-tables").locator('[data-table-id="/contents/0/tables/2"]').press("Enter");
    const group = "/contents/0/fields/AmountDue", amount = `${group}/valueObject/Amount`, currency = `${group}/valueObject/CurrencyCode`;
    await expect(row(page, group)).toHaveCSS("background-color", related);
    await expect(row(page, currency)).toHaveCSS("background-color", related);
    await source(page, amount).hover();
    await expect(row(page, amount)).toHaveCSS("background-color", hover);
    await expectReadable(row(page, amount).locator(".cu-confidence"));
    await expect(row(page, group)).toHaveCSS("background-color", related);
    await row(page, amount).locator(".cu-field-value").click();
    await expect(row(page, amount)).toHaveCSS("background-color", selected);
    await expect(row(page, currency)).toHaveCSS("background-color", related);
    await expect(row(page, amount).locator(".cu-value-chip")).toHaveCSS("background-color", "rgb(252, 232, 230)");
    await expect(page.locator(".cu-table-scope")).toBeVisible();
});

test("UI-48 right-side hover uses the same linked preview palette without selecting", async ({ page }) => {
    await loadReviewFixture(page);
    await page.getByRole("button", { name: "3 columns", exact: true }).click();
    const target = row(page, recipientId);
    await target.locator(".cu-field-name").hover();
    await expect(target).toHaveCSS("background-color", hover);
    await expect(preview(page)).toHaveCSS("stroke", hoverStroke);
    await expectReadable(target.locator(".cu-confidence"));
    await expect(target.locator(".cu-field-name")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
    await target.locator(".cu-field-name").click();
    await expect(target).toHaveCSS("background-color", selected);
    await expect(pin(page)).toHaveCSS("stroke", selectedStroke);
});

test("UI-51 violet outlines contrast with every semantic source fill without changing geometry or pixels", async ({ page }) => {
    await loadReviewFixture(page);
    const regions = page.getByTestId("result-overlay").locator("polygon[data-outline-id]");
    const before = await regions.evaluateAll(elements => elements.map(element => ({
        points: element.getAttribute("points"), fill: getComputedStyle(element).fill,
    })));
    const fills = [...new Set(before.map(region => region.fill))].sort();
    expect(fills).toEqual([
        "rgb(232, 241, 255)", "rgb(232, 245, 233)", "rgb(241, 243, 245)",
        "rgb(252, 232, 230)", "rgb(255, 232, 236)",
    ]);
    const canvas = page.getByTestId("source-canvas");
    const pixels = await canvas.evaluate(element => {
        if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected a source canvas.");
        return element.toDataURL();
    });
    const id = "/contents/0/fields/InvoiceId";
    const points = await source(page, id).getAttribute("points");
    if (!points) throw new Error("The source points are unavailable.");
    await row(page, id).locator(".cu-field-name").hover();
    await expect(preview(page)).toHaveCSS("stroke", hoverStroke);
    await expect(preview(page)).toHaveAttribute("points", points);
    const temporary = await preview(page).evaluate(element => getComputedStyle(element).stroke);
    await row(page, id).locator(".cu-field-name").click();
    await expect(pin(page)).toHaveCSS("stroke", selectedStroke);
    await expect(pin(page)).toHaveAttribute("points", points);
    await expect(pin(page)).toHaveAttribute("stroke-width", "1.8");
    await expect(pin(page)).toHaveCSS("fill", "none");
    await expect(pin(page)).toHaveCSS("shape-rendering", "geometricprecision");
    const fixed = await pin(page).evaluate(element => getComputedStyle(element).stroke);
    for (const fill of ["rgb(255, 255, 255)", ...fills]) {
        expect(contrast(temporary, fill)).toBeGreaterThanOrEqual(3);
        expect(contrast(fixed, fill)).toBeGreaterThanOrEqual(3);
    }
    expect(await regions.evaluateAll(elements => elements.map(element => ({
        points: element.getAttribute("points"), fill: getComputedStyle(element).fill,
    })))).toEqual(before);
    expect(await canvas.evaluate(element => {
        if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected the original source canvas.");
        return element.toDataURL();
    })).toBe(pixels);
});
