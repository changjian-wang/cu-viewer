import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { ready } from "./viewerAssertions";
import { fieldRow, loadReviewFixture, recipientId } from "./uiRedesignFixtures";

test.use({ reducedMotion: "reduce", deviceScaleFactor: 1 });

const trigger = (page: Page) => page.getByRole("button", { name: "Highlighting legend", exact: true });
const dialog = (page: Page) => page.getByRole("dialog", { name: "Legend", exact: true });
const colors = ["rgb(232, 245, 233)", "rgb(232, 241, 255)", "rgb(252, 232, 230)",
    "rgb(246, 197, 204)"];

async function expectPalette(list: Locator): Promise<void> {
    await expect(list.locator(".cu-legend-item")).toHaveCount(4);
    expect(await list.locator(".cu-legend-swatch").evaluateAll(elements =>
        elements.map(element => getComputedStyle(element).backgroundColor))).toEqual(colors);
}

async function expectToolbarLayout(page: Page): Promise<void> {
    const toolbar = page.locator(".cu-source-toolbar");
    const layout = await toolbar.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        const pane = element.closest(".cu-source-pane")!.getBoundingClientRect();
        const slots = [".cu-source-identity", ".cu-page-controls", ".cu-view-controls", ".cu-source-utilities"].map(selector => {
            const child = element.querySelector(selector);
            if (!child) throw new Error(`The toolbar slot ${selector} is missing.`);
            const rect = child.getBoundingClientRect();
            return { left: rect.left, right: rect.right };
        });
        return { width: pane.width, left: bounds.left, right: bounds.right, height: bounds.height,
            overflow: element.scrollWidth - element.clientWidth, slots };
    });
    expect(layout.height).toBe(44);
    expect(layout.overflow).toBeLessThanOrEqual(1);
    for (const [index, slot] of layout.slots.entries()) {
        expect(slot.left).toBeGreaterThanOrEqual(layout.left);
        expect(slot.right).toBeLessThanOrEqual(layout.right);
        if (index) expect(slot.left - layout.slots[index - 1]!.right).toBeGreaterThanOrEqual(4);
    }
    await expect(page.locator(".cu-legend-inline")).toHaveCount(0);
    await expect(trigger(page)).toBeVisible();
}

async function expectPanelInsideSource(page: Page): Promise<void> {
    const panel = await dialog(page).boundingBox(), source = await page.locator(".cu-source-pane").boundingBox();
    const toolbar = await page.locator(".cu-source-toolbar").boundingBox();
    if (!panel || !source || !toolbar) throw new Error("The legend panel is not laid out.");
    expect(panel.x).toBeGreaterThanOrEqual(source.x);
    expect(panel.x + panel.width).toBeLessThanOrEqual(source.x + source.width);
    expect(panel.y).toBeGreaterThanOrEqual(source.y);
    expect(panel.y + panel.height).toBeLessThanOrEqual(toolbar.y - 7);
    expect(panel.y + panel.height).toBeLessThanOrEqual(page.viewportSize()!.height);
}

