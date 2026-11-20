import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { contrast, expandField, fitSource, ready, rotateSource, screenshotPixels, setShowConfidence } from "./viewerAssertions";

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

for (const mode of ["unlabeled", "reference", "comparison"] as const) {
    test(`field-row blank clicks select scalars and collapsed groups without intercepting controls in ${mode} mode`, async ({ page }) => {
        const fields = {
            First: text("First value", "D(1,1,1,1,0.2)"),
            Second: text("Second value", "D(1,1,2,1,0.2)"),
            Group: { type: "object", valueObject: { Child: text("Child value", "D(1,1,3,1,0.2)") } },
            Missing: { type: "string" },
        };
        await page.goto("/");
        await ready(page);
        await page.getByLabel("Choose source file", { exact: true }).setInputFiles(pdf);
        await ready(page);
        if (mode !== "unlabeled") await upload(page, "Choose local label JSON", { fieldLabels: fields }, "row-click.pdf.labels.json");
        if (mode !== "reference") await upload(page, "Choose saved Analyze JSON", result({
            ...fields, First: text("First value", "D(1,3,1,1,0.2)"),
        }), "row-click.pdf.result.json");
        const pane = page.getByRole("region", { name: "Extraction results", exact: true });
        await expect(pane.getByRole("button", { name: "First", exact: true })).toBeVisible();
        if (mode === "comparison") await expect(pane.getByRole("columnheader", { name: "Extracted Value", exact: true })).toBeVisible();
        const row = (name: string) => pane.locator(mode === "unlabeled" ?
            `tr[data-field-id="/contents/0/fields/${name}"]` : `tr[data-comparison-path="/${name}"]`);
        const blankClick = async (name: string, column: number) => {
            const cell = row(name).locator(":scope > td").nth(column);
            expect(await cell.evaluate(element => {
                const box = element.getBoundingClientRect();
                return !element.ownerDocument.elementFromPoint(box.left + 2, box.top + 10)?.closest("button");
            })).toBe(true);
            await cell.click({ position: { x: 2, y: 10 } });
        };
        await blankClick("First", 0);
        await expect(row("First")).toHaveClass(/is-selected/);
        await blankClick("Second", mode === "comparison" ? 2 : 1);
        await expect(row("Second")).toHaveClass(/is-selected/);
        const groupValue = row("Group").locator(":scope > td").nth(1);
        const groupBounds = await groupValue.boundingBox();
        if (!groupBounds) throw new Error("The collapsed group value cell is not laid out.");
        await page.mouse.click(groupBounds.x + groupBounds.width * 0.6, groupBounds.y + groupBounds.height / 2);
        await expect(row("Group")).toHaveClass(/is-selected/);
        const groupName = pane.getByRole("button", { name: "Group", exact: true });
        await expect(groupName).toBeFocused();
        await expect(groupName).toHaveAttribute("aria-expanded", "false");
        await expect(pane.getByRole("button", { name: "Child", exact: true })).toHaveCount(0);
        if (mode === "unlabeled") {
            const details = pane.getByRole("region", { name: "Full value and confidence", exact: true });
            await expect(details).toHaveCount(0);
            await groupValue.getByRole("button", { name: "View full value of Group", exact: true }).click();
            await expect(details).toBeVisible();
            await details.getByRole("button", { name: "Close full value details", exact: true }).click();
        }
        await blankClick("Missing", 1);
        await expect(row("Missing")).toHaveClass(/is-selected/);

        const value = (side: "label" | "extracted") => row("First").getByRole("button", {
            name: mode === "unlabeled" ? "Select value of First" : `Select ${side} value of First`, exact: true,
        });
        const source = page.getByTestId("source-overlay").locator("polygon").first();
        if (mode !== "unlabeled") {
            await value("label").click();
            await expect(source).toHaveAttribute("data-source-id", "/labels/fields/First");
        }
        if (mode !== "reference") {
            await value("extracted").click();
            await expect(source).toHaveAttribute("data-source-id", "/contents/0/fields/First");
        }
        await pane.getByRole("button", { name: "Expand Group", exact: true }).click();
        await expect(pane.getByRole("button", { name: "Group", exact: true })).toHaveAttribute("aria-expanded", "true");
        await expect(row("First")).toHaveClass(/is-selected/);
        await row("Group").getByRole("button", { name: "Reorder Group", exact: true }).click();
        await expect(row("First")).toHaveClass(/is-selected/);
        await row("Second").locator(":scope > td").last().hover();
        const actions = row("Second").locator(":scope > td").last().getByRole("button", { name: "More value actions for Second", exact: true });
        await expect(actions).toBeVisible();
        await actions.click();
        await expect(page.getByRole("menu", { name: "Value actions", exact: true })).toBeVisible();
        await expect(row("First")).toHaveClass(/is-selected/);
    });
}

for (const sample of ["labels", "multipage"]) {
    test(`compared Fields navigation is centered across the whole footer on the ${sample} invoice`, async ({ page }) => {
        await page.goto(`/?sample=${sample}`);
        await ready(page);
        const toolbar = page.getByRole("group", { name: "Fields toolbar", exact: true });
        await expect(toolbar.getByRole("button", { name: /^Show matching fields/ })).toBeVisible();
        const checkLayout = async (width?: number) => {
            const layout = await toolbar.evaluate(element => {
                const bar = element.getBoundingClientRect();
                const search = element.querySelector(".cu-search-box")!.getBoundingClientRect();
                const nav = element.querySelector(".cu-field-navigation")!.getBoundingClientRect();
                const filters = element.querySelector(".cu-comparison-filters")!.getBoundingClientRect();
                const settings = element.querySelector('button[aria-label="Fields settings"]')!.getBoundingClientRect();
                return {
                    width: bar.width, height: bar.height, centerError: Math.abs((nav.left + nav.right - bar.left - bar.right) / 2),
                    gaps: [nav.left - search.right, filters.left - nav.right, settings.left - filters.right],
                    padding: [search.left - bar.left, bar.right - settings.right],
                    overflow: element.scrollWidth - element.clientWidth,
                    controlsReachable: [...element.querySelectorAll("input, button")].every(control => {
                        const box = control.getBoundingClientRect();
                        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
                        return box.width >= 24 && box.height >= 24 && control.contains(hit);
                    }),
                };
            });
            if (width !== undefined) expect(layout.width).toBeCloseTo(width, 0);
            expect(layout.centerError).toBeLessThanOrEqual(1);
            expect(layout.height).toBe(44);
            expect(Math.min(...layout.gaps)).toBeGreaterThanOrEqual(4);
            expect(layout.padding[0]).toBeCloseTo(layout.padding[1]!, 0);
            expect(layout.overflow).toBeLessThanOrEqual(1);
            expect(layout.controlsReachable).toBe(true);
        };
        await checkLayout();
        await page.setViewportSize({ width: 1130, height: 900 });
        await checkLayout();
        await page.getByRole("separator", { name: "Source and results width", exact: true }).press("End");
        await checkLayout(440);
        await toolbar.getByRole("button", { name: "Next field", exact: true }).click();
        await expect(toolbar.getByLabel("Current field position", { exact: true })).toHaveText(/^1 \/ \d+ fields$/);
        await checkLayout(440);
    });
}

test("clicking across the real invoice field-name and label-value gap selects and focuses the field", async ({ page }) => {
    await page.goto("/?sample=labels");
    await ready(page);
    const row = page.locator('tr[data-comparison-path="/DueDate"]');
    const name = row.getByRole("button", { name: "DueDate", exact: true });
    const label = row.getByRole("button", { name: "Select label value of DueDate", exact: true });
    const extracted = row.getByRole("button", { name: "Select extracted value of DueDate", exact: true });
    const previous = page.getByRole("button", { name: "CustomerTaxId", exact: true });
    await name.scrollIntoViewIfNeeded();
    const points = await row.evaluate(element => {
        const name = element.querySelector(".cu-field-name")?.getBoundingClientRect();
        const label = element.querySelector(":scope > td:nth-child(2) > .cu-comparison-value > .cu-field-value");
        const cell = label?.closest("td")?.getBoundingClientRect();
        if (!name || !label || !cell) throw new Error("The invoice's name and label cells are not laid out.");
        const range = element.ownerDocument.createRange();
        range.selectNodeContents(label);
        const text = range.getBoundingClientRect();
        return [
            { spot: "middle of the name-side gap", x: (name.right + cell.left) / 2 },
            { spot: "name side of the column boundary", x: cell.left - 1 },
            { spot: "label side of the column boundary", x: cell.left + 1 },
            { spot: "immediately before the label text", x: text.left - 1 },
            { spot: "blank space after the label text", x: (text.right + cell.right) / 2 },
        ].map(point => ({ ...point, y: (text.top + text.bottom) / 2 }));
    });
    for (const { spot, x, y } of points) await test.step(spot, async () => {
        await previous.click();
        await page.mouse.click(x, y);
        await expect(row).toHaveClass(/is-selected/);
        await expect(previous).toHaveAttribute("aria-pressed", "false");
        await expect(extracted).toHaveAttribute("aria-pressed", "true");
        await expect(label).toHaveAttribute("aria-pressed", "false");
        await expect(name).toBeFocused();
    });
    await expect(row).toHaveCSS("cursor", "pointer");
    await page.getByRole("tab", { name: "Fields", exact: true }).hover();
    await expect(row).toHaveCSS("background-color", "rgb(229, 218, 255)");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("button", { name: "InvoiceDate", exact: true })).toHaveAttribute("aria-pressed", "true");
    await label.click();
    await expect(label).toHaveAttribute("aria-pressed", "true");
    await extracted.click();
    await expect(extracted).toHaveAttribute("aria-pressed", "true");
});

