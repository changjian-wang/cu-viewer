import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { contrast, ready } from "./viewerAssertions";

const pdf = resolve("tests", "fixtures", "labels", "invoice.pdf");
const text = (value: string, source = "D(1,1,1,1,0.2)") => ({ type: "string", valueString: value, source });
const item = (code: string, amount: number) => ({ type: "object", valueObject: {
    Code: text(code), Amount: { type: "number", valueNumber: amount, source: "D(1,1,3,1,0.2)" },
} });
const labels = { fieldLabels: {
    Equal: text("Exact"), Different: text("John"), Missing: text("Expected"),
    Zero: { type: "number", valueNumber: 0 }, Null: { type: "string", valueString: null }, BothMissing: { type: "string" },
    Group: { type: "object", valueObject: { Child: text("Label child") } },
    Items: { type: "array", valueArray: [item("A", 0), item("B", 1), item("C", 2)] },
} };
const extracted = {
    Equal: { ...text("Exact", "D(1,3,1,1,0.2)"), confidence: 0.4 },
    Different: text("john"), Extra: text("Unexpected"),
    Zero: { type: "number", valueNumber: 0 }, Null: { type: "string", valueString: null }, BothMissing: { type: "string" },
    Group: { type: "object", valueObject: { Child: text("Extracted child") } },
    Items: { type: "array", valueArray: [item("A", 0), item("B", 1), item("C", 30)] },
};
const result = (fields?: unknown) => ({ apiVersion: "2025-11-01", contents: [{
    kind: "document", unit: "inch", pages: [{ pageNumber: 1, width: 8.5, height: 11 }],
    ...(fields === undefined ? {} : { fields }),
}] });

async function upload(page: Page, selector: string, value: unknown, name: string) {
    await page.getByLabel(selector, { exact: true }).setInputFiles({
        name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)),
    });
}
async function reference(page: Page) {
    await page.goto("/");
    await ready(page);
    await page.getByLabel("Choose source file", { exact: true }).setInputFiles(pdf);
    await ready(page);
    await upload(page, "Choose local label JSON", labels, "comparison-test.pdf.labels.json");
    await page.getByRole("tab", { name: "Fields", exact: true }).click();
    await expect(page.getByRole("columnheader", { name: "Label Value", exact: true })).toBeVisible();
    return page.getByRole("region", { name: "Extraction results", exact: true });
}

async function expectFixedIndexHeaders(scrollers: Locator, count: number) {
    await expect.poll(() => scrollers.evaluateAll(elements => elements.map(element => {
        const header = element.querySelector("thead th:first-child");
        if (!header) throw new Error("The comparison array index header is unavailable.");
        const corner = header.getBoundingClientRect(), viewport = element.getBoundingClientRect();
        return {
            left: Math.abs(corner.left - viewport.left) < 1,
            top: Math.abs(corner.top - viewport.top) < 1,
            painted: header.ownerDocument.elementFromPoint(corner.left + corner.width / 2, corner.top + corner.height / 2)
                ?.closest("th")?.textContent,
        };
    }))).toEqual(Array.from({ length: count }, () => ({ left: true, top: true, painted: "#" })));
}

