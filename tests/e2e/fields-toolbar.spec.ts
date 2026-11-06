import { expect, test } from "@playwright/test";
import { loadReviewFixture } from "./uiRedesignFixtures";
import { expandField, openFieldsSettings, ready, setShowConfidence } from "./viewerAssertions";
import { standardFontPdf } from "./pdfFixtures";

test.use({ reducedMotion: "reduce" });

test("page and field navigation have native tooltips and cycle at their boundaries without navigating on hover", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const previousPage = page.getByRole("button", { name: "Previous page", exact: true });
    const nextPage = page.getByRole("button", { name: "Next page", exact: true });
    const previousField = page.getByRole("button", { name: "Previous field", exact: true });
    const nextField = page.getByRole("button", { name: "Next field", exact: true });
    const pageNumber = page.getByRole("textbox", { name: "Page number", exact: true });
    const position = page.locator(".cu-field-navigation > span");
    for (const [button, title] of [
        [previousPage, "Previous page (last page)"], [nextPage, "Next page"],
        [previousField, "Previous field"], [nextField, "Next field"],
    ] as const) {
        await button.hover();
        await expect(button).toHaveAttribute("title", title);
        await expect(pageNumber).toHaveValue("1");
        await expect(position).toHaveText("— / 77 fields");
    }
    await expect(previousPage).toBeEnabled();
    await nextPage.click();
    await ready(page);
    await expect(pageNumber).toHaveValue("2");
    await expect(previousPage).toBeEnabled();
    await expect(previousPage).toHaveAttribute("title", "Previous page");
    await expect(nextPage).toHaveAttribute("title", "Next page");
    await pageNumber.fill("4");
    await pageNumber.press("Enter");
    await ready(page);
    await expect(nextPage).toBeEnabled();
    await expect(nextPage).toHaveAttribute("title", "Next page (first page)");
    await nextPage.press("Enter");
    await ready(page);
    await expect(pageNumber).toHaveValue("1");
    await expect(nextPage).toBeFocused();
    await previousPage.click();
    await ready(page);
    await expect(pageNumber).toHaveValue("4");
    await expect(previousPage).toBeFocused();
    await previousField.click();
    await expect(position).toHaveText("77 / 77 fields");
    await expect(previousField).toHaveAttribute("title", "Previous field");
    await nextField.click();
    await expect(position).toHaveText("1 / 77 fields");
    await expect(nextField).toHaveAttribute("title", "Next field");
    await page.getByRole("searchbox", { name: "Search fields or values", exact: true }).fill("no-matching-field-1793865297562");
    for (const button of [previousField, nextField]) {
        await expect(button).toBeDisabled();
        await button.hover();
        await expect(button).toHaveAttribute("title", "No matching fields");
    }
    await expect(position).toHaveText("— / 0 fields");
});

test("source first/last page cycling preserves the selected field and manual zoom", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const invoice = page.getByRole("button", { name: "InvoiceId", exact: true });
    await invoice.click();
    const position = page.locator(".cu-field-navigation > span");
    const selectedPosition = await position.innerText();
    const zoom = page.getByRole("combobox", { name: "Zoom", exact: true });
    await zoom.selectOption("150");
    await ready(page);
    const pageNumber = page.getByRole("textbox", { name: "Page number", exact: true });
    for (let cycle = 0; cycle < 2; cycle++) {
        await page.getByRole("button", { name: "Previous page", exact: true }).click();
        await ready(page);
        await expect(pageNumber).toHaveValue("4");
        await expect(invoice).toHaveAttribute("aria-pressed", "true");
        await expect(position).toHaveText(selectedPosition);
        await expect(zoom).toHaveValue("150");
        await page.getByRole("button", { name: "Next page", exact: true }).click();
        await ready(page);
        await expect(pageNumber).toHaveValue("1");
        await expect(invoice).toHaveAttribute("aria-pressed", "true");
        await expect(position).toHaveText(selectedPosition);
        await expect(zoom).toHaveValue("150");
    }
});

