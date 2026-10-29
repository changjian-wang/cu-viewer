import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { expandField, ready } from "./viewerAssertions";

test.use({ reducedMotion: "reduce", deviceScaleFactor: 1, launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

async function screenshotPixels(page: Page, clip: { x: number; y: number; width: number; height: number }) {
    const png = await page.screenshot({ clip, scale: "device" });
    return page.evaluate(async encoded => {
        const bitmap = await createImageBitmap(new Blob([
            Uint8Array.from(atob(encoded), character => character.charCodeAt(0)),
        ], { type: "image/png" }));
        try {
            const canvas = document.createElement("canvas");
            canvas.width = bitmap.width; canvas.height = bitmap.height;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Screenshot pixel validation is unavailable.");
            context.drawImage(bitmap, 0, 0);
            return { width: canvas.width, height: canvas.height, ratio: devicePixelRatio,
                data: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data) };
        } finally { bitmap.close(); }
    }, png.toString("base64"));
}

async function expectSingleBorder(page: Page, clip: { x: number; y: number; width: number; height: number },
    color: readonly [number, number, number], vertical: boolean, expected: number): Promise<void> {
    const pixels = await screenshotPixels(page, clip);
    let ink = 0;
    for (let index = 0; index < pixels.data.length; index += 4) {
        ink += 765 - pixels.data[index]! - pixels.data[index + 1]! - pixels.data[index + 2]!;
    }
    const deficit = color.reduce((sum, channel) => sum + 255 - channel, 0);
    const coverage = ink / deficit / (vertical ? pixels.height : pixels.width) / pixels.ratio;
    expect(Math.abs(coverage - expected), JSON.stringify({ clip, coverage, expected, ...pixels })).toBeLessThanOrEqual(0.1);
}

async function expectPinnedIndex(wrapper: Locator): Promise<void> {
    await expect.poll(() => wrapper.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        const table = element.querySelector(".cu-items-table");
        if (!table) throw new Error("The inline values table is missing.");
        const indices = table.querySelectorAll(".cu-items-table > thead > tr > th:first-child, .cu-items-table > tbody > tr > th");
        return [...indices].every(index => {
            const rect = index.getBoundingClientRect(), style = getComputedStyle(index);
            const hit = index.ownerDocument.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
            const gutter = index.ownerDocument.elementFromPoint(rect.left - 4, rect.top + rect.height / 2);
            return Math.abs(rect.left - bounds.left - element.clientLeft) < 1 &&
                Math.abs(rect.width - 29) < 1 && style.position === "sticky" && style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
                style.boxShadow === "none" && style.borderRightColor === "rgb(220, 227, 235)" &&
                Boolean(hit && index.contains(hit)) && !gutter?.closest(".cu-items-table");
        });
    })).toBe(true);
}

