import { expect, test } from "@playwright/test";
import { bottomId, fieldRow, line1Id, loadReviewFixture, openValueMenu, recipientId } from "./uiRedesignFixtures";
import { expandField, locateGroup, ready } from "./viewerAssertions";

test("UI3 tree/grid projection, exact counts, search and low-confidence value-only emphasis", async ({ page }) => {
    await loadReviewFixture(page);
    const pane = page.getByRole("region", { name: "Extraction results" });
    await expect(pane.getByRole("button", { name: "2 columns", exact: true })).toHaveAttribute("aria-pressed", "true");
    await pane.getByRole("button", { name: "Expand LineItems", exact: true }).click();
    const grid = pane.getByRole("table", { name: "LineItems values", exact: true });
    await expect(grid.getByRole("row")).toHaveCount(4);
    await expect(grid.getByRole("columnheader")).toHaveCount(9);
    await pane.getByRole("searchbox", { name: "Search fields or values" }).fill("3 items");
    await expect(pane.locator(".cu-field-navigation")).toContainText("24 /");
    await expect(grid.getByRole("row")).toHaveCount(4);
    await pane.getByRole("button", { name: /Low confidence/ }).click();
    await expect(pane.locator(".cu-field-navigation")).toContainText("3 /");
    await expect(grid.getByRole("row")).toHaveCount(4);
    await expect(grid.getByRole("columnheader")).toHaveCount(9);
    await page.locator(fieldRow("/contents/0/fields/LineItems")).hover();
    await expect(pane.getByRole("button", { name: "Reorder LineItems", exact: true })).toBeDisabled();
    await pane.getByRole("searchbox", { name: "Search fields or values" }).fill("no-such-value");
    await expect(pane.getByRole("heading", { name: "No matching fields" })).toBeVisible();
    await pane.getByRole("button", { name: "Clear filters", exact: true }).click();
    await expect(pane.getByRole("button", { name: "InvoiceId", exact: true })).toBeVisible();
});

