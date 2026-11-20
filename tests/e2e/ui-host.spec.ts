import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { inspectJson } from "../../frontend/src/model/resultLimits";
import { expandField, openFieldsSettings, ready } from "./viewerAssertions";

const host = `/@fs/${resolve("tests", "e2e", "source-inputs.html").replaceAll("\\", "/")}`;
const cli = `/@fs/${resolve("frontend", "app", "index.html").replaceAll("\\", "/")}`;
const fixture = (name: string) => readFileSync(resolve("tests", "fixtures", "labels", name));
const text = (valueString: string) => ({ type: "string", valueString });
const roots = (page: Page) => page.locator('.cu-fields-table > tbody > tr[aria-level="1"]');

async function openCli(page: Page, result: unknown, labels: unknown, initialOrder: unknown) {
    let order = initialOrder;
    const writes: unknown[] = [];
    await page.route("**/frontend/app/session.json", route => route.fulfill({ json: {
        source: "./source/invoice.pdf", name: "invoice.pdf", result, labels, fieldOrderUrl: "./field-order",
    } }));
    await page.route("**/frontend/app/source/invoice.pdf", route => route.fulfill({
        contentType: "application/pdf", body: fixture("invoice.pdf"),
    }));
    await page.route("**/frontend/app/field-order", async route => {
        if (route.request().method() === "PUT") {
            order = route.request().postDataJSON();
            writes.push(order);
            await route.fulfill({ status: 204 });
        } else {
            expect(route.request().method()).toBe("GET");
            await route.fulfill({ json: order });
        }
    });
    await page.goto(cli);
    return writes;
}

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
    const result: unknown = JSON.parse(fixture("invoice.pdf.result.json").toString("utf8"));
    const labels: unknown = JSON.parse(fixture("invoice.pdf.labels.json").toString("utf8"));
    const writes = await openCli(page, result, labels, { $root: ["/VendorAddress", "/CustomerAddress"] });
    await ready(page);
    await expect(roots(page).first()).toHaveAttribute("data-comparison-path", "/VendorAddress");
    expect(writes).toHaveLength(0);
    const customer = page.locator('tr[data-comparison-path="/CustomerAddress"]');
    const vendor = page.locator('tr[data-comparison-path="/VendorAddress"]');
    await customer.hover();
    await customer.getByRole("button", { name: "Reorder CustomerAddress", exact: true }).dragTo(vendor, {
        targetPosition: { x: 48, y: 1 },
    });
    await expect.poll(() => writes.length).toBe(1);
    await expect(roots(page).first()).toHaveAttribute("data-comparison-path", "/CustomerAddress");
    expect(writes[0]).toEqual({ $root: await roots(page).evaluateAll(rows => rows.map(row => row.getAttribute("data-comparison-path"))) });
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await ready(page);
    await expect(roots(page).first()).toHaveAttribute("data-comparison-path", "/CustomerAddress");
    expect(writes).toHaveLength(1);
    const settings = await openFieldsSettings(page);
    await settings.getByRole("button", { name: "Reset Field Order", exact: true }).click();
    await expect.poll(() => writes.length).toBe(2);
    expect(writes[1]).toEqual({});
    await page.reload();
    await ready(page);
    await expect(roots(page).first()).toHaveAttribute("data-comparison-path", "/AmountDue");
    expect(writes).toHaveLength(2);
});

test("CLI restores and saves field order when valid labels exceed the synchronous JSON budget", async ({ page }) => {
    const result = { apiVersion: "2025-11-01", contents: [{ kind: "document", fields: { A: text("A"), B: text("B") } }] };
    const labels = { fieldLabels: {
        A: text("A"),
        LabelOnly: text("Label only"),
        Rows: { type: "array", valueArray: Array.from({ length: 2400 }, () => ({
            type: "object", valueObject: { Item: text("A"), Qty: { type: "number", valueNumber: 1 } },
        })) },
    } };
    expect(Buffer.byteLength(JSON.stringify(labels))).toBeLessThan(500_000);
    expect(inspectJson(labels).status).toBe("limit");
    const writes = await openCli(page, result, labels, { $root: ["/B", "/LabelOnly", "/A"] });
    await expect(roots(page).first()).toHaveAttribute("data-comparison-path", "/B");
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(writes).toHaveLength(0);
    await page.getByRole("button", { name: "LabelOnly", exact: true }).press("Alt+ArrowUp");
    await expect.poll(() => writes.at(0)).toEqual({ $root: ["/LabelOnly", "/B", "/A", "/Rows"] });
    await page.reload();
    await expect(roots(page).first()).toHaveAttribute("data-comparison-path", "/LabelOnly");
    expect(writes).toHaveLength(1);
});

