import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 1000 }, reducedMotion: "reduce" });

test.beforeEach(async ({ page }) => {
    page.on("pageerror", error => { throw error; });
    const path = resolve("docs", "ui-redesign", "single-toolbar", "index.html").replaceAll("\\", "/");
    await page.goto(`/@fs/${path}`);
    await expect(page.getByRole("img", { name: "Synthetic pdf document page 1", exact: true })).toBeVisible();
});

async function setWidth(page: Page, width: number): Promise<void> {
    await page.locator(`[data-width="${width}"]`).click();
    await expect(page.locator(".source-pane")).toHaveCSS("width", `${width}px`);
}

for (const width of [570, 740, 1040]) {
    for (const sample of ["invoice", "receipt"]) {
        test(`prototype one row at ${width}px with ${sample}, long names and source states`, async ({ page }) => {
            await setWidth(page, width);
            await page.getByLabel("Example document", { exact: true }).selectOption(sample);
            await page.getByLabel("Long filename", { exact: true }).check();
            const viewport = page.getByRole("group", { name: "Source viewport", exact: true });
            const initial = await viewport.boundingBox();
            for (const state of ["none", "single", "multiple", "group", ...(sample === "invoice" ? ["ungrounded"] : [])]) {
                await page.getByLabel("Selection example", { exact: true }).selectOption(state);
                const metrics = await page.locator(".source-pane").evaluate(element => {
                    const pane = element.getBoundingClientRect();
                    const rect = (selector: string) => {
                        const node = element.querySelector(selector);
                        if (!node) throw new Error(`Missing prototype group: ${selector}`);
                        return node.getBoundingClientRect();
                    };
                    const bar = rect(".toolbar"), left = rect(".file-status"), nav = rect(".page-controls"), right = rect(".right-controls");
                    return { barHeight: bar.height, viewportHeight: rect(".viewport").height, paneHeight: pane.height,
                        leftGap: nav.left - left.right, rightGap: right.left - nav.right,
                        centerError: (nav.left + nav.right - pane.left - pane.right) / 2,
                        overflow: element.querySelector(".toolbar")!.scrollWidth - element.querySelector(".toolbar")!.clientWidth,
                        controls: [...element.querySelectorAll<HTMLButtonElement | HTMLSelectElement | HTMLInputElement>(".toolbar button, .toolbar select, .toolbar input")]
                            .filter(control => control.getClientRects().length > 0).map(control => {
                                const box = control.getBoundingClientRect();
                                const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
                                return { x: box.x, width: box.width, height: box.height,
                                    hit: hit === control || control.contains(hit),
                                    inside: box.left >= bar.left && box.right <= bar.right && box.top >= bar.top && box.bottom <= bar.bottom };
                            }),
                    };
                });
                expect(metrics.barHeight).toBe(44);
                expect(metrics.viewportHeight).toBe(metrics.paneHeight - 46);
                expect(Math.abs(metrics.centerError)).toBeLessThanOrEqual(1);
                expect(metrics.leftGap).toBeGreaterThanOrEqual(0);
                expect(metrics.rightGap).toBeGreaterThanOrEqual(16);
                expect(metrics.overflow).toBeLessThanOrEqual(1);
                for (const control of metrics.controls) {
                    expect(control.width).toBeGreaterThanOrEqual(24);
                    expect(control.height).toBeGreaterThanOrEqual(24);
                    expect(control.inside, JSON.stringify(control)).toBe(true);
                    expect(control.hit, JSON.stringify(control)).toBe(true);
                }
                expect(await viewport.boundingBox()).toEqual(initial);
                await expect(page.getByRole("group", { name: "Document toolbar", exact: true })).toHaveCount(1);
                await expect(page.locator(".source-pane > header")).toHaveCount(0);
                await expect(page.getByRole("button", { name: "Clear selection", exact: true })).toHaveCount(0);
                await expect(page.getByRole("button", { name: "More document actions", exact: true })).toHaveCount(0);
                await expect(page.locator("#filename")).toHaveAttribute("title", /customer-financial-documents-final-review-copy/);
                await expect(page.locator("#prototype-error")).toBeHidden();
            }
        });
    }
}