test("a real single-page PDF keeps page arrows disabled and rejects out-of-range input", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "single-page-navigation.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ apiVersion: "2025-11-01", contents: [{
            kind: "document", unit: "inch", pages: [{ pageNumber: 1, width: 400 / 72, height: 200 / 72 }],
            fields: { Single: { type: "string", valueString: "Single page" } },
        }] })),
    });
    await expect(page.getByRole("button", { name: "Single", exact: true })).toBeVisible();
    await page.getByLabel("Choose source file").setInputFiles({
        name: "single-page.pdf", mimeType: "application/pdf", buffer: standardFontPdf(),
    });
    await ready(page);
    for (const name of ["Previous page", "Next page"]) {
        const button = page.getByRole("button", { name, exact: true });
        await expect(button).toBeDisabled();
        await expect(button).toHaveAttribute("title", "Single-page document");
    }
    const pageNumber = page.getByRole("textbox", { name: "Page number", exact: true });
    await expect(pageNumber).toHaveValue("1");
    await expect(page.locator(".cu-page-controls > span")).toHaveText("/ 1");
    for (const value of ["0", "2"]) {
        await pageNumber.fill(value);
        await pageNumber.press("Enter");
        await expect(page.getByRole("alert")).toHaveText("Enter an existing page number.");
    }
    await pageNumber.fill("1");
    await pageNumber.press("Enter");
    await ready(page);
    await expect(page.getByRole("alert")).toHaveCount(0);
});

