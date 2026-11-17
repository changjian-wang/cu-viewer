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
            for (const row of [1, 2]) {
                const id = `/contents/0/fields/LineItems/valueArray/${row}/valueObject/Description`;
                const region = source.locator(`polygon[data-outline-id="${id}"]`);
                const edge = source.locator(`path[data-source-edge-id="${id}"]`);
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
                        `path[data-source-edge-id="${element.getAttribute("data-outline-id")}"]`);
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
    await expect(flyout.locator(".cu-popover-heading")).toHaveCSS("background-color", "rgb(229, 218, 255)");
    await expect(flyout.locator(".cu-popover-heading")).toHaveCSS("color", "rgb(76, 29, 149)");
    expect(await flyout.evaluate(element => getComputedStyle(element, "::before").backgroundColor)).toBe("rgb(229, 218, 255)");
    await expect(flyout.locator('[data-comparison-side="extracted"] .cu-flyover-comparison-value'))
        .toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
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
    expect(await legend.locator(".cu-legend-item .cu-legend-swatch").evaluateAll(nodes =>
        nodes.map(node => getComputedStyle(node).backgroundColor))).toEqual([
        "rgb(236, 243, 252)", "rgb(222, 233, 250)", "rgb(220, 251, 215)", "rgb(255, 218, 221)", "rgb(248, 192, 200)",
    ]);
    const lowExample = legend.locator(".cu-legend-outline-swatch");
    await expect(lowExample).toHaveText("123");
    await expect(lowExample).toHaveCSS("background-color", "rgb(220, 251, 215)");
    await expect(lowExample).toHaveCSS("border-color", "rgba(180, 60, 75, 0.6)");
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
    await region.hover();
    const preview = page.getByTestId("preview-overlay").locator("polygon").first();
    const hover = await preview.boundingBox();
    if (!hover) throw new Error("The low-confidence preview frame is unavailable.");
    const clearance = (await edge.evaluate(element => parseFloat(getComputedStyle(element).strokeWidth)) +
        await preview.evaluate(element => parseFloat(getComputedStyle(element).strokeWidth))) / 2 + 1;
    expect(raw.x - hover.x).toBeGreaterThan(clearance);
    expect(raw.y - hover.y).toBeGreaterThan(clearance);
    expect(hover.x + hover.width - raw.x - raw.width).toBeGreaterThan(clearance);
    expect(hover.y + hover.height - raw.y - raw.height).toBeGreaterThan(clearance);
    await expect(edge).toHaveCSS("stroke", "rgba(180, 60, 75, 0.6)");
    await expect(preview).toHaveCSS("stroke", "rgb(128, 99, 181)");
    await region.click();
    const pin = page.getByTestId("source-overlay").locator("polygon").first();
    await expect(pin).toHaveCSS("stroke", "rgb(91, 33, 182)");
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
    await expect(billing).toHaveCSS("background-color", "rgb(236, 243, 252)");
    await expect(billing).toHaveCSS("box-shadow", /180, 60, 75/);
    await expect(pane.getByRole("columnheader", { name: "Confidence", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "PDF + Labels", exact: true }).click();
    await ready(page);
    await expect(pane.getByRole("columnheader", { name: "Extracted Value", exact: true })).toBeVisible();
    await expect(pane.getByRole("columnheader", { name: "Confidence", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "PDF", exact: true }).click();
    await ready(page);
    await expect(pane.getByRole("columnheader", { name: "Confidence", exact: true })).toBeVisible();
    await expect(billing).toHaveCSS("background-color", "rgb(236, 243, 252)");
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
