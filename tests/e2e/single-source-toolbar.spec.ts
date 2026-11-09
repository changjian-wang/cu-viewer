import { expect, test } from "@playwright/test";
import { ready } from "./viewerAssertions";

test.use({ reducedMotion: "reduce" });

test("simplified Legend and field summary preserve missing values and the field total", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const summary = page.locator(".cu-field-navigation > span");
    await expect(summary).toHaveText("— / 77 fields");
    await expect(summary).not.toContainText("not returned");
    const missing = page.locator('.cu-fields-table > tbody > tr[data-field-id="/contents/0/fields/PaymentTerm"]');
    await expect(page.getByRole("switch", { name: "Hide missing fields", exact: true })).toHaveCount(0);
    await expect(missing).toBeVisible();
    await expect(missing.locator(".cu-field-value")).toHaveText("Not returned");
    await page.getByRole("button", { name: "Highlighting legend", exact: true }).click();
    const legend = page.getByRole("dialog", { name: "Legend", exact: true });
    await expect(legend.getByText("Confidence unavailable", { exact: true })).toHaveCount(0);
    await expect(legend.getByText("No score was supplied", { exact: true })).toHaveCount(0);
    await expect(legend.locator(".cu-legend-swatch")).toHaveCount(4);
    await expect(legend.getByRole("switch")).toHaveCount(3);
    await expect(legend.getByRole("button")).toHaveCount(1);
});

