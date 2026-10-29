import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { checkPolygon, ready, rotateSource } from "./viewerAssertions";
import { alive, trackSourceResources } from "./sourceResources";
import { croppedRotatedPdf } from "./pdfFixtures";

test.use({ viewport: { width: 1253, height: 888 }, launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

const tableTarget = (page: Page, number: number): Locator => page.getByRole("group", { name: "Source tables", exact: true })
    .getByRole("button", { name: `Locate Table ${number} in results`, exact: true }).first();
const message = (page: Page): Locator => page.locator(".cu-fields-review-footer").getByRole("status");
const row = (page: Page, name: string): Locator => page.locator(`.cu-fields-table > tbody > tr[data-field-id="/contents/0/fields/${name}"]`);

async function clickBlankTable(page: Page, number: number): Promise<void> {
    const bounds = await tableTarget(page, number).boundingBox();
    if (!bounds) throw new Error("The returned table has no current-page source region.");
    await page.mouse.click(bounds.x + bounds.width * 0.9, bounds.y + bounds.height * 0.9);
}

async function noAdditionalTables(page: Page): Promise<void> {
    await expect(page.getByRole("tab", { name: "Tables", exact: true, includeHidden: true })).toHaveCount(0);
    await expect(page.locator(".cu-table-marker, .cu-table-markers, .cu-table-dialog, .cu-tables-pane")).toHaveCount(0);
    await expect(page.getByRole("tooltip", { name: "Table preview" })).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(/Document Tables|Document tables/)).toHaveCount(0);
}

async function upload(page: Page, fields: Record<string, unknown>, sources = ["D(1,5,20,80,25)", "D(1,5,48,80,12)"]): Promise<void> {
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "synthetic-source-table.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ apiVersion: "2025-11-01", contents: [{
            kind: "document", unit: "pixel", pages: [{ pageNumber: 1, width: 96, height: 64 }],
            markdown: "# Saved table fixture", fields,
            tables: sources.map((source, index) => ({ rowCount: 1, columnCount: 2, source,
                cells: [{ rowIndex: 0, columnIndex: 0, columnSpan: 2, kind: "columnHeader", content: `Raw table ${index + 1} only` }] })),
        }] })),
    });
    await expect(tableTarget(page, 1)).toBeVisible();
}

async function fixture(page: Page): Promise<void> {
    await page.getByLabel("Choose source file").setInputFiles(resolve("tests", "fixtures", "images", "orientation-marker.png"));
    await ready(page);
    await upload(page, {
        Pinned: { type: "string", valueString: "Existing selection", source: "D(1,5,3,20,5)" },
        InTable: { type: "string", valueString: "Grounded field", source: "D(1,10,25,20,5)" },
        Rows: { type: "array", valueArray: [0, 1].map(index => ({ type: "object", valueObject: {
            Label: { type: "string", valueString: `Field row ${index + 1}`, source: `D(1,10,${50 + index * 4},20,3)` },
        } })) },
    });
}

test.beforeEach(async ({ page }) => {
    await trackSourceResources(page);
    await page.goto("/");
    await ready(page);
});