for (const viewport of [{ width: 1030, height: 540 }, { width: 1440, height: 1000 }, { width: 1800, height: 1000 }]) {
    test(`Fields controls occupy one symmetric bottom toolbar at ${viewport.width}px`, async ({ page }) => {
        page.on("pageerror", error => { throw error; });
        await page.setViewportSize(viewport);
        await page.goto("/");
        await ready(page);
        const toolbar = page.getByRole("group", { name: "Fields toolbar", exact: true });
        await expect(toolbar).toHaveCount(1);
        await expect(toolbar).toHaveCSS("height", "44px");
        await expect(toolbar.getByRole("searchbox", { name: "Search fields or values", exact: true }))
            .toHaveAttribute("placeholder", "Search field names or values...");
        await expect(toolbar.locator(".cu-search-box")).toHaveAttribute("title", "Search field names or values");
        await expect(page.locator(".cu-fields-controls, .cu-layout-switch, .cu-review-toolbar")).toHaveCount(0);
        await expect(page.getByRole("switch", { name: "Hide missing fields", exact: true })).toHaveCount(0);
        await expect(toolbar.getByRole("button", { name: "Reset order", exact: true })).toHaveCount(0);
        await expect(toolbar.locator(".cu-fields-toolbar-actions > button")).toHaveCount(1);
        const position = toolbar.locator(".cu-field-navigation > span");
        await expect(position).toHaveText("— / 77 fields");
        expect(await position.evaluate(element => ({
            previous: element.previousElementSibling?.getAttribute("aria-label"),
            next: element.nextElementSibling?.getAttribute("aria-label"),
        }))).toEqual({ previous: "Previous field", next: "Next field" });
        const bounds = await toolbar.boundingBox(), left = await page.getByRole("group", {
            name: "Source document toolbar", exact: true,
        }).boundingBox();
        if (!bounds || !left) throw new Error("Both bottom toolbars must be laid out.");
        expect(bounds.height).toBe(left.height);
        expect(Math.abs(bounds.y - left.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(bounds.y + bounds.height - viewport.height)).toBeLessThanOrEqual(1);
        await expect(page.locator(".prototype-footer")).toHaveCount(0);
        const metrics = await toolbar.evaluate(element => {
            const pane = element.closest(".cu-fields-pane")!.getBoundingClientRect();
            const bar = element.getBoundingClientRect();
            const search = element.querySelector(".cu-search-box")!.getBoundingClientRect();
            const nav = element.querySelector(".cu-field-navigation")!.getBoundingClientRect();
            const actions = element.querySelector(".cu-fields-toolbar-actions")!.getBoundingClientRect();
            return { centerError: Math.abs((nav.left + nav.right - pane.left - pane.right) / 2),
                leftGap: nav.left - search.right, rightGap: actions.left - nav.right,
                overflow: element.scrollWidth - element.clientWidth,
                controls: [...element.querySelectorAll("button, input")].map(control => {
                    const box = control.getBoundingClientRect();
                    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
                    return { width: box.width, height: box.height,
                        inside: box.left >= bar.left && box.right <= bar.right && box.top >= bar.top && box.bottom <= bar.bottom,
                        hit: hit === control || control.contains(hit) };
                }) };
        });
        expect(metrics.centerError).toBeLessThanOrEqual(1);
        expect(metrics.leftGap).toBeGreaterThanOrEqual(4);
        expect(metrics.rightGap).toBeGreaterThanOrEqual(4);
        expect(metrics.overflow).toBeLessThanOrEqual(1);
        for (const control of metrics.controls) {
            expect(control.width).toBeGreaterThanOrEqual(24);
            expect(control.height).toBeGreaterThanOrEqual(24);
            expect(control.inside).toBe(true);
            expect(control.hit).toBe(true);
        }
        const trigger = toolbar.getByRole("button", { name: "Fields settings", exact: true });
        await trigger.click();
        const panel = page.getByRole("dialog", { name: "Fields settings", exact: true });
        await expect(panel.getByRole("checkbox", { name: "Show Confidence", exact: true })).toBeFocused();
        await expect(panel.getByRole("checkbox")).toHaveCount(1);
        await expect(panel.getByRole("button")).toHaveCount(4);
        const reset = panel.getByRole("button", { name: "Reset order", exact: true });
        await expect(reset).toBeEnabled();
        await page.keyboard.press("Tab");
        await expect(reset).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(panel.getByRole("checkbox", { name: "Show Confidence", exact: true })).toBeFocused();
        await expect(panel.getByRole("button", { name: /Low confidence/ })).toHaveCount(0);
        await expect(panel.locator("p")).toHaveCount(0);
        await expect(panel).not.toContainText("Preferences stay in this browser.");
        const popup = await panel.boundingBox(), pane = await page.locator(".cu-fields-pane").boundingBox();
        if (!popup || !pane) throw new Error("The Fields settings panel is missing.");
        expect(popup.y).toBeGreaterThanOrEqual(pane.y);
        expect(popup.y + popup.height).toBeLessThanOrEqual(bounds.y - 7);
        expect(popup.x).toBeGreaterThanOrEqual(pane.x);
        expect(popup.x + popup.width).toBeLessThanOrEqual(pane.x + pane.width);
        await page.keyboard.press("Escape");
        await expect(panel).toHaveCount(0);
        await expect(trigger).toBeFocused();
    });
}

test("Show Confidence text, row space and checkbox use native toggling without dismissing Settings", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const panel = await openFieldsSettings(page);
    const checkbox = panel.getByRole("checkbox", { name: "Show Confidence", exact: true });
    const label = panel.locator("label.cu-confidence-toggle");
    const box = await label.boundingBox();
    if (!box) throw new Error("The Confidence label is missing.");
    await label.click({ position: { x: 45, y: box.height / 2 } });
    await expect(panel).toBeVisible();
    await expect(checkbox).toBeChecked();
    await expect(page.getByRole("columnheader", { name: "Confidence", exact: true })).toBeVisible();
    await label.click({ position: { x: box.width - 5, y: box.height / 2 } });
    await expect(panel).toBeVisible();
    await expect(checkbox).not.toBeChecked();
    await expect(page.getByRole("columnheader", { name: "Confidence", exact: true })).toHaveCount(0);
    await checkbox.click();
    await expect(panel).toBeVisible();
    await expect(checkbox).toBeChecked();
    await checkbox.press("Space");
    await expect(panel).toBeVisible();
    await expect(checkbox).not.toBeChecked();
    const search = page.getByRole("searchbox", { name: "Search fields or values", exact: true });
    await search.click();
    await expect(panel).toHaveCount(0);
    await expect(search).toBeFocused();
});