test("the built-in invoice loads its unchanged real result and keeps the reference layout usable at narrow widths", async ({ page }) => {
    const savedResponse = page.waitForResponse(response => response.url().includes("invoice.pdf.result") &&
        (response.headers()["content-type"] ?? "").includes("application/json"));
    await page.goto("/?sample=labels");
    const response = await savedResponse;
    expect(createHash("sha256").update(await response.body()).digest("hex")).toBe(
        createHash("sha256").update(readFileSync(resolve("tests", "fixtures", "labels", "invoice.pdf.result.json"))).digest("hex"),
    );
    await ready(page);
    const pane = page.getByRole("region", { name: "Extraction results", exact: true });
    await expect(pane.locator(".cu-comparison-fields > thead th")).toHaveText(["Field Name", "Label Value", "Extracted Value"]);
    await expect(pane.getByRole("button", { name: "Show matching fields (42 values)", exact: true })).toBeVisible();
    await expect(pane.getByRole("button", { name: "Show incorrect fields (0 values)", exact: true })).toBeVisible();
    expect(await pane.locator('[data-comparison-path="/InvoiceNumber"]').evaluate(row => row.getBoundingClientRect().height))
        .toBeLessThanOrEqual(28);
    const dates = pane.getByRole("table", { name: "LineItems label values", exact: true }).locator("tbody tr").first().locator("td").first();
    expect(await dates.getByRole("button", { name: /Select label value/ }).evaluate(button =>
        button.scrollWidth <= button.clientWidth)).toBe(true);
    for (const width of [1440, 1030]) {
        await page.setViewportSize({ width, height: 1000 });
        const footer = pane.getByRole("group", { name: "Fields toolbar", exact: true });
        const layout = await footer.evaluate(element => ({
            height: element.getBoundingClientRect().height, overflow: element.scrollWidth - element.clientWidth,
        }));
        expect(layout.height).toBe(44);
        expect(layout.overflow).toBe(0);
        await expect(page.getByRole("button", { name: "Highlighting legend", exact: true }).locator("svg")).toBeVisible();
    }
    await page.getByRole("button", { name: "PDF", exact: true }).click();
    await ready(page);
    await expect(pane.locator(".cu-comparison-filters")).toHaveCount(0);
    await expect(pane.getByRole("columnheader", { name: "Value", exact: true })).toBeVisible();
});

