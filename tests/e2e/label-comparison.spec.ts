import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { ready } from "./viewerAssertions";

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
    await expect(pane.locator('[data-comparison-path="/Missing"] td').nth(2)).toContainText("Not extracted");
    await expect(page.getByTestId("result-overlay").locator('[data-outline-id="/labels/fields/Missing"]')).toHaveCount(0);

    await pane.getByRole("button", { name: "Select label value of Equal", exact: true }).click();
    const frame = page.getByTestId("source-overlay").locator("polygon").first();
    await expect(frame).toHaveAttribute("data-source-id", "/labels/fields/Equal");
    const labelPoints = await frame.getAttribute("points");
    await equal.click();
    await expect(frame).toHaveAttribute("data-source-id", "/contents/0/fields/Equal");
    expect(await frame.getAttribute("points")).not.toBe(labelPoints);
    await equal.hover();
    const flyout = page.getByRole("tooltip", { name: "Field preview", exact: true });
    await expect(flyout).toContainText("Label Value");
    await expect(flyout).toContainText("Extracted Value");
    await expect(flyout).toContainText("0.40");
    await page.getByRole("button", { name: "Highlighting legend", exact: true }).click();
    const legend = page.getByRole("dialog", { name: "Legend", exact: true });
    expect(await legend.locator(".cu-legend-item .cu-legend-swatch").evaluateAll(nodes =>
        nodes.map(node => getComputedStyle(node).backgroundColor))).toEqual([
        "rgb(236, 243, 252)", "rgb(220, 251, 215)", "rgb(255, 218, 221)",
    ]);
    await expect(legend.getByText("Matches label", { exact: true })).toBeVisible();
    await expect(legend.getByText("Different, extra or missing value", { exact: true })).toBeVisible();
    await legend.getByRole("button", { name: "Close legend", exact: true }).click();

    await expect(pane.getByRole("table", { name: "Items label values", exact: true })).toBeVisible();
    await expect(pane.getByRole("table", { name: "Items extracted values", exact: true })).toBeVisible();
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

test("absent fields stay reference-only, empty fields expose missing values and unsupported results warn", async ({ page }) => {
    const pane = await reference(page);
    await upload(page, "Choose saved Analyze JSON", result(), "without-fields.result.json");
    await expect(pane.getByRole("columnheader", { name: "Extracted Value", exact: true })).toHaveCount(0);
    await upload(page, "Choose saved Analyze JSON", result({}), "empty-fields.result.json");
    await expect(pane.getByRole("treegrid", { name: "Compared fields", exact: true })).toBeVisible();
    await expect(pane.getByRole("button", { name: "Show incorrect fields (12 values)", exact: true })).toBeVisible();
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
