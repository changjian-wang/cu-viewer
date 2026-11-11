import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { ready, expandField, fitSource, rotateSource } from "./viewerAssertions";

const pdf = resolve("tests", "fixtures", "labels", "invoice.pdf");
const labelFile = resolve("tests", "fixtures", "labels", "invoice.pdf.labels.json");
const labelData: unknown = JSON.parse(readFileSync(labelFile, "utf8"));
const labelId = (path: string): string => `/labels/fields/${path}`;
const invoice = labelId("InvoiceNumber");
const date = labelId("LineItems/valueArray/0/valueObject/Date");

async function loadLabels(page: Page): Promise<void> {
    await page.goto("/");
    await ready(page);
    await page.getByLabel("Choose source file", { exact: true }).setInputFiles(pdf);
    await ready(page);
    await page.getByLabel("Choose local label JSON", { exact: true }).setInputFiles(labelFile);
    await page.getByRole("tab", { name: "Label", exact: true }).click();
    await expect(page.getByRole("treegrid", { name: "Labels", exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
}

async function checkLabelFrame(page: Page, layer: "preview-overlay" | "source-overlay") {
    const frame = page.getByTestId(layer).locator(`polygon[data-source-id="${invoice}"]`);
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveAttribute("data-region-indices", "0 1 2");
    await expect(frame).toHaveAttribute("stroke-width", "1");
    await expect(frame).toHaveAttribute("vector-effect", "non-scaling-stroke");
    await expect(frame).toHaveAttribute("fill", "none");
    const state = await frame.evaluate(element => {
        const points = (polygon: Element) => {
            if (!(polygon instanceof SVGPolygonElement)) throw new Error("Expected an SVG source polygon.");
            const matrix = polygon.getScreenCTM();
            if (!matrix) throw new Error("The SVG source transform is unavailable.");
            return Array.from({ length: polygon.points.numberOfItems }, (_, index) => {
                const point = polygon.points.getItem(index);
                const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
                return { x: screen.x, y: screen.y };
            });
        };
        const bounds = (items: { x: number; y: number }[]) => ({
            left: Math.min(...items.map(point => point.x)), right: Math.max(...items.map(point => point.x)),
            top: Math.min(...items.map(point => point.y)), bottom: Math.max(...items.map(point => point.y)),
        });
        const id = element.getAttribute("data-source-id");
        const sources = [...document.querySelectorAll(`[data-testid="result-overlay"] polygon[data-outline-id="${id}"]`)];
        const original = bounds(sources.flatMap(points)), outer = bounds(points(element));
        return {
            rawPoints: sources.map(source => source.getAttribute("points")),
            padding: [original.left - outer.left, outer.right - original.right,
                original.top - outer.top, outer.bottom - original.bottom],
            marginPoint: { x: original.left - 0.75, y: (original.top + original.bottom) / 2 },
        };
    });
    expect(state.rawPoints).toHaveLength(3);
    for (const padding of state.padding) expect(Math.abs(padding - 1)).toBeLessThanOrEqual(0.15);
    return state;
}

test.describe("Label frame readability", () => {
    test.use({ viewport: { width: 1031, height: 900 }, deviceScaleFactor: 2 });

    test("adjacent label fragments have a thin outer frame without expanding hit targets at small zoom and rotation", async ({ page }) => {
        await loadLabels(page);
        const button = page.getByRole("button", { name: "InvoiceNumber", exact: true });
        for (const mode of ["page", "25%", "125%"]) {
            if (mode === "page") await fitSource(page, "page");
            else {
                await page.getByRole("combobox", { name: "Zoom", exact: true }).selectOption({ label: mode });
                await ready(page);
            }
            for (const rotate of [false, true]) {
                if (rotate) await rotateSource(page);
                await button.click();
                await ready(page);
                const pinned = await checkLabelFrame(page, "source-overlay");
                await page.keyboard.press("Escape");
                await page.locator(".prototype-banner").hover();
                await button.hover();
                const preview = await checkLabelFrame(page, "preview-overlay");
                expect(preview.rawPoints).toEqual(pinned.rawPoints);
                await page.mouse.click(preview.marginPoint.x, preview.marginPoint.y);
                await expect(page.getByTestId("source-overlay")).toHaveCount(0);
                await expect(page.getByTestId("preview-overlay")).toHaveCount(0);
                const actual = await page.getByTestId("result-overlay").locator(`polygon[data-outline-id="${invoice}"]`)
                    .evaluateAll(elements => elements.map(element => element.getAttribute("points")));
                expect(actual).toEqual(pinned.rawPoints);
            }
        }
    });
});

test("local labels retain typed values, nested objects and array rows with fixed reference colors", async ({ page }) => {
    await loadLabels(page);
    const pane = page.getByRole("region", { name: "Extraction results" });
    const grid = pane.getByRole("treegrid", { name: "Labels", exact: true });
    await expect(grid.getByRole("button", { name: "InvoiceNumber", exact: true })).toBeVisible();
    await expect(grid.getByRole("button", { name: "InvoiceId", exact: true })).toHaveCount(0);
    await expect(grid.getByText("2019-11-15", { exact: true })).toBeVisible();
    await expect(grid.getByRole("table", { name: "LineItems values", exact: true }).getByRole("row")).toHaveCount(4);
    const outlines = page.getByTestId("result-overlay");
    await expect(outlines.locator(`polygon[data-outline-id="${invoice}"]`)).toHaveCount(3);
    await expect(outlines.locator(`polygon[data-outline-id="${invoice}"]`).first()).toHaveAttribute("fill", "#E8F5E9");
    await expect(outlines.locator(`polygon[data-outline-id="${labelId("SellerAddress")}"]`).first())
        .toHaveAttribute("fill", "#E8F5E9");
    await expect(outlines.locator(`polygon[data-outline-id="${date}"]`).first()).toHaveAttribute("fill", "#E8F1FF");
    await expandField(page, "OrderInformation");
    const missing = grid.locator(`[data-field-id="${labelId("OrderInformation/valueObject/Salesperson")}"]`);
    await expect(missing).toContainText("Not returned");
    await expect(outlines.locator(`polygon[data-outline-id="${labelId("OrderInformation/valueObject/Salesperson")}"]`))
        .toHaveCount(0);
    await page.getByRole("button", { name: "Highlighting legend", exact: true }).click();
    const legend = page.getByRole("dialog", { name: "Legend", exact: true });
    await expect(legend.getByRole("switch")).toHaveCount(2);
    await expect(legend.getByText("Reference label; not compared", { exact: true })).toBeVisible();
    await expect(legend.getByRole("switch", { name: "Show array label highlights", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Source settings", exact: true })).toHaveCount(0);
    await legend.getByRole("button", { name: "Close legend", exact: true }).click();
    await pane.getByRole("tab", { name: "Fields", exact: true }).click();
    await expect(pane.getByRole("treegrid", { name: "Extracted fields", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Source settings", exact: true })).toBeVisible();
});

test("label hovering and selection work in both directions for scalars, objects and arrays", async ({ page }) => {
    await loadLabels(page);
    const grid = page.getByRole("treegrid", { name: "Labels", exact: true });
    const tooltip = page.getByRole("tooltip", { name: "Label preview", exact: true });
    await grid.getByRole("button", { name: "InvoiceNumber", exact: true }).hover();
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("INV-100");
    await expect(tooltip.getByText("Confidence", { exact: true })).toHaveCount(0);
    await page.locator(".prototype-banner").hover();
    await page.getByTestId("result-overlay").locator(`polygon[data-outline-id="${invoice}"]`).first().hover();
    await expect(tooltip).toContainText("INV-100");
    await expect(grid.locator(`tr[data-field-id="${invoice}"]`)).toHaveClass(/is-hovered/);
    await grid.getByRole("button", { name: "ServicePeriod", exact: true }).hover();
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("StartDate: 2019-10-14");
    await expect(tooltip).toContainText("EndDate: 2019-11-14");
    await grid.getByRole("button", { name: "LineItems", exact: true }).hover();
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("Item 1 / Date: 2021-03-04");
    await grid.getByRole("button", { name: "Select value of LineItems / Item 1 / Date", exact: true }).click();
    await expect(page.getByTestId("source-overlay").locator("polygon").first()).toHaveAttribute("data-source-id", date);
    const search = page.getByRole("searchbox", { name: "Search labels or values", exact: true });
    await search.fill("InvoiceDate");
    await page.getByRole("button", { name: "Next label", exact: true }).click();
    await expect(page.getByLabel("Current label position")).toHaveText("1 / 1 labels");
    await expect(page.getByTestId("source-overlay").locator("polygon").first())
        .toHaveAttribute("data-source-id", labelId("InvoiceDate"));
});

test("the production session loads labels without an Analyze result, preference RPC or outbound requests", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", request => requests.push(request.url()));
    const entry = `/@fs/${resolve("frontend", "app", "main.tsx").replaceAll("\\", "/")}`;
    await page.route("**/label-session/", route => route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>`,
    }));
    await page.route("**/label-session/session.json", route => route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ source: "./source/invoice.pdf", name: "invoice.pdf", labels: labelData }),
    }));
    await page.route("**/label-session/source/invoice.pdf", route => route.fulfill({ path: pdf, contentType: "application/pdf" }));
    await page.goto("/label-session/");
    await ready(page);
    await expect(page.getByRole("tab", { name: "Label", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Fields", exact: true })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Result", exact: true })).toHaveCount(0);
    await expect(page.getByRole("treegrid", { name: "Labels", exact: true })).toContainText("InvoiceNumber");
    expect(requests.some(url => url.includes("field-order") || url.includes(".result.json"))).toBe(false);
    expect(requests.filter(url => url.startsWith("http")).every(url => new URL(url).hostname === "127.0.0.1")).toBe(true);
});

test("invalid label JSON is reported without hiding a readable PDF", async ({ page }) => {
    await loadLabels(page);
    await page.getByLabel("Choose local label JSON", { exact: true }).setInputFiles({
        name: "invalid.labels.json", mimeType: "application/json", buffer: Buffer.from('{"fieldLabels":[]}'),
    });
    await expect(page.getByRole("alert")).toContainText("Labels could not be read");
    await expect(page.getByTestId("rendered-page")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Label", exact: true })).toHaveAttribute("aria-selected", "true");
});
