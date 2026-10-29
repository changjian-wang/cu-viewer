import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { fieldRow, loadReviewFixture, openValueMenu, recipientId, reviewFixture } from "./uiRedesignFixtures";
import { locateGroup, ready } from "./viewerAssertions";

const arrayId = "/contents/0/fields/LineItems";
const cellId = `${arrayId}/valueArray/0/valueObject/Column1`;
const source = (page: Page, id: string) => page.getByTestId("result-overlay").locator(`[data-outline-id="${id}"]`).first();

test.use({ reducedMotion: "reduce", deviceScaleFactor: 1 });

for (const viewport of [{ width: 1536, height: 960 }, { width: 1440, height: 1000 }, { width: 1280, height: 800 }, { width: 1030, height: 760 }]) {
    test(`UI-33/54 settings and compact review toolbar at ${viewport.width}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await loadReviewFixture(page);
        await expect(page.getByRole("button", { name: "View selected value", exact: true })).toHaveCount(0);
        for (const columns of [2, 3]) {
            await page.getByRole("button", { name: `${columns} columns`, exact: true }).click();
            await expect(page.locator(".cu-field-navigation > button")).toHaveCount(2);
            await expect(page.getByRole("button", { name: "Previous field", exact: true })).toBeEnabled();
            await expect(page.getByRole("button", { name: "Next field", exact: true })).toBeEnabled();
            const layout = await page.locator(".cu-fields-pane").evaluate(element => ({
                controlsHeight: element.querySelector(".cu-fields-controls")!.getBoundingClientRect().bottom - element.getBoundingClientRect().top,
                overflow: element.scrollWidth - element.clientWidth,
                toolbarOverflow: element.querySelector(".cu-review-toolbar")!.scrollWidth - element.querySelector(".cu-review-toolbar")!.clientWidth,
            }));
            expect(layout.controlsHeight).toBeLessThanOrEqual(150);
            expect(layout.overflow).toBeLessThanOrEqual(1);
            expect(layout.toolbarOverflow).toBeLessThanOrEqual(1);
        }
        await expect(page.getByRole("button", { name: "Previous page", exact: true })).toHaveCSS("width", "30px");
        await expect(page.getByRole("button", { name: "Next page", exact: true })).toHaveCSS("height", "30px");
        await page.getByRole("button", { name: "Highlighting settings", exact: true }).click();
        const panel = page.getByRole("dialog", { name: "Highlighting", exact: true });
        await expect(panel).toHaveCSS("width", "326px");
        await expect(panel.getByRole("heading", { name: "Highlighting", exact: true })).toHaveCSS("font-size", "18px");
        const threshold = panel.getByRole("spinbutton", { name: "Confidence threshold", exact: true });
        await expect(threshold).toHaveValue("0.70");
        await expect(threshold).toHaveCSS("width", "116px");
        await expect(threshold).toHaveCSS("font-size", "16px");
        await expect(threshold).toBeFocused();
        await expect(panel.locator(".cu-switch-track")).toHaveCount(3);
        await expect(panel.locator(".cu-switch-track").first()).toHaveCSS("width", "35px");
        await expect(panel.locator(".cu-switch-track").first()).toHaveCSS("height", "21px");
        await expect(panel.locator(".cu-legend-swatch")).toHaveCount(0);
        expect(await panel.locator(".cu-switch-track").first().evaluate(element =>
            getComputedStyle(element, "::after").transitionDuration)).toBe("0s");
        const bounds = await panel.boundingBox(), pane = await page.locator(".cu-source-pane").boundingBox();
        if (!bounds || !pane) throw new Error("Highlighting panel is not laid out.");
        expect(bounds.y).toBe(pane.y + 50);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(pane.y + pane.height);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("button", { name: "Highlighting settings", exact: true })).toBeFocused();
        await page.getByRole("button", { name: "Highlighting legend", exact: true }).click();
        const legend = page.getByRole("dialog", { name: "Legend", exact: true });
        await expect(legend.locator(".cu-legend-swatch")).toHaveCount(5);
        await expect(legend.locator(".cu-legend-swatch").first()).toHaveCSS("width", "33px");
        await expect(legend.locator(".cu-legend-swatch").first()).toHaveCSS("height", "28px");
        await page.keyboard.press("Escape");
        await expect(page.getByRole("button", { name: "Highlighting legend", exact: true })).toBeFocused();
    });

    test(`UI-33 below-source flyover uses the shared 12px gap at ${viewport.width}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await loadReviewFixture(page);
        const target = source(page, "/contents/0/fields/InvoiceId");
        await target.click();
        const popup = page.getByRole("tooltip", { name: "Field preview", exact: true });
        await expect(popup).toBeVisible();
        await expect.poll(async () => {
            const card = await popup.boundingBox(), anchor = await target.boundingBox();
            if (!card || !anchor) throw new Error("Source/flyover geometry is unavailable.");
            return Math.abs(card.y - anchor.y - anchor.height - 12);
        }).toBeLessThanOrEqual(1);
        const card = await popup.boundingBox(), viewportBounds = await page.getByRole("group", { name: "Source viewport", exact: true }).boundingBox();
        if (!card || !viewportBounds) throw new Error("Complete source preview is unavailable.");
        expect(card.width).toBeGreaterThanOrEqual(148);
        expect(card.width).toBeLessThanOrEqual(248);
        expect(card.y + card.height).toBeLessThanOrEqual(viewportBounds.y + viewportBounds.height);
    });
}