for (const viewport of [{ width: 1030, height: 760 }, { width: 1280, height: 540 },
    { width: 1800, height: 1000 }, { width: 2100, height: 1000 }]) {
    test(`UI-54 toolbar legend fits ${viewport.width}x${viewport.height} without moving the selected source`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto("/");
        await ready(page);
        await page.getByRole("button", { name: "InvoiceId", exact: true }).click();
        await page.locator(".prototype-banner").hover();
        await expectToolbarLayout(page);
        const frame = await page.getByTestId("rendered-page").boundingBox();
        const points = await page.getByTestId("source-overlay").locator("polygon").getAttribute("points");
        const zoom = await page.getByRole("combobox", { name: "Zoom", exact: true }).inputValue();
        const scroll = await page.getByRole("group", { name: "Source viewport", exact: true }).evaluate(element =>
            ({ x: element.scrollLeft, y: element.scrollTop }));
        const pixels = await page.getByTestId("source-canvas").evaluate(element => {
            if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected an original source canvas.");
            return element.toDataURL();
        });
        const preferences = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
        await trigger(page).click();
        await expect(dialog(page)).toBeVisible();
        await expectPalette(dialog(page));
        await expect(dialog(page).getByRole("button", { name: "Close legend", exact: true })).toBeFocused();
        await expectPanelInsideSource(page);
        await expectToolbarLayout(page);
        expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(frame);
        expect(await page.getByTestId("source-overlay").locator("polygon").getAttribute("points")).toBe(points);
        await expect(page.getByRole("combobox", { name: "Zoom", exact: true })).toHaveValue(zoom);
        expect(await page.getByRole("group", { name: "Source viewport", exact: true }).evaluate(element =>
            ({ x: element.scrollLeft, y: element.scrollTop }))).toEqual(scroll);
        await page.keyboard.press("Escape");
        await expect(dialog(page)).toHaveCount(0);
        await expect(trigger(page)).toBeFocused();
        await expect(page.getByRole("button", { name: "InvoiceId", exact: true })).toHaveAttribute("aria-pressed", "true");
        expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage)))).toBe(preferences);
        expect(await page.getByTestId("source-canvas").evaluate(element => {
            if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected the original source canvas.");
            return element.toDataURL();
        })).toBe(pixels);
    });
}

