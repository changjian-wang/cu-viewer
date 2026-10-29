import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { loadReviewFixture } from "./uiRedesignFixtures";
import { expandField, locateGroup, ready } from "./viewerAssertions";

declare global {
    interface Window { cuSummaryCopies: string[] }
}

test.use({ reducedMotion: "reduce" });

const longValue = `${"Long extracted value <b>literal text</b> ".repeat(100)}COMPLETE END`;
const syntheticResult = {
    apiVersion: "2025-11-01", analyzerId: "synthetic-field-summaries",
    contents: [{ kind: "document", unit: "inch",
        pages: [1, 2].map(pageNumber => ({ pageNumber, width: 8.5, height: 11 })),
        fields: {
            Arbitrary: { type: "object", valueObject: {
                Number: { type: "number", valueNumber: 123.45, confidence: 0.2, source: "D(1,0.7,1.8,1.3,0.25)" },
                Code: { type: "string", valueString: "EUR", confidence: 0.95 },
            } },
            LongObject: { type: "object", valueObject: {
                Text: { type: "string", valueString: longValue, confidence: 0.8, source: "D(1,0.7,3.8,2.5,0.25)" },
                Extra: { type: "string", valueString: "EXTRA" },
            } },
            LongScalar: { type: "string", valueString: longValue, confidence: 0.4, source: "D(1,0.7,4.2,2.5,0.25)" },
            Falsy: { type: "object", valueObject: {
                Zero: { type: "integer", valueInteger: 0 }, Flag: { type: "boolean", valueBoolean: false },
                Nothing: { type: "string", valueString: null }, Empty: { type: "string", valueString: "" },
                Missing: { type: "string" },
            } },
            Rows: { type: "array", valueArray: [
                { type: "object", valueObject: { Label: { type: "string", valueString: "first" } } },
                { type: "object", valueObject: { Label: { type: "string", valueString: "second" } } },
            ] },
        },
    }],
};

const row = (page: Page, name: string) => page.locator(`.cu-fields-table > tbody > tr[data-field-id="/contents/0/fields/${name}"]`);
const summary = (page: Page, name: string) => page.getByRole("button", { name: `View full value of ${name}`, exact: true });

async function fold(page: Page, name: string): Promise<void> {
    const field = page.getByRole("button", { name, exact: true });
    await expect(field).toHaveAttribute("aria-expanded", /^(true|false)$/);
    if (await field.getAttribute("aria-expanded") === "true") await page.getByRole("button", { name: `Collapse ${name}`, exact: true }).click();
    await expect(field).toHaveAttribute("aria-expanded", "false");
}

async function loadSynthetic(page: Page): Promise<void> {
    await loadReviewFixture(page);
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "synthetic-field-summaries.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(syntheticResult)),
    });
    await expect(page.getByRole("button", { name: "Arbitrary", exact: true })).toBeVisible();
}

test("UI-47 selected real money objects retain values and source selection when folded without selected labels", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await page.getByRole("button", { name: "3 columns", exact: true }).click();
    for (const [name, value] of [["AmountDue", "610 USD"], ["BalanceForward", "500 USD"], ["TotalAmount", "110 USD"]] as const) {
        await expandField(page, name);
        await locateGroup(page, `/contents/0/fields/${name}`);
        const source = await page.getByTestId("source-overlay").locator("polygon").evaluateAll(elements =>
            elements.map(element => element.getAttribute("points")));
        const frame = await page.getByTestId("rendered-page").boundingBox();
        await fold(page, name);
        await expect(summary(page, name)).toHaveText(value);
        await expect(row(page, name)).toHaveClass(/is-group-selected/);
        await expect(row(page, name)).toHaveCSS("background-color", "rgb(229, 218, 255)");
        await expect(row(page, name).locator(".cu-confidence")).toHaveText("");
        await expect(page.locator(".cu-group-selection-count")).toHaveCount(0);
        expect(await page.getByTestId("source-overlay").locator("polygon").evaluateAll(elements =>
            elements.map(element => element.getAttribute("points")))).toEqual(source);
        expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(frame);
        await expect(page.locator(".cu-group-source-controls")).toContainText("2 fields");
    }
});