test("unified Fields compares typed leaves, preserves both sources and filters complete arrays", async ({ page }) => {
    const pane = await reference(page);
    await expect(pane.getByRole("tab", { name: "Label", exact: true })).toHaveCount(0);
    await expect(pane.getByRole("columnheader", { name: "Extracted Value", exact: true })).toHaveCount(0);
    await upload(page, "Choose saved Analyze JSON", result(extracted), "comparison-test.pdf.result.json");
    await expect(pane.getByRole("treegrid", { name: "Compared fields", exact: true })).toBeVisible();
    await expect(pane.locator(".cu-comparison-fields > thead th")).toHaveText(["Field Name", "Label Value", "Extracted Value"]);
    await expect(pane.getByRole("button", { name: "Show matching fields (8 values)", exact: true })).toBeVisible();
    await expect(pane.getByRole("button", { name: "Show incorrect fields (5 values)", exact: true })).toBeVisible();
    const toolbar = pane.getByRole("group", { name: "Fields toolbar", exact: true });
    const footerLayout = await toolbar.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return { height: bounds.height, overflow: element.scrollWidth - element.clientWidth,
            children: [...element.children].filter(child => child instanceof HTMLElement && !child.matches("[role='dialog']"))
                .map(child => { const rect = child.getBoundingClientRect(); return { top: rect.top - bounds.top, bottom: rect.bottom - bounds.top }; }) };
    });
    expect(footerLayout.height).toBe(44);
    expect(footerLayout.overflow).toBeLessThanOrEqual(1);
    for (const child of footerLayout.children) {
        expect(child.top).toBeGreaterThanOrEqual(0);
        expect(child.bottom).toBeLessThanOrEqual(44);
    }
    const equal = pane.getByRole("button", { name: "Select extracted value of Equal", exact: true });
    await expect(equal.locator("..")).toHaveCSS("background-color", "rgb(220, 251, 215)");
    await expect(equal.locator("..")).toHaveCSS("box-shadow", /180, 60, 75/);
    await expect(pane.locator('[data-comparison-path="/Missing"] td').nth(2).getByLabel("Not extracted", { exact: true })).toHaveText("\u2014");
    await expect(pane.locator('[data-comparison-path="/Missing"] > td').nth(2).locator(".cu-comparison-value"))
        .toHaveCSS("background-color", "rgb(248, 192, 200)");
    await expect(page.getByTestId("result-overlay").locator('[data-outline-id="/labels/fields/Missing"]'))
        .toHaveAttribute("fill", "#F8C0C8");
    await expect(page.getByTestId("result-overlay").locator('[data-outline-id="/contents/0/fields/Missing"]')).toHaveCount(0);

    await pane.getByRole("button", { name: "Select label value of Equal", exact: true }).click();
    const frame = page.getByTestId("source-overlay").locator("polygon").first();
    await expect(frame).toHaveAttribute("data-source-id", "/labels/fields/Equal");
    const labelPoints = await frame.getAttribute("points");
    await equal.click();
    await expect(frame).toHaveAttribute("data-source-id", "/contents/0/fields/Equal");
    expect(await frame.getAttribute("points")).not.toBe(labelPoints);
    await expect(page.getByRole("tooltip", { name: "Field preview", exact: true })).toBeVisible();
    await equal.hover();
    const flyout = page.getByRole("tooltip", { name: "Field preview", exact: true });
    await expect(flyout).toContainText("Label Value");
    await expect(flyout).toContainText("Extracted Value");
    await expect(flyout).toContainText("0.40");
    await expect(flyout.locator(".cu-popover-heading")).toHaveCSS("background-color", "rgb(220, 251, 215)");
    expect(await flyout.evaluate(element => getComputedStyle(element, "::before").backgroundColor)).toBe("rgb(220, 251, 215)");
    await expect(flyout.locator(".cu-flyover-comparison")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(flyout.locator('[data-comparison-side="extracted"] .cu-flyover-confidence')).toHaveText("0.40");
    await expect(flyout.locator('[data-comparison-side="label"] .cu-flyover-comparison-value')).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const previewRows = await flyout.locator("[data-comparison-side]").evaluateAll(rows => rows.map(row => {
        const bounds = row.getBoundingClientRect();
        return { x: bounds.x, y: bounds.y, bottom: bounds.bottom,
            valueWidth: row.querySelector(".cu-flyover-comparison-value")!.getBoundingClientRect().width };
    }));
    expect(previewRows[0]!.x).toBe(previewRows[1]!.x);
    expect(previewRows[1]!.y).toBeGreaterThanOrEqual(previewRows[0]!.bottom);
    for (const row of previewRows) expect(row.valueWidth).toBeGreaterThan(80);
    await page.getByRole("button", { name: "Highlighting legend", exact: true }).click();
    const legend = page.getByRole("dialog", { name: "Legend", exact: true });
    expect(await legend.locator(".cu-legend-item .cu-legend-swatch").evaluateAll(nodes =>
        nodes.map(node => getComputedStyle(node).backgroundColor))).toEqual([
        "rgb(236, 243, 252)", "rgb(222, 233, 250)", "rgb(220, 251, 215)", "rgb(255, 218, 221)", "rgb(248, 192, 200)",
    ]);
    await expect(legend.getByText("Matches label", { exact: true })).toBeVisible();
    await expect(legend.getByText("Different or extra extracted value", { exact: true })).toBeVisible();
    await expect(legend.getByText("Label only; not extracted", { exact: true })).toBeVisible();
    const toggleLayout = await legend.locator(".cu-legend-review-toggle").evaluateAll(nodes => nodes.map(node => {
        const label = node.querySelector("span")!.getBoundingClientRect();
        const track = node.querySelector(".cu-switch-track")!.getBoundingClientRect();
        return { labelRight: label.right, trackLeft: track.left, width: node.getBoundingClientRect().width };
    }));
    for (const toggle of toggleLayout) {
        expect(toggle.labelRight).toBeLessThan(toggle.trackLeft);
        expect(toggle.width).toBeGreaterThan(200);
    }
    await legend.getByRole("button", { name: "Close legend", exact: true }).click();

    await expect(pane.getByRole("table", { name: "Items label values", exact: true })).toBeVisible();
    await expect(pane.getByRole("table", { name: "Items extracted values", exact: true })).toBeVisible();
    const arrayTables = pane.locator(".cu-comparison-array .cu-items-table");
    const columnWidths = await arrayTables.evaluateAll(tables => tables.map(table =>
        [...table.querySelectorAll("thead th")].map(cell => cell.getBoundingClientRect().width)));
    expect(columnWidths[0]).toEqual(columnWidths[1]);
    await expect(pane.getByRole("group", { name: "Field navigation", exact: true })).toContainText("/ 14 fields");
    await pane.getByRole("button", { name: "Show incorrect fields (5 values)", exact: true }).click();
    await expect(pane.getByRole("table", { name: "Items extracted values", exact: true }).getByRole("row")).toHaveCount(4);
    await pane.getByRole("button", { name: "Show matching fields (8 values)", exact: true }).click();
    await expect(pane.getByRole("table", { name: "Items extracted values", exact: true })).toHaveCount(0);
    await pane.getByRole("button", { name: "Show matching fields (8 values)", exact: true }).click();
    const search = pane.getByRole("searchbox", { name: "Search field names, label values or extracted values", exact: true });
    await search.fill("Extracted child");
    await expect(pane.getByRole("button", { name: "Select label value of Group / Child", exact: true })).toBeVisible();
    await expect(pane.getByRole("button", { name: "Select extracted value of Group / Child", exact: true })).toBeVisible();
    await search.fill("");
    await expect(page.getByRole("alert")).toHaveCount(0);
});