for (const width of [570, 1040]) {
    for (const height of [360, 660]) {
        test(`prototype panels open upward, stay bounded and dismiss correctly at ${width}x${height}`, async ({ page }) => {
            await setWidth(page, width);
            await page.getByLabel("Prototype height", { exact: true }).selectOption(String(height));
            const settings = page.getByRole("button", { name: "Highlighting settings", exact: true });
            const legend = page.getByRole("button", { name: "Highlighting legend", exact: true });
            for (const [trigger, name] of [[settings, "Highlighting"], [legend, "Legend"]] as const) {
                await trigger.click();
                const dialog = page.getByRole("dialog", { name, exact: true });
                const panel = await dialog.boundingBox(), bar = await page.locator(".toolbar").boundingBox(), source = await page.locator(".source-pane").boundingBox();
                if (!panel || !bar || !source) throw new Error("The upward-opening prototype panel is unavailable.");
                expect(panel.y + panel.height).toBeLessThanOrEqual(bar.y - 7);
                expect(panel.y).toBeGreaterThanOrEqual(source.y);
                expect(panel.x).toBeGreaterThanOrEqual(source.x);
                expect(panel.x + panel.width).toBeLessThanOrEqual(source.x + source.width);
                await expect(trigger).toHaveAttribute("aria-expanded", "true");
                await page.keyboard.press("Escape");
                await expect(dialog).toHaveCount(0);
                await expect(trigger).toBeFocused();
            }
            await settings.click();
            const threshold = page.getByRole("spinbutton", { name: "Confidence threshold", exact: true });
            await threshold.fill("0.699");
            await expect(page.locator("#threshold-hint")).toHaveText("Values below 0.699 receive low-confidence highlight.");
            await threshold.fill("1.2");
            await expect(threshold).toHaveAttribute("aria-invalid", "true");
            await expect(page.locator("#threshold-error")).toBeVisible();
            await expect(page.locator("#threshold-hint")).toContainText("0.699");
            await threshold.fill("0.70");
            await page.getByRole("switch", { name: "Show low confidence highlight", exact: true }).uncheck();
            await legend.click();
            await expect(page.getByRole("dialog", { name: "Highlighting", exact: true })).toHaveCount(0);
            await expect(page.getByRole("button", { name: "Low-confidence field", exact: true })).toBeDisabled();
            await expect(page.getByRole("dialog", { name: "Legend", exact: true }).getByText("All scored values while low-confidence highlight is off", { exact: true })).toHaveCount(2);
            await page.getByRole("button", { name: "Close legend", exact: true }).click();
            await expect(legend).toBeFocused();
            await settings.click();
            await page.locator('[data-width="740"]').focus();
            await expect(page.getByRole("dialog")).toHaveCount(0);
            await expect(page.locator('[data-width="740"]')).toBeFocused();
        });
    }
    test(`prototype retains source navigation and fixed zoom at ${width}px`, async ({ page }) => {
        await setWidth(page, width);
        const viewport = page.getByRole("group", { name: "Source viewport", exact: true });
        await page.getByLabel("Selection example", { exact: true }).selectOption("multiple");
        await expect(page.locator("#location")).toHaveText("1 / 2");
        await page.getByRole("button", { name: "Next source region", exact: true }).click();
        await expect(page.getByRole("textbox", { name: "Page number", exact: true })).toHaveValue("2");
        await expect(page.locator("#location")).toHaveText("2 / 2");
        await expect(page.getByRole("button", { name: "Previous source region", exact: true })).toBeFocused();
        await page.getByRole("combobox", { name: "Zoom", exact: true }).selectOption("1.5");
        await expect(page.locator('#zoom option:checked')).toHaveText("150%");
        const paper = await page.locator("#paper").boundingBox();
        await page.getByRole("button", { name: "Rotate 90 degrees", exact: true }).click();
        const rotated = await page.locator("#paper").boundingBox();
        if (!paper || !rotated) throw new Error("The prototype document frame is unavailable.");
        expect(rotated.width).toBe(paper.height);
        expect(rotated.height).toBe(paper.width);
        await page.getByLabel("Selection example", { exact: true }).selectOption("group");
        await page.getByRole("combobox", { name: "Selected group source page", exact: true }).selectOption("1");
        await expect(page.getByRole("textbox", { name: "Page number", exact: true })).toHaveValue("1");
        await expect(page.locator('#zoom option:checked')).toHaveText("150%");
        await page.getByRole("button", { name: "Highlighting settings", exact: true }).click();
        await page.keyboard.press("Escape");
        await expect(page.locator("#source-status")).toBeVisible();
        await viewport.press("Escape");
        await expect(page.locator("#source-status")).toBeHidden();
        await expect(page.locator(".selection-outline")).toHaveCount(0);
    });
}