test("UI-54 Legend and settings remain exclusive with keyboard and outside dismissal", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await trigger(page).focus();
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press("Shift+Tab");
    await expect(trigger(page)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await trigger(page).click();
    await page.keyboard.press("Tab");
    await expect(dialog(page).getByRole("switch", { name: "Show field highlights", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog(page).getByRole("switch", { name: "Show table highlights", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog(page).getByRole("switch", { name: "Show low confidence highlight", exact: true })).toBeFocused();
    await dialog(page).getByRole("switch", { name: "Show low confidence highlight", exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Source settings", exact: true })).toBeFocused();
    await trigger(page).click();
    await page.getByRole("button", { name: "Source settings", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Source settings", exact: true });
    await expect(dialog(page)).toHaveCount(0);
    await expect(settings.locator(".cu-legend-item")).toHaveCount(0);
    await expect(settings.getByRole("switch")).toHaveCount(0);
    await expect(settings.getByRole("spinbutton", { name: "Confidence threshold", exact: true })).toBeFocused();
    await trigger(page).click();
    await expect(settings).toHaveCount(0);
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole("switch")).toHaveCount(3);
    await expect(page.getByRole("button", { name: "More document actions", exact: true })).toHaveCount(0);
    await expect(page.getByRole("menu", { name: "Document actions", exact: true })).toHaveCount(0);
    await page.locator(".prototype-banner").click({ position: { x: 8, y: 8 } });
    await expect(dialog(page)).toHaveCount(0);
    await trigger(page).click();
    await dialog(page).getByRole("button", { name: "Close legend", exact: true }).click();
    await expect(trigger(page)).toBeFocused();
});

test("UI-54 the four explanatory colors survive threshold and visibility changes without modifying settings", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    for (const threshold of ["0", "0.341", "1"]) {
        await page.getByRole("button", { name: "Source settings", exact: true }).click();
        const settings = page.getByRole("dialog", { name: "Source settings", exact: true });
        await settings.getByRole("spinbutton", { name: "Confidence threshold", exact: true }).fill(threshold);
        await page.keyboard.press("Escape");
        await trigger(page).click();
        for (const name of ["Show field highlights", "Show table highlights", "Show low confidence highlight"]) {
            await dialog(page).getByRole("switch", { name, exact: true }).uncheck();
        }
        await page.keyboard.press("Escape");
        const preferences = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
        await trigger(page).click();
        await expectPalette(dialog(page));
        await expect(dialog(page).getByText("All scored values while low-confidence highlight is off", { exact: true })).toHaveCount(2);
        await expect(dialog(page).getByText("Below threshold", { exact: true })).toHaveCount(2);
        await expect(dialog(page).getByText("Confidence unavailable", { exact: true })).toHaveCount(0);
        await expect(dialog(page).getByText("No score was supplied", { exact: true })).toHaveCount(0);
        await page.keyboard.press("Escape");
        expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage)))).toBe(preferences);
    }
});

test("UI-54 source-panel resizing retains one bottom row and the Legend button without persistent chips", async ({ page }) => {
    await page.setViewportSize({ width: 2100, height: 1000 });
    await page.goto("/");
    await ready(page);
    const splitter = page.getByRole("separator", { name: "Source and results width", exact: true });
    for (const target of [1039, 1041, 570, 1200]) {
        const source = await page.locator(".cu-source-pane").boundingBox(), handle = await splitter.boundingBox();
        if (!source || !handle) throw new Error("The source resize handle is unavailable.");
        await page.mouse.move(handle.x + handle.width / 2, handle.y + 30);
        await page.mouse.down();
        await page.mouse.move(handle.x + handle.width / 2 + target - source.width, handle.y + 30, { steps: 4 });
        await page.mouse.up();
        await ready(page);
        const actual = await page.locator(".cu-source-pane").boundingBox();
        if (!actual) throw new Error("The source pane disappeared after resizing.");
        expect(Math.abs(actual.width - target)).toBeLessThanOrEqual(1);
        await expectToolbarLayout(page);
        await trigger(page).click();
        await expectPanelInsideSource(page);
        await page.keyboard.press("Escape");
    }
});

test("UI-54 the compact legend also fits image controls and leaves image navigation unchanged", async ({ page }) => {
    await page.setViewportSize({ width: 1030, height: 760 });
    await page.goto("/");
    await ready(page);
    await page.getByRole("button", { name: "Receipt PNG", exact: true }).click();
    await ready(page);
    await expectToolbarLayout(page);
    await expect(page.getByText("Image \u00b7 single page", { exact: true })).toBeVisible();
    const frame = await page.getByTestId("rendered-page").boundingBox();
    await trigger(page).click();
    await expectPalette(dialog(page));
    await expectPanelInsideSource(page);
    await page.keyboard.press("Escape");
    expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(frame);
});

const categorySources = [
    { key: "field", id: "/contents/0/fields/InvoiceId", fill: "#E8F5E9" },
    { key: "table", id: "/contents/0/fields/LineItems/valueArray/0/valueObject/Column2", fill: "#E8F1FF" },
    { key: "lowField", id: "/contents/0/fields/Zero", fill: "#FCE8E6" },
    { key: "lowTable", id: "/contents/0/fields/LineItems/valueArray/0/valueObject/Column1", fill: "#F6C5CC" },
    { key: "unavailable", id: "/contents/0/fields/Unknown", fill: "#F1F3F5" },
] as const;
const sourceRegion = (page: Page, id: string) => page.getByTestId("result-overlay").locator(`polygon[data-outline-id="${id}"]`).first();

async function sourcePixels(page: Page): Promise<string> {
    return page.getByTestId("source-canvas").evaluate(element => {
        if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected an original source canvas.");
        return element.toDataURL();
    });
}

async function savedReviewIdentity(page: Page) {
    return page.evaluate(() => {
        for (const [key, text] of Object.entries(localStorage)) {
            if (!key.startsWith("cu-viewer:review:v1:")) continue;
            if (typeof text !== "string") throw new Error("Saved review preferences must contain text.");
            const value: unknown = JSON.parse(text);
            if (value && typeof value === "object" && "schema" in value && typeof value.schema === "string" &&
                value.schema.includes("synthetic-ui-review")) return { key, schema: value.schema };
        }
        throw new Error("The synthetic review preferences were not saved.");
    });
}

for (const viewport of [{ width: 1280, height: 800 }, { width: 2100, height: 1000 }]) {
    test(`UI-56 passive colors and three integrated switches preserve geometry in the ${viewport.width} layout`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await loadReviewFixture(page);
        await page.getByRole("button", { name: "InvoiceId", exact: true }).click();
        await page.locator(".prototype-banner").hover();
        await expectToolbarLayout(page);
        const frame = await page.getByTestId("rendered-page").boundingBox();
        const pixels = await sourcePixels(page);
        const fields = await page.locator(".cu-fields-pane").textContent();
        const regions = page.getByTestId("result-overlay").locator("polygon[data-outline-id]");
        const geometry = await regions.evaluateAll(elements => elements.map(element => ({
            id: element.getAttribute("data-outline-id"), region: element.getAttribute("data-region-index"), points: element.getAttribute("points"),
        })));
        const pin = page.getByTestId("source-overlay").locator("polygon");
        const selected = await pin.getAttribute("points");
        await trigger(page).click();
        const list = dialog(page);
        await expect(list.getByRole("button")).toHaveCount(1);
        await expect(list.getByRole("switch")).toHaveCount(3);
        await expect(list.getByText("Options", { exact: true })).toHaveCount(0);
        const preferences = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
        await expect(list.locator('.cu-legend-item[data-legend-category="unavailable"]')).toHaveCount(0);
        for (const category of categorySources.filter(category => category.key !== "unavailable")) {
            const entry = list.locator(`.cu-legend-item[data-legend-category="${category.key}"]`);
            expect(await entry.evaluate(element =>
                !element.closest("button, label") && !element.querySelector("button, input, [tabindex], [aria-pressed]"))).toBe(true);
            await entry.locator(".cu-legend-swatch").click();
            await expect(list).toBeVisible();
            await entry.locator(".cu-legend-name").click();
            await expect(sourceRegion(page, category.id)).toHaveAttribute("fill", category.fill);
        }
        expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage)))).toBe(preferences);
        for (const [name, hidden, normalColors] of [
            ["Show field highlights", ["field", "lowField", "unavailable"], false],
            ["Show table highlights", ["table", "lowTable"], false],
            ["Show low confidence highlight", [], true],
        ] as const) {
            const control = list.getByRole("switch", { name, exact: true });
            const bounds = await control.boundingBox();
            if (!bounds) throw new Error("A highlight switch is not laid out.");
            expect(bounds.width).toBeGreaterThanOrEqual(24);
            expect(bounds.height).toBeGreaterThanOrEqual(24);
            await control.uncheck();
            await expect(control).not.toBeChecked();
            await expectPalette(list);
            for (const candidate of categorySources) {
                const fill = hidden.some(key => key === candidate.key) ? "none" :
                    normalColors && candidate.key === "lowField" ? "#E8F5E9" :
                        normalColors && candidate.key === "lowTable" ? "#E8F1FF" : candidate.fill;
                await expect(sourceRegion(page, candidate.id)).toHaveAttribute("fill", fill);
            }
            expect(await sourcePixels(page)).toBe(pixels);
            expect(await page.locator(".cu-fields-pane").textContent()).toBe(fields);
            expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(frame);
            expect(await pin.getAttribute("points")).toBe(selected);
            expect(await regions.evaluateAll(elements => elements.map(element => ({
                id: element.getAttribute("data-outline-id"), region: element.getAttribute("data-region-index"), points: element.getAttribute("points"),
            })))).toEqual(geometry);
            await control.press("Space");
            await expect(control).toBeChecked();
            for (const candidate of categorySources) {
                await expect(sourceRegion(page, candidate.id)).toHaveAttribute("fill", candidate.fill);
                await expect(page.locator(`.cu-source-highlight-edges [data-source-edge-id="${candidate.id}"]`)).toHaveCount(1);
            }
        }
        await page.keyboard.press("Escape");
        await page.getByRole("button", { name: "Source settings", exact: true }).click();
        const settings = page.getByRole("dialog", { name: "Source settings", exact: true });
        await expect(settings.getByRole("spinbutton")).toHaveValue("0.70");
        await expect(settings.getByRole("switch")).toHaveCount(0);
        await page.keyboard.press("Escape");
        await trigger(page).click();
        for (const name of ["Show field highlights", "Show table highlights", "Show low confidence highlight"]) {
            await expect(dialog(page).getByRole("switch", { name, exact: true })).toBeChecked();
        }
    });
}