for (const viewport of [{ width: 1536, height: 960 }, { width: 1030, height: 760 }]) {
    for (const columns of [2, 3]) {
        test(`UI-47 long values remain one-line ellipsized without layout shifts at ${viewport.width} and ${columns} columns`, async ({ page }) => {
            await page.setViewportSize(viewport);
            await loadSynthetic(page);
            await page.getByRole("button", { name: `${columns} columns`, exact: true }).click();
            await expandField(page, "LongObject");
            const before = await row(page, "LongObject").evaluate(element => element.getBoundingClientRect().height);
            await fold(page, "LongObject");
            const value = summary(page, "LongObject");
            await expect(value).toHaveText(`${longValue} EXTRA`);
            await expect(value).toHaveCSS("white-space", "nowrap");
            await expect(value).toHaveCSS("text-overflow", "ellipsis");
            await expect(value).toHaveCSS("overflow", "hidden");
            await expect(value).toHaveCSS("font-size", "12.5px");
            expect(await value.evaluate(element => element.clientWidth > 0 && element.scrollWidth > element.clientWidth)).toBe(true);
            expect(await row(page, "LongObject").evaluate(element => element.getBoundingClientRect().height)).toBeCloseTo(before, 1);
            const width = await value.evaluate(element => element.clientWidth);
            await row(page, "LongObject").hover();
            expect(await value.evaluate(element => element.clientWidth)).toBe(width);
            expect(await page.locator(".cu-fields-scroll").evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
            const scalar = row(page, "LongScalar").locator(".cu-value-chip");
            await expect(scalar).toHaveText(longValue);
            await expect(scalar).toHaveCSS("white-space", "nowrap");
            await expect(scalar).toHaveCSS("text-overflow", "ellipsis");
            expect(await scalar.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
            if (columns === 3) {
                const bounds = await row(page, "LongObject").locator(".cu-confidence").boundingBox();
                const viewport = await page.locator(".cu-fields-scroll").boundingBox();
                if (!bounds || !viewport) throw new Error("Confidence column bounds are unavailable.");
                expect(bounds.width).toBeGreaterThan(0);
                expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.x + viewport.width);
            }
        });
    }
}

test("UI-47 full-value actions and F2 retain raw long values, copy content, collapse and focus", async ({ page }) => {
    await page.addInitScript(() => {
        window.cuSummaryCopies = [];
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
            writeText(value: string) { window.cuSummaryCopies.push(value); return Promise.resolve(); },
        } });
    });
    await loadSynthetic(page);
    await fold(page, "LongObject");
    const frame = await page.getByTestId("rendered-page").boundingBox();
    const expected = JSON.stringify(syntheticResult.contents[0]!.fields.LongObject.valueObject, null, 2);
    await summary(page, "LongObject").click();
    const content = page.getByLabel("Full extracted value", { exact: true });
    await expect(content).toBeFocused();
    expect(await content.textContent()).toBe(expected);
    await expect(content.locator("b")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "LongObject", exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
    expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(frame);
    await page.getByRole("button", { name: "Copy full value", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.cuSummaryCopies)).toEqual([expected]);
    await page.getByRole("button", { name: "Close full value details", exact: true }).click();
    const field = page.getByRole("button", { name: "LongObject", exact: true });
    await expect(field).toBeFocused();
    await field.press("F2");
    expect(await content.textContent()).toBe(expected);
    await expect(field).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: "Close full value details", exact: true }).click();
    await fold(page, "Rows");
    await expect(summary(page, "Rows")).toHaveText("2 items");
    await summary(page, "Rows").click();
    expect(await content.textContent()).toBe(JSON.stringify(syntheticResult.contents[0]!.fields.Rows.valueArray, null, 2));
    await expect(page.locator(".cu-group-selection-count")).toHaveCount(0);
});

test("UI-47 folded summaries keep zero, false, null and empty-string semantics", async ({ page }) => {
    await loadSynthetic(page);
    await fold(page, "Falsy");
    await expect(summary(page, "Falsy")).toHaveText('0 false null "" (empty string)');
    await summary(page, "Falsy").click();
    expect(await page.getByLabel("Full extracted value", { exact: true }).textContent())
        .toBe(JSON.stringify(syntheticResult.contents[0]!.fields.Falsy.valueObject, null, 2));
});