test("default scalar and array blues are distinct in Fields, Preview and flyout banners", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await page.getByLabel("Choose source file", { exact: true }).setInputFiles(pdf);
    await ready(page);
    await upload(page, "Choose saved Analyze JSON", result(extracted), "default-colors.result.json");
    const pane = page.getByRole("region", { name: "Extraction results", exact: true });
    await expect(pane.getByRole("button", { name: "Select value of Equal", exact: true }).locator(".cu-value-chip"))
        .toHaveCSS("background-color", "rgb(236, 243, 252)");
    const table = pane.getByRole("table", { name: "Items values", exact: true });
    await expect(table.locator(".cu-value-chip").first()).toHaveCSS("background-color", "rgb(222, 233, 250)");
    const source = page.getByTestId("result-overlay");
    await expect(source.locator('polygon[data-outline-id="/contents/0/fields/Equal"]')).toHaveAttribute("fill", "#ECF3FC");
    await expect(source.locator('polygon[data-outline-id="/contents/0/fields/Items/valueArray/0/valueObject/Code"]'))
        .toHaveAttribute("fill", "#DEE9FA");
    await table.locator(".cu-cell-content > button").first().hover();
    const popup = page.getByRole("tooltip", { name: "Field preview", exact: true });
    await expect(popup.locator(".cu-popover-heading")).toHaveCSS("background-color", "rgb(222, 233, 250)");
    expect(await popup.evaluate(element => getComputedStyle(element, "::before").backgroundColor)).toBe("rgb(222, 233, 250)");
});

test("paired array horizontal scroll keeps index headers visible and is bidirectional, isolated and restored", async ({ page }) => {
    const pane = await reference(page);
    const row = { type: "object", valueObject: Object.fromEntries(Array.from({ length: 8 }, (_, index) => [
        `WideColumn${index}ForComparison`, { type: "string", valueString: `Value ${index}` },
    ])) };
    const array = { type: "array", valueArray: [row] };
    await upload(page, "Choose local label JSON", { fieldLabels: { First: array, Second: array } }, "scroll.labels.json");
    await upload(page, "Choose saved Analyze JSON", result({ First: array, Second: array }), "scroll.result.json");
    const first = pane.locator(".cu-comparison-arrays").filter({ has: page.getByRole("table", { name: "First label values", exact: true }) });
    const second = pane.locator(".cu-comparison-arrays").filter({ has: page.getByRole("table", { name: "Second label values", exact: true }) });
    const scrollers = first.locator(".cu-comparison-array-scroll");
    const positions = () => scrollers.evaluateAll(elements => elements.map(element => element.scrollLeft));
    await expectFixedIndexHeaders(scrollers, 2);
    await scrollers.first().hover();
    await page.mouse.wheel(120, 0);
    await expect.poll(positions).toEqual([120, 120]);
    await expectFixedIndexHeaders(scrollers, 2);
    await scrollers.nth(1).evaluate(element => { element.scrollLeft = 250; });
    await expect.poll(positions).toEqual([250, 250]);
    await expectFixedIndexHeaders(scrollers, 2);
    expect(await second.locator(".cu-comparison-array-scroll").evaluateAll(elements => elements.map(element => element.scrollLeft)))
        .toEqual([0, 0]);
    const headers = await first.locator("table").evaluateAll(tables => tables.map(table =>
        [...table.querySelectorAll("thead th")].map(cell => cell.getBoundingClientRect().left)));
    expect(headers[0]).toEqual(headers[1]);
    await scrollers.first().evaluate(element => { element.scrollLeft = element.scrollWidth; });
    await expect.poll(positions).toEqual(await scrollers.evaluateAll(elements =>
        elements.map(element => element.scrollWidth - element.clientWidth)));
    await expectFixedIndexHeaders(scrollers, 2);
    await scrollers.nth(1).evaluate(element => { element.scrollLeft = 250; });
    await expect.poll(positions).toEqual([250, 250]);
    await pane.getByRole("tab", { name: "Result", exact: true }).click();
    await pane.getByRole("tab", { name: "Fields", exact: true }).click();
    await expect.poll(positions).toEqual([250, 250]);
    await expectFixedIndexHeaders(scrollers, 2);
    await pane.getByRole("button", { name: "Collapse First", exact: true }).click();
    await pane.getByRole("button", { name: "Expand First", exact: true }).click();
    await expect.poll(positions).toEqual([250, 250]);
    await expectFixedIndexHeaders(scrollers, 2);
});