test("UI-38 real PDF table blanks locate PONumber without another table grid or source movement", async ({ page }) => {
    const bounds = await tableTarget(page, 1).boundingBox(), before = await page.getByTestId("rendered-page").boundingBox();
    const viewport = page.getByRole("group", { name: "Source viewport", exact: true });
    const scroll = await viewport.evaluate(element => ({ left: element.scrollLeft, top: element.scrollTop }));
    const zoom = await page.getByLabel("Zoom percentage").textContent();
    if (!bounds || !before) throw new Error("The real PDF table is not ready.");
    await page.mouse.click(bounds.x + 2, bounds.y + bounds.height - 2);
    await expect(page.getByRole("tab", { name: "Fields", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(row(page, "PONumber")).toHaveClass(/is-selected/);
    await expect(message(page)).toContainText("related fields located in Fields");
    expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(before);
    expect(await viewport.evaluate(element => ({ left: element.scrollLeft, top: element.scrollTop }))).toEqual(scroll);
    await expect(page.getByLabel("Zoom percentage")).toHaveText(zoom!);
    await expect(viewport).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await noAdditionalTables(page);
});

test("UI-38 real line-item table locates and expands the existing array without selecting its first value", async ({ page }) => {
    await page.getByRole("button", { name: "Collapse LineItems", exact: true }).click();
    await page.getByRole("tab", { name: "Markdown", exact: true }).click();
    await tableTarget(page, 2).press("Enter");
    const group = row(page, "LineItems");
    await expect(page.getByRole("tab", { name: "Fields", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: "Collapse LineItems", exact: true })).toBeVisible();
    await expect(group).toHaveClass(/is-selected/);
    await expect(group.locator(".cu-field-count")).toHaveCount(0);
    await expect(group.locator(".cu-summary-value")).toHaveText("3 items");
    await expect(page.getByRole("table", { name: "LineItems values", exact: true })).toBeVisible();
    await expect.poll(() => page.locator(".cu-items-table .is-table-related-cell").count()).toBeGreaterThan(1);
    await expect(page.locator(".cu-items-table .cu-cell-value[aria-pressed=true]")).toHaveCount(0);
    await expect.poll(() => group.evaluate(element => element.getBoundingClientRect().top -
        element.closest(".cu-fields-scroll")!.querySelector("thead th")!.getBoundingClientRect().bottom)).toBeGreaterThanOrEqual(0);
    await noAdditionalTables(page);
});

test("UI-38 the real totals table locates all related existing groups rather than the first scalar", async ({ page }) => {
    await tableTarget(page, 3).press("Enter");
    const groups = await page.locator(".cu-fields-table > tbody > .is-selected").evaluateAll(elements => elements.map(element => element.getAttribute("data-field-id")));
    expect(groups).toContain("/contents/0/fields/AmountDue");
    expect(groups.length).toBeGreaterThan(1);
    await expect(page.locator(".cu-fields-table > tbody > .is-table-related")).not.toHaveCount(0);
    await expect(row(page, "AmountDue").getByRole("button", { name: "AmountDue", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".cu-field-name[aria-pressed=true]")).toHaveCount(0);
    await noAdditionalTables(page);
});

test("UI-38 unmapped real page-two tables explain the absence and retain original data in Result", async ({ page }) => {
    await page.getByRole("textbox", { name: "Page number", exact: true }).fill("2");
    await page.getByRole("textbox", { name: "Page number", exact: true }).press("Enter");
    await ready(page);
    const before = await page.getByTestId("rendered-page").boundingBox();
    await tableTarget(page, 4).press("Enter");
    await expect(message(page)).toContainText("no corresponding extracted fields");
    await expect(page.locator(".cu-fields-table > tbody > .is-selected")).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Page number", exact: true })).toHaveValue("2");
    expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(before);
    await page.getByRole("tab", { name: "Result", exact: true }).click();
    await expect(page.getByRole("tree", { name: "Original Analyze result JSON", exact: true })).toBeVisible();
    await noAdditionalTables(page);
});

test("UI-38 image field hits keep priority and a table locates only its true existing fields", async ({ page }) => {
    await fixture(page);
    await page.getByTestId("result-overlay").locator('[data-outline-id="/contents/0/fields/InTable"]').click();
    await expect(row(page, "InTable").getByRole("button", { name: "InTable", exact: true })).toHaveAttribute("aria-pressed", "true");
    await clickBlankTable(page, 1);
    await expect(row(page, "InTable")).toHaveClass(/is-selected/);
    await expect(row(page, "Pinned")).toHaveCount(0);
    await expect(row(page, "Rows")).toHaveCount(0);
    await expect(message(page)).toContainText("Table 1:");
    await noAdditionalTables(page);
});

test("UI-38 Enter/Space navigate table regions to Fields while retaining source focus and tab scroll", async ({ page }) => {
    await fixture(page);
    await page.getByRole("button", { name: "Collapse Rows", exact: true }).click();
    const first = tableTarget(page, 1), second = tableTarget(page, 2);
    await first.focus();
    await first.press("ArrowDown");
    await expect(second).toBeFocused();
    await second.press("Enter");
    await expect(page.getByRole("button", { name: "Collapse Rows", exact: true })).toBeVisible();
    await expect(row(page, "Rows")).toHaveClass(/is-selected/);
    await expect(second).toBeFocused();
    await second.press("ArrowUp");
    await first.press("Space");
    await expect(row(page, "InTable")).toHaveClass(/is-selected/);
    await expect(first).toBeFocused();
    const scroll = await page.locator(".cu-fields-scroll").evaluate(element => element.scrollTop);
    await page.getByRole("tab", { name: "Markdown", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Markdown", exact: true })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Fields", exact: true }).click();
    await expect(page.locator(".cu-fields-scroll")).toHaveJSProperty("scrollTop", scroll);
    await noAdditionalTables(page);
});

test("UI-38 table-only and ambiguous results never create a Document Tables group or guess a field", async ({ page }) => {
    await fixture(page);
    await upload(page, {});
    await tableTarget(page, 1).press("Enter");
    await expect(page.getByRole("heading", { name: "No extracted fields", exact: true })).toBeVisible();
    await expect(message(page)).toContainText("no corresponding extracted fields");
    await noAdditionalTables(page);
    await upload(page, { LooksLikeTable: { type: "string", valueString: "Raw table 1 only", source: "D(1,10,25,20,5)" } },
        ["D(1,5,20,80,25)", "D(1,8,22,70,20)"]);
    await tableTarget(page, 1).press("Enter");
    await expect(message(page)).toContainText("association is ambiguous");
    await expect(row(page, "LooksLikeTable")).not.toHaveClass(/is-selected/);
    await noAdditionalTables(page);
});

test("UI-38 filters remain unchanged and explain matched fields hidden by the current filter", async ({ page }) => {
    await fixture(page);
    await page.getByRole("searchbox", { name: "Search fields or values", exact: true }).fill("Existing selection");
    await tableTarget(page, 2).press("Enter");
    await expect(page.getByRole("searchbox", { name: "Search fields or values", exact: true })).toHaveValue("Existing selection");
    await expect(page.locator(".cu-fields-review-footer")).toContainText("2 selected fields are hidden by filters");
    await expect(row(page, "Pinned")).toHaveCount(0);
    await noAdditionalTables(page);
});

test("UI-38 a partial object-array match reveals the actual related cell rather than a hidden row object", async ({ page }) => {
    await fixture(page);
    await upload(page, { Rows: { type: "array", valueArray: [25, 50].map((y, index) => ({
        type: "object", valueObject: { Label: { type: "string", valueString: `Value ${index + 1}`, source: `D(1,10,${y},20,3)` } },
    })) } });
    await page.getByRole("button", { name: "Collapse Rows", exact: true }).click();
    await tableTarget(page, 2).press("Enter");
    const grid = page.getByRole("table", { name: "Rows values", exact: true });
    await expect(grid).toBeVisible();
    await expect(grid.locator(".is-table-related-cell")).toHaveCount(1);
    await expect(grid.locator(".is-table-related-cell .cu-cell-value")).toHaveText("Value 2");
    await expect(grid.locator(".cu-cell-value[aria-pressed=true]")).toHaveCount(0);
    await expect(message(page)).toContainText("related fields located in Fields");
});

test("UI-38 result replacement clears old associations and invalid raw grids remain available without a fake Fields grid", async ({ page }) => {
    await fixture(page);
    await tableTarget(page, 2).press("Enter");
    await expect(row(page, "Rows")).toHaveClass(/is-selected/);
    await upload(page, { New: { type: "string", valueString: "Replacement", source: "D(1,15,25,10,5)" } });
    await expect(message(page)).toHaveCount(0);
    await tableTarget(page, 1).press("Enter");
    await expect(row(page, "New")).toHaveClass(/is-selected/);
    await expect(row(page, "Rows")).toHaveCount(0);
    await page.getByLabel("Choose source file").setInputFiles({
        name: "corrupt.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a PDF"),
    });
    await expect(page.getByTestId("source-tables")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Source could not be displayed", exact: true })).toBeVisible();
    await expect.poll(() => alive(page)).toEqual({ workers: 0, bitmaps: 0, urls: 0 });
    await noAdditionalTables(page);
});

test("UI-38 repeated matching reuses source resources and dragging inside tables remains pan-only", async ({ page }) => {
    await fixture(page);
    const resources = await alive(page);
    for (let round = 0; round < 8; round++) {
        const number = round % 2 + 1;
        await tableTarget(page, number).press("Enter");
        await expect(message(page)).toContainText(`Table ${number}:`);
    }
    expect(await alive(page)).toEqual(resources);
    await page.getByTestId("result-overlay").locator('[data-outline-id="/contents/0/fields/Pinned"]').click();
    const bounds = await tableTarget(page, 1).boundingBox(), before = await page.getByTestId("rendered-page").boundingBox();
    if (!bounds || !before) throw new Error("Table/source frame is unavailable.");
    await page.mouse.move(bounds.x + bounds.width * 0.8, bounds.y + bounds.height * 0.8);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.8 + 30, bounds.y + bounds.height * 0.8 + 15);
    await page.mouse.up();
    const after = await page.getByTestId("rendered-page").boundingBox();
    if (!after) throw new Error("Panned source frame is unavailable.");
    expect(after.x - before.x).toBeCloseTo(30, 0);
    expect(after.y - before.y).toBeCloseTo(15, 0);
    await expect(row(page, "Pinned").getByRole("button", { name: "Pinned", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(message(page)).toHaveCount(0);
});

test("UI-38 table source-region navigation preserves zoom between differently sized PDF pages", async ({ page }) => {
    await page.getByLabel("Choose source file").setInputFiles({
        name: "cross-page-tables.pdf", mimeType: "application/pdf", buffer: croppedRotatedPdf(),
    });
    await ready(page);
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "cross-page-tables.cu.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ apiVersion: "2025-11-01", contents: [{
            kind: "document", unit: "pixel", pages: [
                { pageNumber: 1, width: 300, height: 200 }, { pageNumber: 2, width: 240, height: 360 },
            ],
            fields: { Rows: { type: "array", valueArray: [1, 2].map(page => ({
                type: "string", valueString: `Page ${page}`, source: `D(${page},30,30,30,10)`,
            })) } },
            tables: [{ rowCount: 2, columnCount: 1, source: "D(1,20,20,100,100);D(2,20,20,100,100)",
                cells: [{ rowIndex: 0, columnIndex: 0, content: "Native first" }, { rowIndex: 1, columnIndex: 0, content: "Native second" }] }],
        }] })),
    });
    await tableTarget(page, 1).press("Enter");
    const zoom = await page.getByLabel("Zoom percentage").textContent();
    await page.getByRole("button", { name: "Next source region", exact: true }).click();
    await ready(page);
    await expect(page.getByRole("textbox", { name: "Page number", exact: true })).toHaveValue("2");
    await expect(page.getByLabel("Zoom percentage")).toHaveText(zoom!);
    await expect(row(page, "Rows")).toHaveClass(/is-selected/);
    await noAdditionalTables(page);
});