test("UI-47 real summary search keeps parent matches, navigation counts and own-confidence filters consistent", async ({ page }) => {
    await loadSynthetic(page);
    await fold(page, "Arbitrary");
    await expect(summary(page, "Arbitrary")).toHaveText("123.45 EUR");
    await page.getByRole("searchbox", { name: "Search fields or values" }).fill("123.45 EUR");
    await expect(page.locator(".cu-field-navigation")).toContainText("2 /");
    await expect(page.getByRole("button", { name: "Number", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Code", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Low confidence/ }).click();
    await expect(page.locator(".cu-field-navigation")).toContainText("1 /");
    await expect(page.getByRole("button", { name: "Code", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Number", exact: true })).toBeVisible();
    await expect(page.locator(".cu-group-selection-count")).toHaveCount(0);
});

test("UI-47 collapsed scope ancestors never expose unrelated values while full-value inspection keeps the original object", async ({ page }) => {
    await loadReviewFixture(page);
    const valueObject = {
        External: { type: "string", valueString: "external value", source: "D(1,6,6,1,0.25)" },
        Related: { type: "string", valueString: "related value", source: "D(1,0.7,1.8,1,0.25)" },
    };
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "synthetic-summary-scope.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ apiVersion: "2025-11-01", contents: [{
            kind: "document", unit: "inch", pages: [{ pageNumber: 1, width: 8.5, height: 11 }],
            fields: { Mixed: { type: "object", valueObject } },
            tables: [{ rowCount: 1, columnCount: 1, source: "D(1,0.6,1.7,1.2,0.5)", cells: [
                { rowIndex: 0, columnIndex: 0, content: "related value", source: "D(1,0.7,1.8,1,0.25)" },
            ] }],
        }] })),
    });
    await expect(page.getByRole("button", { name: "Mixed", exact: true })).toBeVisible();
    await page.getByTestId("source-tables").locator("polygon").press("Enter");
    await expect(page.locator(".cu-table-scope")).toBeVisible();
    await fold(page, "Mixed");
    await expect(summary(page, "Mixed")).toHaveText("related value");
    await expect(page.getByRole("button", { name: "External", exact: true })).toHaveCount(0);
    await summary(page, "Mixed").click();
    expect(await page.getByLabel("Full extracted value", { exact: true }).textContent()).toBe(JSON.stringify(valueObject, null, 2));
    await page.getByRole("button", { name: "Close full value details", exact: true }).click();
    await page.getByRole("searchbox", { name: "Search fields or values" }).fill("external value");
    await expect(page.getByRole("heading", { name: "No matching fields", exact: true })).toBeVisible();
    await expect(page.locator(".cu-table-scope")).toBeVisible();
});

test("UI-49 real arrays keep one Value count when folded or expanded, with unchanged full-value access", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    for (const [name, count] of [["LineItems", 3], ["TaxDetails", 1]] as const) {
        await fold(page, name);
        const group = row(page, name);
        await expect(group.locator("td").first()).toHaveText(name);
        await expect(group.locator(".cu-summary-value")).toHaveCount(1);
        await expect(summary(page, name)).toHaveText(`${count} items`);
        await expect(page.locator(".cu-field-count")).toHaveCount(0);
        await summary(page, name).click();
        await expect(page.getByRole("region", { name: "Full value and confidence", exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute("aria-expanded", "false");
        await page.getByRole("button", { name: "Close full value details", exact: true }).click();
        await page.getByRole("button", { name, exact: true }).click();
        await expect(group.locator(".cu-summary-value")).toHaveText(`${count} items`);
        await expect(group.locator("td").first()).toHaveText(name);
        await expect(page.getByRole("table", { name: `${name} values`, exact: true }).getByRole("row")).toHaveCount(count + 1);
        await expect(page.locator(".cu-field-count")).toHaveCount(0);
    }
});

test("UI-49 arbitrary root and nested arrays use the same single-count rule", async ({ page }) => {
    await loadReviewFixture(page);
    const rootValues = [{ type: "integer", valueInteger: 0 }, { type: "boolean", valueBoolean: false }];
    const nestedValues = [{ type: "string", valueString: "alpha" }, { type: "string", valueString: "beta" }];
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "synthetic-array-counts.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ apiVersion: "2025-11-01", contents: [{ kind: "document", fields: {
            RootArray: { type: "array", valueArray: rootValues },
            Nested: { type: "object", valueObject: { Inner: { type: "array", valueArray: nestedValues } } },
        } }] })),
    });
    await expect(page.getByRole("button", { name: "RootArray", exact: true })).toBeVisible();
    for (const [name, path, values] of [["RootArray", "RootArray", rootValues], ["Inner", "Nested/valueObject/Inner", nestedValues]] as const) {
        await fold(page, name);
        const group = row(page, path);
        await expect(group.locator("td").first()).toHaveText(name);
        await expect(group.locator(".cu-summary-value")).toHaveText("2 items");
        await expect(page.locator(".cu-field-count")).toHaveCount(0);
        await group.locator(".cu-summary-value").click();
        expect(await page.getByLabel("Full extracted value", { exact: true }).textContent()).toBe(JSON.stringify(values, null, 2));
        await page.getByRole("button", { name: "Close full value details", exact: true }).click();
        await page.getByRole("button", { name, exact: true }).press("F2");
        expect(await page.getByLabel("Full extracted value", { exact: true }).textContent()).toBe(JSON.stringify(values, null, 2));
        await page.getByRole("button", { name: "Close full value details", exact: true }).click();
    }
});