for (const viewport of [{ width: 1536, height: 960 }, { width: 1280, height: 800 }, { width: 1030, height: 760 }]) {
    test(`UI3 nested-only horizontal scrolling and non-shifting actions at ${viewport.width}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await loadReviewFixture(page);
        for (const columns of [2, 3]) {
            await page.getByRole("button", { name: `${columns} columns`, exact: true }).click();
            const value = page.locator(fieldRow(line1Id)).getByRole("button", { name: /Select value of/ });
            await page.locator(".prototype-banner").hover();
            const before = await value.boundingBox();
            await value.hover();
            expect(await value.boundingBox()).toEqual(before);
            await expect.poll(() => page.locator(".cu-fields-pane").evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
        }
        await page.getByRole("button", { name: "Expand LineItems", exact: true }).click();
        await expect.poll(() => page.locator(".cu-inline-table-wrap").evaluate(element => element.scrollWidth - element.clientWidth)).toBeGreaterThan(100);
        await expect.poll(() => page.locator(".cu-fields-scroll").evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
        const height = await page.locator(".cu-fields-controls").evaluate(element =>
            element.getBoundingClientRect().bottom - element.closest(".cu-fields-pane")!.getBoundingClientRect().top);
        expect(height).toBeLessThanOrEqual(150);
    });
}

test("UI3 sibling order, consecutive keyboard moves, resizers and browser persistence", async ({ page }) => {
    await loadReviewFixture(page);
    const invoice = page.getByRole("button", { name: "InvoiceId", exact: true });
    await invoice.focus();
    await invoice.press("Alt+ArrowDown");
    await expect(invoice).toBeFocused();
    await invoice.press("Alt+ArrowDown");
    await expect(invoice).toBeFocused();
    const roots = page.locator('.cu-fields-table > tbody > tr[data-field-depth="0"]');
    await expect(roots.nth(2)).toHaveAttribute("data-field-id", "/contents/0/fields/InvoiceId");
    const split = page.getByRole("separator", { name: "Source and results width", exact: true });
    const column = page.getByRole("separator", { name: "Field column width", exact: true });
    await split.press("ArrowRight");
    const paneWidth = await split.getAttribute("aria-valuenow");
    await column.press("ArrowRight");
    const fieldWidth = await column.getAttribute("aria-valuenow");
    await page.getByRole("button", { name: "3 columns", exact: true }).click();
    await loadReviewFixture(page);
    await expect(roots.nth(2)).toHaveAttribute("data-field-id", "/contents/0/fields/InvoiceId");
    await expect(split).toHaveAttribute("aria-valuenow", paneWidth!);
    await expect(page.getByRole("button", { name: "3 columns", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "2 columns", exact: true }).click();
    await expect(column).toHaveAttribute("aria-valuenow", fieldWidth!);
});

test("UI3 existing Fields array cells retain their full value and confidence actions", async ({ page }) => {
    await loadReviewFixture(page);
    await page.getByRole("button", { name: "Expand LineItems", exact: true }).click();
    const table = page.getByRole("table", { name: "LineItems values", exact: true });
    const cell = table.getByRole("button", { name: "Select value of LineItems / Item 1 / Column1", exact: true });
    await cell.press("Shift+F10");
    await page.getByRole("menuitem", { name: "View full value and confidence", exact: true }).press("Enter");
    await expect(page.getByRole("region", { name: "Full value and confidence" })).toContainText("Confidence 0.50");
    await expect(table.getByRole("row")).toHaveCount(4);
});

test("UI3 actual saved invoice LineItems retain nested monetary values in the inline grid", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await expandField(page, "LineItems");
    const grid = page.getByRole("table", { name: "LineItems values", exact: true });
    await expect(grid.getByRole("row")).toHaveCount(4);
    await expect(grid.getByRole("columnheader", { name: "TaxAmount / Amount", exact: true })).toBeVisible();
    await expect(grid.getByRole("button", { name: "Select value of LineItems / Item 1 / TaxAmount / Amount", exact: true })).toHaveText("6");
});

test("UI-16 pinned bottom space and both scroll positions survive result-tab round trips", async ({ page }) => {
    await loadReviewFixture(page);
    await page.getByRole("combobox", { name: "Zoom", exact: true }).selectOption("width");
    await ready(page);
    await page.getByRole("button", { name: "PageBottom", exact: true }).click();
    await expect(page.getByRole("tooltip", { name: "Field preview", exact: true })).toBeVisible();
    const frame = await page.getByTestId("rendered-page").boundingBox();
    const scroll = await page.getByRole("group", { name: "Source viewport", exact: true }).evaluate(element => element.scrollTop);
    await page.getByRole("button", { name: "Expand LineItems", exact: true }).click();
    await page.locator(".cu-inline-table-wrap").evaluate(element => { element.scrollLeft = 250; });
    await expect.poll(() => page.locator(".cu-fields-scroll").evaluate(element => element.scrollHeight - element.clientHeight)).toBeGreaterThan(50);
    await page.locator(".cu-fields-scroll").evaluate(element => { element.scrollTop = 50; });
    await page.getByRole("tab", { name: "Markdown", exact: true }).click();
    expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(frame);
    expect(await page.getByRole("group", { name: "Source viewport", exact: true }).evaluate(element => element.scrollTop)).toBe(scroll);
    await page.getByRole("tab", { name: "Fields", exact: true }).click();
    await expect(page.getByRole("button", { name: "Collapse LineItems", exact: true })).toBeVisible();
    await expect.poll(() => page.locator(".cu-inline-table-wrap").evaluate(element => element.scrollLeft)).toBe(250);
    await expect.poll(() => page.locator(".cu-fields-scroll").evaluate(element => element.scrollTop)).toBe(50);
    expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(frame);
    await expect(page.getByRole("tooltip", { name: "Field preview", exact: true })).toBeVisible();
});

test("UI-10 real group drag moves descendants together and rejects a cross-parent drop", async ({ page }) => {
    await loadReviewFixture(page);
    const customer = page.locator(fieldRow("/contents/0/fields/Customer"));
    const invoice = page.locator(fieldRow("/contents/0/fields/InvoiceId"));
    await customer.hover();
    await customer.getByRole("button", { name: "Reorder Customer", exact: true })
        .dragTo(invoice, { targetPosition: { x: 80, y: 4 } });
    const rows = page.locator(".cu-fields-table > tbody > tr[data-field-id]");
    await expect(rows.nth(0)).toHaveAttribute("data-field-id", "/contents/0/fields/Customer");
    await expect(rows.nth(1)).toHaveAttribute("data-field-id", recipientId);
    const order = await rows.evaluateAll(elements => elements.map(element => element.getAttribute("data-field-id")));
    await customer.hover();
    await customer.getByRole("button", { name: "Reorder Customer", exact: true })
        .dragTo(page.locator(fieldRow(line1Id)));
    expect(await rows.evaluateAll(elements => elements.map(element => element.getAttribute("data-field-id")))).toEqual(order);
});

for (const viewport of [{ width: 1536, height: 960 }, { width: 1280, height: 800 }]) {
    for (const detailsOpen of [false, true]) {
        test(`UI-31 stationary menu dismissal ${viewport.width}, details ${detailsOpen}`, async ({ page }) => {
            await page.setViewportSize(viewport);
            await loadReviewFixture(page);
            for (let repeat = 0; repeat < 2; repeat++) {
                if (detailsOpen || repeat > 0) {
                    await openValueMenu(page, recipientId);
                    await page.getByRole("menuitem", { name: "View full value and confidence", exact: true }).click();
                }
                await openValueMenu(page, recipientId);
                await page.getByRole("menuitem", { name: "Locate on page 1", exact: true }).click();
                await openValueMenu(page, recipientId);
                await page.getByRole("menuitem", { name: "View full value and confidence", exact: true }).click();
                await page.waitForTimeout(200);
                await expect(page.getByTestId("preview-overlay")).toHaveCount(0);
                await expect(page.getByTestId("source-overlay").locator("polygon").first()).toHaveAttribute("data-source-id", recipientId);
                await expect(page.getByRole("region", { name: "Full value and confidence" })).toContainText("Microsoft Corp");
                await expect(page.getByRole("tooltip", { name: "Field preview", exact: true })).toContainText("Microsoft Corp");
            }
            await page.locator(fieldRow(line1Id)).hover();
            await expect(page.getByTestId("preview-overlay").locator("polygon")).toHaveAttribute("data-source-id", line1Id);
            await expect(page.getByRole("region", { name: "Full value and confidence" })).toContainText("Microsoft Corp");
        });
    }
}

test("UI-07/19 real group selection and current-page-only preview", async ({ page }) => {
    await loadReviewFixture(page);
    const crossPage = page.getByRole("button", { name: "CrossPage", exact: true });
    await crossPage.hover();
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("1");
    await crossPage.click();
    await ready(page);
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("2");
    await locateGroup(page, "/contents/0/fields/CustomerAddress");
    await ready(page);
    await expect(page.getByTestId("source-overlay").locator("polygon")).toHaveCount(2);
    await expect(page.getByRole("tooltip", { name: "Field preview" })).toHaveCount(0);
    await page.getByRole("button", { name: "Collapse CustomerAddress", exact: true }).click();
    await expect(page.getByTestId("source-overlay").locator("polygon")).toHaveCount(2);
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 1280, height: 540 }]) {
    for (const entry of ["name", "value", "Enter", "menu", "source"] as const) {
        test(`UI-26/29 bottom selection through ${entry} at height ${viewport.height}`, async ({ page }) => {
            await page.setViewportSize(viewport);
            await loadReviewFixture(page);
            await page.getByRole("combobox", { name: "Zoom", exact: true }).selectOption(viewport.height === 540 ? "page" : "width");
            await ready(page);
            const row = page.locator(fieldRow(bottomId));
            const target = page.getByTestId("result-overlay").locator(`[data-outline-id="${bottomId}"]`);
            if (entry === "source") {
                await target.evaluate(element => element.scrollIntoView({ block: "end" }));
                const bounds = await target.boundingBox();
                if (!bounds) throw new Error("Page-bottom source is unavailable.");
                await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
                const before = await target.boundingBox();
                await page.waitForTimeout(200);
                expect(await target.boundingBox()).toEqual(before);
                await page.mouse.down(); await page.mouse.up();
            } else if (entry === "name") await row.getByRole("button", { name: "PageBottom", exact: true }).click();
            else if (entry === "value") await row.getByRole("button", { name: /Select value of PageBottom/ }).click();
            else if (entry === "Enter") await row.getByRole("button", { name: "PageBottom", exact: true }).press("Enter");
            else {
                await openValueMenu(page, bottomId);
                await page.getByRole("menuitem", { name: "Locate on page 1", exact: true }).click();
            }
            await ready(page);
            const popup = page.getByRole("tooltip", { name: "Field preview", exact: true });
            await expect(popup).toBeVisible();
            const card = await popup.boundingBox(), source = await target.boundingBox();
            const viewportBounds = await page.getByRole("group", { name: "Source viewport", exact: true }).boundingBox();
            if (!card || !source || !viewportBounds) throw new Error("Source reveal geometry is unavailable.");
            expect(card.y).toBeGreaterThanOrEqual(source.y + source.height);
            expect(card.y + card.height).toBeLessThanOrEqual(viewportBounds.y + viewportBounds.height);
        });
    }
}