for (const mode of ["unlabeled", "reference", "comparison"] as const) {
    test(`missing values use side-specific gray placeholders without replacing authored values in ${mode} Fields`, async ({ page }) => {
        const values = {
            Absent: { type: "string" }, AbsentObject: { type: "object" },
            MissingSummary: { type: "object", valueObject: { Nested: {
                type: "object", valueObject: { Child: { type: "string" } },
            } } },
            LiteralSummary: { type: "object", valueObject: { Child: text("Not returned") } },
            EmptySummary: { type: "object", valueObject: { Child: text("") } },
            Zero: { type: "number", valueNumber: 0 }, False: { type: "boolean", valueBoolean: false },
            Empty: { type: "string", valueString: "" }, Null: { type: "string", valueString: null },
            Dash: text("-"), EmDash: text("\u2014"), LiteralMissing: text("Not returned"), LiteralUnlabelled: text("Not labelled"),
            Rows: { type: "array", valueArray: [
                { type: "object", valueObject: { A: text("One") } },
                { type: "object", valueObject: { B: text("Two") } },
                { type: "object", valueObject: { A: { type: "string" }, B: text("") } },
            ] },
        };
        await page.goto("/");
        await ready(page);
        await page.getByLabel("Choose source file", { exact: true }).setInputFiles(pdf);
        await ready(page);
        if (mode !== "unlabeled") await upload(page, "Choose local label JSON", {
            fieldLabels: { ...values, LabelOnly: text("Expected") },
        }, "missing-values.pdf.labels.json");
        if (mode !== "reference") await upload(page, "Choose saved Analyze JSON", result({
            ...values, Rows: mode === "comparison" ? { type: "array", valueArray: [
                { type: "object", valueObject: { A: text("One") } },
                { type: "object", valueObject: { B: { type: "string" } } },
                { type: "object", valueObject: { A: text("Actual cell"), B: text("") } },
            ] } : values.Rows,
            LabelOnly: { type: "string", confidence: 0.2 }, ExtractedOnly: text("Actual"),
        }), "missing-values.pdf.result.json");
        await expect(page.getByRole("button", { name: "Absent", exact: true })).toBeVisible();
        if (mode === "comparison") await expect(page.getByRole("columnheader", { name: "Extracted Value", exact: true })).toBeVisible();
        await page.locator(".prototype-banner").hover();
        const valueCell = (name: string, side: "label" | "extracted") => page.locator(mode === "unlabeled" ?
            `tr[data-field-id="/contents/0/fields/${name}"]` : `tr[data-comparison-path="/${name}"]`)
            .locator(":scope > td").nth(mode === "comparison" && side === "extracted" ? 2 : 1);
        const sides: ("label" | "extracted")[] = mode === "comparison" ? ["label", "extracted"] :
            mode === "reference" ? ["label"] : ["extracted"];
        for (const side of sides) {
            const placeholder = side === "label" ? "Not labelled" : "Not returned";
            for (const name of ["Absent", "AbsentObject", "MissingSummary"]) {
                const missing = valueCell(name, side).getByText(placeholder, { exact: true });
                await expect(missing).toBeVisible();
                await expect(missing).toHaveCSS("color", "rgb(75, 85, 99)");
                await expect(missing).toHaveCSS("font-style", "italic");
                await expect(missing).toHaveCSS("font-size", "11px");
            }
            for (const [name, expected] of [["LiteralSummary", "Not returned"], ["EmptySummary", '"" (empty string)']] as const) {
                const cell = valueCell(name, side);
                await expect(cell.getByText(expected, { exact: true })).toHaveCSS("font-style", "normal");
                await expect(cell.locator(".is-missing")).toHaveCount(0);
            }
            for (const [name, expected] of [
                ["Zero", "0"], ["False", "false"], ["Empty", '"" (empty string)'], ["Null", "null"],
                ["Dash", "-"], ["EmDash", "\u2014"], ["LiteralMissing", "Not returned"], ["LiteralUnlabelled", "Not labelled"],
            ] as const) {
                const cell = valueCell(name, side);
                await expect(cell.getByRole("button", { name: /^Select / })).toHaveText(expected);
                await expect(cell.locator(".is-missing")).toHaveCount(0);
            }
        }
        await expandField(page, "Rows");
        for (const layout of mode === "comparison" ? ["Side by side", "Stacked"] : [null]) {
            if (layout) await page.getByRole("button", { name: layout, exact: true }).click();
            for (const side of sides) {
                const name = mode === "unlabeled" ? "Rows values" : `Rows ${side} values`;
                const table = page.getByRole("table", { name, exact: true });
                const missingCells = table.locator(".cu-missing-cell");
                await expect(missingCells).toHaveCount(2);
                for (const cell of await missingCells.all()) {
                    await expect(cell).toHaveText(side === "label" ? "Not labelled" : "Not returned");
                    await expect(cell).toHaveCSS("color", "rgb(75, 85, 99)");
                }
                if (side === "label") {
                    const cells = table.locator('tr[data-comparison-row="2"] td');
                    const missing = cells.nth(0).getByLabel("Not labelled", { exact: true });
                    await expect(missing).toHaveText("Not labelled");
                    await expect(missing.locator(".cu-value-chip")).toHaveCSS("font-style", "italic");
                    const empty = cells.nth(1).getByRole("button", { name: /^Select label value/ });
                    await expect(empty).toHaveText('"" (empty string)');
                    if (mode === "comparison") await expect(empty.locator("..")).toHaveAttribute("data-comparison-status", "matched");
                }
            }
        }
        if (mode === "comparison") {
            const arrayMissing = page.getByRole("table", { name: "Rows extracted values", exact: true })
                .locator('tr[data-comparison-row="1"] td').nth(1).getByLabel("Not extracted", { exact: true });
            await arrayMissing.hover();
            await expect(arrayMissing.locator(".cu-value-chip")).toHaveCSS("color", "rgb(75, 85, 99)");
            const row = await arrayMissing.locator("..").locator("..").boundingBox();
            if (!row) throw new Error("The missing-value array row is unavailable.");
            expect(row.height).toBeLessThanOrEqual(29);
            await expect(valueCell("ExtractedOnly", "label").getByLabel("Not labelled", { exact: true })).toHaveText("Not labelled");
            const missing = valueCell("LabelOnly", "extracted").getByLabel("Not extracted", { exact: true });
            await expect(missing).toHaveText("Not returned");
            await expect(missing).toHaveCSS("background-color", "rgb(248, 192, 200)");
            const colors = await missing.evaluate(element => ({
                text: getComputedStyle(element.querySelector(".cu-value-chip") ?? element).color,
                background: getComputedStyle(element).backgroundColor,
            }));
            expect(contrast(colors.text, colors.background)).toBeGreaterThanOrEqual(4.5);
        }
    });
}

test("the real invoice distinguishes missing labels from missing extractions in objects and arrays", async ({ page }) => {
    await page.goto("/?sample=labels");
    await ready(page);
    const pane = page.getByRole("region", { name: "Extraction results", exact: true });
    const row = (name: string) => pane.locator(`tr[data-comparison-path="/${name}"]`);
    const value = (name: string, side: "label" | "extracted") => row(name).locator(":scope > td").nth(side === "label" ? 1 : 2);
    await page.locator(".prototype-banner").hover();
    const ordinary = value("PaymentTerm", "label").getByText("Not labelled", { exact: true });
    await expect(ordinary).toHaveCSS("color", "rgb(75, 85, 99)");
    for (const name of ["SubtotalAmount", "TotalDiscountAmount", "TotalTaxAmount"]) {
        const labelSummary = value(name, "label").getByRole("button", { name: `Select label value of ${name}`, exact: true });
        await expect(labelSummary).toHaveText("Not labelled");
        const missing = labelSummary.getByText("Not labelled", { exact: true });
        await expect(missing).toHaveCSS("font-style", "italic");
        await expect(missing).toHaveCSS("color", "rgb(75, 85, 99)");
        await expect(missing).toHaveCSS("font-size", "11px");
    }
    const discount = value("TotalDiscountAmount", "extracted").getByText("Not returned", { exact: true });
    await expect(discount).toHaveCSS("font-style", "italic");
    await expect(discount).toHaveCSS("color", "rgb(75, 85, 99)");
    const subtotal = value("SubtotalAmount", "extracted").getByRole("button", { name: "Select extracted value of SubtotalAmount" });
    await expect(subtotal).toHaveText("100 USD");
    await expect(subtotal).toHaveCSS("font-style", "normal");
    expect(await row("TotalDiscountAmount").evaluate(element => element.getBoundingClientRect().height))
        .toBe(await row("BalanceForward").evaluate(element => element.getBoundingClientRect().height));
    await expandField(page, "SubtotalAmount");
    for (const child of ["Amount", "CurrencyCode"]) {
        const missing = value(`SubtotalAmount/${child}`, "label").getByText("Not labelled", { exact: true });
        await expect(missing).toHaveCSS("font-style", "italic");
    }
    await expandField(page, "LineItems");
    const unit = pane.getByRole("table", { name: "LineItems label values", exact: true })
        .locator('[data-field-value-focus="/labels/fields/LineItems/valueArray/1/valueObject/QuantityUnit"] .cu-value-chip');
    await expect(unit).toHaveText("Not labelled");
    await expect(unit).toHaveCSS("font-style", "italic");
});

test("source-review stars share the same solid light blue style and stay outside array value fills in both Fields views", async ({ page }) => {
    await page.goto("/?sample=labels");
    await ready(page);
    const pane = page.getByRole("region", { name: "Extraction results", exact: true });
    const compareRow = (path: string) => pane.locator(`tr[data-comparison-path="${path}"]`);
    const regularRow = (path: string) => pane.locator(`tr[data-field-id="/contents/0/fields/${path}"]`);
    const lightBlue = "rgb(203, 234, 241)";
    const expectStar = async (icon: Locator) => {
        await expect(icon).toBeVisible();
        await expect(icon).toHaveCSS("fill", lightBlue);
        await expect(icon).toHaveCSS("stroke", "none");
    };
    const expectSourceReview = async (row: Locator, value: Locator, fieldName: string, valueText: string) => {
        const name = row.getByRole("button", { name: fieldName, exact: true });
        for (const state of ["normal", "hover", "focus", "selected"] as const) {
            if (state === "hover") await name.hover();
            else if (state === "focus") await name.focus();
            else if (state === "selected") await name.click();
            await expect(name).toHaveCSS("color", "rgb(36, 52, 71)");
            await expect(name.locator(".cu-source-review-name")).toHaveCSS("color", "rgb(36, 52, 71)");
            await expectStar(name.locator(".cu-source-review-icon path"));
            await expect(value).toHaveCSS("background-color", lightBlue);
        }
        await page.locator(".prototype-banner").hover();
        await expect(name).toHaveAccessibleDescription(/No direct match in the source text/);
        await expect(value).toContainText(valueText);
        await expect(value).toHaveCSS("background-color", lightBlue);
        await expect(value).toHaveCSS("box-shadow", /180, 60, 75/);
    };

    const country = compareRow("/CountryRegion");
    const extractedCountry = country.locator("td").nth(2).locator(".cu-comparison-value");
    await expectSourceReview(country, extractedCountry, "CountryRegion", "United States");
    await expect(extractedCountry).toHaveAttribute("data-comparison-status", "extra");
    await expect(country.locator("td").nth(1)).toHaveText("Not labelled");
    await expect(page.getByTestId("result-overlay").locator('polygon[data-outline-id="/contents/0/fields/CountryRegion"]').first())
        .toHaveCSS("fill", "rgb(255, 218, 221)");
    await expandField(page, "AmountDue");
    await expect(compareRow("/AmountDue/Amount").locator(".cu-source-review-icon")).toHaveCount(0);
    const comparedCurrency = compareRow("/AmountDue/CurrencyCode");
    await expectSourceReview(comparedCurrency, comparedCurrency.locator("td").nth(2).locator(".cu-comparison-value"),
        "CurrencyCode", "USD");
    await expect(compareRow("/InvoiceDate").locator(".cu-source-review-icon")).toHaveCount(0);
    await expect(compareRow("/VendorAddress").locator(".cu-source-review-icon")).toHaveCount(0);
    const taxCurrencyId = "/contents/0/fields/LineItems/valueArray/0/valueObject/TaxAmount/valueObject/CurrencyCode";
    const expectArrayStar = async (table: string) => {
        const cell = pane.getByRole("table", { name: table, exact: true }).locator(`[data-field-id="${taxCurrencyId}"]`);
        await expect(cell.getByRole("button", { name: /^Select / })).toHaveText("USD");
        await expectStar(cell.locator(".cu-source-review-icon path"));
        const [marker, surface] = await Promise.all([cell.locator(".cu-source-review-icon").boundingBox(), cell.boundingBox()]);
        if (!marker || !surface) throw new Error("The currency marker and value surface must both be laid out.");
        expect(marker.x + marker.width).toBeLessThan(surface.x);
        await expect(cell).toHaveCSS("background-color", lightBlue);
        await expect(cell).toHaveCSS("box-shadow", /180, 60, 75/);
    };
    await expectArrayStar("LineItems extracted values");
    await pane.getByRole("group", { name: "LineItems array layout", exact: true })
        .getByRole("button", { name: "Stacked", exact: true }).click();
    await expectArrayStar("LineItems extracted values");

    await page.getByLabel("Choose source file", { exact: true }).setInputFiles(pdf);
    await ready(page);
    await page.getByLabel("Choose saved Analyze JSON", { exact: true }).setInputFiles(`${pdf}.result.json`);
    await expect(pane.getByRole("columnheader", { name: "Value", exact: true })).toBeVisible();
    await expectSourceReview(regularRow("CountryRegion"), regularRow("CountryRegion").locator(".cu-field-value-content"),
        "CountryRegion", "United States");
    await expandField(page, "AmountDue");
    await expect(regularRow("AmountDue/valueObject/Amount").locator(".cu-source-review-icon")).toHaveCount(0);
    const regularCurrency = regularRow("AmountDue/valueObject/CurrencyCode");
    await expectSourceReview(regularCurrency, regularCurrency.locator(".cu-field-value-content"), "CurrencyCode", "USD");
    await expect(regularRow("AmountDue/valueObject/Amount").locator(".cu-field-value-content"))
        .toHaveCSS("background-color", "rgb(220, 251, 215)");
    await expectArrayStar("LineItems values");
});

