import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { fieldRow, line1Id, loadReviewFixture, recipientId } from "./uiRedesignFixtures";
import { expandField, ready } from "./viewerAssertions";

const billingId = "/contents/0/fields/BillingAddress";
const productId = "/contents/0/fields/LineItems/valueArray/0/valueObject/ProductCode";
const arrayId = "/contents/0/fields/LineItems";
test.use({ reducedMotion: "no-preference" });

async function selectSource(page: Page, id: string): Promise<void> {
    await page.getByTestId("result-overlay").locator(`[data-outline-id="${id}"]`).first().click();
}

async function expectUncoveredRow(row: Locator): Promise<void> {
    await expect.poll(() => row.evaluate(element => {
        const viewport = element.closest(".cu-fields-scroll")!;
        const header = viewport.querySelector(".cu-fields-table > thead th")!.getBoundingClientRect();
        const bounds = element.getBoundingClientRect();
        const name = element.querySelector(".cu-field-name")!;
        const button = name.getBoundingClientRect();
        return bounds.top >= header.bottom && bounds.bottom <= viewport.getBoundingClientRect().bottom &&
            [0.2, 0.5, 0.8].every(fraction => name.contains(
                element.ownerDocument.elementFromPoint(button.left + button.width * fraction, button.top + button.height / 2)));
    })).toBe(true);
}

async function expectNoPulse(target: Locator): Promise<void> {
    await expect.poll(() => target.evaluate(element =>
        element.getAnimations({ subtree: true }).filter(animation => animation.id === "cu-field-location").length)).toBe(0);
}

async function expectSelectedRow(row: Locator): Promise<void> {
    await expect(row).toHaveCSS("background-color", "rgb(229, 218, 255)");
    await expect(row).toHaveCSS("outline-style", "none");
    await expect(row.locator(":scope > td").first()).toHaveCSS("box-shadow", "none");
}

for (const viewport of [{ width: 1536, height: 960 }, { width: 1280, height: 800 }, { width: 1030, height: 760 }]) {
    test(`UI-32 real BillingAddress clears the sticky header at ${viewport.width}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto("/");
        await ready(page);
        await expandField(page, "LineItems");
        await expandField(page, "TaxDetails");
        const row = page.locator(`.cu-fields-table > tbody > tr${fieldRow(billingId)}`);
        const before = await row.evaluate(element => ({
            height: element.getBoundingClientRect().height,
            valueBackground: getComputedStyle(element.querySelector(".cu-value-chip")!).backgroundColor,
        }));
        await page.locator(".cu-fields-scroll").evaluate(element => { element.scrollTop = 230; });
        await selectSource(page, billingId);
        await expect(row).toHaveClass(/is-selected/);
        await expectUncoveredRow(row);
        await expect(row.locator(".cu-field-name")).toHaveCSS("font-weight", "600");
        await expect(page.getByRole("group", { name: "Source viewport", exact: true })).toBeFocused();
        const after = await row.evaluate(element => ({
            height: element.getBoundingClientRect().height,
            valueBackground: getComputedStyle(element.querySelector(".cu-value-chip")!).backgroundColor,
        }));
        expect(after).toEqual(before);
        await expect(page.getByRole("region", { name: "Full value and confidence" })).toHaveCount(0);
    });

    test(`UI-32 real A123 clears the sticky index and marks its row/column at ${viewport.width}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto("/");
        await ready(page);
        await expandField(page, "LineItems");
        const wrap = page.locator(`[data-array-id="${arrayId}"]`);
        const content = wrap.locator(`.cu-cell-content${fieldRow(productId)}`);
        const before = await content.evaluate(element => ({
            width: element.closest("td")!.getBoundingClientRect().width,
            height: element.closest("td")!.getBoundingClientRect().height,
            indexWidth: element.closest("tr")!.querySelector("th")!.getBoundingClientRect().width,
            valueBackground: getComputedStyle(element.querySelector(".cu-value-chip")!).backgroundColor,
        }));
        await wrap.evaluate(element => { element.scrollLeft = 765; });
        await page.locator(".cu-fields-scroll").evaluate(element => { element.scrollTop = 230; });
        await selectSource(page, productId);
        await expect(content.locator(".cu-cell-value")).toHaveAttribute("aria-pressed", "true");
        await expect.poll(() => content.evaluate(element => {
            const cell = element.closest("td")!.getBoundingClientRect();
            const index = element.closest("tr")!.querySelector("th")!.getBoundingClientRect();
            const wrapper = element.closest(".cu-inline-table-wrap")!;
            const outer = wrapper.getBoundingClientRect();
            const chip = element.querySelector(".cu-value-chip")!;
            const value = chip.getBoundingClientRect();
            const viewport = element.closest(".cu-fields-scroll")!;
            const header = viewport.querySelector(".cu-fields-table > thead th")!.getBoundingClientRect();
            return cell.left >= index.right + 7 && cell.right <= outer.left + wrapper.clientWidth &&
                cell.top >= header.bottom && cell.bottom <= viewport.getBoundingClientRect().bottom &&
                [0.2, 0.5, 0.8].every(fraction => chip.contains(element.ownerDocument.elementFromPoint(
                    value.left + value.width * fraction, value.top + value.height / 2)));
        })).toBe(true);
        await expect(wrap.locator(".is-location-row")).toHaveText("1");
        await expect(wrap.locator(".is-location-column")).toHaveText("ProductCode");
        await expect(wrap.locator("td.is-selected-cell")).toHaveCount(1);
        const after = await content.evaluate(element => ({
            width: element.closest("td")!.getBoundingClientRect().width,
            height: element.closest("td")!.getBoundingClientRect().height,
            indexWidth: element.closest("tr")!.querySelector("th")!.getBoundingClientRect().width,
            valueBackground: getComputedStyle(element.querySelector(".cu-value-chip")!).backgroundColor,
        }));
        expect(after).toEqual(before);
        await expect(page.getByRole("group", { name: "Source viewport", exact: true })).toBeFocused();
    });
}

