import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { ready } from "./viewerAssertions";

test.use({ viewport: { width: 1253, height: 888 }, reducedMotion: "reduce",
    launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

const table = (page: Page, number: number): Locator => page.getByTestId("source-tables")
    .getByRole("button", { name: `Locate Table ${number} in results`, exact: true }).first();
const showAll = (page: Page): Locator => page.getByRole("button", { name: "Show all fields", exact: true });
const roots = (page: Page): Locator => page.locator('.cu-fields-table > tbody > tr[data-field-depth="0"]');
const amount = (page: Page, name: string): Locator => page.locator(`[data-field-id="/contents/0/fields/${name}/valueObject/Amount"]`)
    .getByRole("button", { name: "Amount", exact: true });
const savedPreferences = (page: Page): Promise<string> => page.evaluate(() => JSON.stringify(
    Object.keys(localStorage).filter(key => key.startsWith("cu-viewer:review:v1:")).sort().map(key => [key, localStorage.getItem(key)])));

test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await ready(page);
});

test("UI-41 related fields gather without saved-order changes and Show all restores the original view", async ({ page }) => {
    await page.getByRole("button", { name: "TaxDetails", exact: true }).press("Alt+ArrowUp");
    const order = await roots(page).evaluateAll(elements => elements.map(element => element.getAttribute("data-field-id")));
    const preferences = await savedPreferences(page);
    const array = page.locator('[data-array-id="/contents/0/fields/LineItems"]');
    await array.evaluate(element => { element.scrollLeft = 250; });
    await page.locator(".cu-fields-scroll").evaluate(element => { element.scrollTop = 180; });
    const scroll = await page.locator(".cu-fields-scroll").evaluate(element => element.scrollTop);
    await table(page, 3).press("Enter");
    await expect(showAll(page)).toBeVisible();
    await expect(page.locator(".cu-table-scope")).toContainText("Table 3");
    const related = await roots(page).evaluateAll(elements => elements.map(element => element.getAttribute("data-field-id")));
    expect(related).toHaveLength(4);
    expect(related).toEqual(order.filter(id => [
        "/contents/0/fields/AmountDue", "/contents/0/fields/BalanceForward",
        "/contents/0/fields/TaxDetails", "/contents/0/fields/TotalAmount",
    ].includes(id ?? "")));
    await expect(page.locator(".cu-field-navigation > span")).toHaveText("12 / 77 fields");
    await expect(page.getByRole("table", { name: "TaxDetails values", exact: true })).toBeVisible();
    expect(await roots(page).evaluateAll(elements => elements.every(element =>
        getComputedStyle(element).backgroundColor === "rgb(248, 245, 255)" &&
        getComputedStyle(element).outlineStyle === "none" &&
        getComputedStyle(element.querySelector("td")!).boxShadow === "none"))).toBe(true);
    await page.getByRole("button", { name: "AmountDue", exact: true }).focus();
    await expect(page.getByRole("button", { name: "Reorder AmountDue", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Reset order", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "AmountDue", exact: true }).press("Alt+ArrowUp");
    expect(await savedPreferences(page)).toBe(preferences);
    await table(page, 1).press("Enter");
    await expect(roots(page)).toHaveCount(1);
    await expect(roots(page).first()).toHaveAttribute("data-field-id", "/contents/0/fields/PONumber");
    await showAll(page).click();
    await expect(showAll(page)).toHaveCount(0);
    await expect(page.getByRole("searchbox", { name: "Search fields or values", exact: true })).toBeFocused();
    expect(await roots(page).evaluateAll(elements => elements.map(element => element.getAttribute("data-field-id")))).toEqual(order);
    await expect(page.locator(".cu-fields-scroll")).toHaveJSProperty("scrollTop", scroll);
    await expect(array).toHaveJSProperty("scrollLeft", 250);
    await expect(page.getByRole("button", { name: "Expand TaxDetails", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset order", exact: true })).toBeEnabled();
    expect(await savedPreferences(page)).toBe(preferences);
});

test("UI-41 selecting and inspecting related values keeps the scope and distinguishes the current value", async ({ page }) => {
    await table(page, 3).press("Enter");
    await amount(page, "AmountDue").click();
    await expect(showAll(page)).toBeVisible();
    await expect(roots(page)).toHaveCount(4);
    const current = page.locator('[data-field-id="/contents/0/fields/AmountDue/valueObject/Amount"]');
    await expect(current).toHaveCSS("background-color", "rgb(229, 218, 255)");
    await expect(current).toHaveCSS("outline-style", "none");
    await expect(current.locator("td").first()).toHaveCSS("box-shadow", "none");
    await expect(current.locator(".cu-value-chip")).toHaveCSS("background-color", "rgb(252, 232, 230)");
    const currency = page.locator('[data-field-id="/contents/0/fields/AmountDue/valueObject/CurrencyCode"]');
    await expect(currency).toHaveCSS("background-color", "rgb(248, 245, 255)");
    await expect(currency.locator(".cu-value-chip")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await amount(page, "AmountDue").press("F2");
    const details = page.getByRole("region", { name: "Full value and confidence", exact: true });
    await expect(details).toContainText("610");
    await amount(page, "BalanceForward").click();
    await expect(details).toContainText("500");
    await expect(showAll(page)).toBeVisible();
    await expect(roots(page)).toHaveCount(4);
    await page.getByRole("button", { name: "Close full value details", exact: true }).click();
    await expect(showAll(page)).toBeVisible();
    await currency.getByRole("button", { name: "CurrencyCode", exact: true }).click();
    await expect(showAll(page)).toBeVisible();
    await currency.getByRole("button", { name: "CurrencyCode", exact: true }).press("F2");
    await expect(details).toContainText("USD");
    await table(page, 2).press("Enter");
    await expect(details).toHaveCount(0);
    await expect(roots(page)).toHaveCount(1);
    const grid = page.getByRole("table", { name: "LineItems values", exact: true });
    await grid.getByRole("button", { name: "Select value of LineItems / Item 1 / ProductCode", exact: true }).click();
    await expect(showAll(page)).toBeVisible();
    await expect(roots(page)).toHaveCount(1);
    await expect(grid.locator(".is-selected-cell")).toHaveCSS("background-color", "rgb(229, 218, 255)");
});

test("UI-41 source table emphasis uses background frames rather than momentarily restoring group borders", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await table(page, 3).press("Enter");
    const group = page.locator('.cu-fields-table > tbody > tr[data-field-id="/contents/0/fields/AmountDue"]');
    const effect = await group.evaluate(element => {
        const animation = element.getAnimations().find(item => item.id === "cu-field-location");
        if (!animation || !(animation.effect instanceof KeyframeEffect)) throw new Error("The related-block emphasis is missing.");
        return animation.effect.getKeyframes();
    });
    expect(effect.every(frame => typeof frame.backgroundColor === "string" && !frame.outline)).toBe(true);
    await expect(group).toHaveCSS("outline-style", "none");
});

test("UI-41 scoped review intersects existing search and filters without clearing explicit user edits", async ({ page }) => {
    const query = page.getByRole("searchbox", { name: "Search fields or values", exact: true });
    await query.fill("Amount");
    await page.getByRole("button", { name: /Low confidence/ }).click();
    await table(page, 3).press("Enter");
    await expect(showAll(page)).toBeVisible();
    await expect(query).toHaveValue("Amount");
    await expect(page.getByRole("button", { name: /Low confidence/ })).toHaveAttribute("aria-pressed", "true");
    await query.fill("BalanceForward");
    await expect(roots(page)).toHaveCount(1);
    await showAll(page).click();
    await expect(query).toHaveValue("BalanceForward");
    await expect(page.getByRole("button", { name: /Low confidence/ })).toHaveAttribute("aria-pressed", "true");
    await expect(roots(page).first()).toHaveAttribute("data-field-id", "/contents/0/fields/BalanceForward");
    await query.fill("INV-100");
    await table(page, 3).press("Enter");
    await expect(showAll(page)).toBeVisible();
    await expect(page.getByRole("heading", { name: "No matching fields", exact: true })).toBeVisible();
    await expect(page.locator(".cu-fields-review-footer")).toContainText("hidden by filters");
    await expect(query).toHaveValue("INV-100");
});

test("UI-41 closing details after Show all returns focus to the restored collapsed parent", async ({ page }) => {
    await table(page, 3).press("Enter");
    const value = page.getByRole("button", { name: "Select value of TaxDetails / Item 1 / Amount / Amount", exact: true });
    await value.click();
    await value.press("F2");
    await expect(page.getByRole("region", { name: "Full value and confidence", exact: true })).toContainText("10");
    await showAll(page).click();
    await expect(page.getByRole("button", { name: "Expand TaxDetails", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close full value details", exact: true }).click();
    const parent = page.getByRole("button", { name: "TaxDetails", exact: true });
    await expect(parent).toBeFocused();
    await expect(parent).toHaveAttribute("aria-expanded", "false");
    expect(await parent.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return element.contains(element.ownerDocument.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
    })).toBe(true);
});

test("UI-41 hovering outside the table keeps the scope, but explicitly selecting an outside source exits and reveals it safely", async ({ page }) => {
    await page.locator(".cu-fields-scroll").evaluate(element => { element.scrollTop = 580; });
    await table(page, 3).press("Enter");
    const invoice = page.getByTestId("result-overlay").locator('[data-outline-id="/contents/0/fields/InvoiceId"]');
    await invoice.hover();
    await expect(showAll(page)).toBeVisible();
    await invoice.click();
    await expect(showAll(page)).toHaveCount(0);
    await expect(roots(page)).toHaveCount(31);
    const field = page.getByRole("button", { name: "InvoiceId", exact: true });
    await expect(field).toHaveAttribute("aria-pressed", "true");
    expect(await field.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return element.contains(element.ownerDocument.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2));
    })).toBe(true);
    await expect(page.locator(".cu-fields-table > tbody > .is-table-block")).toHaveCount(0);
});

test("UI-41 scoped tab round trips keep the range, and clear restores base expansion and scroll", async ({ page }) => {
    const array = page.locator('[data-array-id="/contents/0/fields/LineItems"]');
    await array.evaluate(element => { element.scrollLeft = 200; });
    await page.locator(".cu-fields-scroll").evaluate(element => { element.scrollTop = 100; });
    await table(page, 3).press("Enter");
    await page.getByRole("tab", { name: "Markdown", exact: true }).click();
    await page.getByRole("tab", { name: "Fields", exact: true }).click();
    await expect(showAll(page)).toBeVisible();
    await expect(roots(page)).toHaveCount(4);
    await page.getByRole("button", { name: "Clear selection", exact: true }).click();
    await expect(showAll(page)).toHaveCount(0);
    await expect(roots(page)).toHaveCount(31);
    await expect(page.locator(".cu-fields-scroll")).toHaveJSProperty("scrollTop", 100);
    await expect(array).toHaveJSProperty("scrollLeft", 200);
    await expect(page.getByRole("button", { name: "Expand TaxDetails", exact: true })).toBeVisible();
});

test("UI-41 replacing a scoped result discards the old range and never restores old fields", async ({ page }) => {
    await table(page, 3).press("Enter");
    await expect(showAll(page)).toBeVisible();
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "new-scope-context.cu.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ apiVersion: "2025-11-01", analyzerId: "scope-context-replacement", contents: [{
            kind: "document", unit: "inch", pages: [{ pageNumber: 1, width: 8.5, height: 11 }],
            fields: { NewOnly: { type: "string", valueString: "New result only", source: "D(1,1,1,1,1)" } },
        }] })),
    });
    await expect(showAll(page)).toHaveCount(0);
    await expect(roots(page)).toHaveCount(1);
    await expect(page.getByRole("button", { name: "NewOnly", exact: true })).toBeVisible();
    await expect(page.locator(".cu-table-scope")).toHaveCount(0);
    await expect(page.locator(".cu-fields-table > tbody > .is-table-block")).toHaveCount(0);
});

for (const viewport of [{ width: 1536, height: 960 }, { width: 1030, height: 760 }]) {
    test(`UI-41 related scope fits the compact toolbar at ${viewport.width}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await table(page, 3).press("Enter");
        for (const columns of [2, 3]) {
            await page.getByRole("button", { name: `${columns} columns`, exact: true }).click();
            await expect(showAll(page)).toBeVisible();
            const geometry = await page.locator(".cu-fields-pane").evaluate(element => ({
                controls: element.querySelector(".cu-fields-controls")!.getBoundingClientRect().bottom - element.getBoundingClientRect().top,
                overflow: element.scrollWidth - element.clientWidth,
                headingOverflow: element.querySelector(".cu-result-heading")!.scrollWidth - element.querySelector(".cu-result-heading")!.clientWidth,
            }));
            expect(geometry.controls).toBeLessThanOrEqual(150);
            expect(geometry.overflow).toBeLessThanOrEqual(1);
            expect(geometry.headingOverflow).toBeLessThanOrEqual(1);
        }
    });
}