for (const ratio of [1, 1.25, 2]) {
    test.describe(`UI-53 single-line inline grid at DPR ${ratio}`, () => {
        test.use({ deviceScaleFactor: ratio });
        test("visible seams stay single, preserve border-box sizing and retain the scrolled index divider", async ({ page }) => {
            await page.setViewportSize({ width: 1253, height: 888 });
            await page.goto("/");
            await ready(page);
            expect(await page.evaluate(() => devicePixelRatio)).toBe(ratio);
            const wrapper = page.locator('[data-array-id="/contents/0/fields/LineItems"]');
            const grid = page.getByRole("table", { name: "LineItems values", exact: true });
            await wrapper.scrollIntoViewIfNeeded();
            await page.locator(".prototype-banner").hover();
            const measure = () => grid.evaluate(table => ({
                width: table.getBoundingClientRect().width,
                headers: [...table.querySelectorAll(":scope > thead > tr > th")].map(cell => cell.getBoundingClientRect().width),
                rows: [...table.querySelectorAll(":scope > tbody > tr")].map(row => row.getBoundingClientRect().height),
            }));
            const baseline = await page.addStyleTag({ content: `
                .cu-items-table th { border: 1px solid #e2e7ed !important; }
                .cu-items-table td { border: 1px solid #e7ebf0 !important; }
                .cu-items-table th:first-child { box-shadow: 1px 0 #dce3eb; }
            ` });
            let original: Awaited<ReturnType<typeof measure>>;
            try { original = await measure(); }
            finally {
                await baseline.evaluate(element => {
                    if (!(element instanceof HTMLStyleElement)) throw new Error("The border-box baseline style is unavailable.");
                    element.remove();
                });
                await baseline.dispose();
            }
            expect(await measure()).toEqual(original);
            const first = grid.locator(":scope > tbody > tr:first-child > td").first();
            await expect(first).toHaveCSS("border-right-color", "rgb(238, 241, 245)");
            await expect(first).toHaveCSS("border-bottom-color", "rgb(231, 235, 240)");
            await expect(first).toHaveCSS("border-left-color", "rgba(0, 0, 0, 0)");
            await expect(first).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
            await expect(grid.locator(":scope > thead > tr > th").nth(1)).toHaveCSS("border-bottom-color", "rgb(220, 227, 235)");
            await expect(grid.locator(":scope > thead > tr > th").nth(1)).toHaveCSS("border-top-color", "rgb(220, 227, 235)");
            await expect(grid.locator(":scope > tbody > tr:last-child > td").first()).toHaveCSS("border-bottom-color", "rgb(220, 227, 235)");
            await expect(grid.locator(":scope > tbody > tr:first-child > td").last()).toHaveCSS("border-right-color", "rgb(220, 227, 235)");
            const strips = await first.evaluate(cell => {
                const bounds = cell.getBoundingClientRect(), style = getComputedStyle(cell);
                return {
                    vertical: { x: Math.floor(bounds.right - 4), y: Math.floor(bounds.top + 3), width: 8, height: 1 },
                    horizontal: { x: Math.floor(bounds.left + 3), y: Math.floor(bounds.bottom - 4), width: 1, height: 8 },
                    verticalWidth: parseFloat(style.borderRightWidth), horizontalWidth: parseFloat(style.borderBottomWidth),
                };
            });
            await expectSingleBorder(page, strips.vertical, [238, 241, 245], true, strips.verticalWidth);
            await expectSingleBorder(page, strips.horizontal, [231, 235, 240], false, strips.horizontalWidth);
            for (const offset of [0, 230]) {
                await wrapper.evaluate((element, value) => { element.scrollLeft = value; }, offset);
                await expectPinnedIndex(wrapper);
                const index = grid.locator(":scope > tbody > tr > th").first();
                const divider = await index.evaluate(cell => {
                    const bounds = cell.getBoundingClientRect();
                    return { clip: { x: Math.floor(bounds.right - 4), y: Math.floor(bounds.top + 3), width: 8, height: 1 },
                        width: parseFloat(getComputedStyle(cell).borderRightWidth) };
                });
                expect(divider.width).toBe(1);
                const actual = await screenshotPixels(page, divider.clip);
                // Fractional-DPR sticky compositing must match an isolated one-border reference.
                const reference = await page.addStyleTag({ content: `
                    .cu-items-table th, .cu-items-table td { border-color: transparent !important; box-shadow: none !important; }
                    .cu-items-table > tbody > tr > th:first-child { border-right: 1px solid #dce3eb !important; }
                ` });
                try { expect(await screenshotPixels(page, divider.clip)).toEqual(actual); }
                finally {
                    await reference.evaluate(element => {
                        if (!(element instanceof HTMLStyleElement)) throw new Error("The isolated border reference is unavailable.");
                        element.remove();
                    });
                    await reference.dispose();
                }
            }
        });
    });
}

