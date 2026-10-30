import { expect, test } from "@playwright/test";
import { applyReviewFixture, fieldRow, line1Id, loadReviewFixture, openValueMenu, recipientId } from "./uiRedesignFixtures";
import { expandField, ready } from "./viewerAssertions";

declare global {
    interface Window {
        cuReviewCopies: { value: string; resolve: () => void; reject: (message: string) => void }[];
    }
}

async function clipboard(page: import("@playwright/test").Page): Promise<void> {
    await page.addInitScript(() => {
        window.cuReviewCopies = [];
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
            writeText(value: string) {
                return new Promise<void>((resolve, reject) => {
                    window.cuReviewCopies.push({ value, resolve, reject: message => reject(new Error(message)) });
                });
            },
        } });
    });
}

for (const oldFailure of [false, true]) {
    test(`UI-27 old ${oldFailure ? "failure" : "success"} cannot override newer feedback`, async ({ page }) => {
        await clipboard(page); await loadReviewFixture(page);
        await openValueMenu(page, recipientId);
        await page.getByRole("menuitem", { name: "Copy value", exact: true }).click();
        await openValueMenu(page, line1Id);
        await page.getByRole("menuitem", { name: "Copy value", exact: true }).click();
        expect(await page.evaluate(() => window.cuReviewCopies.map(copy => copy.value))).toEqual(["Microsoft Corp", "123 Other St"]);
        await page.evaluate(failed => {
            const copy = window.cuReviewCopies[1]!;
            if (failed) copy.resolve(); else copy.reject("new denied");
        }, oldFailure);
        if (oldFailure) await expect(page.getByRole("status").filter({ hasText: /^Copied$/ })).toBeVisible();
        else await expect(page.getByRole("alert")).toContainText("new denied");
        await page.evaluate(failed => {
            const copy = window.cuReviewCopies[0]!;
            if (failed) copy.reject("obsolete denied"); else copy.resolve();
        }, oldFailure);
        if (oldFailure) await expect(page.getByRole("status").filter({ hasText: /^Copied$/ })).toBeVisible();
        else await expect(page.getByRole("alert")).toContainText("new denied");
        await expect(page.getByRole("region", { name: "Full value and confidence" })).toHaveCount(0);
    });
}

for (const reset of ["clear", "same-field select", "details close", "document round-trip"] as const) {
    for (const failure of [false, true]) {
        test(`UI-30 null-state quick-copy ${failure ? "failure" : "success"} invalidated by ${reset}`, async ({ page }) => {
            await clipboard(page); await loadReviewFixture(page);
            await openValueMenu(page, recipientId);
            await page.getByRole("menuitem", { name: "Copy value", exact: true }).click();
            if (reset === "clear") await page.getByRole("group", { name: "Source viewport", exact: true }).press("Escape");
            else if (reset === "same-field select") {
                await page.locator(fieldRow(recipientId)).getByRole("button", { name: "CustomerAddressRecipient", exact: true }).click();
                await page.locator(fieldRow(recipientId)).getByRole("button", { name: "CustomerAddressRecipient", exact: true }).click();
            } else if (reset === "details close") {
                await page.locator(fieldRow(recipientId)).getByRole("button", { name: "CustomerAddressRecipient", exact: true }).press("F2");
                await page.getByRole("button", { name: "Close full value details", exact: true }).click();
            } else {
                await page.getByRole("button", { name: "Receipt PNG", exact: true }).click(); await ready(page);
                await applyReviewFixture(page);
            }
            await page.evaluate(failed => {
                const copy = window.cuReviewCopies[0]!;
                if (failed) copy.reject("obsolete denied"); else copy.resolve();
            }, failure);
            await expect(page.locator(".cu-copy-feedback")).toHaveCount(0);
            await expect(page.getByRole("region", { name: "Full value and confidence" })).toHaveCount(0);
        });
    }
}