test("Show Confidence controls the third column without changing source, selection or saved order", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const invoice = page.getByRole("button", { name: "InvoiceId", exact: true });
    await invoice.click();
    const canvas = page.getByTestId("source-canvas");
    const pixels = await canvas.evaluate(element => {
        if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected a source canvas.");
        return element.toDataURL();
    });
    const sourceFrame = await page.getByTestId("rendered-page").boundingBox();
    const rows = await page.locator(".cu-fields-table > tbody > tr[data-field-depth='0']").evaluateAll(elements =>
        elements.map(element => element.getAttribute("data-field-id")));
    await expect(page.getByRole("columnheader", { name: "Confidence", exact: true })).toHaveCount(0);
    await setShowConfidence(page, true);
    await expect(page.getByRole("columnheader", { name: "Confidence", exact: true })).toBeVisible();
    await expect(page.locator('[data-field-id="/contents/0/fields/CountryRegion"] .cu-confidence')).toHaveText("N/A");
    await expect(invoice).toHaveAttribute("aria-pressed", "true");
    expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(sourceFrame);
    expect(await canvas.evaluate(element => {
        if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected a source canvas.");
        return element.toDataURL();
    })).toBe(pixels);
    expect(await page.locator(".cu-fields-table > tbody > tr[data-field-depth='0']").evaluateAll(elements =>
        elements.map(element => element.getAttribute("data-field-id")))).toEqual(rows);
    await page.reload();
    await ready(page);
    await expect(page.getByRole("columnheader", { name: "Confidence", exact: true })).toBeVisible();
    await setShowConfidence(page, false);
    await expect(page.getByRole("columnheader", { name: "Confidence", exact: true })).toHaveCount(0);
});