test("UI-56 field and table switches hide all their fills and can restore unknown confidence", async ({ page }) => {
    await loadReviewFixture(page);
    await trigger(page).click();
    const fields = dialog(page).getByRole("switch", { name: "Show field highlights", exact: true });
    const tables = dialog(page).getByRole("switch", { name: "Show table highlights", exact: true });
    await fields.uncheck();
    for (const index of [0, 2, 4]) await expect(sourceRegion(page, categorySources[index]!.id)).toHaveAttribute("fill", "none");
    for (const index of [1, 3]) {
        const category = categorySources[index]!;
        await expect(sourceRegion(page, category.id)).toHaveAttribute("fill", category.fill);
    }
    await tables.uncheck();
    await expect(page.getByTestId("result-overlay").locator('polygon[data-outline-id]:not([fill="none"])')).toHaveCount(0);
    for (const control of await dialog(page).getByRole("switch").all()) await expect(control).toBeEnabled();
    await fields.check();
    await tables.check();
    for (const category of categorySources) await expect(sourceRegion(page, category.id)).toHaveAttribute("fill", category.fill);
    await dialog(page).getByRole("switch", { name: "Show low confidence highlight", exact: true }).uncheck();
    await expect(sourceRegion(page, categorySources[2].id)).toHaveAttribute("fill", "#E8F5E9");
    await expect(sourceRegion(page, categorySources[3].id)).toHaveAttribute("fill", "#E8F1FF");
    await expect(sourceRegion(page, categorySources[4].id)).toHaveAttribute("fill", "#F1F3F5");
});