test("compared fields can be reordered without separating label and extracted values", async ({ page }) => {
    const pane = await reference(page);
    await upload(page, "Choose local label JSON", { fieldLabels: {
        First: text("Label first"), Second: text("Label second"),
    } }, "ordered.pdf.labels.json");
    await upload(page, "Choose saved Analyze JSON", result({
        First: text("Extracted first"), Second: text("Extracted second"),
    }), "ordered.pdf.result.json");

    const grid = pane.getByRole("treegrid", { name: "Compared fields", exact: true });
    const first = grid.locator('tr[data-comparison-path="/First"]');
    const second = grid.locator('tr[data-comparison-path="/Second"]');
    await second.hover();
    await second.getByRole("button", { name: "Reorder Second", exact: true }).dragTo(first, {
        targetPosition: { x: 48, y: 1 },
    });

    await expect.poll(() => grid.locator("tbody > tr[data-comparison-path]")
        .evaluateAll(rows => rows.map(row => row.getAttribute("data-comparison-path"))))
        .toEqual(["/Second", "/First"]);
    await expect(second.locator("td").nth(1)).toContainText("Label second");
    await expect(second.locator("td").nth(2)).toContainText("Extracted second");
    await expect(first.locator("td").nth(1)).toContainText("Label first");
    await expect(first.locator("td").nth(2)).toContainText("Extracted first");

    await first.getByRole("button", { name: "First", exact: true }).press("Alt+ArrowUp");
    await expect.poll(() => grid.locator("tbody > tr[data-comparison-path]")
        .evaluateAll(rows => rows.map(row => row.getAttribute("data-comparison-path"))))
        .toEqual(["/First", "/Second"]);

    await pane.getByRole("searchbox", { name: "Search field names, label values or extracted values" }).fill("Second");
    await expect(grid.locator('tr[data-comparison-path="/Second"]')
        .getByRole("button", { name: "Reorder Second", exact: true })).toBeDisabled();
});

for (const mode of ["reference", "comparison"] as const) {
    test(`Fields arrows select one value per field in ${mode} mode, including missing values`, async ({ page }) => {
        const pane = await reference(page);
        await upload(page, "Choose local label JSON", { fieldLabels: {
            First: text("First label"), LabelOnly: text("Label only"),
            Missing: { type: "string" }, Last: text("Last label"),
        } }, "keyboard.pdf.labels.json");
        const comparison = mode === "comparison";
        if (comparison) {
            await upload(page, "Choose saved Analyze JSON", result({
                First: text("First extracted"), Missing: { type: "string" }, Last: text("Last extracted"),
            }), "keyboard.pdf.result.json");
            await expect(pane.getByRole("columnheader", { name: "Extracted Value", exact: true })).toBeVisible();
        }
        const position = pane.getByLabel("Current field position", { exact: true });
        const row = (name: string) => pane.locator(`tr[data-comparison-path="/${name}"]`);
        const value = (name: string, side: "label" | "extracted") => pane.getByRole("button",
            { name: `Select ${side} value of ${name}`, exact: true });
        const assertPosition = async (index: number) => expect(position).toHaveText(`${index} / 4${comparison ? " fields" : ""}`);
        const preferred = comparison ? "extracted" : "label";

        await row("First").getByRole("button", { name: "First", exact: true }).press("ArrowDown");
        await assertPosition(1);
        await expect(value("First", preferred)).toBeFocused();
        await expect(value("First", preferred)).toHaveAttribute("aria-pressed", "true");
        await page.keyboard.press("ArrowDown");
        await assertPosition(2);
        const labelOnly = value("LabelOnly", "label");
        await expect(labelOnly).toBeFocused();
        await expect(labelOnly.locator("..")).toHaveCSS("outline-color", "rgb(55, 111, 172)");
        await expect(labelOnly.locator("..")).toHaveCSS("border-top-left-radius", "5px");
        await expect(labelOnly).toHaveCSS("outline-style", "none");

        await pane.getByRole("button", { name: "Next field", exact: true }).press("Enter");
        await assertPosition(3);
        const missing = row("Missing").locator('[data-field-value-focus="/labels/fields/Missing"]');
        await expect(missing).toBeFocused();
        await expect(missing).toHaveText("Not labelled");
        await page.keyboard.press("ArrowDown");
        await assertPosition(4);
        await expect(value("Last", preferred)).toBeFocused();
        await page.keyboard.press("ArrowDown");
        await assertPosition(1);
        await page.keyboard.press("ArrowUp");
        await assertPosition(4);
        await expect(value("Last", preferred)).toBeFocused();
    });
}

for (const compared of [false, true]) {
    test(`${compared ? "compared" : "reference"} field order survives reopening and explicit reset`, async ({ page }) => {
        const group = { type: "object", valueObject: { One: text("One"), Two: text("Two") } };
        const open = async () => {
            await reference(page);
            await upload(page, "Choose local label JSON", { fieldLabels: {
                First: text("Label first"), Second: text("Label second"), Group: group,
            } }, "persistent-order.pdf.labels.json");
            if (compared) await upload(page, "Choose saved Analyze JSON", result({
                First: text("Extracted first"), Second: text("Extracted second"), Group: group,
            }), "persistent-order.pdf.result.json");
            await expect(page.getByRole("button", { name: "Select label value of First", exact: true })).toBeVisible();
            if (compared) await expect(page.getByRole("columnheader", { name: "Extracted Value", exact: true })).toBeVisible();
        };
        const roots = page.locator('.cu-fields-table > tbody > tr[data-comparison-path][aria-level="1"]');
        const order = () => roots.evaluateAll(rows => rows.map(row => row.getAttribute("data-comparison-path")));
        const children = () => page.locator('tr[data-comparison-path^="/Group/"]')
            .evaluateAll(rows => rows.map(row => row.getAttribute("data-comparison-path")));
        await open();
        const first = roots.filter({ has: page.getByRole("button", { name: "First", exact: true }) });
        const second = roots.filter({ has: page.getByRole("button", { name: "Second", exact: true }) });
        await second.hover();
        await second.getByRole("button", { name: "Reorder Second", exact: true }).dragTo(first, {
            targetPosition: { x: 48, y: 1 },
        });
        await expect.poll(order).toEqual(["/Second", "/First", "/Group"]);
        await expandField(page, "Group");
        await page.getByRole("button", { name: "One", exact: true }).press("Alt+ArrowDown");
        await expect.poll(children).toEqual(["/Group/Two", "/Group/One"]);
        await open();
        await expect.poll(order).toEqual(["/Second", "/First", "/Group"]);
        await expandField(page, "Group");
        await expect.poll(children).toEqual(["/Group/Two", "/Group/One"]);
        await expect(second.locator("td").nth(1)).toContainText("Label second");
        if (compared) await expect(second.locator("td").nth(2)).toContainText("Extracted second");
        await page.getByRole("button", { name: "Fields settings", exact: true }).click();
        await page.getByRole("button", { name: "Reset Field Order", exact: true }).click();
        await expect.poll(order).toEqual(["/First", "/Second", "/Group"]);
        await expect.poll(children).toEqual(["/Group/One", "/Group/Two"]);
        await open();
        await expect.poll(order).toEqual(["/First", "/Second", "/Group"]);
    });
}

test("the unlabeled invoice preview leaves CustomerName plain and retains the Fields and source highlights", async ({ page }) => {
    await page.goto("/?sample=pdf");
    await ready(page);
    const pane = page.getByRole("region", { name: "Extraction results", exact: true });
    const id = "/contents/0/fields/CustomerName";
    const name = pane.getByRole("button", { name: "CustomerName", exact: true });
    const cell = pane.locator(`tr[data-field-id="${id}"] .cu-field-value-content`);
    const source = page.getByTestId("result-overlay").locator(`polygon[data-outline-id="${id}"]`).first();
    const preview = page.getByRole("tooltip", { name: "Field preview", exact: true });
    const value = preview.locator(".cu-flyover-value dd");
    const badge = preview.locator(".cu-flyover-confidence");

    for (const target of [name, source]) {
        await target.hover();
        await expect(preview.locator(".cu-popover-heading")).toHaveText("CustomerName");
        await expect(value).toHaveText("MICROSOFT CORPORATION");
        await expect(value).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
        await expect(value).toHaveCSS("box-shadow", "none");
        await expect(preview.locator(".cu-popover-heading")).toHaveCSS("background-color", "rgb(229, 218, 255)");
        await expect(badge.locator("dd")).toHaveText("0.34");
        await expect(badge).toHaveCSS("background-color", "rgb(255, 218, 221)");
        await expect(cell).toHaveCSS("background-color", "rgb(220, 251, 215)");
        await expect(cell).toHaveCSS("box-shadow", /180, 60, 75/);
        await expect(source).toHaveCSS("fill", "rgb(220, 251, 215)");
    }
});

test("the invoice tooltip reuses the Extracted Value background without coloring the label or frame", async ({ page }) => {
    await page.goto("/?sample=labels");
    await ready(page);
    const flyout = page.getByRole("tooltip", { name: "Field preview", exact: true });
    const extractedValue = flyout.locator('[data-comparison-side="extracted"] .cu-flyover-comparison-value');
    for (const [field, color] of [
        ["CustomerId", "rgb(255, 218, 221)"],
        ["InvoiceId", "rgb(220, 251, 215)"],
        ["CountryRegion", "rgb(203, 234, 241)"],
        ["AmountDue", "rgb(251, 226, 193)"],
    ] as const) {
        const cell = page.locator(`tr[data-comparison-path="/${field}"] > td:nth-child(3) .cu-comparison-value`);
        await expect(cell).toHaveCSS("background-color", color);
        await cell.locator(".cu-field-value").hover();
        await expect(flyout.locator(".cu-popover-heading")).toHaveText(field);
        await expect(extractedValue).toHaveCSS("background-color", color);
        await expect(extractedValue).toHaveCSS("box-shadow", "none");
        await expect(flyout.locator('[data-comparison-side="label"] .cu-flyover-comparison-value'))
            .toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    }
});

test("partial-match object summaries stay pastel orange when collapsed or expanded", async ({ page }) => {
    const pane = await reference(page);
    const group = (matched: string, mismatched: string) => ({
        type: "object", valueObject: { Matched: text(matched), Mismatched: text(mismatched) },
    });
    await upload(page, "Choose local label JSON", { fieldLabels: {
        GeneratedField: group("Same", "Expected"), FullyDifferent: group("Old value", "Other expected value"),
    } }, "mixed-groups.pdf.labels.json");
    await upload(page, "Choose saved Analyze JSON", result({
        GeneratedField: group("Same", "Actual"), FullyDifferent: group("New value", "Different value"),
    }), "mixed-groups.pdf.result.json");

    const grid = pane.getByRole("treegrid", { name: "Compared fields", exact: true });
    const partial = grid.locator('tr[data-comparison-path="/GeneratedField"]');
    const fullError = grid.locator('tr[data-comparison-path="/FullyDifferent"]');
    const extractedValue = (row: typeof partial) => row.locator("td").nth(2).locator(".cu-comparison-value");
    await expect(extractedValue(partial)).toHaveCSS("background-color", "rgb(251, 226, 193)");
    await expect(extractedValue(fullError)).toHaveCSS("background-color", "rgb(255, 218, 221)");

    await partial.getByRole("button", { name: /^Expand / }).click();
    await expect(extractedValue(partial)).toHaveCSS("background-color", "rgb(251, 226, 193)");
    await expect(extractedValue(grid.locator('tr[data-comparison-path="/GeneratedField/Matched"]')))
        .toHaveCSS("background-color", "rgb(220, 251, 215)");
    await expect(extractedValue(grid.locator('tr[data-comparison-path="/GeneratedField/Mismatched"]')))
        .toHaveCSS("background-color", "rgb(255, 218, 221)");
    await partial.getByRole("button", { name: /^Collapse / }).click();
    await expect(extractedValue(partial)).toHaveCSS("background-color", "rgb(251, 226, 193)");
    await fullError.getByRole("button", { name: /^Expand / }).click();
    await expect(extractedValue(fullError)).toHaveCSS("background-color", "rgb(255, 218, 221)");
});