test("UI-32 repeated source selections replay only the current bounded emphasis; clear cancels it", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const row = page.locator(`.cu-fields-table > tbody > tr${fieldRow(billingId)}`);
    await selectSource(page, billingId);
    const first = await row.evaluateHandle(element => {
        const animation = element.getAnimations().find(item => item.id === "cu-field-location");
        if (!animation) throw new Error("Source selection did not start a location emphasis.");
        return animation;
    });
    const frames = await first.evaluate(animation => {
        if (!(animation.effect instanceof KeyframeEffect)) throw new Error("Source selection has no keyframe effect.");
        return animation.effect.getKeyframes();
    });
    expect(frames.map(frame => frame.backgroundColor)).toEqual(["rgb(216, 198, 242)", "rgb(229, 218, 255)"]);
    expect(frames.every(frame => !frame.outline && !frame.boxShadow)).toBe(true);
    await expect(row).toHaveCSS("outline-style", "none");
    await expect(row.locator(":scope > td").first()).toHaveCSS("box-shadow", "none");
    await selectSource(page, billingId);
    expect(await first.evaluate(animation => animation.playState)).toBe("idle");
    const replay = await row.evaluate((element, previous) => {
        const current = element.getAnimations().find(item => item.id === "cu-field-location");
        return { restarted: Boolean(current && current !== previous), duration: current?.effect?.getTiming().duration };
    }, first);
    expect(replay).toEqual({ restarted: true, duration: 1000 });
    await expectNoPulse(row);
    await expect(row).toHaveClass(/is-selected/);
    await expectSelectedRow(row);
    await selectSource(page, billingId);
    const viewport = await page.getByRole("group", { name: "Source viewport", exact: true }).boundingBox();
    if (!viewport) throw new Error("Source viewport is unavailable.");
    await page.mouse.click(viewport.x + 5, viewport.y + 5);
    await expect(row).not.toHaveClass(/is-selected/);
    await expect(row).not.toHaveCSS("background-color", "rgb(229, 218, 255)");
    await expectNoPulse(row);
    await first.dispose();
});