test("UI-56 integrated switches retain their saved settings after reload", async ({ page }) => {
    await loadReviewFixture(page);
    await trigger(page).click();
    for (const name of ["Show field highlights", "Show table highlights", "Show low confidence highlight"]) {
        await dialog(page).getByRole("switch", { name, exact: true }).uncheck();
    }
    const identity = await savedReviewIdentity(page);
    const saved = await page.evaluate(key => localStorage.getItem(key), identity.key);
    await page.reload();
    await loadReviewFixture(page);
    await trigger(page).click();
    for (const name of ["Show field highlights", "Show table highlights", "Show low confidence highlight"]) {
        await expect(dialog(page).getByRole("switch", { name, exact: true })).not.toBeChecked();
    }
    await expect(page.getByTestId("result-overlay").locator('polygon[data-outline-id]:not([fill="none"])')).toHaveCount(0);
    expect(await page.evaluate(key => localStorage.getItem(key), identity.key)).toBe(saved);
    await dialog(page).getByRole("switch", { name: "Show field highlights", exact: true }).check();
    await expect(sourceRegion(page, "/contents/0/fields/Unknown")).toHaveAttribute("fill", "#F1F3F5");
    await expect(sourceRegion(page, "/contents/0/fields/Zero")).toHaveAttribute("fill", "#E8F5E9");
    await expect(sourceRegion(page, categorySources[1].id)).toHaveAttribute("fill", "none");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Source settings", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Source settings", exact: true }).getByRole("spinbutton")).toHaveValue("0.70");
});

test("UI-56 hidden fills remain selectable and previewable without changing confidence, counts or pins", async ({ page }) => {
    await loadReviewFixture(page);
    const count = await page.locator(".cu-field-navigation > span").textContent();
    await trigger(page).click();
    await dialog(page).getByRole("switch", { name: "Show field highlights", exact: true }).uncheck();
    await page.keyboard.press("Escape");
    const zero = sourceRegion(page, "/contents/0/fields/Zero");
    await expect(zero).toHaveAttribute("fill", "none");
    await expect(sourceRegion(page, "/contents/0/fields/Unknown")).toHaveAttribute("fill", "none");
    expect(await page.locator(".cu-field-navigation > span").textContent()).toBe(count);
    await zero.click();
    const selectedPosition = await page.locator(".cu-field-navigation > span").textContent();
    const pin = page.getByTestId("source-overlay").locator("polygon");
    await expect(pin).toHaveAttribute("data-source-id", "/contents/0/fields/Zero");
    await expect(pin).toHaveAttribute("stroke-width", "1.8");
    await expect(page.locator(".cu-flyover-confidence dd")).toHaveText("0.00");
    await expect(page.locator(`${fieldRow("/contents/0/fields/Zero")} .cu-value-chip`)).toHaveCSS("background-color", "rgb(252, 232, 230)");
    await sourceRegion(page, recipientId).hover();
    await expect(page.getByTestId("preview-overlay").locator("polygon")).toHaveAttribute("data-source-id", recipientId);
    await expect(pin).toHaveAttribute("data-source-id", "/contents/0/fields/Zero");
    expect(await page.locator(".cu-field-navigation > span").textContent()).toBe(selectedPosition);
});

