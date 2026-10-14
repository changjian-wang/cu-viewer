import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { ready } from "./viewerAssertions";
import { alive, trackSourceResources } from "./sourceResources";

async function fixture(page: Page): Promise<void> {
    await page.getByLabel("Choose source file").setInputFiles(resolve("tests", "fixtures", "images", "orientation-marker.png"));
    await ready(page);
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "synthetic-source-table.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ apiVersion: "2025-11-01", contents: [{
            kind: "document", unit: "pixel", pages: [{ pageNumber: 1, width: 96, height: 64 }],
            markdown: "# Saved table fixture",
            fields: { Pinned: { type: "string", valueString: "Existing selection", source: "D(1,5,3,20,5)" } },
            tables: [{
                rowCount: 3, columnCount: 2, source: "D(1,5,20,80,25)",
                cells: [
                    { rowIndex: 0, columnIndex: 0, content: "State Code:" }, { rowIndex: 0, columnIndex: 1, content: "5" },
                    { rowIndex: 1, columnIndex: 0, content: "GSTIN:" }, { rowIndex: 1, columnIndex: 1, content: "98AAAAA7654Z3Z2" },
                    { rowIndex: 2, columnIndex: 0, content: "PLACE OF SUPPLY:" }, { rowIndex: 2, columnIndex: 1, content: "5 Maharashtra" },
                ],
            }, {
                rowCount: 2, columnCount: 2, source: "D(1,5,48,80,12)",
                cells: [{ rowIndex: 0, columnIndex: 0, columnSpan: 2, kind: "columnHeader", content: "Merged header" },
                    { rowIndex: 1, columnIndex: 0, content: "Left" }, { rowIndex: 1, columnIndex: 1, content: "Right" }],
            }],
        }] })),
    });
}

test.beforeEach(async ({ page }) => {
    await trackSourceResources(page);
    await page.goto("/");
    await ready(page);
});

test("source table icons preview Rows/Columns and inspect a readonly modal without switching the right tab or pin", async ({ page }) => {
    await fixture(page);
    await page.getByRole("button", { name: "Pinned", exact: true }).press("Enter");
    await page.locator(".prototype-banner").click();
    const pane = page.getByRole("region", { name: "Extraction results" });
    const before = await page.getByTestId("rendered-page").boundingBox();
    const zoom = await page.getByLabel("Zoom percentage").textContent();
    const pin = await pane.getByRole("status").textContent();
    const marker = page.getByRole("button", { name: "Open Table 1", exact: true });
    await marker.hover();
    await expect(page.getByRole("tooltip", { name: "Table preview" })).toHaveText("Rows: 3, Columns: 2");
    await expect(page.getByTestId("table-preview-overlay").locator("polygon")).toHaveAttribute("stroke-dasharray", "3 3");
    await marker.click();
    const dialog = page.getByRole("dialog", { name: "Table", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("row")).toHaveCount(3);
    await expect(dialog.getByRole("cell")).toHaveText(["State Code:", "5", "GSTIN:", "98AAAAA7654Z3Z2", "PLACE OF SUPPLY:", "5 Maharashtra"]);
    await expect(dialog.getByRole("button")).toHaveCount(1);
    await expect(dialog.locator(".cu-detail-source")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Close table" })).toBeFocused();
    await expect(pane.locator('[role="tab"][aria-selected="true"]')).toHaveText("Fields");
    expect(await pane.locator('[role="status"]').textContent()).toBe(pin);
    expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(before);
    expect(await page.getByLabel("Zoom percentage").textContent()).toBe(zoom);
    await dialog.getByRole("button", { name: "Close table" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(marker).toBeFocused();
    await expect(pane.getByRole("button", { name: "Pinned", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("marker keyboard opening, modal focus wrapping and Escape closing preserve original grid spans", async ({ page }) => {
    await fixture(page);
    const marker = page.getByRole("button", { name: "Open Table 2", exact: true });
    await marker.focus();
    await expect(page.getByRole("tooltip", { name: "Table preview" })).toHaveText("Rows: 2, Columns: 2");
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Table", exact: true });
    const close = dialog.getByRole("button", { name: "Close table" });
    await expect(dialog.getByRole("columnheader")).toHaveAttribute("colspan", "2");
    await expect(close).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.locator(".cu-table-scroll")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.locator(".cu-table-scroll")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(marker).toBeFocused();
    await page.keyboard.press("Space");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(marker).toBeFocused();
});

test("Markdown source markers remain inspectable and input replacement closes stale modals without retaining resources", async ({ page }) => {
    await fixture(page);
    await page.getByRole("tab", { name: "Markdown", exact: true }).click();
    await page.getByRole("button", { name: "Open Table 1", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Table", exact: true })).toBeVisible();
    await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveText("Markdown");
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "replacement-table.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ apiVersion: "2025-11-01", contents: [{
            kind: "document", unit: "pixel", pages: [{ pageNumber: 1, width: 96, height: 64 }],
            tables: [{ rowCount: 1, columnCount: 1, source: "D(1,5,5,30,20)",
                cells: [{ rowIndex: 0, columnIndex: 0, content: "Replacement only" }] }],
        }] })),
    });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Open Table 1", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("cell")).toHaveText(["Replacement only"]);
    await page.getByLabel("Choose source file").setInputFiles({
        name: "corrupt.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a PDF"),
    });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Source could not be displayed" })).toBeVisible();
    await expect.poll(() => alive(page)).toEqual({ workers: 0, bitmaps: 0, urls: 0 });
    expect(await page.evaluate(() => document.querySelector("dialog[open]"))).toBeNull();
});

test("repeated table inspection creates no new source resources and modal errors stay explicit", async ({ page }) => {
    await fixture(page);
    const resources = await alive(page);
    const marker = page.getByRole("button", { name: "Open Table 1", exact: true });
    for (let round = 0; round < 12; round++) {
        await marker.press("Enter");
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(marker).toBeFocused();
    }
    expect(await alive(page)).toEqual(resources);
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "invalid-table-grid.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ apiVersion: "2025-11-01", contents: [{
            kind: "document", unit: "pixel", pages: [{ pageNumber: 1, width: 96, height: 64 }],
            fields: { Keep: { type: "string", valueString: "Still readable" } },
            tables: [{ rowCount: 1, columnCount: 2, source: "D(1,5,5,40,20)", cells: [
                { rowIndex: 0, columnIndex: 0, columnSpan: 2, content: "Merged" },
                { rowIndex: 0, columnIndex: 1, content: "Overlap" },
            ] }],
        }] })),
    });
    await marker.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("alert")).toContainText("spans overlap");
    await expect(dialog.getByRole("table")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Close table" }).click();
    await expect(page.getByRole("button", { name: "Keep", exact: true })).toBeVisible();
});

