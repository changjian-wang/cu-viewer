import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { openFieldsSettings, ready } from "./viewerAssertions";

const host = `/@fs/${resolve("tests", "e2e", "source-inputs.html").replaceAll("\\", "/")}`;

test("labeled Fields honor saved host order, emit changes and retain them across viewer sessions", async ({ page }) => {
    await page.goto(host);
    await page.getByRole("checkbox", { name: "Controlled field order", exact: true }).check();
    await page.getByRole("checkbox", { name: "Include PDF labels", exact: true }).check();
    await page.getByRole("button", { name: "Load PDF", exact: true }).click();
    const viewer = page.locator(".cu-viewer");
    const roots = viewer.locator('.cu-fields-table > tbody > tr[aria-level="1"]');
    await expect(roots.first()).toHaveAttribute("data-comparison-path", "/InvoiceId");
    await viewer.getByRole("button", { name: "InvoiceId", exact: true }).press("Alt+ArrowDown");
    await expect(page.getByTestId("host-field-order")).toContainText('"changes":1');
    await expect(roots.first()).toHaveAttribute("data-comparison-path", "/CustomerName");
    await page.getByRole("button", { name: "Unmount viewer", exact: true }).click();
    await page.getByRole("button", { name: "Mount viewer", exact: true }).click();
    await expect(roots.first()).toHaveAttribute("data-comparison-path", "/CustomerName");
    await page.getByRole("checkbox", { name: "Handle order changes", exact: true }).uncheck();
    await viewer.getByRole("button", { name: "CustomerName", exact: true }).press("Alt+ArrowDown");
    await expect(page.getByTestId("host-field-order")).toContainText('"changes":1');
    const readOnly = await openFieldsSettings(viewer);
    await expect(readOnly.getByRole("button", { name: "Reset Field Order", exact: true })).toBeDisabled();
    await page.getByRole("checkbox", { name: "Handle order changes", exact: true }).check();
    const settings = await openFieldsSettings(viewer);
    await settings.getByRole("button", { name: "Reset Field Order", exact: true }).click();
    await expect(page.getByTestId("host-field-order")).toContainText('"changes":2');
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("cu-viewer:review:v1:")))).toEqual([]);
    await page.getByRole("button", { name: "Inspect caller data", exact: true }).click();
    await expect(page.getByTestId("caller-result-unchanged")).toHaveText("true");
});

test("CLI label comparison saves real invoice order to the host and restores it after reload", async ({ page }) => {
    const fixture = (name: string) => readFileSync(resolve("tests", "fixtures", "labels", name));
    const result: unknown = JSON.parse(fixture("invoice.pdf.result.json").toString("utf8"));
    const labels: unknown = JSON.parse(fixture("invoice.pdf.labels.json").toString("utf8"));
    let saved: unknown = { $root: ["/VendorAddress", "/CustomerAddress"] };
    let writes = 0;
    await page.route("**/frontend/app/session.json", route => route.fulfill({ json: {
        source: "./source/invoice.pdf", name: "invoice.pdf", result, labels, fieldOrderUrl: "./field-order",
    } }));
    await page.route("**/frontend/app/source/invoice.pdf", route => route.fulfill({
        contentType: "application/pdf", body: fixture("invoice.pdf"),
    }));
    await page.route("**/frontend/app/field-order", async route => {
        if (route.request().method() === "PUT") {
            saved = route.request().postDataJSON();
            writes++;
            await route.fulfill({ status: 204 });
        } else {
            expect(route.request().method()).toBe("GET");
            await route.fulfill({ json: saved });
        }
    });
    await page.goto(`/@fs/${resolve("frontend", "app", "index.html").replaceAll("\\", "/")}`);
    await ready(page);
    const roots = page.locator('.cu-fields-table > tbody > tr[aria-level="1"]');
    await expect(roots.first()).toHaveAttribute("data-comparison-path", "/VendorAddress");
    expect(writes).toBe(0);
    const customer = page.locator('tr[data-comparison-path="/CustomerAddress"]');
    const vendor = page.locator('tr[data-comparison-path="/VendorAddress"]');
    await customer.hover();
    await customer.getByRole("button", { name: "Reorder CustomerAddress", exact: true }).dragTo(vendor, {
        targetPosition: { x: 48, y: 1 },
    });
    await expect.poll(() => writes).toBe(1);
    await expect(roots.first()).toHaveAttribute("data-comparison-path", "/CustomerAddress");
    expect(saved).toEqual({ $root: await roots.evaluateAll(rows => rows.map(row => row.getAttribute("data-comparison-path"))) });
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await ready(page);
    await expect(roots.first()).toHaveAttribute("data-comparison-path", "/CustomerAddress");
    expect(writes).toBe(1);
    const settings = await openFieldsSettings(page);
    await settings.getByRole("button", { name: "Reset Field Order", exact: true }).click();
    await expect.poll(() => writes).toBe(2);
    expect(saved).toEqual({});
    await page.reload();
    await ready(page);
    await expect(roots.first()).toHaveAttribute("data-comparison-path", "/AmountDue");
    expect(writes).toBe(2);
});

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