test("label-only highlights keep their own inch geometry while an extracted pixel value remains pinned", async ({ page }) => {
    const pane = await reference(page);
    await upload(page, "Choose saved Analyze JSON", { apiVersion: "2025-11-01", contents: [{
        kind: "document", unit: "pixel", pages: [{ pageNumber: 1, width: 816, height: 1056 }],
        fields: { Equal: { ...text("Exact"), source: "D(1,288,96,96,19.2)" } },
    }] }, "mixed-units.result.json");
    await pane.getByRole("button", { name: "Select extracted value of Equal", exact: true }).click();
    const pin = page.getByTestId("source-overlay").locator("polygon").first();
    const points = await pin.getAttribute("points");
    const missing = page.getByTestId("result-overlay").locator('polygon[data-outline-id="/labels/fields/Missing"]');
    await expect(missing).toHaveAttribute("fill", "#F8C0C8");
    const paper = await page.getByTestId("rendered-page").boundingBox(), box = await missing.boundingBox();
    if (!paper || !box) throw new Error("Missing-label geometry is unavailable.");
    expect(box.width).toBeCloseTo(paper.width / 8.5, 0);
    await pane.getByRole("button", { name: "Select label value of Missing", exact: true }).hover();
    await expect(page.getByRole("tooltip").locator(".cu-popover-heading")).toHaveCSS("background-color", "rgb(248, 192, 200)");
    const fill = await missing.evaluate(element => getComputedStyle(element).fill);
    const stroke = await page.getByTestId("preview-overlay").locator("polygon").first()
        .evaluate(element => getComputedStyle(element).stroke);
    expect(contrast(stroke, fill)).toBeGreaterThanOrEqual(3);
    await expect(pin).toHaveAttribute("data-source-id", "/contents/0/fields/Equal");
    await expect(pin).toHaveAttribute("points", points!);
});

test("absent fields stay reference-only, empty fields expose missing values and unsupported results warn", async ({ page }) => {
    const pane = await reference(page);
    await upload(page, "Choose saved Analyze JSON", result(), "without-fields.result.json");
    await expect(pane.getByRole("columnheader", { name: "Extracted Value", exact: true })).toHaveCount(0);
    await upload(page, "Choose saved Analyze JSON", result({}), "empty-fields.result.json");
    await expect(pane.getByRole("treegrid", { name: "Compared fields", exact: true })).toBeVisible();
    await expect(pane.getByRole("button", { name: "Show incorrect fields (12 values)", exact: true })).toBeVisible();
    await upload(page, "Choose saved Analyze JSON", { apiVersion: "2025-11-01", contents: [{
        kind: "document", fields: {},
    }] }, "empty-fields-without-geometry.result.json");
    await expect(page.getByTestId("result-overlay").locator('polygon[data-outline-id="/labels/fields/Missing"]'))
        .toHaveAttribute("fill", "#F8C0C8");
    await upload(page, "Choose saved Analyze JSON", { apiVersion: "unsupported", contents: [] }, "unsupported.result.json");
    await expect(pane.getByRole("alert")).toContainText("Comparison unavailable");
    await expect(pane.getByRole("columnheader", { name: "Label Value", exact: true })).toBeVisible();
    await expect(pane.getByRole("columnheader", { name: "Extracted Value", exact: true })).toHaveCount(0);
});