test("overlapping monetary sources select the whole amount and hide only related confidence borders", async ({ page }) => {
    const pane = await reference(page);
    await upload(page, "Choose local label JSON", { fieldLabels: {
        Total: { type: "object", valueObject: {
            Amount: { type: "number", valueNumber: 10, source: "D(1,2,2,0.1,0.2);D(1,2.12,2,0.78,0.2)" },
            CurrencyCode: { type: "string" },
        } },
        Other: text("Other", "D(1,4,2,0.8,0.2)"),
    } }, "money.pdf.labels.json");
    await upload(page, "Choose saved Analyze JSON", result({
        Total: { type: "object", valueObject: {
            Amount: { type: "number", valueNumber: 10, confidence: 0.4, source: "D(1,2.12,2,0.78,0.2)" },
            CurrencyCode: { type: "string", valueString: "USD", confidence: 0.3, source: "D(1,2,2,0.9,0.2)" },
        } },
        Other: { ...text("Other", "D(1,4,2,0.8,0.2)"), confidence: 0.2 },
    }), "money.pdf.result.json");

    const overlay = page.getByTestId("result-overlay");
    const amountId = "/contents/0/fields/Total/valueObject/Amount";
    const currencyId = "/contents/0/fields/Total/valueObject/CurrencyCode";
    const amount = overlay.locator(`polygon[data-outline-id="${amountId}"]`);
    const currency = overlay.locator(`polygon[data-outline-id="${currencyId}"]`);
    const edge = (id: string) => overlay.locator(
        `[data-low-confidence][data-source-edge-id="${id}"], [data-low-confidence][data-related-source-id="${id}"]`);
    const amountEdge = edge(amountId), currencyEdge = edge(currencyId), otherEdge = edge("/contents/0/fields/Other");
    const amountPoints = await amount.getAttribute("points"), currencyPoints = await currency.getAttribute("points");
    const amountBounds = await amount.boundingBox(), currencyBounds = await currency.boundingBox();
    if (!amountBounds || !currencyBounds || !amountPoints || !currencyPoints) throw new Error("Monetary source geometry is unavailable.");
    await expect(amountEdge).toHaveCount(1);
    await expect(currencyEdge).toHaveCount(1);
    await expect(amountEdge).toHaveAttribute("data-monetary-confidence", "true");
    await expect(currencyEdge).toHaveAttribute("data-monetary-confidence", "true");
    expect(await amountEdge.evaluate((element, selector) => element === document.querySelector(selector),
        `[data-low-confidence][data-related-source-id="${currencyId}"]`)).toBe(true);
    await expect(otherEdge).toHaveCount(1);

    const preview = page.getByTestId("preview-overlay").locator("polygon");
    await page.mouse.move(amountBounds.x + amountBounds.width / 2, amountBounds.y + amountBounds.height / 2);
    await expect(preview).toHaveCount(1);
    await expect(preview).toHaveAttribute("data-source-id", amountId);
    const frame = await preview.boundingBox();
    if (!frame) throw new Error("The monetary preview is unavailable.");
    expect(frame.x).toBeLessThanOrEqual(currencyBounds.x);
    expect(frame.x + frame.width).toBeGreaterThanOrEqual(currencyBounds.x + currencyBounds.width);
    await expect(amountEdge).toHaveCount(0);
    await expect(currencyEdge).toHaveCount(0);
    await expect(otherEdge).toHaveCount(1);

    await page.locator(".prototype-banner").hover();
    await expect(amountEdge).toHaveCount(1);
    await expect(currencyEdge).toHaveCount(1);
    const symbol = { x: currencyBounds.x + currencyBounds.width * 0.05, y: currencyBounds.y + currencyBounds.height / 2 };
    await page.mouse.move(symbol.x, symbol.y);
    await expect(preview).toHaveAttribute("data-source-id", amountId);
    await page.mouse.click(symbol.x, symbol.y);
    const pinned = page.getByTestId("source-overlay").locator("polygon");
    await expect(pinned).toHaveCount(1);
    await expect(pinned).toHaveAttribute("data-source-id", amountId);
    await page.locator(".prototype-banner").hover();
    await expect(amountEdge).toHaveCount(0);
    await expect(currencyEdge).toHaveCount(0);
    await expect(otherEdge).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(amountEdge).toHaveCount(1);
    await expect(currencyEdge).toHaveCount(1);

    await expandField(page, "Total");
    const label = pane.getByRole("button", { name: "Select label value of Total / Amount", exact: true });
    await label.hover();
    await expect(preview).toHaveCount(1);
    await expect(preview).toHaveAttribute("data-region-indices", "0 1");
    await expect(currencyEdge).toHaveCount(0);
    await label.click();
    await expect(pinned).toHaveCount(1);
    await expect(pinned).toHaveAttribute("data-region-indices", "0 1");
    await page.locator(".prototype-banner").hover();
    await expect(currencyEdge).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(currencyEdge).toHaveCount(1);

    const extractedAmount = pane.getByRole("button", { name: "Select extracted value of Total / Amount", exact: true });
    await extractedAmount.hover();
    await expect(preview).toHaveCount(1);
    const extractedFrame = await preview.boundingBox(), currentCurrency = await currency.boundingBox();
    if (!extractedFrame || !currentCurrency) throw new Error("The extracted monetary preview is unavailable.");
    expect(extractedFrame.x).toBeLessThanOrEqual(currentCurrency.x);
    expect(extractedFrame.x + extractedFrame.width).toBeGreaterThanOrEqual(currentCurrency.x + currentCurrency.width);
    await expect(amountEdge).toHaveCount(0);
    await expect(currencyEdge).toHaveCount(0);
    await expect(otherEdge).toHaveCount(1);
    await extractedAmount.click();
    await expect(pinned).toHaveCount(1);
    await expect(pinned).toHaveAttribute("data-source-id", amountId);
    const extractedPin = await pinned.boundingBox(), pinnedCurrency = await currency.boundingBox();
    if (!extractedPin || !pinnedCurrency) throw new Error("The extracted monetary selection is unavailable.");
    expect(extractedPin.x).toBeLessThanOrEqual(pinnedCurrency.x);
    expect(extractedPin.x + extractedPin.width).toBeGreaterThanOrEqual(pinnedCurrency.x + pinnedCurrency.width);
    await page.locator(".prototype-banner").hover();
    await expect(amountEdge).toHaveCount(0);
    await expect(currencyEdge).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(amountEdge).toHaveCount(1);
    await expect(currencyEdge).toHaveCount(1);

    const extractedGroup = pane.getByRole("button", { name: "Select extracted value of Total", exact: true });
    await extractedGroup.hover();
    await expect(preview).toHaveCount(1);
    await extractedGroup.click();
    await expect(pinned).toHaveCount(1);
    await expect(pinned).toHaveAttribute("data-region-indices", "0 1");
    await page.locator(".prototype-banner").hover();
    await expect(amountEdge).toHaveCount(0);
    await expect(currencyEdge).toHaveCount(0);
    await expect(otherEdge).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(amountEdge).toHaveCount(1);
    await expect(currencyEdge).toHaveCount(1);

    const labelGroup = pane.getByRole("button", { name: "Select label value of Total", exact: true });
    await labelGroup.hover();
    await expect(preview).toHaveCount(1);
    await labelGroup.click();
    await expect(pinned).toHaveCount(1);
    await expect(pinned).toHaveAttribute("data-region-indices", "0 1");
    await page.locator(".prototype-banner").hover();
    await expect(currencyEdge).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(currencyEdge).toHaveCount(1);

    await expect(amount).toHaveAttribute("points", amountPoints);
    await expect(currency).toHaveAttribute("points", currencyPoints);

    await page.getByRole("combobox", { name: "Zoom", exact: true }).selectOption({ label: "25%" });
    await ready(page);
    await rotateSource(page);
    await extractedAmount.hover();
    await expect(preview).toHaveCount(1);
    await expect(preview).toHaveAttribute("data-source-id", amountId);
    const rotatedFrame = await preview.boundingBox(), rotatedCurrency = await currency.boundingBox();
    if (!rotatedFrame || !rotatedCurrency) throw new Error("The rotated monetary preview is unavailable.");
    expect(rotatedFrame.x).toBeLessThanOrEqual(rotatedCurrency.x);
    expect(rotatedFrame.y).toBeLessThanOrEqual(rotatedCurrency.y);
    expect(rotatedFrame.x + rotatedFrame.width).toBeGreaterThanOrEqual(rotatedCurrency.x + rotatedCurrency.width);
    expect(rotatedFrame.y + rotatedFrame.height).toBeGreaterThanOrEqual(rotatedCurrency.y + rotatedCurrency.height);
    await expect(amountEdge).toHaveCount(0);
    await expect(currencyEdge).toHaveCount(0);
    await expect(otherEdge).toHaveCount(1);
    await label.hover();
    await expect(preview).toHaveCount(1);
    await expect(preview).toHaveAttribute("data-region-indices", "0 1");
    await label.click();
    await expect(pinned).toHaveCount(1);
    await expect(pinned).toHaveAttribute("data-region-indices", "0 1");
});

test("one low-confidence monetary component draws one shared red frame around the whole amount", async ({ page }) => {
    await reference(page);
    await upload(page, "Choose local label JSON", { fieldLabels: {
        CurrencyLow: { type: "object", valueObject: {
            Amount: { type: "number", valueNumber: 10, source: "D(1,2.12,2,0.78,0.2)" },
            CurrencyCode: { type: "string" },
        } },
        AmountLow: { type: "object", valueObject: {
            Amount: { type: "number", valueNumber: 20, source: "D(1,2.12,4,0.78,0.2)" },
            CurrencyCode: { type: "string" },
        } },
    } }, "single-low-money.pdf.labels.json");
    await upload(page, "Choose saved Analyze JSON", result({
        CurrencyLow: { type: "object", valueObject: {
            Amount: { type: "number", valueNumber: 10, confidence: 0.9, source: "D(1,2.12,2,0.78,0.2)" },
            CurrencyCode: { type: "string", valueString: "USD", confidence: 0.3, source: "D(1,2,2,0.9,0.2)" },
        } },
        AmountLow: { type: "object", valueObject: {
            Amount: { type: "number", valueNumber: 20, confidence: 0.3, source: "D(1,2.12,4,0.78,0.2)" },
            CurrencyCode: { type: "string", valueString: "USD", confidence: 0.9, source: "D(1,2,4,0.9,0.2)" },
        } },
    }), "single-low-money.pdf.result.json");

    const overlay = page.getByTestId("result-overlay");
    await page.getByRole("heading", { name: "CU Viewer", exact: true }).hover();
    await expect(overlay.locator("[data-monetary-confidence]")).toHaveCount(2);
    for (const name of ["CurrencyLow", "AmountLow"]) {
        await page.getByRole("heading", { name: "CU Viewer", exact: true }).hover();
        const amountId = `/contents/0/fields/${name}/valueObject/Amount`;
        const currencyId = `/contents/0/fields/${name}/valueObject/CurrencyCode`;
        const amount = overlay.locator(`polygon[data-outline-id="${amountId}"]`);
        const currency = overlay.locator(`polygon[data-outline-id="${currencyId}"]`);
        const frame = overlay.locator(
            `[data-monetary-confidence][data-source-edge-id="${amountId}"][data-related-source-id="${currencyId}"]`);
        await expect(frame).toHaveCount(1);
        const amountBounds = await amount.boundingBox(), currencyBounds = await currency.boundingBox();
        const frameBounds = await frame.boundingBox();
        if (!amountBounds || !currencyBounds || !frameBounds) throw new Error("Monetary confidence geometry is unavailable.");
        expect(frameBounds.x).toBeLessThanOrEqual(Math.min(amountBounds.x, currencyBounds.x));
        expect(frameBounds.x + frameBounds.width).toBeGreaterThanOrEqual(
            Math.max(amountBounds.x + amountBounds.width, currencyBounds.x + currencyBounds.width));
        await page.mouse.move(frameBounds.x + frameBounds.width / 2, frameBounds.y + frameBounds.height / 2);
        await expect(frame).toHaveCount(0);
    }

    await page.getByRole("heading", { name: "CU Viewer", exact: true }).hover();
    await page.getByRole("button", { name: "Highlighting legend", exact: true }).click();
    const legend = page.getByRole("dialog", { name: "Legend", exact: true });
    await legend.getByRole("switch", { name: "Show field highlights", exact: true }).uncheck();
    await legend.getByRole("switch", { name: "Show array highlights", exact: true }).uncheck();
    await expect(overlay.locator('polygon[data-outline-id]:not([fill="none"])')).toHaveCount(0);
    await expect(overlay.locator("[data-monetary-confidence]")).toHaveCount(2);
    const low = legend.getByRole("switch", { name: "Show low confidence outlines", exact: true });
    await low.uncheck();
    await expect(overlay.locator("[data-low-confidence]")).toHaveCount(0);
    await low.check();
    await expect(overlay.locator("[data-monetary-confidence]")).toHaveCount(2);
    await page.keyboard.press("Escape");
    const frame = overlay.locator('[data-monetary-confidence][data-source-edge-id="/contents/0/fields/CurrencyLow/valueObject/Amount"]');
    const frameBounds = await frame.boundingBox();
    if (!frameBounds) throw new Error("The unfilled monetary confidence frame is unavailable.");
    await page.mouse.move(frameBounds.x + frameBounds.width / 2, frameBounds.y + frameBounds.height / 2);
    await expect(frame).toHaveCount(0);
    await page.getByRole("heading", { name: "CU Viewer", exact: true }).hover();
    await expect(frame).toHaveCount(1);
});