test("UI-33 source visibility never clears right-hand low-confidence emphasis", async ({ page }) => {
    await loadReviewFixture(page);
    await page.getByRole("button", { name: "Expand LineItems", exact: true }).click();
    const field = page.locator(fieldRow(recipientId)).locator(".cu-value-chip");
    const cell = page.locator(`.cu-cell-content${fieldRow(cellId)}`).locator(".cu-value-chip");
    const pixels = await page.getByTestId("source-canvas").evaluate(element => {
        if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected an original source canvas.");
        return element.toDataURL();
    });
    await page.getByRole("button", { name: "Highlighting settings", exact: true }).click();
    await page.getByRole("switch", { name: "Show field highlights", exact: true }).uncheck();
    await page.getByRole("switch", { name: "Show table highlights", exact: true }).uncheck();
    await expect(source(page, recipientId)).toHaveAttribute("fill", "none");
    await expect(source(page, cellId)).toHaveAttribute("fill", "none");
    await expect(field).toHaveCSS("background-color", "rgb(252, 232, 230)");
    await expect(cell).toHaveCSS("background-color", "rgb(255, 232, 236)");
    await page.getByRole("button", { name: "Close highlighting settings", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Tables", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Highlighting settings", exact: true }).click();
    await page.getByRole("switch", { name: "Highlight low confidences", exact: true }).uncheck();
    await expect(cell).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await page.getByRole("button", { name: "Close highlighting settings", exact: true }).click();
    await page.getByRole("tab", { name: "Fields", exact: true }).click();
    await expect(field).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(cell).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    expect(await page.getByTestId("source-canvas").evaluate(element => {
        if (!(element instanceof HTMLCanvasElement)) throw new Error("Original source canvas disappeared.");
        return element.toDataURL();
    })).toBe(pixels);
});

test("UI-55 field-level F2 survives shortcut removal without relocating source or stealing later source focus", async ({ page }) => {
    await loadReviewFixture(page);
    await source(page, recipientId).click();
    await expect(page.getByRole("button", { name: "View selected value", exact: true })).toHaveCount(0);
    const button = page.locator(fieldRow(recipientId)).locator(".cu-field-name");
    const frame = await page.getByTestId("rendered-page").boundingBox();
    const viewport = page.getByRole("group", { name: "Source viewport", exact: true });
    const scroll = await viewport.evaluate(element => element.scrollTop);
    await button.press("F2");
    await expect(page.getByRole("region", { name: "Full value and confidence" })).toContainText("Microsoft Corp");
    await expect(button).toBeFocused();
    expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(frame);
    expect(await viewport.evaluate(element => element.scrollTop)).toBe(scroll);
    await source(page, "/contents/0/fields/Zero").click();
    await expect(page.getByLabel("Full extracted value", { exact: true })).toHaveText("0");
    await expect(viewport).toBeFocused();
    await page.getByRole("button", { name: "Close full value details", exact: true }).click();
    await page.getByRole("button", { name: "Clear selection", exact: true }).click();
    await expect(page.getByRole("button", { name: "View selected value", exact: true })).toHaveCount(0);
    await locateGroup(page, "/contents/0/fields/Customer");
    await expect(page.getByRole("button", { name: "View selected value", exact: true })).toHaveCount(0);
});