test.describe("table marker alignment at DPR 2", () => {
    test.use({ deviceScaleFactor: 2 });
    test("icons follow the source through quarter-turns and pan, and their previews stay bounded", async ({ page }) => {
        await fixture(page);
        const marker = page.getByRole("button", { name: "Open Table 1", exact: true });
        for (let turn = 0; turn < 4; turn++) {
            if (turn) {
                await page.getByRole("button", { name: "Rotate 90°", exact: true }).click();
                await ready(page);
            }
            await marker.hover();
            const icon = await marker.boundingBox();
            const polygon = await page.getByTestId("table-preview-overlay").locator("polygon").evaluate(element => {
                if (!(element instanceof SVGPolygonElement)) throw new Error("Expected a table source polygon.");
                const matrix = element.getScreenCTM();
                if (!matrix) throw new Error("Table projection is unavailable.");
                const points = Array.from({ length: element.points.numberOfItems }, (_, index) => {
                    const point = element.points.getItem(index);
                    return new DOMPoint(point.x, point.y).matrixTransform(matrix);
                });
                return { x: Math.min(...points.map(point => point.x)), y: Math.min(...points.map(point => point.y)) };
            });
            const popup = await page.getByRole("tooltip", { name: "Table preview" }).boundingBox();
            const viewport = await page.getByRole("group", { name: "Source viewport", exact: true }).boundingBox();
            if (!icon || !polygon || !popup || !viewport) throw new Error("Table marker preview geometry is unavailable.");
            expect(icon.x + icon.width / 2).toBeCloseTo(polygon.x - 12, 0);
            expect(icon.y + icon.height / 2).toBeCloseTo(polygon.y + 6, 0);
            expect(popup.x).toBeGreaterThanOrEqual(viewport.x);
            expect(popup.y).toBeGreaterThanOrEqual(viewport.y);
            expect(popup.x + popup.width).toBeLessThanOrEqual(viewport.x + viewport.width);
            await marker.press("Enter");
            await expect(page.getByRole("dialog")).toBeVisible();
            await page.keyboard.press("Escape");
        }
        const before = await marker.boundingBox();
        await page.getByRole("group", { name: "Source viewport", exact: true }).focus();
        await page.keyboard.press("ArrowRight");
        const after = await marker.boundingBox();
        if (!before || !after) throw new Error("Panned table marker bounds are unavailable.");
        expect(after.x - before.x).toBeCloseTo(40, 1);
        await expect(page.getByRole("tooltip", { name: "Table preview" })).toHaveCount(0);
    });
});