test("UI-28 value menu exits on Tab/Shift+Tab and restores logical focus on Escape", async ({ page }) => {
    await loadReviewFixture(page);
    const name = page.locator(fieldRow(recipientId)).getByRole("button", { name: "CustomerAddressRecipient", exact: true });
    await name.press("Shift+F10");
    await page.keyboard.press("End");
    await expect(page.getByRole("menuitem", { name: "Copy value", exact: true })).toBeFocused();
    await page.keyboard.press("Home");
    await expect(page.getByRole("menuitem", { name: "Locate on page 1", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("menu", { name: "Value actions" })).toHaveCount(0);
    await name.press("Shift+F10"); await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("menu", { name: "Value actions" })).toHaveCount(0);
    await name.press("Shift+F10"); await page.keyboard.press("Escape");
    await expect(name).toBeFocused();
    await expect(page.getByRole("menu", { name: "Value actions" })).toHaveCount(0);
    await openValueMenu(page, recipientId);
    await page.locator(fieldRow(recipientId)).getByRole("button", { name: /More value actions/ }).click();
    await expect(page.getByRole("menu", { name: "Value actions" })).toHaveCount(0);
});

test("UI-04/05 highlighting validation and category precedence preserve real source pixels", async ({ page }) => {
    await loadReviewFixture(page);
    const canvas = page.getByTestId("source-canvas");
    const pixels = await canvas.evaluate(element => {
        if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected a real source canvas.");
        return element.toDataURL();
    });
    await page.getByRole("button", { name: "Highlighting settings", exact: true }).click();
    const threshold = page.getByRole("spinbutton", { name: "Confidence threshold", exact: true });
    await threshold.fill("");
    await expect(page.getByRole("alert")).toContainText("Enter a confidence threshold");
    await expect(page.getByTestId("result-overlay").locator('[data-outline-id="/contents/0/fields/Boundary"]')).toHaveAttribute("fill", "#FCE8E6");
    await threshold.fill("0");
    await expect(page.getByTestId("result-overlay").locator('[data-outline-id="/contents/0/fields/Zero"]')).toHaveAttribute("fill", "#E8F5E9");
    await threshold.fill("0.70");
    await page.getByRole("switch", { name: "Show field highlights", exact: true }).uncheck();
    await page.getByRole("switch", { name: "Show low confidence highlight", exact: true }).uncheck();
    await page.getByRole("switch", { name: "Show low confidence highlight", exact: true }).check();
    await expect(page.getByTestId("result-overlay").locator('[data-outline-id="/contents/0/fields/Zero"]')).toHaveAttribute("fill", "none");
    await page.getByRole("button", { name: "Close highlighting settings", exact: true }).click();
    await page.getByRole("button", { name: "Zero", exact: true }).click();
    await expect(page.getByTestId("source-overlay")).toBeVisible();
    expect(await canvas.evaluate(element => {
        if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected the original source canvas.");
        return element.toDataURL();
    })).toBe(pixels);
    await expect(page.getByTestId("word-overlay")).toHaveCount(0);
});

test("UI-45 Microsoft Services uses the default value text while its confidence stays low", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const id = "/contents/0/fields/ServiceAddressRecipient";
    const row = page.locator(`.cu-fields-table > tbody > tr${fieldRow(id)}`);
    const before = await row.locator(".cu-value-chip").evaluate(element => ({
        color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor,
    }));
    const source = page.getByTestId("result-overlay").locator(`[data-outline-id="${id}"]`);
    await expect(source).toHaveAttribute("fill", "#FCE8E6");
    await row.locator(".cu-field-name").click();
    const popup = page.getByRole("tooltip", { name: "Field preview", exact: true });
    await expect(popup.locator(".cu-flyover-value dd")).toHaveText("Microsoft Services");
    await expect(popup.locator(".cu-flyover-value dd")).toHaveCSS("color", "rgb(30, 58, 42)");
    await expect(popup.locator(".cu-flyover-value dd")).toHaveCSS("font-size", "14px");
    await expect(popup.locator(".cu-flyover-value dd")).toHaveCSS("font-weight", "600");
    await expect(popup.locator(".cu-flyover-confidence dd")).toHaveText("0.31");
    await expect(popup.locator(".cu-flyover-confidence dd")).toHaveCSS("color", "rgb(155, 28, 28)");
    await expect(popup.locator(".cu-flyover-confidence")).toHaveCSS("background-color", "rgb(252, 232, 230)");
    await expect(popup.locator(".cu-flyover-confidence dd")).toHaveCSS("font-size", "11px");
    expect(await row.locator(".cu-value-chip").evaluate(element => ({
        color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor,
    }))).toEqual(before);
    await expect(source).toHaveAttribute("fill", "#FCE8E6");
});