test("bottom search and field navigation preserve actual field values without a score filter", async ({ page }) => {
    await loadReviewFixture(page);
    const search = page.getByRole("searchbox", { name: "Search fields or values", exact: true });
    const count = page.locator(".cu-field-navigation > span");
    const initial = (await count.innerText()).match(/^— \/ (\d+) fields$/);
    if (!initial?.[1]) throw new Error("The unfiltered field total is inconsistent.");
    const total = initial[1];
    const missing = page.getByRole("button", { name: "Missing", exact: true });
    await search.fill("Missing");
    await expect(missing).toBeVisible();
    await expect(count).toHaveText("— / 1 fields");
    await search.fill("INV-100");
    await expect(count).toHaveText("— / 1 fields");
    await page.getByRole("button", { name: "Next field", exact: true }).click();
    await expect(count).toHaveText("1 / 1 fields");
    await expect(page.getByRole("button", { name: "InvoiceId", exact: true })).toHaveAttribute("aria-pressed", "true");
    await search.fill("no such field value");
    await expect(page.getByRole("heading", { name: "No matching fields", exact: true })).toBeVisible();
    await expect(count).toHaveText("— / 0 fields");
    await expect(page.getByRole("button", { name: "Next field", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Clear filters", exact: true }).click();
    await expect(search).toHaveValue("");
    await expect(missing).toBeVisible();
    await setShowConfidence(page, true);
    await expect(count).toHaveText(`1 / ${total} fields`);
    await expect(missing).toBeVisible();
});

const orderedResult = {
    apiVersion: "2025-11-01", analyzerId: "field-position-navigation",
    contents: [{
        kind: "document", unit: "inch", pages: [{ pageNumber: 1, width: 8.5, height: 11 }],
        fields: {
            Alpha: { type: "string", valueString: "alpha" },
            Group: { type: "object", valueObject: {
                A: { type: "string", valueString: "group-a" },
                B: { type: "string", valueString: "group-b" },
            } },
            Beta: { type: "string", valueString: "beta" },
            Rows: { type: "array", valueArray: [
                { type: "object", valueObject: {
                    B: { type: "string", valueString: "row1-b" }, A: { type: "string", valueString: "row1-a" },
                } },
                { type: "object", valueObject: {
                    A: { type: "string", valueString: "row2-a" }, B: { type: "string", valueString: "row2-b" },
                    C: { type: "string", valueString: "row2-c" },
                } },
            ] },
            Last: { type: "string", valueString: "last" },
        },
    }],
};
const orderedIds = [
    "/Alpha", "/Group/valueObject/A", "/Group/valueObject/B", "/Beta",
    "/Rows/valueArray/0/valueObject/B", "/Rows/valueArray/0/valueObject/A",
    "/Rows/valueArray/1/valueObject/B", "/Rows/valueArray/1/valueObject/A",
    "/Rows/valueArray/1/valueObject/C", "/Last",
].map(id => "/contents/0/fields" + id);

async function loadOrderedFields(page: Parameters<typeof ready>[0]): Promise<void> {
    await page.goto("/");
    await ready(page);
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "ordered-navigation.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(orderedResult)),
    });
    await expect(page.getByRole("button", { name: "Alpha", exact: true })).toBeVisible();
}

test("field positions advance consecutively in rendered order and wrap at both ends", async ({ page }) => {
    await loadOrderedFields(page);
    const position = page.locator(".cu-field-navigation > span");
    const next = page.getByRole("button", { name: "Next field", exact: true });
    const previous = page.getByRole("button", { name: "Previous field", exact: true });
    await expect(position).toHaveText("— / 10 fields");
    for (const [index, id] of orderedIds.entries()) {
        await next.click();
        await expect(position).toHaveText(`${index + 1} / 10 fields`);
        await expect(page.locator(`[data-review-focus="${id}"][aria-pressed="true"]`)).toHaveCount(1);
    }
    await next.click();
    await expect(position).toHaveText("1 / 10 fields");
    await previous.click();
    await expect(position).toHaveText("10 / 10 fields");
    await previous.click();
    await expect(position).toHaveText("9 / 10 fields");
    const grid = page.getByRole("table", { name: "Rows values", exact: true });
    await expect(grid.getByRole("columnheader")).toHaveText(["#", "B", "A", "C"]);
    await expect(grid.getByRole("rowheader")).toHaveText(["1", "2"]);
});

test("real root and nested drags reindex the same selected field and Reset order restores navigation", async ({ page }) => {
    await loadOrderedFields(page);
    await expandField(page, "Group");
    const position = page.locator(".cu-field-navigation > span");
    const selectedId = "/contents/0/fields/Group/valueObject/B";
    const selected = page.locator(`[data-review-focus="${selectedId}"]`);
    await selected.click();
    await expect(position).toHaveText("3 / 10 fields");
    const group = page.locator('.cu-fields-table > tbody > tr[data-field-id="/contents/0/fields/Group"]');
    const alpha = page.locator('.cu-fields-table > tbody > tr[data-field-id="/contents/0/fields/Alpha"]');
    await group.hover();
    await group.getByRole("button", { name: "Reorder Group", exact: true }).dragTo(alpha, {
        targetPosition: { x: 80, y: 4 },
    });
    await expect(page.locator(".cu-fields-table > tbody > tr[data-field-depth='0']").first())
        .toHaveAttribute("data-field-id", "/contents/0/fields/Group");
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await expect(position).toHaveText("2 / 10 fields");
    const rowB = page.locator(`.cu-fields-table > tbody > tr[data-field-id="${selectedId}"]`);
    const rowA = page.locator('.cu-fields-table > tbody > tr[data-field-id="/contents/0/fields/Group/valueObject/A"]');
    await rowB.hover();
    await rowB.getByRole("button", { name: "Reorder Group / B", exact: true }).dragTo(rowA, {
        targetPosition: { x: 80, y: 4 },
    });
    await expect(position).toHaveText("1 / 10 fields");
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Next field", exact: true }).click();
    await expect(position).toHaveText("2 / 10 fields");
    await expect(page.locator('[data-review-focus="/contents/0/fields/Group/valueObject/A"]')).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Previous field", exact: true }).click();
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    const settings = await openFieldsSettings(page);
    await settings.getByRole("button", { name: "Reset order", exact: true }).click();
    await expect(settings).toBeVisible();
    await expect(settings.getByRole("button", { name: "Reset order", exact: true })).toBeFocused();
    await settings.getByRole("button", { name: "Close fields settings", exact: true }).click();
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await expect(position).toHaveText("3 / 10 fields");
    await page.getByRole("button", { name: "Previous field", exact: true }).click();
    await expect(position).toHaveText("2 / 10 fields");
    await expect(page.locator('[data-review-focus="/contents/0/fields/Group/valueObject/A"]')).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await ready(page);
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "ordered-navigation.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(orderedResult)),
    });
    await expandField(page, "Group");
    await selected.click();
    await expect(position).toHaveText("3 / 10 fields");
});