test("UI-56 legacy category masks no longer hide colors that have no recovery controls", async ({ page }) => {
    await loadReviewFixture(page);
    await trigger(page).click();
    await dialog(page).getByRole("switch", { name: "Show table highlights", exact: true }).uncheck();
    const identity = await savedReviewIdentity(page);
    const legacy = JSON.stringify({ format: "cu-viewer-review", version: 1, schema: identity.schema,
        settings: { threshold: 0.341, showFields: true, showTables: false, highlightLow: true,
            columns: 2, paneRatio: 0.58, fieldRatio: 0.46,
            sourceCategories: { field: false, table: false, lowField: false, lowTable: false, unavailable: false } },
        order: {} });
    await page.evaluate(({ key, text }) => localStorage.setItem(key, text), { key: identity.key, text: legacy });
    await page.reload();
    await loadReviewFixture(page);
    await trigger(page).click();
    await expect(dialog(page).getByRole("switch", { name: "Show field highlights", exact: true })).toBeChecked();
    await expect(dialog(page).getByRole("switch", { name: "Show table highlights", exact: true })).not.toBeChecked();
    await expect(sourceRegion(page, "/contents/0/fields/InvoiceId")).toHaveAttribute("fill", "#E8F5E9");
    await expect(sourceRegion(page, "/contents/0/fields/Zero")).toHaveAttribute("fill", "#FCE8E6");
    await expect(sourceRegion(page, "/contents/0/fields/Unknown")).toHaveAttribute("fill", "#F1F3F5");
    expect(await page.evaluate(key => localStorage.getItem(key), identity.key)).toBe(legacy);
    await dialog(page).getByRole("switch", { name: "Show table highlights", exact: true }).check();
    for (const category of categorySources) {
        const fill = category.key === "lowTable" ? "#E8F1FF" : category.fill;
        await expect(sourceRegion(page, category.id)).toHaveAttribute("fill", fill);
    }
    expect(await page.evaluate(key => localStorage.getItem(key), identity.key)).not.toContain("sourceCategories");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Source settings", exact: true }).click();
    await expect(page.getByRole("spinbutton", { name: "Confidence threshold", exact: true })).toHaveValue("0.341");
});

test("UI-56 legacy saved settings load with all categories enabled and no record rewrite", async ({ page }) => {
    await loadReviewFixture(page);
    await trigger(page).click();
    await dialog(page).getByRole("switch", { name: "Show field highlights", exact: true }).uncheck();
    const identity = await savedReviewIdentity(page);
    const legacy = JSON.stringify({ format: "cu-viewer-review", version: 1, schema: identity.schema,
        settings: { threshold: 0.341, showFields: true, showTables: true, highlightLow: true, columns: 2, paneRatio: 0.58, fieldRatio: 0.46 },
        order: {} });
    await page.evaluate(({ key, text }) => localStorage.setItem(key, text), { key: identity.key, text: legacy });
    await page.reload();
    await loadReviewFixture(page);
    await trigger(page).click();
    for (const control of await dialog(page).getByRole("switch").all()) await expect(control).toBeChecked();
    await expectPalette(dialog(page));
    await expect(sourceRegion(page, "/contents/0/fields/Zero")).toHaveAttribute("fill", "#FCE8E6");
    await expect(sourceRegion(page, "/contents/0/fields/Unknown")).toHaveAttribute("fill", "#F1F3F5");
    expect(await page.evaluate(key => localStorage.getItem(key), identity.key)).toBe(legacy);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Source settings", exact: true }).click();
    await expect(page.getByRole("spinbutton", { name: "Confidence threshold", exact: true })).toHaveValue("0.341");
});