test.describe("source table projection at DPR 2", () => {
    test.use({ deviceScaleFactor: 2 });
    test("UI-38 association survives quarter turns, zoom and pan using original source coordinates", async ({ page }) => {
        await fixture(page);
        const target = tableTarget(page, 1);
        for (let turn = 0; turn < 4; turn++) {
            if (turn) await rotateSource(page);
            await checkPolygon(page, [{ x: 5 / 96, y: 20 / 64 }, { x: 85 / 96, y: 20 / 64 },
                { x: 85 / 96, y: 45 / 64 }, { x: 5 / 96, y: 45 / 64 }], turn * 90, target);
            await target.press("Enter");
            await expect(row(page, "InTable")).toHaveClass(/is-selected/);
        }
        await page.getByRole("button", { name: "Zoom out", exact: true }).click();
        await ready(page);
        await page.getByRole("group", { name: "Source viewport", exact: true }).evaluate(element => {
            if (!(element instanceof HTMLElement)) throw new Error("Source viewport is not focusable.");
            element.focus({ preventScroll: true });
        });
        const before = await target.boundingBox();
        await page.keyboard.press("ArrowRight");
        const after = await target.boundingBox();
        if (!before || !after) throw new Error("Panned table bounds are unavailable.");
        expect(after.x - before.x).toBeCloseTo(40, 1);
        await noAdditionalTables(page);
    });
});