test("UI-55 field counts and previous/next navigation remain without an information shortcut", async ({ page }) => {
    await loadReviewFixture(page);
    const navigation = page.locator(".cu-field-navigation");
    const count = await navigation.locator("span").textContent();
    await expect(navigation.locator("button")).toHaveCount(2);
    await page.getByRole("button", { name: "Next field", exact: true }).click();
    const pin = page.getByTestId("source-overlay").locator("polygon").first();
    const first = await pin.getAttribute("data-source-id");
    if (!first) throw new Error("The first navigated field has no source selection.");
    await page.getByRole("button", { name: "Next field", exact: true }).click();
    await expect(pin).not.toHaveAttribute("data-source-id", first);
    await page.getByRole("button", { name: "Previous field", exact: true }).click();
    await expect(pin).toHaveAttribute("data-source-id", first);
    expect(await navigation.locator("span").textContent()).toBe(count);
    await expect(page.getByRole("button", { name: "View selected value", exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Full value and confidence" })).toHaveCount(0);
});

test("UI-33/47 groups keep blank confidence and hover-only page actions without selected-count labels", async ({ page }) => {
    await loadReviewFixture(page);
    await page.getByRole("button", { name: "3 columns", exact: true }).click();
    const row = page.locator(fieldRow("/contents/0/fields/CustomerAddress"));
    await page.locator(".prototype-banner").hover();
    await expect(row.locator(".cu-page-badge")).toBeHidden();
    await expect(row.locator(".cu-confidence")).toHaveText("");
    const before = await row.evaluate(element => ({ height: element.getBoundingClientRect().height, width: element.getBoundingClientRect().width }));
    await row.hover();
    await expect(row.locator(".cu-page-badge")).toBeVisible();
    await locateGroup(page, "/contents/0/fields/CustomerAddress");
    await expect(row.locator(".cu-group-selection-count")).toHaveCount(0);
    await expect(page.getByTestId("source-overlay").locator("polygon")).toHaveCount(2);
    expect(await row.evaluate(element => ({ height: element.getBoundingClientRect().height, width: element.getBoundingClientRect().width }))).toEqual(before);
    await page.getByRole("group", { name: "Source viewport", exact: true }).focus();
    await page.locator(".prototype-banner").hover();
    await expect(row.locator(".cu-page-badge")).toBeHidden();
});

test("UI-33 inline array defaults match the reference and action menus retain icons and keyboard behavior", async ({ page }) => {
    await loadReviewFixture(page);
    await page.getByRole("button", { name: "Expand LineItems", exact: true }).click();
    const grid = page.getByRole("table", { name: "LineItems values", exact: true });
    await expect(grid.getByRole("columnheader").nth(1)).toHaveCSS("text-align", "left");
    await expect(grid.getByRole("columnheader").nth(1)).toHaveCSS("font-weight", "600");
    await expect(grid.getByRole("rowheader").first()).toHaveCSS("font-weight", "400");
    await expect(grid.getByRole("rowheader").first()).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await openValueMenu(page, recipientId);
    const menu = page.getByRole("menu", { name: "Value actions", exact: true });
    await expect(menu).toHaveCSS("width", "240px");
    await expect(menu.locator("svg")).toHaveCount(3);
    await page.keyboard.press("End");
    await expect(menu.getByRole("menuitem", { name: "Copy value", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "Locate on page 1", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "More document actions", exact: true }).click();
    const documentMenu = page.getByRole("menu", { name: "Document actions", exact: true });
    await expect(documentMenu).toHaveCSS("width", "224px");
    await expect(documentMenu.locator("svg")).toHaveCount(2);
});

test("UI-33 threshold stepping, exact precision and invalid-input feedback remain truthful", async ({ page }) => {
    await loadReviewFixture(page);
    await page.getByRole("button", { name: "Highlighting settings", exact: true }).click();
    const threshold = page.getByRole("spinbutton", { name: "Confidence threshold", exact: true });
    await threshold.press("ArrowUp");
    await expect(threshold).toHaveValue("0.71");
    await threshold.press("ArrowDown");
    await expect(threshold).toHaveValue("0.7");
    await threshold.fill("0.699");
    await expect(page.locator(".cu-setting-hint strong")).toHaveText("0.699");
    const boundary = source(page, "/contents/0/fields/Boundary");
    await expect(boundary).toHaveAttribute("fill", "#E8F5E9");
    await threshold.fill("");
    await expect(threshold).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("alert")).toContainText("Enter a confidence threshold");
    await expect(boundary).toHaveAttribute("fill", "#E8F5E9");
    await threshold.fill("1.01");
    await expect(page.getByRole("alert")).toContainText("finite");
    await threshold.fill("0.70");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(boundary).toHaveAttribute("fill", "#FCE8E6");
    await page.keyboard.press("Escape");
    await ready(page);
});

for (const kind of ["pdf", "image"] as const) {
    test(`UI-34 ${kind} displays exact reference colors without covering original glyphs`, async ({ page }) => {
        await loadReviewFixture(page);
        if (kind === "image") {
            const png = await page.getByTestId("source-canvas").evaluate(element => {
                if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected the rendered reference document.");
                return element.toDataURL("image/png").split(",")[1]!;
            });
            await page.getByLabel("Choose source file").setInputFiles({
                name: "synthetic-color-proof.png", mimeType: "image/png", buffer: Buffer.from(png, "base64"),
            });
            await ready(page);
            const content = reviewFixture.contents[0];
            if (!content) throw new Error("The reference result has no document content.");
            await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
                name: "synthetic-color-proof.cu.json", mimeType: "application/json",
                buffer: Buffer.from(JSON.stringify({ ...reviewFixture, contents: [{
                    ...content, pages: content.pages.slice(0, 1),
                    fields: { InvoiceId: content.fields.InvoiceId, Customer: content.fields.Customer,
                        Unknown: content.fields.Unknown, LineItems: content.fields.LineItems },
                }] })),
            });
            await expect(page.getByRole("button", { name: "Customer", exact: true })).toBeVisible();
        }
        await page.getByRole("button", { name: "Clear selection", exact: true }).click();
        const canvas = page.getByTestId("source-canvas");
        const original = await canvas.evaluate(element => {
            if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected an original source canvas.");
            return element.toDataURL();
        });
        const setSourceFills = async (enabled: boolean): Promise<void> => {
            await page.getByRole("button", { name: "Highlighting settings", exact: true }).click();
            await page.getByRole("switch", { name: "Show field highlights", exact: true }).setChecked(enabled);
            await page.getByRole("switch", { name: "Show table highlights", exact: true }).setChecked(enabled);
            await page.getByRole("button", { name: "Close highlighting settings", exact: true }).click();
        };
        await setSourceFills(false);
        const before = await page.screenshot();
        await setSourceFills(true);
        await expect(page.getByTestId("result-overlay")).toHaveCSS("mix-blend-mode", "multiply");
        const cases = [
            { id: "/contents/0/fields/InvoiceId", rgb: [232, 245, 233] },
            { id: recipientId, rgb: [252, 232, 230] },
            { id: "/contents/0/fields/Unknown", rgb: [241, 243, 245] },
            { id: cellId, rgb: [255, 232, 236] },
            { id: `${arrayId}/valueArray/0/valueObject/Column2`, rgb: [232, 241, 255] },
        ];
        const regions = [];
        for (const item of cases) {
            const target = source(page, item.id);
            await expect(target).toHaveAttribute("fill-opacity", "1");
            const box = await target.boundingBox();
            if (!box) throw new Error(`Missing color-proof source region: ${item.id}`);
            regions.push({ ...item, ...box });
        }
        const after = await page.screenshot();
        const samples = await page.evaluate(async ({ before, after, regions }) => {
            const decode = async (encoded: string): Promise<ImageData> => {
                const image = await createImageBitmap(new Blob([
                    Uint8Array.from(atob(encoded), character => character.charCodeAt(0)),
                ], { type: "image/png" }));
                const canvas = document.createElement("canvas");
                canvas.width = image.width; canvas.height = image.height;
                const context = canvas.getContext("2d");
                if (!context) throw new Error("Canvas pixel comparison is unavailable.");
                context.drawImage(image, 0, 0);
                return context.getImageData(0, 0, canvas.width, canvas.height);
            };
            const baseline = await decode(before), painted = await decode(after);
            if (baseline.width !== painted.width || baseline.height !== painted.height) throw new Error("Color comparison frame changed.");
            return regions.map(region => {
                let white = 0, exact = 0, dark = 0, obscured = 0;
                for (let y = Math.ceil(region.y + 2); y < Math.floor(region.y + region.height - 2); y++) {
                    for (let x = Math.ceil(region.x + 2); x < Math.floor(region.x + region.width - 2); x++) {
                        const index = (y * baseline.width + x) * 4;
                        const a = baseline.data.subarray(index, index + 3), b = painted.data.subarray(index, index + 3);
                        if (a.every(value => value === 255)) {
                            white++;
                            if (b.every((value, channel) => value === region.rgb[channel])) exact++;
                        }
                        if (a.every(value => value <= 40)) {
                            dark++;
                            if (b.some((value, channel) => value > a[channel]! + 1)) obscured++;
                        }
                    }
                }
                return { id: region.id, white, exact, dark, obscured };
            });
        }, { before: before.toString("base64"), after: after.toString("base64"), regions });
        for (const sample of samples) {
            expect(sample.white, sample.id).toBeGreaterThan(20);
            expect(sample.exact, sample.id).toBe(sample.white);
            expect(sample.obscured, sample.id).toBe(0);
        }
        expect(samples.reduce((count, sample) => count + sample.dark, 0)).toBeGreaterThan(20);
        expect(await canvas.evaluate(element => {
            if (!(element instanceof HTMLCanvasElement)) throw new Error("Original source canvas disappeared.");
            return element.toDataURL();
        })).toBe(original);
    });
}