test("CLI projects saved order per content and retains label-only and object order when saving another content", async ({ page }) => {
    const result = { apiVersion: "2025-11-01", contents: [
        { kind: "document", fields: { A: text("A"), Group: {
            type: "object", valueObject: { Left: text("left"), Right: text("right") },
        }, B: text("B") } },
        { kind: "document", fields: { A: text("A"), Group: text("now scalar"), B: text("B") } },
    ] };
    const labels = { fieldLabels: { LabelOnly: text("Label only"), Group: {
        type: "object", valueObject: { Left: text("left"), LabelChild: text("Label child"), Right: text("right") },
    } } };
    const saved = {
        $root: ["/LabelOnly", "/A", "/Group", "/B"],
        "/Group": ["/Group/Right", "/Group/LabelChild", "/Group/Left"],
    };
    const writes = await openCli(page, result, labels, saved);
    const groupChildren = page.locator('tr[data-comparison-path^="/Group/"]');
    const content = page.getByRole("combobox", { name: "Result content", exact: true });
    await expandField(page, "Group");
    await expect(groupChildren.first()).toHaveAttribute("data-comparison-path", "/Group/Right");
    expect(writes).toHaveLength(0);
    await page.getByRole("button", { name: "LabelChild", exact: true }).press("Alt+ArrowUp");
    const updatedGroup = ["/Group/LabelChild", "/Group/Right", "/Group/Left"];
    await expect.poll(() => writes.at(0)).toEqual({ ...saved, "/Group": updatedGroup });

    await content.selectOption("1");
    await expect(page.getByRole("button", { name: "B", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "B", exact: true }).press("Alt+ArrowUp");
    await expect.poll(() => writes.at(1)).toEqual({ $root: ["/LabelOnly", "/A", "/B", "/Group"], "/Group": updatedGroup });
    await page.reload();
    await expect(roots(page).first()).toHaveAttribute("data-comparison-path", "/LabelOnly");
    await expect(roots(page).nth(2)).toHaveAttribute("data-comparison-path", "/B");
    await expandField(page, "Group");
    await expect(groupChildren.first()).toHaveAttribute("data-comparison-path", "/Group/LabelChild");
    expect(writes).toHaveLength(2);
});

test("CLI keeps extracted Fields order writable when adjacent labels fail typed-value validation", async ({ page }) => {
    const result = { apiVersion: "2025-11-01", contents: [{ kind: "document", fields: { A: text("A"), B: text("B") } }] };
    const labels = { fieldLabels: { A: { type: "string", valueNumber: 123 } } };
    const writes = await openCli(page, result, labels, { $root: ["/B", "/A"] });
    await expect(page.getByRole("alert").filter({ hasText: "Labels could not be read" })).toBeVisible();
    const extracted = page.locator('tr[data-field-depth="0"]');
    await expect(extracted.first()).toHaveAttribute("data-field-id", "/contents/0/fields/B");
    await page.getByRole("button", { name: "A", exact: true }).press("Alt+ArrowUp");
    await expect.poll(() => writes.at(0)).toEqual({ $root: ["/A", "/B"] });
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
    await expect(position).toHaveText("— / 73 fields");
    await selected.click();
    await expect(position).toHaveText("1 / 73 fields");
    await viewer.getByRole("button", { name: "InvoiceId", exact: true }).press("Alt+ArrowDown");
    await expect(roots.first()).toHaveAttribute("data-field-id", "/contents/0/fields/CustomerName");
    await expect(position).toHaveText("2 / 73 fields");
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("host-field-order")).toContainText('"changes":1');
    await page.getByRole("checkbox", { name: "Handle order changes", exact: true }).uncheck();
    await viewer.getByRole("button", { name: "InvoiceId", exact: true }).press("Alt+ArrowUp");
    await expect(roots.first()).toHaveAttribute("data-field-id", "/contents/0/fields/CustomerName");
    await expect(position).toHaveText("2 / 73 fields");
    await expect(page.getByTestId("host-field-order")).toContainText('"changes":1');
    const readOnlySettings = await openFieldsSettings(viewer);
    await expect(readOnlySettings.getByRole("switch", { name: "Use Customized Field Order", exact: true })).toHaveCount(0);
    await expect(readOnlySettings.getByRole("button", { name: "Reset Field Order", exact: true })).toBeDisabled();
    await expect(readOnlySettings.getByRole("button", { name: "Reset Field Order", exact: true }))
        .toHaveAttribute("title", /Field order is read-only/);
    await page.getByRole("checkbox", { name: "Handle order changes", exact: true }).check();
    const settings = await openFieldsSettings(viewer);
    await settings.getByRole("button", { name: "Reset Field Order", exact: true }).click();
    await settings.getByRole("button", { name: "Close fields settings", exact: true }).click();
    await expect(position).toHaveText("13 / 73 fields");
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("host-field-order")).toContainText('"changes":2');
    await viewer.getByRole("button", { name: "Next field", exact: true }).click();
    await expect(position).toHaveText("14 / 73 fields");
    await viewer.getByRole("button", { name: "Previous field", exact: true }).click();
    await expect(position).toHaveText("13 / 73 fields");
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