for (const viewport of [{ width: 1536, height: 960 }, { width: 1280, height: 800 }, { width: 1030, height: 760 }]) {
    test(`UI-39 index header and row numbers stay pinned without leaking values at ${viewport.width}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto("/");
        await ready(page);
        const wrapper = page.locator('[data-array-id="/contents/0/fields/LineItems"]');
        const table = page.getByRole("table", { name: "LineItems values", exact: true });
        for (const columns of [2, 3]) {
            await page.getByRole("button", { name: `${columns} columns`, exact: true }).click();
            await wrapper.scrollIntoViewIfNeeded();
            await wrapper.evaluate(element => { element.scrollLeft = 0; });
            await expect(table.getByRole("rowheader")).toHaveText(["1", "2", "3"]);
            await expect(table.getByRole("columnheader").first()).toHaveText("#");
            const initial = await table.getByRole("columnheader").nth(1).boundingBox();
            if (!initial) throw new Error("The first data column is not laid out.");
            const maximum = await wrapper.evaluate(element => element.scrollWidth - element.clientWidth);
            expect(maximum).toBeGreaterThan(100);
            for (const offset of [0, 80, 230, 335, maximum / 2, maximum, 0]) {
                await wrapper.evaluate((element, value) => { element.scrollLeft = value; }, offset);
                await expectPinnedIndex(wrapper);
                const actual = await wrapper.evaluate(element => element.scrollLeft);
                expect(Math.abs(actual - Math.min(offset, maximum))).toBeLessThanOrEqual(1);
                const data = await table.getByRole("columnheader").nth(1).boundingBox();
                if (!data) throw new Error("The data column disappeared while scrolling.");
                expect(Math.abs(data.x - initial.x + actual)).toBeLessThanOrEqual(1);
            }
        }
        await expect.poll(() => page.locator(".cu-fields-scroll").evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    });
}

test("UI-39/40 the flush table does not paint outside its left edge after scrolling past Description", async ({ page }) => {
    await page.setViewportSize({ width: 1253, height: 888 });
    await page.goto("/");
    await ready(page);
    const wrapper = page.locator('[data-array-id="/contents/0/fields/LineItems"]');
    await wrapper.scrollIntoViewIfNeeded();
    await wrapper.evaluate(element => { element.scrollLeft = 230; });
    await expectPinnedIndex(wrapper);
    const strip = await wrapper.evaluate(element => {
        const parent = element.parentElement!.getBoundingClientRect(), bounds = element.getBoundingClientRect();
        const index = element.querySelector(".cu-items-table > tbody > tr > th")!.getBoundingClientRect();
        if (Math.abs(bounds.left - parent.left) > 1 || Math.abs(bounds.width - parent.width) > 1) {
            throw new Error("The inline table must use the full Fields width without indentation.");
        }
        return { x: bounds.left - 4, y: index.top + 3, width: 3, height: index.height - 6 };
    });
    const { data } = await screenshotPixels(page, strip);
    let paintedPixels = 0;
    for (let index = 0; index < data.length; index += 4) {
        if (data[index] !== 255 || data[index + 1] !== 255 || data[index + 2] !== 255) paintedPixels++;
    }
    expect(paintedPixels).toBe(0);
});

test("UI-39 dragging the native horizontal scrollbar moves values without moving indices or business rows", async ({ page }) => {
    await page.setViewportSize({ width: 1253, height: 888 });
    await page.goto("/");
    await ready(page);
    const wrapper = page.locator('[data-array-id="/contents/0/fields/LineItems"]');
    await wrapper.scrollIntoViewIfNeeded();
    await wrapper.evaluate(element => { element.scrollLeft = 0; });
    const geometry = await wrapper.evaluate(element => {
        if (!(element instanceof HTMLElement)) throw new Error("The horizontal table viewport is unavailable.");
        const bounds = element.getBoundingClientRect();
        const thickness = element.offsetHeight - element.clientHeight;
        const track = element.clientWidth - 2 * thickness;
        const thumb = track * element.clientWidth / element.scrollWidth;
        return { thickness, x: bounds.left + thickness + thumb / 2,
            y: bounds.top + element.clientHeight + thickness / 2, delta: (track - thumb) * 0.65 };
    });
    expect(geometry.thickness).toBeGreaterThan(0);
    expect(geometry.delta).toBeGreaterThan(30);
    const rows = await wrapper.locator(".cu-cell-content").evaluateAll(elements => elements.map(element => element.getAttribute("data-field-id")));
    await page.mouse.move(geometry.x, geometry.y);
    await page.mouse.down();
    await page.mouse.move(geometry.x + geometry.delta, geometry.y, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => wrapper.evaluate(element => element.scrollLeft)).toBeGreaterThan(40);
    await expectPinnedIndex(wrapper);
    expect(await wrapper.locator(".cu-cell-content").evaluateAll(elements => elements.map(element => element.getAttribute("data-field-id")))).toEqual(rows);
});

test("UI-39 source-driven cell reveal, value menus and tab restoration retain the pinned index", async ({ page }) => {
    await page.setViewportSize({ width: 1253, height: 888 });
    await page.goto("/");
    await ready(page);
    const wrapper = page.locator('[data-array-id="/contents/0/fields/LineItems"]');
    await wrapper.scrollIntoViewIfNeeded();
    await wrapper.evaluate(element => { element.scrollLeft = element.scrollWidth; });
    const id = "/contents/0/fields/LineItems/valueArray/0/valueObject/ProductCode";
    await page.getByTestId("result-overlay").locator(`[data-outline-id="${id}"]`).click();
    await expectPinnedIndex(wrapper);
    const cell = wrapper.locator(`.cu-cell-content[data-field-id="${id}"]`);
    await expect(cell.locator(".cu-cell-value")).toHaveAttribute("aria-pressed", "true");
    await expect(cell.locator(".cu-cell-value")).toHaveText("A123");
    await cell.locator(".cu-cell-value").press("Shift+F10");
    await expect(page.getByRole("menu", { name: "Value actions", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    const left = await wrapper.evaluate(element => element.scrollLeft);
    await page.getByRole("tab", { name: "Markdown", exact: true }).click();
    await page.getByRole("tab", { name: "Fields", exact: true }).click();
    await expect(wrapper).toHaveJSProperty("scrollLeft", left);
    await expectPinnedIndex(wrapper);
    await page.setViewportSize({ width: 1030, height: 760 });
    await wrapper.scrollIntoViewIfNeeded();
    await expectPinnedIndex(wrapper);
});

test("UI-40 pointer selection uses one cell background and quiet header cues without changing confidence colors", async ({ page }) => {
    await page.setViewportSize({ width: 1253, height: 888 });
    await page.goto("/");
    await ready(page);
    await expandField(page, "TaxDetails");
    const grid = page.getByRole("table", { name: "TaxDetails values", exact: true });
    const id = "/contents/0/fields/TaxDetails/valueArray/0/valueObject/Amount/valueObject/Amount";
    const selected = grid.locator(`td:has(.cu-cell-content[data-field-id="${id}"])`);
    const value = selected.locator(".cu-cell-value");
    const chip = selected.locator(".cu-value-chip");
    const before = await selected.boundingBox();
    const confidenceColor = await chip.evaluate(element => getComputedStyle(element).backgroundColor);
    const separator = await grid.getByRole("rowheader").first().evaluate(element => getComputedStyle(element).boxShadow);
    await value.click();
    await expect(selected).toHaveCSS("background-color", "rgb(229, 218, 255)");
    await expect(selected).toHaveCSS("box-shadow", "none");
    await expect(selected).toHaveCSS("outline-style", "none");
    await expect(value).toHaveCSS("outline-style", "none");
    await expect(grid.locator(".is-location-row")).toHaveCSS("background-color", "rgb(248, 245, 255)");
    await expect(grid.locator(".is-location-row")).toHaveCSS("box-shadow", separator);
    await expect(grid.locator(".is-location-column")).toHaveCSS("background-color", "rgb(248, 245, 255)");
    await expect(grid.locator(".is-location-column")).toHaveCSS("box-shadow", "none");
    await expect(grid.locator("td:not(.is-selected-cell)").first()).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(chip).toHaveCSS("background-color", confidenceColor);
    expect(confidenceColor).toBe("rgb(255, 232, 236)");
    await expect(selected.locator(".cu-value-menu-trigger")).toHaveCSS("border-top-width", "0px");
    const after = await selected.boundingBox();
    if (!before || !after) throw new Error("The selected cell is not laid out.");
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
    await expectPinnedIndex(page.locator('[data-array-id="/contents/0/fields/TaxDetails"]'));
});

test("UI-40 keyboard navigation retains a single cell-level focus ring and menu focus restoration", async ({ page }) => {
    await page.setViewportSize({ width: 1253, height: 888 });
    await page.goto("/");
    await ready(page);
    await expandField(page, "TaxDetails");
    const grid = page.getByRole("table", { name: "TaxDetails values", exact: true });
    const first = grid.getByRole("button", { name: "Select value of TaxDetails / Item 1 / Amount / Amount", exact: true });
    const second = grid.getByRole("button", { name: "Select value of TaxDetails / Item 1 / Amount / CurrencyCode", exact: true });
    const cell = grid.locator("td:has(.cu-cell-value:focus-visible)");
    await first.click();
    await first.press("ArrowDown");
    await expect(second).toBeFocused();
    await expect(cell).toHaveCount(1);
    await expect(cell).toHaveCSS("outline-style", "solid");
    await expect(cell).toHaveCSS("outline-width", "1px");
    await expect(second).toHaveCSS("outline-style", "none");
    await second.press("Enter");
    await expect(cell).toHaveCSS("background-color", "rgb(229, 218, 255)");
    await second.press("Shift+F10");
    await expect(page.getByRole("menu", { name: "Value actions", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(second).toBeFocused();
    await expect(cell).toHaveCount(1);
    await expect(cell).toHaveCSS("outline-width", "1px");
    await expect(second).toHaveCSS("outline-style", "none");
    await first.click();
    await expect(cell).toHaveCount(0);
    await expect(grid.locator("td.is-selected-cell")).toHaveCSS("outline-style", "none");
});

test("UI-40 source selection briefly emphasizes array backgrounds rather than drawing a second border", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await ready(page);
    const id = "/contents/0/fields/LineItems/valueArray/0/valueObject/ProductCode";
    const cell = page.locator(`.cu-items-table td:has(.cu-cell-content[data-field-id="${id}"])`);
    await page.getByTestId("result-overlay").locator(`[data-outline-id="${id}"]`).click();
    const animation = await cell.evaluate(element => {
        const active = element.getAnimations().find(item => item.id === "cu-field-location");
        if (!active || !(active.effect instanceof KeyframeEffect)) throw new Error("The source selection emphasis did not start.");
        return { frames: active.effect.getKeyframes(), duration: active.effect.getTiming().duration };
    });
    expect(animation.duration).toBe(1000);
    expect(animation.frames.every(frame => typeof frame.backgroundColor === "string" && !frame.outline)).toBe(true);
    await expect.poll(() => cell.evaluate(element => element.getAnimations().filter(item => item.id === "cu-field-location").length)).toBe(0);
    await expect(cell).toHaveCSS("background-color", "rgb(229, 218, 255)");
    await expect(cell).toHaveCSS("box-shadow", "none");
    await expect(cell).toHaveCSS("outline-style", "none");
    await expect(cell.locator(".cu-value-chip")).toHaveCSS("background-color", "rgb(255, 232, 236)");
});