test("a currency source in a different location is not joined to an amount", async ({ page }) => {
    const pane = await reference(page);
    await upload(page, "Choose local label JSON", { fieldLabels: {
        Total: { type: "object", valueObject: {
            Amount: { type: "number", valueNumber: 10, source: "D(1,4,3,0.8,0.2)" },
            CurrencyCode: { type: "string" },
        } },
    } }, "distant-money.pdf.labels.json");
    await upload(page, "Choose saved Analyze JSON", result({
        Total: { type: "object", valueObject: {
            Amount: { type: "number", valueNumber: 10, confidence: 0.9, source: "D(1,4,3,0.8,0.2)" },
            CurrencyCode: { type: "string", valueString: "USD", confidence: 0.3, source: "D(1,2,3,0.9,0.2)" },
        } },
    }), "distant-money.pdf.result.json");
    await expandField(page, "Total");
    const amountId = "/contents/0/fields/Total/valueObject/Amount";
    const currencyId = "/contents/0/fields/Total/valueObject/CurrencyCode";
    const overlay = page.getByTestId("result-overlay");
    const amount = overlay.locator(`polygon[data-outline-id="${amountId}"]`);
    const currency = overlay.locator(`polygon[data-outline-id="${currencyId}"]`);
    const edge = overlay.locator(`[data-low-confidence][data-source-edge-id="${currencyId}"]`);
    await pane.getByRole("button", { name: "Select extracted value of Total / Amount", exact: true }).hover();
    const preview = page.getByTestId("preview-overlay").locator("polygon");
    await expect(preview).toHaveAttribute("points", (await amount.getAttribute("points"))!);
    await expect(edge).toHaveCount(1);
    const bounds = await currency.boundingBox();
    if (!bounds) throw new Error("The distant currency source is unavailable.");
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await expect(preview).toHaveAttribute("data-source-id", currencyId);
    await pane.getByRole("button", { name: "Select extracted value of Total", exact: true }).click();
    await expect(page.getByTestId("source-overlay").locator("polygon")).toHaveCount(2);
});

test("separate monetary occurrences retain their own selection frames and source indices", async ({ page }) => {
    const pane = await reference(page);
    await upload(page, "Choose local label JSON", { fieldLabels: {
        Total: { type: "object", valueObject: {
            Amount: { type: "number", valueNumber: 10,
                source: "D(1,1,2,0.1,0.2);D(1,1.12,2,0.78,0.2);D(1,4,2,0.1,0.2);D(1,4.12,2,0.78,0.2)" },
            CurrencyCode: { type: "string" },
        } },
    } }, "repeated-money.pdf.labels.json");
    await upload(page, "Choose saved Analyze JSON", result({
        Total: { type: "object", valueObject: {
            Amount: { type: "number", valueNumber: 10, confidence: 0.4,
                source: "D(1,1.12,2,0.78,0.2);D(1,4.12,2,0.78,0.2)" },
            CurrencyCode: { type: "string", valueString: "USD", confidence: 0.3,
                source: "D(1,1,2,0.9,0.2);D(1,4,2,0.9,0.2)" },
        } },
    }), "repeated-money.pdf.result.json");

    const pinned = page.getByTestId("source-overlay").locator("polygon");
    const indices = () => pinned.evaluateAll(elements => elements.map(element => element.getAttribute("data-region-indices")));
    await pane.getByRole("button", { name: "Select extracted value of Total", exact: true }).click();
    await expect(pinned).toHaveCount(2);
    expect(await indices()).toEqual(["0 2", "1 3"]);
    await page.keyboard.press("Escape");

    await expandField(page, "Total");
    await pane.getByRole("button", { name: "Select extracted value of Total / Amount", exact: true }).click();
    await expect(pinned).toHaveCount(2);
    expect(await indices()).toEqual(["0", "1"]);
    await page.keyboard.press("Escape");

    await pane.getByRole("button", { name: "Select label value of Total / Amount", exact: true }).click();
    await expect(pinned).toHaveCount(2);
    expect(await indices()).toEqual(["0 1", "2 3"]);
});

test("overlapping monetary values resolve hover and click through the matching currency source", async ({ page }) => {
    await reference(page);
    await upload(page, "Choose local label JSON", { fieldLabels: {
        Distractor: { type: "object", valueObject: {
            Amount: { type: "number", valueNumber: 10, source: "D(1,2.12,2,0.78,0.2)" },
            CurrencyCode: { type: "string" },
        } },
        Total: { type: "object", valueObject: {
            Amount: { type: "number", valueNumber: 30, source: "D(1,2.12,2,0.78,0.2)" },
            CurrencyCode: { type: "string" },
        } },
    } }, "overlapping-money.pdf.labels.json");
    await upload(page, "Choose saved Analyze JSON", result({
        Distractor: { type: "object", valueObject: {
            Amount: { type: "number", valueNumber: 10, confidence: 0.9, source: "D(1,2.12,2,0.78,0.2)" },
            CurrencyCode: { type: "string", valueString: "USD", confidence: 0.9, source: "D(1,4,2,0.9,0.2)" },
        } },
        Total: { type: "object", valueObject: {
            Amount: { type: "number", valueNumber: 30, confidence: 0.9, source: "D(1,2.12,2,0.78,0.2)" },
            CurrencyCode: { type: "string", valueString: "USD", confidence: 0.4, source: "D(1,2,2,0.9,0.2)" },
        } },
    }), "overlapping-money.pdf.result.json");

    const totalAmountId = "/contents/0/fields/Total/valueObject/Amount";
    const totalCurrencyId = "/contents/0/fields/Total/valueObject/CurrencyCode";
    const totalAmount = page.getByTestId("result-overlay").locator(`polygon[data-outline-id="${totalAmountId}"]`);
    const totalCurrency = page.getByTestId("result-overlay").locator(`polygon[data-outline-id="${totalCurrencyId}"]`);
    const amountBounds = await totalAmount.boundingBox(), currencyBounds = await totalCurrency.boundingBox();
    if (!amountBounds || !currencyBounds) throw new Error("Overlapping monetary geometry is unavailable.");
    const preview = page.getByTestId("preview-overlay").locator("polygon");
    const symbol = { x: currencyBounds.x + currencyBounds.width * 0.05, y: currencyBounds.y + currencyBounds.height / 2 };
    const number = { x: amountBounds.x + amountBounds.width / 2, y: amountBounds.y + amountBounds.height / 2 };
    for (const point of [symbol, number]) {
        await page.mouse.move(point.x, point.y);
        await expect(preview).toHaveAttribute("data-source-id", totalAmountId);
        const frame = await preview.boundingBox();
        if (!frame) throw new Error("The whole monetary preview is unavailable.");
        expect(frame.x).toBeLessThanOrEqual(currencyBounds.x);
        expect(frame.x + frame.width).toBeGreaterThanOrEqual(currencyBounds.x + currencyBounds.width);
        await page.mouse.click(point.x, point.y);
        await expect(page.getByTestId("source-overlay").locator("polygon"))
            .toHaveAttribute("data-source-id", totalAmountId);
        await page.keyboard.press("Escape");
    }
});