test("large comparison and reference arrays keep a bounded DOM and reach the last value", async ({ page }) => {
    const pane = await reference(page);
    const rows = (changed: boolean) => Array.from({ length: 1_000 }, (_, row) => ({
        type: "object", valueObject: Object.fromEntries(Array.from({ length: 10 }, (_, column) => [
            `C${column}`, { type: "number", valueNumber: changed && row === 999 && column === 9 ? -1 : row * 10 + column },
        ])),
    }));
    await upload(page, "Choose saved Analyze JSON", result({ Rows: { type: "array", valueArray: rows(true) } }), "large-test.result.json");
    await upload(page, "Choose local label JSON", { fieldLabels: { Rows: { type: "array", valueArray: rows(false) } } }, "large-test.labels.json");
    await expect(pane.getByRole("button", { name: "Show matching fields (9999 values)", exact: true })).toBeVisible();
    await expect(pane.getByRole("button", { name: "Show incorrect fields (1 value)", exact: true })).toBeVisible();
    expect(await pane.locator("[data-comparison-row]").count()).toBeLessThan(200);
    const scrollers = pane.locator(".cu-comparison-array-scroll");
    await scrollers.first().evaluate(element => { element.scrollTop = 300; });
    await expect.poll(() => scrollers.first().evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    expect(await scrollers.nth(1).evaluate(element => element.scrollTop)).toBe(0);
    await expectFixedIndexHeaders(scrollers, 2);
    await pane.getByRole("button", { name: "Previous field", exact: true }).click();
    const last = pane.locator('button[data-source-field-id="/contents/0/fields/Rows/valueArray/999/valueObject/C9"]');
    await expect(last).toBeVisible();
    await expect(last).toHaveAttribute("aria-pressed", "true");
    await expect(last).toHaveText("-1");
    expect(await pane.locator("[data-comparison-row]").count()).toBeLessThan(200);
    await pane.getByRole("button", { name: "Show incorrect fields (1 value)", exact: true }).click();
    await pane.getByRole("searchbox", { name: "Search field names, label values or extracted values", exact: true }).fill("9999");
    await expect(pane.getByRole("table", { name: "Rows extracted values", exact: true })).toBeVisible();
    await upload(page, "Choose saved Analyze JSON", result(), "large-reference.result.json");
    await expect(pane.getByRole("columnheader", { name: "Extracted Value", exact: true })).toHaveCount(0);
    await expect(pane.getByRole("table", { name: "Rows label values", exact: true })).toBeVisible();
    expect(await pane.locator("[data-comparison-row]").count()).toBeLessThan(100);
    await expect(page.getByRole("alert")).toHaveCount(0);
});

test("labels are never implicitly applied to a different result content", async ({ page }) => {
    const pane = await reference(page);
    const first = result(extracted);
    const second = result({ Equal: text("Unrelated second content") });
    await upload(page, "Choose saved Analyze JSON", { ...first, contents: [...first.contents, ...second.contents] }, "multi-content.result.json");
    await expect(pane.getByRole("treegrid", { name: "Compared fields", exact: true })).toBeVisible();
    await pane.getByRole("combobox", { name: "Result content", exact: true }).selectOption("1");
    await expect(pane.getByRole("treegrid", { name: "Extracted fields", exact: true })).toBeVisible();
    await expect(pane.getByRole("columnheader", { name: "Label Value", exact: true })).toHaveCount(0);
    await expect(pane.getByRole("alert")).toContainText("This content is not compared");
    await pane.getByRole("combobox", { name: "Result content", exact: true }).selectOption("0");
    await expect(pane.getByRole("treegrid", { name: "Compared fields", exact: true })).toBeVisible();
    await expect(pane.getByRole("button", { name: "Show incorrect fields (5 values)", exact: true })).toBeVisible();
});