test("UI-45 low, normal, unknown and array values share one text color without changing badge colors", async ({ page }) => {
    await loadReviewFixture(page);
    await expandField(page, "LineItems");
    for (const [id, inline, color, background] of [
        ["/contents/0/fields/InvoiceId", false, "rgb(30, 58, 42)", "rgb(232, 245, 233)"],
        [recipientId, false, "rgb(155, 28, 28)", "rgb(252, 232, 230)"],
        ["/contents/0/fields/Unknown", false, "rgb(55, 65, 81)", "rgb(241, 243, 245)"],
        ["/contents/0/fields/LineItems/valueArray/0/valueObject/Column1", true, "rgb(155, 28, 28)", "rgb(255, 232, 236)"],
        ["/contents/0/fields/LineItems/valueArray/0/valueObject/Column2", true, "rgb(30, 64, 175)", "rgb(232, 241, 255)"],
    ] as const) {
        await page.locator(fieldRow(id)).locator(inline ? ".cu-cell-value" : ".cu-field-name").click();
        const popup = page.getByRole("tooltip", { name: "Field preview", exact: true });
        await expect(popup.locator(".cu-flyover-value dd")).toHaveCSS("color", "rgb(30, 58, 42)");
        await expect(popup.locator(".cu-flyover-confidence dd")).toHaveCSS("color", color);
        await expect(popup.locator(".cu-flyover-confidence")).toHaveCSS("background-color", background);
    }
});

test("UI-45 confidence threshold and highlight changes never recolor the value text", async ({ page }) => {
    await loadReviewFixture(page);
    await page.locator(fieldRow(recipientId)).locator(".cu-field-name").click();
    const popup = page.getByRole("tooltip", { name: "Field preview", exact: true });
    await expect(popup.locator(".cu-flyover-value dd")).toHaveCSS("color", "rgb(30, 58, 42)");
    await expect(popup.locator(".cu-flyover-confidence dd")).toHaveCSS("color", "rgb(155, 28, 28)");
    await page.getByRole("button", { name: "Highlighting settings", exact: true }).click();
    await page.getByRole("spinbutton", { name: "Confidence threshold", exact: true }).fill("0.20");
    await page.getByRole("button", { name: "Close highlighting settings", exact: true }).click();
    await expect(popup.locator(".cu-flyover-value dd")).toHaveCSS("color", "rgb(30, 58, 42)");
    await expect(popup.locator(".cu-flyover-confidence dd")).toHaveCSS("color", "rgb(30, 58, 42)");
    await page.getByRole("button", { name: "Highlighting settings", exact: true }).click();
    await page.getByRole("spinbutton", { name: "Confidence threshold", exact: true }).fill("0.70");
    await page.getByRole("button", { name: "Close highlighting settings", exact: true }).click();
    await expect(popup.locator(".cu-flyover-confidence dd")).toHaveCSS("color", "rgb(155, 28, 28)");
    await page.getByRole("button", { name: "Highlighting settings", exact: true }).click();
    await page.getByRole("switch", { name: "Show low confidence highlight", exact: true }).uncheck();
    await page.getByRole("button", { name: "Close highlighting settings", exact: true }).click();
    await expect(popup.locator(".cu-flyover-value dd")).toHaveCSS("color", "rgb(30, 58, 42)");
    await expect(popup.locator(".cu-flyover-confidence dd")).toHaveCSS("color", "rgb(30, 58, 42)");
});