test("the real invoice resolves a shared digit region to the matching complete monetary source", async ({ page }) => {
    await page.goto("/?sample=labels");
    await ready(page);
    const pane = page.getByRole("region", { name: "Extraction results", exact: true });
    const amountId = "/contents/0/fields/LineItems/valueArray/1/valueObject/TotalAmount/valueObject/Amount";
    const currencyId = "/contents/0/fields/LineItems/valueArray/1/valueObject/TotalAmount/valueObject/CurrencyCode";
    const amount = page.getByTestId("result-overlay").locator(`polygon[data-outline-id="${amountId}"]`);
    const currency = page.getByTestId("result-overlay").locator(`polygon[data-outline-id="${currencyId}"]`);
    const amountBounds = await amount.boundingBox(), currencyBounds = await currency.boundingBox();
    if (!amountBounds || !currencyBounds) throw new Error("The shared invoice amount source is unavailable.");
    const preview = page.getByTestId("preview-overlay").locator("polygon");
    const pin = page.getByTestId("source-overlay").locator("polygon");
    const points = [
        { x: amountBounds.x + amountBounds.width / 2, y: amountBounds.y + amountBounds.height / 2 },
        { x: currencyBounds.x + currencyBounds.width * 0.05, y: currencyBounds.y + currencyBounds.height / 2 },
    ];
    for (const point of points) {
        await page.mouse.move(point.x, point.y);
        await expect(preview).toHaveAttribute("data-source-id", amountId);
        const frame = await preview.boundingBox();
        if (!frame) throw new Error("The full invoice amount frame is unavailable.");
        expect(frame.x).toBeLessThanOrEqual(currencyBounds.x);
        expect(frame.x + frame.width).toBeGreaterThanOrEqual(currencyBounds.x + currencyBounds.width);
        await page.mouse.click(point.x, point.y);
        await expect(pin).toHaveAttribute("data-source-id", amountId);
        await page.keyboard.press("Escape");
    }

    await pane.getByRole("button", {
        name: "Select extracted value of LineItems / Item 2 / TotalAmount / Amount", exact: true,
    }).hover();
    await expect(preview).toHaveAttribute("data-source-id", amountId);
});

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
    await pane.getByRole("group", { name: "LineItems array layout", exact: true })
        .getByRole("button", { name: "Stacked", exact: true }).click();
    expect(await pane.locator('[data-comparison-path="/InvoiceNumber"]').evaluate(row => row.getBoundingClientRect().height))
        .toBeLessThanOrEqual(28);
    const dates = pane.getByRole("table", { name: "LineItems label values", exact: true }).locator("tbody tr").first().locator("td").first();
    expect(await dates.getByRole("button", { name: /Select label value/ }).evaluate(button =>
        button.scrollWidth <= button.clientWidth)).toBe(true);
    for (const width of [1440, 1030]) {
        await page.setViewportSize({ width, height: 1000 });
        if (width === 1440) {
            expect(await pane.locator(".cu-comparison-array-scroll").evaluateAll(elements =>
                elements.map(element => element.scrollWidth <= element.clientWidth))).toEqual([true, true]);
        }
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

test.describe("Paired label frame readability", () => {
    test.use({ viewport: { width: 1227, height: 888 }, deviceScaleFactor: 2 });

    test("paired regions do not block their own label fragments but unrelated fields still do", async ({ page }) => {
        await reference(page);
        const fragments = (x: number) => text("AB", `D(1,${x},1,0.25,0.2);D(1,${x + 0.26},1,0.25,0.2)`);
        await upload(page, "Choose local label JSON", { fieldLabels: {
            Joined: fragments(1), Blocked: fragments(3),
        } }, "fragments.pdf.labels.json");
        await upload(page, "Choose saved Analyze JSON", result({
            Joined: text("AB", "D(1,0.8,0.9,0.9,0.4)"),
            JoinedAlias: { ...text("Same source", "D(1,1.7,1.3,1.7,0.9,0.8,0.9,0.8,1.3)"), confidence: 0.3 },
            JoinedSubset: { ...text("Part of a label fragment", "D(1,1.05,1.02,0.1,0.16)"), confidence: 0.4 },
            Blocked: text("AB", "D(1,2.8,0.9,0.9,0.4)"),
            Other: text("X", "D(1,3.25,1,0.01,0.2)"),
        }), "fragments.pdf.result.json");
        await expect(page.getByRole("columnheader", { name: "Extracted Value", exact: true })).toBeVisible();
        const background = page.getByTestId("result-overlay").locator("polygon");
        const rawPoints = await background.evaluateAll(elements => elements.map(element => element.getAttribute("points")));
        const joined = page.getByRole("button", { name: "Select label value of Joined", exact: true });
        await joined.hover();
        const preview = page.getByTestId("preview-overlay").locator('polygon[data-source-id="/labels/fields/Joined"]');
        await expect(preview).toHaveCount(1);
        await expect(preview).toHaveAttribute("data-region-indices", "0 1");
        const own = await preview.boundingBox();
        const counterpart = await page.getByTestId("result-overlay")
            .locator('polygon[data-outline-id="/contents/0/fields/Joined"]').boundingBox();
        if (!own || !counterpart) throw new Error("The paired source frames are unavailable.");
        expect(own.x).toBeGreaterThan(counterpart.x);
        expect(own.x + own.width).toBeLessThan(counterpart.x + counterpart.width);
        await joined.click();
        await expect(page.getByTestId("source-overlay").locator('polygon[data-source-id="/labels/fields/Joined"]'))
            .toHaveAttribute("data-region-indices", "0 1");
        await page.keyboard.press("Escape");
        const blocked = page.getByRole("button", { name: "Select label value of Blocked", exact: true });
        await blocked.hover();
        await expect(page.getByTestId("preview-overlay").locator('polygon[data-source-id="/labels/fields/Blocked"]'))
            .toHaveCount(2);
        await blocked.click();
        await expect(page.getByTestId("source-overlay").locator('polygon[data-source-id="/labels/fields/Blocked"]'))
            .toHaveCount(2);
        expect(await background.evaluateAll(elements => elements.map(element => element.getAttribute("points")))).toEqual(rawPoints);
    });

    test("real invoice label addresses merge across coincident extracted sources", async ({ page }) => {
        await page.goto("/?sample=labels");
        await ready(page);
        const overlay = page.getByTestId("result-overlay");
        const country = "/contents/0/fields/CountryRegion";
        const countryEdges = overlay.locator(`[data-low-confidence][data-source-edge-id="${country}"]`);
        for (const rotate of [false, true]) {
            if (rotate) {
                await page.getByRole("combobox", { name: "Zoom", exact: true }).selectOption({ label: "125%" });
                await ready(page);
                await rotateSource(page);
            }
            for (const [address, count] of [["CustomerAddress", 8], ["VendorAddress", 9]] as const) {
                await page.locator(".prototype-banner").hover();
                await page.keyboard.press("Escape");
                await expect(countryEdges).toHaveCount(2);
                const extracted = overlay.locator(`polygon[data-outline-id="/contents/0/fields/${address}"]`).nth(1);
                const points = await extracted.getAttribute("points");
                if (!points) throw new Error("The shared address source is unavailable.");
                const path = `M ${points.split(" ").join(" L ")} Z`;
                const sharedEdge = overlay.locator(`[data-low-confidence][data-source-edge-id="${country}"][d="${path}"]`);
                await expect(sharedEdge).toHaveCount(1);
                const button = page.getByRole("button", { name: `Select label value of ${address}`, exact: true });
                await button.hover();
                const preview = page.getByTestId("preview-overlay").locator(`polygon[data-source-id="/labels/fields/${address}"]`);
                await expect(preview).toHaveCount(1);
                await expect(preview).toHaveAttribute("data-region-indices", Array.from({ length: count }, (_, index) => index).join(" "));
                await expect(preview).toHaveAttribute("stroke-width", "1");
                await expect(sharedEdge).toHaveCount(0);
                await expect(countryEdges).toHaveCount(1);
                const frame = await preview.getAttribute("points");
                await button.click();
                const pinned = page.getByTestId("source-overlay").locator(`polygon[data-source-id="/labels/fields/${address}"]`);
                await expect(pinned).toHaveCount(1);
                await expect(pinned).toHaveAttribute("points", frame!);
                await page.locator(".prototype-banner").hover();
                await expect(sharedEdge).toHaveCount(0);
                await page.keyboard.press("Escape");
                await expect(countryEdges).toHaveCount(2);
            }
        }
    });

    test("real paired invoice fragments remain one thin frame for scalars, addresses and array cells at small zoom and rotation",
        async ({ page }) => {
            await page.goto("/?sample=labels");
            await ready(page);
            await expandField(page, "OrderInformation");
            const fields = [
                { name: "InvoiceNumber", path: "InvoiceNumber", fragments: 3 },
                { name: "SellerAddress", path: "SellerAddress", fragments: 11 },
                { name: "AmountDueAmount", path: "AmountDueAmount", fragments: 2 },
                { name: "LineItems / Item 3 / Description", path: "LineItems/valueArray/2/valueObject/Description", fragments: 2 },
                { name: "OrderInformation / PurchaseOrderNumber", path: "OrderInformation/valueObject/PurchaseOrderNumber", fragments: 3 },
            ];
            for (const zoom of ["25%", "page", "75%", "125%"]) {
                if (zoom === "page") await fitSource(page, "page");
                else await page.getByRole("combobox", { name: "Zoom", exact: true }).selectOption({ label: zoom });
                await ready(page);
                for (const rotate of [false, true]) {
                    if (rotate) await rotateSource(page);
                    for (const field of fields) {
                        const button = page.getByRole("button", { name: `Select label value of ${field.name}`, exact: true });
                        const selector = `polygon[data-source-id="/labels/fields/${field.path}"]`;
                        const indices = Array.from({ length: field.fragments }, (_, index) => index).join(" ");
                        await button.hover();
                        const preview = page.getByTestId("preview-overlay").locator(selector);
                        await expect(preview).toHaveCount(1);
                        await expect(preview).toHaveAttribute("data-region-indices", indices);
                        await expect(preview).toHaveAttribute("stroke-width", "1");
                        await expect(preview).toHaveAttribute("vector-effect", "non-scaling-stroke");
                        const points = await preview.getAttribute("points");
                        await button.click();
                        await ready(page);
                        const pinned = page.getByTestId("source-overlay").locator(selector);
                        await expect(pinned).toHaveCount(1);
                        await expect(pinned).toHaveAttribute("data-region-indices", indices);
                        await expect(pinned).toHaveAttribute("stroke-width", "1");
                        expect(await pinned.getAttribute("points")).toBe(points);
                        await page.keyboard.press("Escape");
                    }
                }
            }
        });
});

test.describe("Confidence border readability", () => {
    test.use({ viewport: { width: 2400, height: 1300 }, deviceScaleFactor: 1 });

    test("real invoice confidence borders stay continuous above fills at small zoom without expanding hit targets", async ({ page }) => {
        await page.goto("/?sample=labels");
        await ready(page);
        const source = page.getByTestId("result-overlay");
        const canvas = page.getByTestId("source-canvas");
        for (const zoom of ["75%", "100%", "125%"]) {
            await page.getByRole("combobox", { name: "Zoom", exact: true }).selectOption({ label: zoom });
            await ready(page);
            await page.getByRole("heading", { name: "CU Viewer", exact: true }).hover();
            const original = await canvas.evaluate(element => {
                if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected the original PDF canvas.");
                return element.toDataURL();
            });
            const rows: number[] = [];
            for (const row of [1, 2]) {
                const id = `/contents/0/fields/LineItems/valueArray/${row}/valueObject/Description`;
                if (await source.locator(`path[data-source-edge-id="${id}"][data-low-confidence="true"]`).count()) rows.push(row);
            }
            expect(rows.length).toBeGreaterThan(0);
            for (const row of rows) {
                const id = `/contents/0/fields/LineItems/valueArray/${row}/valueObject/Description`;
                const region = source.locator(`polygon[data-outline-id="${id}"]`);
                const edge = source.locator(`path[data-source-edge-id="${id}"][data-low-confidence="true"]`);
                await expect(edge).toHaveCSS("stroke", "rgba(180, 60, 75, 0.6)");
                await expect(edge).toHaveAttribute("stroke-width", "1.5");
                await expect(region).toHaveAttribute("fill", "#DCFBD7");
                const geometry = await region.evaluate(element => {
                    if (!(element instanceof SVGPolygonElement)) throw new Error("Expected a source polygon.");
                    const matrix = element.getScreenCTM();
                    if (!matrix) throw new Error("The source transform is unavailable.");
                    const points = Array.from({ length: element.points.numberOfItems }, (_, index) => {
                        const value = element.points.getItem(index);
                        const point = new DOMPoint(value.x, value.y).matrixTransform(matrix);
                        return { x: point.x, y: point.y };
                    });
                    return { raw: element.getAttribute("points"), points };
                });
                const { points } = geometry;
                const left = Math.floor(Math.min(...points.map(point => point.x))) - 3;
                const top = Math.floor(Math.min(...points.map(point => point.y))) - 3;
                const clip = { x: left, y: top, width: Math.ceil(Math.max(...points.map(point => point.x))) + 3 - left,
                    height: Math.ceil(Math.max(...points.map(point => point.y))) + 3 - top };
                const pixels = await screenshotPixels(page, clip);
                expect(pixels.ratio).toBe(1);
                const start = points[3]!, end = points[2]!;
                let columns = 0, redColumns = 0;
                for (let x = Math.ceil(start.x) + 2; x < Math.floor(end.x) - 2; x++) {
                    const lineY = start.y + (end.y - start.y) * (x + 0.5 - start.x) / (end.x - start.x);
                    let red = false;
                    for (let y = Math.floor(lineY) - 1; y <= Math.ceil(lineY) + 1; y++) {
                        const index = ((y - clip.y) * pixels.width + x - clip.x) * 4;
                        const r = pixels.data[index]!, g = pixels.data[index + 1]!, b = pixels.data[index + 2]!;
                        if (r > g + 15 && r > b + 15 && r > 80 && g < 235) red = true;
                    }
                    columns++;
                    if (red) redColumns++;
                }
                expect(columns).toBeGreaterThan(40);
                expect(redColumns, `${zoom}: ${id} has a missing bottom-border segment`).toBe(columns);
                expect(await edge.evaluate(element => {
                    const svg = element.closest("svg");
                    if (!svg) throw new Error("The source SVG is unavailable.");
                    return [...svg.querySelectorAll("polygon[data-outline-id]")].every(fill =>
                        Boolean(fill.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING));
                })).toBe(true);
                await expect(edge).toHaveCSS("pointer-events", "none");
                const hit = await region.evaluate((element, points) => {
                    const center = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length,
                        y: sum.y + point.y / points.length }), { x: 0, y: 0 });
                    const first = points[0]!, next = points[1]!;
                    const dx = next.x - first.x, dy = next.y - first.y, length = Math.hypot(dx, dy);
                    const outside = { x: (first.x + next.x) / 2 + dy / length * 0.5,
                        y: (first.y + next.y) / 2 - dx / length * 0.5 };
                    const edge = element.parentElement?.querySelector<SVGPathElement>(
                        `path[data-source-edge-id="${element.getAttribute("data-outline-id")}"][data-low-confidence="true"]`);
                    if (!edge) throw new Error("The confidence border is unavailable.");
                    const readHit = () => {
                        const hit = document.elementFromPoint(outside.x, outside.y);
                        return { tag: hit?.tagName, id: hit?.getAttribute("data-outline-id") };
                    };
                    const painted = readHit(), display = edge.style.display;
                    let unpainted;
                    edge.style.display = "none";
                    try { unpainted = readHit(); } finally { edge.style.display = display; }
                    return { inside: document.elementFromPoint(center.x, center.y)?.getAttribute("data-outline-id"),
                        painted, unpainted, raw: element.getAttribute("points") };
                }, points);
                expect(hit.inside).toBe(id);
                expect(hit.painted).toEqual(hit.unpainted);
                expect(hit.raw).toBe(geometry.raw);
            }
            expect(await canvas.evaluate(element => {
                if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected the unchanged PDF canvas.");
                return element.toDataURL();
            })).toBe(original);
        }
    });
});