test("UI-32 source selection opens hidden ancestors without stealing focus or changing filters", async ({ page }) => {
    await loadReviewFixture(page);
    await page.getByRole("button", { name: "Collapse Customer", exact: true }).click();
    await selectSource(page, recipientId);
    const row = page.locator(`.cu-fields-table > tbody > tr${fieldRow(recipientId)}`);
    await expect(page.getByRole("button", { name: "Collapse Customer", exact: true })).toBeVisible();
    await expectUncoveredRow(row);
    await expect(page.getByRole("group", { name: "Source viewport", exact: true })).toBeFocused();
    await page.getByRole("searchbox", { name: "Search fields or values" }).fill("INV-100");
    await selectSource(page, recipientId);
    await expect(page.getByRole("searchbox", { name: "Search fields or values" })).toHaveValue("INV-100");
    await expect(page.locator(".cu-fields-review-footer")).toContainText("1 selected fields are hidden by filters.");
    await expectNoPulse(page.locator(".cu-fields-scroll"));
    await page.getByRole("searchbox", { name: "Search fields or values" }).fill("");
    await expectNoPulse(row);
});

test("UI-32 hover, right-side selection and tab restoration never replay source emphasis", async ({ page }) => {
    await loadReviewFixture(page);
    const row = page.locator(`.cu-fields-table > tbody > tr${fieldRow(recipientId)}`);
    await row.locator(".cu-field-name").click();
    await expectNoPulse(row);
    await selectSource(page, recipientId);
    await expectNoPulse(row);
    const scroll = await page.locator(".cu-fields-scroll").evaluate(element => element.scrollTop);
    await page.getByRole("button", { name: "Line1", exact: true }).hover();
    await expectNoPulse(page.locator(".cu-fields-scroll"));
    await expect(page.locator(".cu-fields-scroll")).toHaveJSProperty("scrollTop", scroll);
    await page.getByRole("tab", { name: "Markdown", exact: true }).click();
    await page.getByRole("tab", { name: "Fields", exact: true }).click();
    await expect(row).toHaveClass(/is-selected/);
    await expectNoPulse(row);
    await expect(page.locator(".cu-fields-scroll")).toHaveJSProperty("scrollTop", scroll);
    await page.getByRole("button", { name: "Line1", exact: true }).click();
    await expectNoPulse(page.locator(".cu-fields-scroll"));
    await expect(row).not.toHaveClass(/is-selected/);
});

test("UI-32 reduced motion retains static cues and the low-confidence value color", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await loadReviewFixture(page);
    await page.getByRole("button", { name: "Expand LineItems", exact: true }).click();
    const id = `${arrayId}/valueArray/0/valueObject/Column1`;
    const content = page.locator(`.cu-cell-content${fieldRow(id)}`);
    const before = await content.locator(".cu-value-chip").evaluate(element => getComputedStyle(element).backgroundColor);
    await selectSource(page, id);
    await expect(content.locator(".cu-cell-value")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".cu-items-table td.is-selected-cell")).toHaveCount(1);
    await expect(page.locator(".cu-items-table .is-location-column")).toHaveText("Column1");
    await expectNoPulse(page.locator(".cu-fields-scroll"));
    expect(await content.locator(".cu-value-chip").evaluate(element => getComputedStyle(element).backgroundColor)).toBe(before);
    expect(before).toBe("rgb(255, 232, 236)");
});

test("UI-32 source keyboard selection preserves focus and Fields keyboard browsing avoids sticky headers", async ({ page }) => {
    await loadReviewFixture(page);
    const source = page.getByTestId("result-overlay").locator(`[data-outline-id="${recipientId}"]`).first();
    await source.focus();
    const scroll = await page.locator(".cu-fields-scroll").evaluate(element => element.scrollTop);
    await expectNoPulse(page.locator(".cu-fields-scroll"));
    await expect(page.locator(".cu-fields-scroll")).toHaveJSProperty("scrollTop", scroll);
    await source.press("Enter");
    const row = page.locator(`.cu-fields-table > tbody > tr${fieldRow(recipientId)}`);
    await expect(row).toHaveClass(/is-selected/);
    await expect(source).toBeFocused();
    await expectUncoveredRow(row);
    await expectNoPulse(row);
    const frame = await page.getByTestId("rendered-page").boundingBox();
    await row.locator(".cu-field-name").focus();
    await row.locator(".cu-field-name").press("End");
    await expect(page.getByRole("button", { name: "PageBottom", exact: true })).toBeFocused();
    await expectUncoveredRow(page.locator('.cu-fields-table > tbody > tr[data-field-id="/contents/0/fields/PageBottom"]'));
    await page.getByRole("button", { name: "PageBottom", exact: true }).press("Home");
    await expect(page.getByRole("button", { name: "InvoiceId", exact: true })).toBeFocused();
    await expectUncoveredRow(page.locator('.cu-fields-table > tbody > tr[data-field-id="/contents/0/fields/InvoiceId"]'));
    expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(frame);
    await expectNoPulse(page.locator(".cu-fields-scroll"));
});