test("search positions use only the matching fields and return to the selected field's full position", async ({ page }) => {
    await loadOrderedFields(page);
    const position = page.locator(".cu-field-navigation > span");
    const search = page.getByRole("searchbox", { name: "Search fields or values", exact: true });
    await page.getByRole("button", { name: "Last", exact: true }).click();
    await expect(position).toHaveText("10 / 10 fields");
    await search.fill("Group");
    await expect(position).toHaveText("— / 2 fields");
    await expect(position).toHaveAttribute("title", /2 matching fields out of 10 total/);
    await page.getByRole("button", { name: "Next field", exact: true }).click();
    await expect(position).toHaveText("1 / 2 fields");
    await page.getByRole("button", { name: "Next field", exact: true }).click();
    await expect(position).toHaveText("2 / 2 fields");
    await search.fill("");
    await expect(position).toHaveText("3 / 10 fields");
    await expect(page.locator('[data-review-focus="/contents/0/fields/Group/valueObject/B"]')).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Collapse Group", exact: true }).click();
    await expect(position).toHaveText("3 / 10 fields");
    await page.getByRole("group", { name: "Source viewport", exact: true }).press("Escape");
    await expect(position).toHaveText("— / 10 fields");
    await page.getByRole("button", { name: "Previous field", exact: true }).click();
    await expect(position).toHaveText("10 / 10 fields");
    await search.fill("not-an-existing-field");
    await expect(position).toHaveText("— / 0 fields");
    await expect(page.getByRole("button", { name: "Previous field", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Next field", exact: true })).toBeDisabled();
});

test("Settings Reset order restores the input order without resetting Show Confidence", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const roots = page.locator(".cu-fields-table > tbody > tr[data-field-depth='0']");
    const original = await roots.evaluateAll(elements => elements.map(element => element.getAttribute("data-field-id")));
    await setShowConfidence(page, true);
    const invoice = page.getByRole("button", { name: "InvoiceId", exact: true });
    await invoice.focus();
    await invoice.press("Alt+ArrowUp");
    expect(await roots.evaluateAll(elements => elements.map(element => element.getAttribute("data-field-id")))).not.toEqual(original);
    const search = page.getByRole("searchbox", { name: "Search fields or values", exact: true });
    await search.fill("InvoiceId");
    const settings = await openFieldsSettings(page);
    const reset = settings.getByRole("button", { name: "Reset order", exact: true });
    await expect(reset).toBeEnabled();
    await reset.press("Enter");
    await expect(reset).toBeFocused();
    await expect(settings).toBeVisible();
    await expect(search).toHaveValue("InvoiceId");
    await expect(page.getByRole("columnheader", { name: "Confidence", exact: true })).toBeVisible();
    await expect(settings.getByRole("checkbox", { name: "Show Confidence", exact: true })).toBeChecked();
    await settings.getByRole("button", { name: "Close fields settings", exact: true }).click();
    await expect(page.getByRole("button", { name: "Fields settings", exact: true })).toBeFocused();
    await search.fill("");
    expect(await roots.evaluateAll(elements => elements.map(element => element.getAttribute("data-field-id")))).toEqual(original);
});

test("field details stay above the toolbar without breaking bottom symmetry", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const toolbar = page.getByRole("group", { name: "Fields toolbar", exact: true });
    const original = await toolbar.boundingBox();
    const invoice = page.getByRole("button", { name: "InvoiceId", exact: true });
    await invoice.press("F2");
    const details = page.getByRole("region", { name: "Full value and confidence", exact: true });
    await expect(details).toBeVisible();
    expect(await toolbar.boundingBox()).toEqual(original);
    const inspector = await details.boundingBox();
    if (!inspector || !original) throw new Error("The details and toolbar must both be laid out.");
    expect(inspector.y + inspector.height).toBeLessThanOrEqual(original.y);
    const markdown = page.getByRole("tab", { name: "Markdown", exact: true });
    await markdown.click();
    await expect(markdown).toBeFocused();
    await expect(details).toContainText("INV-100");
    await page.getByRole("tab", { name: "Fields", exact: true }).click();
    await expect(details).toBeVisible();
    expect(await toolbar.boundingBox()).toEqual(original);
    await page.getByRole("button", { name: "Close full value details", exact: true }).click();
    await expect(details).toHaveCount(0);
    expect(await toolbar.boundingBox()).toEqual(original);
    await expect(invoice).toBeFocused();
});