test("comparison layout preserves saved resizing and resets to its own default without changing ordinary layout", async ({ page }) => {
    await page.goto("/?sample=labels");
    await ready(page);
    const source = page.locator(".cu-source-pane");
    const initial = await source.evaluate(element => element.getBoundingClientRect().width);
    const splitter = page.getByRole("separator", { name: "Source and results width", exact: true });
    await splitter.press("ArrowRight");
    await expect.poll(() => source.evaluate(element => element.getBoundingClientRect().width)).toBeCloseTo(initial + 24, 0);
    const saved = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
    await page.reload();
    await ready(page);
    await expect.poll(() => source.evaluate(element => element.getBoundingClientRect().width)).toBeCloseTo(initial + 24, 0);
    expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage)))).toBe(saved);
    await page.getByRole("button", { name: "PDF", exact: true }).click();
    await ready(page);
    expect(await source.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(initial + 24);
    await page.getByRole("button", { name: "PDF + Labels", exact: true }).click();
    await ready(page);
    await expect.poll(() => source.evaluate(element => element.getBoundingClientRect().width)).toBeCloseTo(initial + 24, 0);
    await splitter.dblclick();
    await expect.poll(() => source.evaluate(element => element.getBoundingClientRect().width)).toBeCloseTo(initial, 0);
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
    await expect(equal.locator("..")).toHaveCSS("box-shadow", /180, 60, 75, 0.6/);
    await expect(pane.locator('[data-comparison-path="/Missing"] td').nth(2).getByLabel("Not extracted", { exact: true })).toHaveText("Not returned");
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
    await expect(flyout.locator(".cu-popover-heading")).toHaveCSS("background-color", "rgb(229, 218, 255)");
    await expect(flyout.locator(".cu-popover-heading")).toHaveCSS("color", "rgb(76, 29, 149)");
    expect(await flyout.evaluate(element => getComputedStyle(element, "::before").backgroundColor)).toBe("rgb(229, 218, 255)");
    await expect(flyout.locator('[data-comparison-side="extracted"] .cu-flyover-comparison-value'))
        .toHaveCSS("background-color", "rgb(220, 251, 215)");
    await expect(flyout.locator('[data-comparison-side="extracted"] .cu-flyover-comparison-value')).toHaveCSS("box-shadow", "none");
    await expect(flyout.locator('[data-comparison-side="extracted"] .cu-flyover-comparison-value')).toHaveCSS("border-top-width", "0px");
    await expect(flyout.locator(".cu-flyover-comparison")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(flyout.locator('[data-comparison-side="extracted"] .cu-flyover-confidence')).toHaveText("0.40");
    await expect(flyout.locator('[data-comparison-side="extracted"] .cu-flyover-confidence'))
        .toHaveCSS("background-color", "rgb(255, 218, 221)");
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
    await expect(legend.locator(".cu-legend-name")).toHaveText([
        "Matches label", "Different or extra extracted value", "Some child values differ", "Low confidence",
    ]);
    expect(await legend.locator(".cu-legend-item .cu-legend-swatch").evaluateAll(nodes =>
        nodes.map(node => getComputedStyle(node).backgroundColor))).toEqual([
        "rgb(220, 251, 215)", "rgb(255, 218, 221)", "rgb(251, 226, 193)",
    ]);
    const lowExample = legend.locator(".cu-legend-outline-swatch");
    await expect(lowExample).toHaveText("123");
    await expect(lowExample).toHaveCSS("background-color", "rgb(220, 251, 215)");
    await expect(lowExample).toHaveCSS("border-color", "rgba(180, 60, 75, 0.6)");
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
    expect(columnWidths[0]).toHaveLength(columnWidths[1]!.length);
    for (const [index, width] of columnWidths[0]!.entries()) expect(width).toBeCloseTo(columnWidths[1]![index]!, 1);
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

test("the legacy palette keeps empty slots neutral and confidence outlines separate from interaction frames", async ({ page }) => {
    const pane = await reference(page);
    await upload(page, "Choose saved Analyze JSON", result({
        ...extracted, Missing: { type: "string", confidence: 0.2 }, BothMissing: { type: "string", confidence: 0.2 },
    }), "color-rules.result.json");
    const empty = pane.locator('[data-comparison-path="/BothMissing"] > td').nth(2).locator(".cu-comparison-value");
    const missing = pane.locator('[data-comparison-path="/Missing"] > td').nth(2).locator(".cu-comparison-value");
    await expect(empty).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(empty).toHaveCSS("box-shadow", "none");
    await expect(missing).toHaveCSS("background-color", "rgb(248, 192, 200)");
    await expect(missing).toHaveCSS("box-shadow", "none");
    await pane.getByRole("button", { name: "Select label value of Missing", exact: true }).hover();
    const absentPreview = page.getByRole("tooltip", { name: "Label preview", exact: true });
    await expect(absentPreview.locator('[data-comparison-side="extracted"] .cu-flyover-comparison-value'))
        .toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(absentPreview.locator('[data-comparison-side="extracted"] .cu-flyover-comparison-value')).toHaveCSS("box-shadow", "none");
    await expect(absentPreview.locator(".cu-flyover-confidence")).toHaveText("0.20");
    await expect(absentPreview.locator(".cu-flyover-confidence")).toHaveCSS("background-color", "rgb(255, 218, 221)");
    await expect(pane.getByRole("button", { name: "Select extracted value of Different", exact: true }).locator(".."))
        .toHaveCSS("background-color", "rgb(255, 218, 221)");
    const equal = pane.getByRole("button", { name: "Select extracted value of Equal", exact: true });
    await equal.focus();
    await expect(equal.locator("..")).toHaveCSS("box-shadow", /180, 60, 75, 0.6/);
    await expect(equal).toHaveCSS("outline-style", "none");
    await expect(equal.locator("..")).toHaveCSS("outline-offset", "0px");
    const colors = await equal.locator("..").evaluate(element => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, text: style.color };
    });
    expect(contrast(colors.background, colors.text)).toBeGreaterThanOrEqual(4.5);
    const id = "/contents/0/fields/Equal";
    const region = page.getByTestId("result-overlay").locator(`[data-outline-id="${id}"]`);
    const edge = page.getByTestId("result-overlay").locator(`[data-source-edge-id="${id}"]`);
    const points = await region.getAttribute("points");
    const raw = await region.boundingBox();
    if (!raw) throw new Error("The low-confidence source region is unavailable.");
    await expect(edge).toHaveCSS("stroke", "rgba(180, 60, 75, 0.6)");
    const edgeWidth = await edge.evaluate(element => parseFloat(getComputedStyle(element).strokeWidth));
    await region.hover();
    const preview = page.getByTestId("preview-overlay").locator("polygon").first();
    const hover = await preview.boundingBox();
    if (!hover) throw new Error("The low-confidence preview frame is unavailable.");
    const clearance = (edgeWidth + await preview.evaluate(element => parseFloat(getComputedStyle(element).strokeWidth))) / 2 + 1;
    expect(raw.x - hover.x).toBeGreaterThan(clearance);
    expect(raw.y - hover.y).toBeGreaterThan(clearance);
    expect(hover.x + hover.width - raw.x - raw.width).toBeGreaterThan(clearance);
    expect(hover.y + hover.height - raw.y - raw.height).toBeGreaterThan(clearance);
    await expect(edge).toHaveCount(0);
    await expect(preview).toHaveCSS("stroke", "rgb(128, 99, 181)");
    await region.click();
    const pin = page.getByTestId("source-overlay").locator("polygon").first();
    await expect(pin).toHaveCSS("stroke", "rgb(91, 33, 182)");
    await expect(edge).toHaveCount(0);
    const pinned = await pin.getAttribute("points");
    await page.getByRole("button", { name: "Highlighting legend", exact: true }).click();
    const legend = page.getByRole("dialog", { name: "Legend", exact: true });
    await legend.getByRole("switch", { name: "Show low confidence outlines", exact: true }).uncheck();
    await expect(equal.locator("..")).toHaveCSS("box-shadow", "none");
    await expect(pin).toHaveAttribute("points", pinned!);
    await expect(region).toHaveAttribute("points", points!);
    await expect(legend.locator(".cu-legend-outline-swatch")).toHaveCSS("border-color", "rgba(180, 60, 75, 0.6)");
    await expect(pane.getByRole("button", { name: "Show matching fields (8 values)", exact: true })).toBeVisible();
    await expect(pane.getByRole("button", { name: "Show incorrect fields (5 values)", exact: true })).toBeVisible();
    await legend.getByRole("button", { name: "Close legend", exact: true }).click();
    await equal.hover();
    await expect(page.getByRole("tooltip").locator(".cu-flyover-confidence")).toHaveCSS("background-color", "rgb(255, 218, 221)");
});

test("comparison searches literal field names, readable parent paths and both values", async ({ page }) => {
    const pane = await reference(page);
    await upload(page, "Choose local label JSON", { fieldLabels: {
        "a/b~c": text("Unique label token"),
        "Group~Name": { type: "object", valueObject: { "Child/Name": text("Nested label") } },
    } }, "search.labels.json");
    await upload(page, "Choose saved Analyze JSON", result({
        "a/b~c": text("Unique extracted token"),
        "Group~Name": { type: "object", valueObject: { "Child/Name": text("Nested extraction") } },
    }), "search.result.json");
    const search = pane.getByRole("searchbox", { name: "Search field names, label values or extracted values", exact: true });
    for (const query of ["a/b~c", "Unique label token", "Unique extracted token"]) {
        await search.fill(query);
        await expect(pane.getByRole("button", { name: "Select label value of a/b~c", exact: true })).toBeVisible();
        await expect(pane.getByRole("button", { name: "Select extracted value of a/b~c", exact: true })).toBeVisible();
        await expect(pane.getByRole("heading", { name: "No matching fields", exact: true })).toHaveCount(0);
    }
    await search.fill("Group~Name / Child/Name");
    await expect(pane.getByRole("button", { name: "Select label value of Group~Name / Child/Name", exact: true })).toBeVisible();
    await expect(pane.getByRole("button", { name: "Select label value of a/b~c", exact: true })).toHaveCount(0);
});