test("UI-32 document replacement cancels an old emphasis and never restores it on return", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await selectSource(page, billingId);
    const animation = await page.locator(`.cu-fields-table > tbody > tr${fieldRow(billingId)}`).evaluateHandle(element => {
        const current = element.getAnimations().find(item => item.id === "cu-field-location");
        if (!current) throw new Error("Source selection did not start a location emphasis.");
        return current;
    });
    await page.getByRole("button", { name: "Receipt PNG", exact: true }).click();
    await ready(page);
    expect(await animation.evaluate(current => current.playState)).toBe("idle");
    await expectNoPulse(page.locator(".cu-fields-scroll"));
    await page.getByRole("button", { name: "PDF", exact: true }).click();
    await ready(page);
    await expect(page.locator(`.cu-fields-table > tbody > tr${fieldRow(billingId)}`)).not.toHaveClass(/is-selected/);
    await expectNoPulse(page.locator(".cu-fields-scroll"));
    await animation.dispose();
});

for (const columns of [2, 3]) {
    test(`UI-42 ordinary source and right-side selections use one clear background in ${columns} columns`, async ({ page }) => {
        await page.goto("/");
        await ready(page);
        await page.getByRole("button", { name: `${columns} columns`, exact: true }).click();
        const row = page.locator('.cu-fields-table > tbody > tr[data-field-id="/contents/0/fields/CustomerAddress"]');
        const before = await row.evaluate(element => ({
            height: element.getBoundingClientRect().height,
            widths: [...element.querySelectorAll(":scope > td")].map(cell => cell.getBoundingClientRect().width),
            valueBackground: getComputedStyle(element.querySelector(".cu-value-chip")!).backgroundColor,
        }));
        const frame = await page.getByTestId("rendered-page").boundingBox();
        const preferences = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([key]) => key.startsWith("cu-viewer"))));
        await selectSource(page, "/contents/0/fields/CustomerAddress");
        await expectSelectedRow(row);
        await expectUncoveredRow(row);
        await expect(page.getByRole("group", { name: "Source viewport", exact: true })).toBeFocused();
        expect(await row.evaluate(element => ({
            height: element.getBoundingClientRect().height,
            widths: [...element.querySelectorAll(":scope > td")].map(cell => cell.getBoundingClientRect().width),
            valueBackground: getComputedStyle(element.querySelector(".cu-value-chip")!).backgroundColor,
        }))).toEqual(before);
        expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(frame);
        await expect(page.getByRole("region", { name: "Full value and confidence" })).toHaveCount(0);
        const billing = page.locator(`.cu-fields-table > tbody > tr${fieldRow(billingId)}`);
        await billing.locator(".cu-field-value").click();
        await expectSelectedRow(billing);
        await expectNoPulse(billing);
        await expect(row).not.toHaveClass(/is-selected/);
        await expect(row).not.toHaveCSS("background-color", "rgb(229, 218, 255)");
        await row.hover();
        await expectSelectedRow(billing);
        await expect(page.locator(".cu-fields-table > tbody > tr.is-current-value")).toHaveCount(1);
        expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([key]) => key.startsWith("cu-viewer"))))).toBe(preferences);
    });
}

