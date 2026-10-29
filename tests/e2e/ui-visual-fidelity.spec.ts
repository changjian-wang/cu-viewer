import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { loadReviewFixture } from "./uiRedesignFixtures";
import { ready, rotateSource } from "./viewerAssertions";

test.use({ viewport: { width: 1536, height: 960 }, reducedMotion: "reduce" });

async function expectUniformStroke(outline: Locator): Promise<void> {
    await expect(outline).toHaveCSS("shape-rendering", "geometricprecision");
    await expect(outline).toHaveAttribute("stroke-width", "1.8");
    const coverage = await outline.evaluate(async element => {
        if (!(element instanceof SVGPolygonElement)) throw new Error("Expected an interaction outline.");
        const matrix = element.getScreenCTM();
        if (!matrix) throw new Error("The outline has no screen transform.");
        const points = Array.from({ length: element.points.numberOfItems }, (_, index) =>
            new DOMPoint(element.points.getItem(index).x, element.points.getItem(index).y).matrixTransform(matrix));
        const originX = Math.floor((Math.min(...points.map(point => point.x)) - 8) / 4) * 4;
        const originY = Math.floor((Math.min(...points.map(point => point.y)) - 8) / 4) * 4;
        const shifted = points.map(point => ({ x: point.x - originX, y: point.y - originY }));
        const left = Math.min(...shifted.map(point => point.x)), right = Math.max(...shifted.map(point => point.x));
        const top = Math.min(...shifted.map(point => point.y)), bottom = Math.max(...shifted.map(point => point.y));
        const width = Math.ceil((right + 8) / 4) * 4, height = Math.ceil((bottom + 8) / 4) * 4;
        const style = getComputedStyle(element), ratio = devicePixelRatio;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><polygon
            points="${shifted.map(point => `${point.x},${point.y}`).join(" ")}" fill="none"
            stroke="${style.stroke}" stroke-width="${style.strokeWidth}" shape-rendering="${style.shapeRendering}"/></svg>`;
        const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        try {
            const image = new Image();
            image.src = url;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = width * ratio; canvas.height = height * ratio;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Outline pixel sampling is unavailable.");
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
            const sample = (axis: "x" | "y", edge: number, midpoint: number): number => {
                const center = Math.floor(edge * ratio), cross = Math.floor(midpoint * ratio);
                let alpha = 0;
                for (let offset = -Math.ceil(3 * ratio); offset <= Math.ceil(3 * ratio); offset++) {
                    const x = axis === "x" ? center + offset : cross, y = axis === "y" ? center + offset : cross;
                    alpha += data[(y * canvas.width + x) * 4 + 3]!;
                }
                return alpha / 255 / ratio;
            };
            return [sample("x", left, (top + bottom) / 2), sample("x", right, (top + bottom) / 2),
                sample("y", top, (left + right) / 2), sample("y", bottom, (left + right) / 2)];
        } finally { URL.revokeObjectURL(url); }
    });
    for (const thickness of coverage) expect(Math.abs(thickness - 1.8)).toBeLessThanOrEqual(0.03);
}

for (const ratio of [1, 1.25, 2]) {
    test.describe(`UI-50 interaction stroke sampling at DPR ${ratio}`, () => {
        test.use({ deviceScaleFactor: ratio });
        test("single and merged outlines retain uniform weight through zoom/rotation without changing sources", async ({ page }) => {
            await page.goto("/");
            await ready(page);
            expect(await page.evaluate(() => devicePixelRatio)).toBe(ratio);
            const customer = "/contents/0/fields/CustomerName", billing = "/contents/0/fields/BillingAddress";
            for (const angle of [0, 90]) {
                if (angle) await rotateSource(page);
                for (const zoom of ["75", "125"]) {
                    await page.getByRole("combobox", { name: "Zoom", exact: true }).selectOption(zoom);
                    await ready(page);
                    await page.getByRole("button", { name: "CustomerName", exact: true }).click();
                    await page.locator(".prototype-banner").hover();
                    const outline = page.getByTestId("source-overlay").locator("polygon");
                    const actual = page.getByTestId("result-overlay").locator(`[data-outline-id="${customer}"]`);
                    await expect(outline).toHaveCSS("stroke", "rgb(91, 33, 182)");
                    expect(await outline.getAttribute("points")).toBe(await actual.getAttribute("points"));
                    await expect(actual).toHaveCSS("shape-rendering", "crispedges");
                    await expectUniformStroke(outline);
                    await page.getByRole("button", { name: "BillingAddress", exact: true }).hover();
                    const preview = page.getByTestId("preview-overlay").locator("polygon");
                    await expect(preview).toHaveAttribute("data-source-id", billing);
                    await expect(preview).toHaveAttribute("data-selection-frame", "merged");
                    await expect(preview).toHaveCSS("stroke", "rgb(140, 112, 194)");
                    await expectUniformStroke(preview);
                    await page.getByRole("button", { name: "BillingAddress", exact: true }).click();
                    await page.getByTestId("result-overlay").locator(`[data-outline-id="${billing}"][data-region-index="1"]`).focus();
                    await expect(page.getByTestId("preview-overlay")).toHaveCount(0);
                    await expectUniformStroke(page.getByTestId("source-overlay").locator("polygon"));
                }
            }
        });
    });
}

test("UI-35 source decoration adds only a 1px non-interactive edge around unchanged polygons", async ({ page }) => {
    await loadReviewFixture(page);
    const id = "/contents/0/fields/InvoiceId";
    const polygon = page.getByTestId("result-overlay").locator(`[data-outline-id="${id}"]`);
    const edge = page.locator(`.cu-source-highlight-edges [data-source-edge-id="${id}"]`);
    const points = await polygon.getAttribute("points");
    if (!points) throw new Error("The true source polygon is missing.");
    await expect(edge).toHaveAttribute("d", `M ${points.split(" ").join(" L ")} Z`);
    await expect(edge).toHaveAttribute("stroke-width", "2");
    await expect(edge).toHaveAttribute("stroke-linejoin", "round");
    await expect(edge).toHaveAttribute("vector-effect", "non-scaling-stroke");
    await expect(edge).toHaveCSS("pointer-events", "none");
    await expect(edge).toHaveAttribute("stroke", "#E8F5E9");
    const bounds = await polygon.boundingBox();
    if (!bounds) throw new Error("Source geometry is unavailable.");
    const outside = { x: bounds.x - 0.5, y: bounds.y + bounds.height / 2 };
    expect(await edge.evaluate((element, client) => {
        if (!(element instanceof SVGPathElement)) throw new Error("Expected a decorative path.");
        const transform = element.getScreenCTM();
        if (!transform) throw new Error("Decorative stroke transform is unavailable.");
        return element.isPointInStroke(new DOMPoint(client.x, client.y).matrixTransform(transform.inverse()));
    }, outside)).toBe(true);
    await page.mouse.click(outside.x, outside.y);
    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
    await polygon.click();
    await expect(page.getByTestId("source-overlay").locator("polygon")).toHaveAttribute("points", points);
    await expect(polygon).toHaveAttribute("points", points);
    await page.getByRole("button", { name: "Clear selection", exact: true }).click();
    const first = page.getByTestId("result-overlay").locator("polygon").first();
    const second = page.getByTestId("result-overlay").locator("polygon").nth(1);
    await first.focus();
    await first.press("ArrowUp");
    await expect(first).toBeFocused();
    await first.press("ArrowDown");
    await expect(second).toBeFocused();
    await page.getByRole("button", { name: "Highlighting settings", exact: true }).click();
    await page.getByRole("switch", { name: "Show field highlights", exact: true }).uncheck();
    await expect(edge).toHaveCount(0);
    await expect(polygon).toHaveAttribute("fill", "none");
});

test("UI-36 real invoice defaults respect the row budget and never reapply over user choices", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await expect(page.getByRole("button", { name: "Collapse AmountDue", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Collapse BalanceForward", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Collapse LineItems", exact: true })).toBeVisible();
    const visibleRows = await page.locator(".cu-fields-scroll").evaluate(element =>
        element.querySelectorAll(".cu-fields-table > tbody > tr[data-field-id]").length +
        element.querySelectorAll(".cu-items-table tr").length);
    expect(visibleRows).toBeLessThanOrEqual(40);
    await page.getByRole("button", { name: "Collapse AmountDue", exact: true }).click();
    await page.getByRole("button", { name: "Highlighting settings", exact: true }).click();
    await page.getByRole("spinbutton", { name: "Confidence threshold", exact: true }).fill("0.60");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Expand AmountDue", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "LineItems", exact: true }).focus();
    await page.getByRole("button", { name: "LineItems", exact: true }).press("Alt+ArrowUp");
    await expect(page.getByRole("button", { name: "Expand AmountDue", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Markdown", exact: true }).click();
    await page.getByRole("tab", { name: "Fields", exact: true }).click();
    await expect(page.getByRole("button", { name: "Expand AmountDue", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Collapse LineItems", exact: true })).toBeVisible();
});

test("UI-36 matched flat invoice arrays use reference-density columns and accurate group annotations", async ({ page }) => {
    await loadReviewFixture(page);
    const columns = ["Date", "ItemCode", "Description", "Qty", "UM", "Price", "Tax", "Amount"];
    const rows = [
        ["3/4/2021", "A123", "Consulting Services", 2, "hours", "$30.00", "$6.00", "$60.00"],
        ["3/5/2021", "B456", "Document Fee", 3, "", "$10.00", "$3.00", "$30.00"],
        ["3/6/2021", "C789", "Printing Fee", 10, "pages", "$1.00", "$1.00", "$10.00"],
    ];
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "matched-compact-array.cu.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ apiVersion: "2025-11-01", contents: [{
            kind: "document", unit: "inch", pages: [{ pageNumber: 1, width: 8.5, height: 11 }], fields: {
                Customer: { type: "object", valueObject: { Name: { type: "string", valueString: "Contoso" } } },
                LineItems: { type: "array", valueArray: rows.map((row, rowIndex) => ({
                    type: "object", valueObject: Object.fromEntries(columns.map((name, columnIndex) => {
                        const value = row[columnIndex];
                        if (value === undefined) throw new Error("The matched array fixture is missing a cell.");
                        return [name, { ...(typeof value === "number" ? { type: "number", valueNumber: value } :
                            { type: "string", valueString: value }), confidence: rowIndex === 2 && columnIndex === 4 ? 0.41 : 0.95 }];
                    })),
                })) },
            },
        }] })),
    });
    const grid = page.getByRole("table", { name: "LineItems values", exact: true });
    await expect(grid).toBeVisible();
    await expect(grid.getByRole("row")).toHaveCount(4);
    const widths = await grid.evaluate(table => ({
        table: table.getBoundingClientRect().width,
        quantity: table.querySelectorAll("thead th")[4]!.getBoundingClientRect().width,
        row: table.querySelector("tbody tr")!.getBoundingClientRect().height,
    }));
    expect(Math.abs(widths.table - 773.421875)).toBeLessThanOrEqual(1);
    expect(Math.abs(widths.quantity - 60.40625)).toBeLessThanOrEqual(1);
    expect(Math.abs(widths.row - 29)).toBeLessThanOrEqual(0.1);
    await expect(page.locator('[data-field-id="/contents/0/fields/Customer"] .cu-summary-value')).toHaveText("");
    await expect(page.locator('[data-field-id="/contents/0/fields/LineItems"] .cu-field-count')).toHaveCount(0);
    await expect(page.locator('[data-field-id="/contents/0/fields/LineItems"] .cu-summary-value')).toHaveText("3 items");
    await expect(page.locator(".cu-fields-table > thead th").first()).toHaveCSS("border-top-left-radius", "4px");
    await expect(page.locator(".cu-fields-scroll")).toHaveCSS("scrollbar-color", "rgb(192, 202, 214) rgba(0, 0, 0, 0)");
    await page.getByRole("searchbox", { name: "Search fields or values" }).fill("1 properties");
    await expect(page.getByRole("heading", { name: "No matching fields", exact: true })).toBeVisible();
});