test("reference labels keep distinct scalar and array blues with a separate purple flyout title", async ({ page }) => {
    const pane = await reference(page);
    await expect(pane.getByRole("button", { name: "Select label value of Equal", exact: true }).locator(".."))
        .toHaveCSS("background-color", "rgb(236, 243, 252)");
    const table = pane.getByRole("table", { name: "Items label values", exact: true });
    await expect(table.locator(".cu-comparison-value").first()).toHaveCSS("background-color", "rgb(222, 233, 250)");
    const source = page.getByTestId("result-overlay");
    await expect(source.locator('polygon[data-outline-id="/labels/fields/Equal"]')).toHaveAttribute("fill", "#ECF3FC");
    await expect(source.locator('polygon[data-outline-id="/labels/fields/Items/valueArray/0/valueObject/Code"]'))
        .toHaveAttribute("fill", "#DEE9FA");
    await table.locator(".cu-field-value").first().hover();
    const popup = page.getByRole("tooltip", { name: "Label preview", exact: true });
    await expect(popup.locator(".cu-popover-heading")).toHaveCSS("background-color", "rgb(229, 218, 255)");
    expect(await popup.evaluate(element => getComputedStyle(element, "::before").backgroundColor)).toBe("rgb(229, 218, 255)");
    await expect(popup.locator(".cu-flyover-body")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(popup.locator(".cu-flyover-value dd")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(popup.locator(".cu-flyover-value dd")).toHaveCSS("box-shadow", "none");
});

test("label comparison preserves the unlabeled PDF palette, confidence column and single-array layout", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await setShowConfidence(page, true);
    const pane = page.getByRole("region", { name: "Extraction results", exact: true });
    const billing = pane.locator('[data-field-id="/contents/0/fields/BillingAddress"] .cu-field-value-content');
    await expect(billing).toHaveCSS("background-color", "rgb(220, 251, 215)");
    await expect(billing).toHaveCSS("box-shadow", /180, 60, 75/);
    await expect(pane.getByRole("columnheader", { name: "Confidence", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "PDF + Labels", exact: true }).click();
    await ready(page);
    await expect(pane.getByRole("columnheader", { name: "Extracted Value", exact: true })).toBeVisible();
    await expect(pane.getByRole("columnheader", { name: "Confidence", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "PDF", exact: true }).click();
    await ready(page);
    await expect(pane.getByRole("columnheader", { name: "Confidence", exact: true })).toBeVisible();
    await expect(billing).toHaveCSS("background-color", "rgb(220, 251, 215)");
    await expect(pane.getByRole("table", { name: "LineItems values", exact: true })).toHaveCount(1);
    await expect(pane.locator(".cu-comparison-arrays,.cu-comparison-filters")).toHaveCount(0);
    await expect(page.getByTestId("result-overlay").locator('[data-outline-id="/contents/0/fields/BillingAddress"]').first())
        .toHaveAttribute("fill", "#ECF3FC");
    await pane.locator('.cu-fields-table > tbody > tr[data-field-id="/contents/0/fields/BillingAddress"] .cu-field-name').hover();
    await expect(page.getByTestId("preview-overlay").locator("polygon").first()).toHaveCSS("stroke", "rgb(128, 99, 181)");
    await page.getByRole("button", { name: "Highlighting legend", exact: true }).click();
    const legend = page.getByRole("dialog", { name: "Legend", exact: true });
    await expect(legend.locator(".cu-legend-swatch")).toHaveCount(2);
    await expect(legend.getByRole("switch", { name: "Show low confidence outlines", exact: true })).toBeVisible();
    await expect(legend.getByText("Matches label", { exact: true })).toHaveCount(0);
});

test("both array summaries preview their own sources without inventing ungrounded regions or changing ordinary arrays", async ({ page }) => {
    const pane = await reference(page);
    const rows = (x: number) => ({ type: "array", valueArray: [{
        type: "object", valueObject: { Code: text("A", `D(1,${x},1,1,0.2)`) },
    }] });
    const ungrounded = { type: "array", valueArray: [{ type: "string", valueString: "Unlocated" }] };
    await upload(page, "Choose local label JSON", { fieldLabels: { Rows: rows(1), Ungrounded: ungrounded } }, "arrays.labels.json");
    await upload(page, "Choose saved Analyze JSON", result({ Rows: rows(3), Ungrounded: ungrounded }), "arrays.result.json");
    const label = pane.getByRole("button", { name: "Select label value of Rows", exact: true });
    const extracted = pane.getByRole("button", { name: "Select extracted value of Rows", exact: true });
    const preview = page.getByTestId("preview-overlay").locator("polygon").first();
    await label.hover();
    await expect(page.getByRole("tooltip", { name: "Label preview", exact: true })).toContainText("Extracted Value");
    await expect(preview).toHaveAttribute("data-source-id", "/labels/fields/Rows");
    const labelPoints = await preview.getAttribute("points");
    await label.click();
    const pin = page.getByTestId("source-overlay").locator("polygon").first();
    await expect(pin).toHaveAttribute("data-source-id", "/labels/fields/Rows");
    await extracted.hover();
    const popup = page.getByRole("tooltip", { name: "Field preview", exact: true });
    await expect(popup).toContainText("Label Value");
    await expect(popup).toContainText("Extracted Value");
    await expect(popup.locator(".cu-popover-heading")).toHaveCSS("background-color", "rgb(229, 218, 255)");
    await expect(preview).toHaveAttribute("data-source-id", "/contents/0/fields/Rows");
    expect(await preview.getAttribute("points")).not.toBe(labelPoints);
    await expect(pin).toHaveAttribute("data-source-id", "/labels/fields/Rows");
    await extracted.click();
    await expect(pin).toHaveAttribute("data-source-id", "/contents/0/fields/Rows");
    const pinnedPoints = await pin.getAttribute("points");
    const missing = pane.getByRole("button", { name: "Select extracted value of Ungrounded", exact: true });
    await expect(missing).toHaveAttribute("title", /No source region/);
    await missing.hover();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await expect(page.getByTestId("preview-overlay")).toHaveCount(0);
    await expect(pin).toHaveAttribute("points", pinnedPoints!);
    await page.getByRole("button", { name: "PDF", exact: true }).click();
    await ready(page);
    await pane.locator('.cu-fields-table > tbody > tr[data-field-id="/contents/0/fields/LineItems"] .cu-summary-value').hover();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("array layout controls show side by side before stacked and switch layouts", async ({ page }) => {
    await page.goto("/?sample=labels");
    await ready(page);
    const layout = page.getByRole("group", { name: "LineItems array layout", exact: true });
    const buttons = layout.getByRole("button");
    await expect(buttons).toHaveText(["Side by side", "Stacked"]);
    const sideBySide = layout.getByRole("button", { name: "Side by side", exact: true });
    const stacked = layout.getByRole("button", { name: "Stacked", exact: true });
    const sideBySideBounds = await sideBySide.boundingBox();
    const stackedBounds = await stacked.boundingBox();
    expect(sideBySideBounds).not.toBeNull();
    expect(stackedBounds).not.toBeNull();
    expect(sideBySideBounds!.x + sideBySideBounds!.width).toBeLessThan(stackedBounds!.x);
    const pair = layout.locator("..");
    await expect(sideBySide).toHaveAttribute("aria-pressed", "true");
    await expect(pair).toHaveClass(/is-side-by-side/);
    await stacked.click();
    await expect(stacked).toHaveAttribute("aria-pressed", "true");
    await expect(pair).not.toHaveClass(/is-side-by-side/);
    await sideBySide.click();
    await expect(sideBySide).toHaveAttribute("aria-pressed", "true");
    await expect(pair).toHaveClass(/is-side-by-side/);
});

test("paired invoice arrays switch between stacked and side-by-side without changing values, sources or colors", async ({ page }) => {
    await page.goto("/?sample=labels");
    await ready(page);
    const layout = page.getByRole("group", { name: "LineItems array layout", exact: true });
    await expect(layout.getByRole("button", { name: "Side by side", exact: true })).toHaveAttribute("aria-pressed", "true");
    await layout.getByRole("button", { name: "Stacked", exact: true }).click();
    await page.reload();
    await ready(page);
    await page.getByRole("combobox", { name: "Zoom", exact: true }).selectOption({ label: "75%" });
    await ready(page);
    await page.getByRole("button", { name: "Select label value of InvoiceNumber", exact: true }).click();
    const pin = page.getByTestId("source-overlay").locator("polygon").first();
    const points = await pin.getAttribute("points");
    const pane = page.getByRole("region", { name: "Extraction results", exact: true });
    const pair = pane.locator(".cu-comparison-arrays").filter({ has: layout });
    const sections = pair.locator(":scope > .cu-comparison-array");
    await expect(sections).toHaveCount(2);
    const geometry = () => sections.evaluateAll(elements => elements.map(element => {
        const bounds = element.getBoundingClientRect();
        return { x: bounds.x, y: bounds.y, width: bounds.width, bottom: bounds.bottom };
    }));
    await expect(layout.getByRole("button", { name: "Side by side", exact: true })).toHaveAttribute("aria-pressed", "true");
    for (const width of [1030, 1342, 1920]) {
        await page.setViewportSize({ width, height: 1000 });
        await ready(page);
        const bounds = await geometry();
        expect(Math.abs(bounds[0]!.y - bounds[1]!.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(bounds[0]!.width - bounds[1]!.width)).toBeLessThanOrEqual(1);
        expect(bounds[1]!.x).toBeGreaterThan(bounds[0]!.x + bounds[0]!.width);
        const rows = await pair.locator("tbody").evaluateAll(elements => elements.map(element =>
            [...element.querySelectorAll("tr[data-comparison-row]")].map(row => row.getBoundingClientRect().y)));
        expect(rows[0]).toEqual(rows[1]);
    }
    const scrollers = pair.locator(".cu-comparison-array-scroll");
    await scrollers.first().evaluate(element => { element.scrollLeft = 120; });
    await expect.poll(() => scrollers.evaluateAll(elements => elements.map(element => element.scrollLeft))).toEqual([120, 120]);
    await expectFixedIndexHeaders(scrollers, 2);
    const low = pair.locator('[data-field-id="/contents/0/fields/LineItems/valueArray/0/valueObject/UnitOfMeasure"]');
    await expect(low).toHaveCSS("background-color", "rgb(220, 251, 215)");
    expect(await low.evaluate(element => getComputedStyle(element).boxShadow)).toContain("rgba(180, 60, 75, 0.6)");
    await expect(pin).toHaveAttribute("points", points!);
    await expect(pin).toHaveAttribute("data-source-id", "/labels/fields/InvoiceNumber");
    await layout.getByRole("button", { name: "Stacked", exact: true }).press("Enter");
    const restored = await geometry();
    expect(restored[1]!.y).toBeGreaterThan(restored[0]!.bottom);
    await expect(pin).toHaveAttribute("points", points!);
    await expect(pane.getByRole("button", { name: "Show matching fields (42 values)", exact: true })).toBeVisible();
    await upload(page, "Choose saved Analyze JSON",
        JSON.parse(readFileSync(resolve("tests", "fixtures", "labels", "invoice.pdf.result.json"), "utf8")),
        "invoice.pdf.result.json");
    await expect(layout.getByRole("button", { name: "Side by side", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "PDF", exact: true }).click();
    await ready(page);
    await expect(pane.locator(".cu-array-layout-controls")).toHaveCount(0);
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
    await first.getByRole("button", { name: "Stacked", exact: true }).click();
    await second.getByRole("button", { name: "Stacked", exact: true }).click();
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
    await expect(page.getByRole("tooltip").locator(".cu-popover-heading")).toHaveCSS("background-color", "rgb(229, 218, 255)");
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
    const layout = pane.getByRole("group", { name: "Rows array layout", exact: true });
    await expect(layout.getByRole("button", { name: "Side by side", exact: true })).toHaveAttribute("aria-pressed", "true");
    await layout.getByRole("button", { name: "Stacked", exact: true }).click();
    await scrollers.first().evaluate(element => { element.scrollTop = 300; });
    await expect.poll(() => scrollers.first().evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    expect(await scrollers.nth(1).evaluate(element => element.scrollTop)).toBe(0);
    await expectFixedIndexHeaders(scrollers, 2);
    await layout.getByRole("button", { name: "Side by side", exact: true }).click();
    const tops = () => scrollers.evaluateAll(elements => elements.map(element => element.scrollTop));
    await expect.poll(tops).toEqual([300, 300]);
    await scrollers.nth(1).evaluate(element => { element.scrollTop = 600; });
    await expect.poll(tops).toEqual([600, 600]);
    await scrollers.first().evaluate(element => { element.scrollTop = 900; });
    await expect.poll(tops).toEqual([900, 900]);
    await expectFixedIndexHeaders(scrollers, 2);
    await layout.getByRole("button", { name: "Stacked", exact: true }).click();
    await scrollers.first().evaluate(element => { element.scrollTop = 300; });
    await expect.poll(tops).toEqual([300, 900]);
    await layout.getByRole("button", { name: "Side by side", exact: true }).click();
    await expect.poll(tops).toEqual([300, 300]);
    await pane.getByRole("button", { name: "Previous field", exact: true }).click();
    const last = pane.locator('button[data-source-field-id="/contents/0/fields/Rows/valueArray/999/valueObject/C9"]');
    await expect(last).toBeVisible();
    await expect(last).toHaveAttribute("aria-pressed", "true");
    await expect(last).toHaveText("-1");
    await expect.poll(async () => {
        const positions = await tops();
        return positions.length === 2 && positions.every(top => top > 25_000) && Math.abs(positions[0]! - positions[1]!) <= 1;
    }).toBe(true);
    expect(await pane.locator("[data-comparison-row]").count()).toBeLessThan(200);
    await expect(last).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(pane.getByRole("button", { name: "Rows", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(pane.getByRole("button", { name: "Rows", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(pane.getByLabel("Current field position", { exact: true })).toHaveText("1 / 10001 fields");
    await page.keyboard.press("ArrowDown");
    const first = pane.locator('button[data-source-field-id="/contents/0/fields/Rows/valueArray/0/valueObject/C0"]');
    await expect(first).toBeFocused();
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await pane.getByRole("button", { name: "Show incorrect fields (1 value)", exact: true }).click();
    await pane.getByRole("searchbox", { name: "Search field names, label values or extracted values", exact: true }).fill("9999");
    await expect(pane.getByRole("table", { name: "Rows extracted values", exact: true })).toBeVisible();
    await upload(page, "Choose saved Analyze JSON", result(), "large-reference.result.json");
    await expect(pane.getByRole("columnheader", { name: "Extracted Value", exact: true })).toHaveCount(0);
    await expect(pane.locator(".cu-array-layout-controls")).toHaveCount(0);
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
    await page.getByRole("button", { name: "Highlighting legend", exact: true }).click();
    const legend = page.getByRole("dialog", { name: "Legend", exact: true });
    await expect(legend.locator(".cu-legend-review-toggle")).toHaveCount(3);
    await expect(legend.locator(".cu-ordinary-field-legend")).toHaveCount(0);
    await legend.getByRole("button", { name: "Close legend", exact: true }).click();
    await pane.getByRole("combobox", { name: "Result content", exact: true }).selectOption("0");
    await expect(pane.getByRole("treegrid", { name: "Compared fields", exact: true })).toBeVisible();
    await expect(pane.getByRole("button", { name: "Show incorrect fields (5 values)", exact: true })).toBeVisible();
});
