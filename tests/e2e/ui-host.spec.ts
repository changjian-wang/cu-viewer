import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { openFieldsSettings } from "./viewerAssertions";

const host = `/@fs/${resolve("tests", "e2e", "source-inputs.html").replaceAll("\\", "/")}`;

test("UI6 controlled order renders host changes, is read-only without a handler and preserves caller JSON", async ({ page }) => {
    await page.goto(host);
    await page.getByRole("checkbox", { name: "Controlled field order", exact: true }).check();
    await page.getByRole("button", { name: "Load PDF", exact: true }).click();
    const viewer = page.locator(".cu-viewer");
    await expect(viewer.getByRole("button", { name: "Zoom in", exact: true })).toBeEnabled({ timeout: 15000 });
    const roots = viewer.locator('.cu-fields-table > tbody > tr[data-field-depth="0"]');
    await expect(roots.first()).toHaveAttribute("data-field-id", "/contents/0/fields/InvoiceId");
    const position = viewer.locator(".cu-field-navigation > span");
    const selected = viewer.getByRole("button", { name: "InvoiceId", exact: true });
    await expect(position).toHaveText("— / 77 fields");
    await selected.click();
    await expect(position).toHaveText("1 / 77 fields");
    await viewer.getByRole("button", { name: "InvoiceId", exact: true }).press("Alt+ArrowDown");
    await expect(roots.first()).toHaveAttribute("data-field-id", "/contents/0/fields/CustomerName");
    await expect(position).toHaveText("2 / 77 fields");
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("host-field-order")).toContainText('"changes":1');
    await page.getByRole("checkbox", { name: "Handle order changes", exact: true }).uncheck();
    await viewer.getByRole("button", { name: "InvoiceId", exact: true }).press("Alt+ArrowUp");
    await expect(roots.first()).toHaveAttribute("data-field-id", "/contents/0/fields/CustomerName");
    await expect(position).toHaveText("2 / 77 fields");
    await expect(page.getByTestId("host-field-order")).toContainText('"changes":1');
    const readOnlySettings = await openFieldsSettings(viewer);
    await expect(readOnlySettings.getByRole("button", { name: "Reset Field Order", exact: true })).toBeDisabled();
    await expect(readOnlySettings.getByRole("button", { name: "Reset Field Order", exact: true }))
        .toHaveAttribute("title", /Field order is read-only/);
    await page.getByRole("checkbox", { name: "Handle order changes", exact: true }).check();
    const settings = await openFieldsSettings(viewer);
    await settings.getByRole("button", { name: "Reset Field Order", exact: true }).click();
    await settings.getByRole("button", { name: "Close fields settings", exact: true }).click();
    await expect(position).toHaveText("15 / 77 fields");
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("host-field-order")).toContainText('"changes":2');
    await viewer.getByRole("button", { name: "Next field", exact: true }).click();
    await expect(position).toHaveText("16 / 77 fields");
    await viewer.getByRole("button", { name: "Previous field", exact: true }).click();
    await expect(position).toHaveText("15 / 77 fields");
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Inspect caller data", exact: true }).click();
    await expect(page.getByTestId("caller-result-unchanged")).toHaveText("true");
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("cu-viewer:review:v1:")))).toEqual([]);
});

test("UI6 two embedded viewers have unique IDs and isolated menus, pins, focus and clear intents", async ({ page }) => {
    await page.goto(host);
    await page.getByRole("combobox", { name: "Source input", exact: true }).selectOption("ArrayBuffer");
    await page.getByRole("checkbox", { name: "Show second viewer", exact: true }).check();
    await page.getByRole("button", { name: "Load PDF", exact: true }).click();
    const first = page.locator(".cu-viewer").nth(0), second = page.locator(".cu-viewer").nth(1);
    await expect(first.getByRole("button", { name: "Zoom in", exact: true })).toBeEnabled({ timeout: 15000 });
    await expect(second.getByRole("button", { name: "Zoom in", exact: true })).toBeEnabled({ timeout: 15000 });
    await first.getByRole("button", { name: "InvoiceId", exact: true }).click();
    await second.getByRole("button", { name: "BillingAddress", exact: true }).click();
    await first.getByRole("button", { name: "InvoiceId", exact: true }).press("Shift+F10");
    await page.keyboard.press("Escape");
    await expect(first.getByTestId("source-overlay")).toBeVisible();
    await expect(second.getByTestId("source-overlay")).toBeVisible();
    await second.getByRole("button", { name: "BillingAddress", exact: true }).press("Escape");
    await expect(second.getByTestId("source-overlay")).toHaveCount(0);
    await expect(first.getByTestId("source-overlay")).toBeVisible();
    expect(await page.locator("[id]").evaluateAll(elements => {
        const ids = elements.map(element => element.id);
        return ids.length - new Set(ids).size;
    })).toBe(0);
    await page.getByRole("button", { name: "Inspect caller data", exact: true }).click();
    await expect(page.getByTestId("caller-result-unchanged")).toHaveText("true");
});

test("bulk object actions preserve controlled order and independent manual table state", async ({ page }) => {
    await page.goto(host);
    await page.getByRole("checkbox", { name: "Controlled field order", exact: true }).check();
    await page.getByRole("button", { name: "Load PDF", exact: true }).click();
    const viewer = page.locator(".cu-viewer");
    await expect(viewer.getByRole("button", { name: "Zoom in", exact: true })).toBeEnabled({ timeout: 15000 });
    const amount = viewer.getByRole("button", { name: "AmountDue", exact: true });
    const table = viewer.getByRole("button", { name: "LineItems", exact: true });
    await expect(amount).toHaveAttribute("aria-expanded", "false");
    await expect(table).toHaveAttribute("aria-expanded", "true");
    await viewer.getByRole("button", { name: "Collapse LineItems", exact: true }).click();
    let settings = await openFieldsSettings(viewer);
    for (let repeat = 0; repeat < 2; repeat++) {
        await settings.getByRole("button", { name: "Expand all object values", exact: true }).click();
        await expect(amount).toHaveAttribute("aria-expanded", "true");
        await expect(table).toHaveAttribute("aria-expanded", "false");
        await settings.getByRole("button", { name: "Collapse all object fields", exact: true }).click();
        await expect(amount).toHaveAttribute("aria-expanded", "false");
        await expect(table).toHaveAttribute("aria-expanded", "false");
    }
    await expect(page.getByTestId("host-field-order")).toContainText('"changes":0');
    await page.getByRole("checkbox", { name: "Handle order changes", exact: true }).uncheck();
    settings = await openFieldsSettings(viewer);
    await expect(settings.getByRole("button", { name: "Reset Field Order", exact: true })).toBeDisabled();
    await expect(settings.getByRole("button", { name: "Expand all object values", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Inspect caller data", exact: true }).click();
    await expect(page.getByTestId("caller-result-unchanged")).toHaveText("true");
});