test("compact Legend switches reduce visual size by 20 percent while keeping outer clicks and Space usable", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await page.getByRole("button", { name: "Highlighting legend", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Legend", exact: true });
    const switches = panel.locator(".cu-legend-switch");
    await expect(switches).toHaveCount(3);
    for (const label of await switches.all()) {
        const control = label.getByRole("switch");
        const track = label.locator(".cu-switch-track");
        const hit = await control.boundingBox(), visual = await track.boundingBox();
        if (!hit || !visual) throw new Error("The switch or visual track is unavailable.");
        expect(visual.width / 35).toBeCloseTo(0.8, 3);
        expect(visual.height / 21).toBeCloseTo(0.8, 3);
        expect(hit.width).toBe(35);
        expect(hit.height).toBe(28);
        expect(hit.y + 2).toBeLessThan(visual.y);
        const initial = await control.isChecked();
        for (const keyboard of [false, true]) {
            if (keyboard) await control.press("Space");
            else await control.click({ position: { x: hit.width / 2, y: 2 } });
            if (keyboard ? initial : !initial) await expect(control).toBeChecked();
            else await expect(control).not.toBeChecked();
            await expect(panel).toBeVisible();
            const thumb = await track.evaluate(element => {
                const style = getComputedStyle(element, "::after"), rail = getComputedStyle(element);
                const shift = style.transform === "none" ? 0 : new DOMMatrix(style.transform).m41;
                return { width: Number.parseFloat(style.width), height: Number.parseFloat(style.height),
                    left: Number.parseFloat(style.left) + shift, top: Number.parseFloat(style.top),
                    railWidth: Number.parseFloat(rail.width), railHeight: Number.parseFloat(rail.height) };
            });
            expect(thumb.width / 15).toBeCloseTo(0.8, 3);
            expect(thumb.height / 15).toBeCloseTo(0.8, 3);
            expect(thumb.left).toBeGreaterThanOrEqual(0);
            expect(thumb.top).toBeGreaterThanOrEqual(0);
            expect(thumb.left + thumb.width).toBeLessThanOrEqual(thumb.railWidth);
            expect(thumb.top + thumb.height).toBeLessThanOrEqual(thumb.railHeight);
        }
    }
});

for (const viewport of [{ width: 1030, height: 540 }, { width: 1800, height: 1000 }]) {
    for (const sample of ["PDF", "Receipt PNG"]) {
        test(`Legend switches align with their control row for ${sample} at ${viewport.width}px`, async ({ page }) => {
            await page.setViewportSize(viewport);
            await page.goto("/");
            await ready(page);
            if (sample !== "PDF") {
                await page.getByRole("button", { name: sample, exact: true }).click();
                await ready(page);
            }
            await page.getByRole("button", { name: "Highlighting legend", exact: true }).click();
            const panel = page.getByRole("dialog", { name: "Legend", exact: true });
            await expect(panel.getByRole("switch")).toHaveCount(3);
            await expect(panel.getByRole("heading", { name: "Low confidence Fields & tables", exact: true })).toBeVisible();
            const low = panel.getByRole("switch", { name: "Show low confidence highlight", exact: true });
            for (const enabled of [true, false, true]) {
                await low.setChecked(enabled);
                await expect.poll(() => panel.evaluate(element => {
                    const tracks = [...element.querySelectorAll(".cu-legend-group[data-setting]")].map(group => {
                        const anchor = (group.querySelector(".cu-legend-group-title") ??
                            group.querySelector(".cu-legend-swatch"))?.getBoundingClientRect();
                        const track = group.querySelector(".cu-switch-track")?.getBoundingClientRect();
                        if (!anchor || !track) throw new Error("The Legend control row or switch is missing.");
                        return {
                            left: track.left, right: track.right,
                            centerError: Math.abs(track.top + track.height / 2 - anchor.top - anchor.height / 2),
                        };
                    });
                    if (tracks.length !== 3) throw new Error("Expected exactly three Legend switch rows.");
                    return Math.max(
                        ...tracks.map(track => track.centerError),
                        Math.max(...tracks.map(track => track.left)) - Math.min(...tracks.map(track => track.left)),
                        Math.max(...tracks.map(track => track.right)) - Math.min(...tracks.map(track => track.right)),
                    );
                })).toBeLessThanOrEqual(1);
            }
            await expect(panel.locator('[data-setting="highlightLow"] .cu-legend-swatch')).toHaveCount(2);
            await expect(panel.locator('[data-setting="highlightLow"]').getByRole("switch")).toHaveCount(1);
            const heading = await panel.locator(".cu-legend-group-title").boundingBox();
            const firstColor = await panel.locator('[data-setting="highlightLow"] .cu-legend-swatch').first().boundingBox();
            if (!heading || !firstColor) throw new Error("The shared low-confidence section is not laid out.");
            expect(firstColor.y).toBeGreaterThanOrEqual(heading.y + heading.height);
            await expect(low).toHaveAccessibleDescription("Low-confidence field Below threshold Low-confidence table value Below threshold");
            await expect(panel.locator(".cu-legend-item button")).toHaveCount(0);
            await page.keyboard.press("Escape");
            await expect(panel).toHaveCount(0);
            await expect(page.getByRole("button", { name: "Highlighting legend", exact: true })).toBeFocused();
        });
    }
}

test("Source and Fields settings share the Settings title with distinct accessible names", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const source = page.getByRole("button", { name: "Source settings", exact: true });
    const fields = page.getByRole("button", { name: "Fields settings", exact: true });
    await expect(source).toHaveAttribute("title", "Source settings");
    await expect(fields).toHaveAttribute("title", "Fields settings");
    await source.click();
    const sourcePanel = page.getByRole("dialog", { name: "Source settings", exact: true });
    await expect(sourcePanel.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(sourcePanel.getByRole("spinbutton", { name: "Confidence threshold", exact: true })).toBeFocused();
    await sourcePanel.getByRole("button", { name: "Close source settings", exact: true }).click();
    await expect(source).toBeFocused();
    await fields.click();
    const fieldsPanel = page.getByRole("dialog", { name: "Fields settings", exact: true });
    await expect(fieldsPanel.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(fieldsPanel.getByRole("switch", { name: "Show Confidence", exact: true })).toBeFocused();
    await expect(fieldsPanel.getByRole("button", { name: "Reset Field Order", exact: true })).toBeEnabled();
    await fieldsPanel.getByRole("button", { name: "Close fields settings", exact: true }).click();
    await expect(fields).toBeFocused();
});

for (const height of [540, 1000]) {
    test(`single bottom toolbar keeps upward panels and validation usable at height ${height}`, async ({ page }) => {
        page.on("pageerror", error => { throw error; });
        await page.setViewportSize({ width: 1030, height });
        await page.goto("/");
        await ready(page);
        const toolbar = page.getByRole("group", { name: "Source document toolbar", exact: true });
        const source = page.getByRole("region", { name: "Source document", exact: true });
        const viewport = page.getByRole("group", { name: "Source viewport", exact: true });
        const settings = page.getByRole("button", { name: "Source settings", exact: true });
        const legend = page.getByRole("button", { name: "Highlighting legend", exact: true });
        await expect(toolbar).toHaveCount(1);
        await expect(toolbar).toHaveCSS("height", "44px");
        await expect(source.locator(":scope > header")).toHaveCount(0);
        const frame = await viewport.boundingBox();
        const sourceFrame = await source.boundingBox();
        if (!frame || !sourceFrame) throw new Error("The source pane is not laid out.");
        expect(frame.y).toBe(sourceFrame.y);
        expect(frame.height).toBe(sourceFrame.height - 44);
        for (const [trigger, name] of [[settings, "Source settings"], [legend, "Legend"]] as const) {
            await trigger.click();
            const panel = page.getByRole("dialog", { name, exact: true });
            const bounds = await panel.boundingBox(), bar = await toolbar.boundingBox();
            if (!bounds || !bar) throw new Error("The upward toolbar panel is unavailable.");
            expect(bounds.x).toBeGreaterThanOrEqual(sourceFrame.x);
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(sourceFrame.x + sourceFrame.width);
            expect(bounds.y).toBeGreaterThanOrEqual(sourceFrame.y);
            expect(bounds.y + bounds.height).toBeLessThanOrEqual(bar.y - 7);
            if (name === "Legend") {
                await expect(panel.locator(".cu-legend-swatch")).toHaveCount(4);
                await expect(panel.getByText("Options", { exact: true })).toHaveCount(0);
                await expect(panel.getByRole("switch")).toHaveCount(3);
                for (const control of await panel.getByRole("switch").all()) {
                    await control.focus();
                    expect(await control.evaluate(element => {
                        const rect = element.getBoundingClientRect();
                        const panel = element.closest(".cu-legend-panel")?.getBoundingClientRect();
                        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
                        return panel && rect.top >= panel.top && rect.bottom <= panel.bottom &&
                            rect.left >= panel.left && rect.right <= panel.right && hit === element;
                    })).toBe(true);
                }
            } else {
                await expect(panel.getByRole("switch")).toHaveCount(0);
                await expect(panel.getByRole("spinbutton", { name: "Confidence threshold", exact: true })).toBeFocused();
            }
            await page.keyboard.press("Escape");
            await expect(panel).toHaveCount(0);
            await expect(trigger).toBeFocused();
            expect(await viewport.boundingBox()).toEqual(frame);
        }
        const input = page.getByRole("textbox", { name: "Page number", exact: true });
        await input.fill("99");
        await input.press("Enter");
        await expect(page.getByRole("alert")).toHaveText("Enter an existing page number.");
        expect(await viewport.boundingBox()).toEqual(frame);
        await settings.click();
        const threshold = page.getByRole("spinbutton", { name: "Confidence threshold", exact: true });
        await threshold.fill("0.699");
        await expect(page.locator(".cu-setting-hint")).toHaveText("Values below 0.699 receive low-confidence highlight.");
        await threshold.fill("1.2");
        await expect(threshold).toHaveAttribute("aria-invalid", "true");
        const zoom = page.getByRole("button", { name: "Zoom in", exact: true });
        await zoom.click();
        await expect(viewport).toHaveAttribute("aria-disabled", "false");
        await expect(page.getByTestId("rendered-page")).toBeVisible();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(zoom).toBeFocused();
        await expect(page.getByRole("alert")).toHaveText("Enter an existing page number.");
        await expect(toolbar).toHaveCSS("height", "44px");
        await expect(page.getByRole("button", { name: "Clear selection", exact: true })).toHaveCount(0);
        await expect(page.locator(".cu-legend-inline")).toHaveCount(0);
    });
}