test("UI-42 ordinary object selection fills its complete block without outlines or sidebars", async ({ page }) => {
    await loadReviewFixture(page);
    const group = page.locator('.cu-fields-table > tbody > tr[data-field-id="/contents/0/fields/CustomerAddress"]');
    await group.hover();
    await group.getByRole("button", { name: /^Locate CustomerAddress on page/ }).click();
    await expect(group).toHaveClass(/is-group-selected/);
    const members = page.locator(".cu-fields-table > tbody > tr.is-group-member");
    await expect(members).toHaveCount(3);
    const block = page.locator(".cu-fields-table > tbody > tr.is-group-selected, .cu-fields-table > tbody > tr.is-group-member");
    expect(await block.evaluateAll(elements => elements.every(element =>
        getComputedStyle(element).backgroundColor === "rgb(229, 218, 255)" &&
        getComputedStyle(element).outlineStyle === "none" &&
        getComputedStyle(element.querySelector("td")!).boxShadow === "none"))).toBe(true);
    await expect(group.locator(".cu-group-selection-count")).toHaveCount(0);
    await expect(page.locator(".cu-table-scope")).toHaveCount(0);
    const line = page.locator(`.cu-fields-table > tbody > tr${fieldRow(line1Id)}`);
    await line.locator(".cu-field-value").click();
    await expectSelectedRow(line);
    await expect(group).not.toHaveClass(/is-group-selected/);
    await expect(page.locator(".cu-fields-table > tbody > tr.is-group-member")).toHaveCount(0);
});

test("UI-42 ordinary whole-array selection keeps its body and opaque pinned indices in the same block", async ({ page }) => {
    await loadReviewFixture(page);
    await expandField(page, "LineItems");
    const group = page.locator(`.cu-fields-table > tbody > tr${fieldRow(arrayId)}`);
    await group.hover();
    await group.getByRole("button", { name: /^Locate LineItems on page/ }).click();
    await expect(group).toHaveCSS("background-color", "rgb(229, 218, 255)");
    await expect(group).toHaveCSS("outline-style", "none");
    const wrapper = page.locator(`[data-array-id="${arrayId}"]`);
    const cells = wrapper.locator(".cu-items-table > tbody > tr > td");
    const indices = wrapper.locator(".cu-items-table > tbody > tr > th");
    await expect(cells).toHaveCount(24);
    expect(await cells.evaluateAll(elements => elements.every(element =>
        getComputedStyle(element).backgroundColor === "rgb(229, 218, 255)"))).toBe(true);
    expect(await indices.evaluateAll(elements => elements.every(element =>
        getComputedStyle(element).backgroundColor === "rgb(229, 218, 255)" &&
        getComputedStyle(element).position === "sticky"))).toBe(true);
    await expect(wrapper.locator("..")).toHaveCSS("background-color", "rgb(229, 218, 255)");
    await expect(cells.first().locator(".cu-value-chip")).toHaveCSS("background-color", "rgb(255, 232, 236)");
    await expect(page.locator(".cu-table-scope")).toHaveCount(0);
    await cells.first().locator(".cu-cell-value").click();
    await expect(cells.first()).toHaveCSS("background-color", "rgb(229, 218, 255)");
    await expect(cells.nth(1)).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(wrapper.locator(".is-group-member")).toHaveCount(0);
});

test("UI-42 ordinary keyboard selection keeps a distinct focus cue without restoring a selection frame", async ({ page }) => {
    await loadReviewFixture(page);
    const row = page.locator(`.cu-fields-table > tbody > tr${fieldRow(recipientId)}`);
    const name = row.locator(".cu-field-name");
    await name.focus();
    await name.press("Enter");
    await expectSelectedRow(row);
    await expect(name).toBeFocused();
    await expect(name).toHaveCSS("outline-style", "solid");
    expect(await name.evaluate(element => element.matches(":focus-visible"))).toBe(true);
    await name.press("Shift+F10");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(name).toBeFocused();
    await expectSelectedRow(row);
    await expectNoPulse(row);
    await name.press("ArrowDown");
    await expect(page.getByRole("button", { name: "CustomerAddress", exact: true })).toBeFocused();
    await expectSelectedRow(row);
    await expect(row.locator(".cu-value-chip")).toHaveCSS("background-color", "rgb(252, 232, 230)");
});

test("UI-42 reduced-motion ordinary source selection keeps the static background and confidence chip", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await loadReviewFixture(page);
    const row = page.locator(`.cu-fields-table > tbody > tr${fieldRow(recipientId)}`);
    await selectSource(page, recipientId);
    await expectSelectedRow(row);
    await expectNoPulse(row);
    await expect(row.locator(".cu-value-chip")).toHaveCSS("background-color", "rgb(252, 232, 230)");
});
