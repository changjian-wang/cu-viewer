import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { ready } from "./viewerAssertions";
import { alive, trackSourceResources } from "./sourceResources";

async function loadMarkdown(page: Page, markdown: string): Promise<void> {
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "large-markdown.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({
            apiVersion: "2025-11-01", contents: [{ kind: "document", markdown, fields: {} }],
        })),
    });
    await page.getByRole("tab", { name: "Markdown", exact: true }).click();
}

async function loadFigureMarkdown(page: Page, markdown: string, figures: readonly { id: string; source?: string }[]): Promise<void> {
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "local-figures.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({
            apiVersion: "2025-11-01", contents: [{ kind: "document", unit: "inch", markdown, fields: {},
                pages: [1, 2, 3, 4].map(pageNumber => ({ pageNumber, width: 8.5, height: 11 })), figures }],
        })),
    });
    await page.getByRole("tab", { name: "Markdown", exact: true }).click();
}

test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await ready(page);
});

test("a single long formatted paragraph remains complete with bounded visible DOM", async ({ page }) => {
    await loadMarkdown(page, `# Long single page\n\n**${"Long formatted text. ".repeat(60_000)}END_OF_PARAGRAPH**\n\n[reference][ref]\n\n[ref]: https://example.com/reference`);
    const scroll = page.getByRole("region", { name: "Markdown content", exact: true });
    await expect(scroll).toBeVisible({ timeout: 20_000 });
    await expect(scroll.getByRole("heading", { name: "Long single page" })).toBeVisible();
    const initial = await scroll.locator("*").count();
    expect(initial).toBeLessThan(1500);
    await scroll.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(scroll).toContainText("END_OF_PARAGRAPH");
    await expect(scroll.getByRole("link", { name: "reference", exact: true })).toHaveAttribute("href", "https://example.com/reference");
    expect(await scroll.locator("*").count()).toBeLessThan(1500);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Page number", exact: true })).toHaveValue("1");
});

test("a ten-thousand-row table preserves headers, spans, final rows and long-cell content", async ({ page }) => {
    const longCell = `${"Large cell text. ".repeat(6000)}END_OF_LONG_CELL`;
    const rows = Array.from({ length: 10_000 }, (_, index) => {
        const indexCell = index === 0 ? '<td rowspan="100">shared-label</td>' :
            index < 100 ? "" : `<td>${index}</td>`;
        return `<tr>${indexCell}<td>${index === 9999 ? longCell : `value-${index}`}</td><td>end-${index}</td></tr>`;
    }).join("");
    await loadMarkdown(page, `<table><thead><tr><th rowspan="2">Index</th><th colspan="2">Metrics</th></tr>` +
        `<tr><th>A</th><th>B</th></tr></thead><tbody>${rows}</tbody></table>`);
    const table = page.getByRole("region", { name: "Scrollable Markdown table", exact: true });
    await expect(table).toBeVisible({ timeout: 40_000 });
    await expect(table.getByRole("columnheader", { name: "Metrics", exact: true })).toBeVisible();
    await expect(table).toContainText("value-0");
    expect(await table.locator("tbody tr[data-index]").count()).toBeLessThan(80);
    await table.evaluate(element => { element.scrollTop = 1600; });
    await expect(table).toContainText("shared-label");
    const span = table.getByRole("cell", { name: "shared-label", exact: true });
    expect(Number(await span.getAttribute("rowspan"))).toBeGreaterThan(1);
    await table.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(table).toContainText("end-9999");
    await expect(table.getByRole("columnheader", { name: "Metrics", exact: true })).toBeVisible();
    const cell = table.getByRole("region", { name: "Long Markdown cell content", exact: true });
    await expect(cell).toBeVisible();
    await cell.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(cell).toContainText("END_OF_LONG_CELL");
    expect(await table.locator("*").count()).toBeLessThan(3000);
    await expect(page.getByRole("alert")).toHaveCount(0);
});

test("references and HTML tables keep their semantics across CU page boundaries", async ({ page }) => {
    const markdown = `[Across pages][ref]\n\n${"First page. ".repeat(2500)}\n\n` +
        '<table><tr><th>A</th><th>B</th></tr><tr><td rowspan="2">Merged</td><td>First row</td></tr>\n' +
        '<!-- PageBreak -->\n<tr><td>Last row</td></tr></table>\n\n' +
        `[ref]: https://example.com/reference\n\n${"Second page. ".repeat(2500)}`;
    await loadMarkdown(page, markdown);
    await expect(page.getByRole("link", { name: "Across pages", exact: true })).toHaveAttribute("href", "https://example.com/reference");
    const input = page.getByRole("textbox", { name: "Markdown page number", exact: true });
    await input.fill("2"); await input.press("Enter");
    const table = page.getByRole("table", { name: "Markdown table (continued)", exact: true });
    await expect(table).toBeVisible();
    await expect(table).toContainText("Merged");
    await expect(table).toContainText("Last row");
    await expect(table.getByRole("columnheader", { name: "A", exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
});

test("wide tables virtualize columns without dropping their last cells", async ({ page }) => {
    const header = Array.from({ length: 80 }, (_, column) => `<th>H${column}</th>`).join("");
    const rows = Array.from({ length: 3 }, (_, row) => `<tr>${Array.from({ length: 80 }, (_, column) =>
        `<td>r${row}-c${column}</td>`).join("")}</tr>`).join("");
    await loadMarkdown(page, `<table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>`);
    const table = page.getByRole("region", { name: "Scrollable Markdown table", exact: true });
    await expect(table).toBeVisible();
    await expect(table).toContainText("r0-c0");
    expect(await table.locator("col").count()).toBeLessThan(20);
    await table.evaluate(element => { element.scrollLeft = element.scrollWidth; });
    await expect(table.getByRole("columnheader", { name: "H79", exact: true })).toBeVisible();
    await expect(table).toContainText("r2-c79");
    expect(await table.locator("col").count()).toBeLessThan(20);
});

test("worker loading errors retain original Markdown, a working PDF, and an explicit retry", async ({ page }) => {
    const workerRoute = "**/markdown/markdown.worker.js";
    await page.route(workerRoute, route => route.fulfill({ status: 404, body: "Synthetic missing worker" }));
    await loadMarkdown(page, "# Original remains readable\n\nSaved original text.");
    await expect(page.getByRole("alert")).toContainText("Markdown could not be formatted");
    await expect(page.locator(".cu-markdown-raw")).toContainText("# Original remains readable");
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Page number", exact: true })).toHaveValue("2");
    await expect(page.getByRole("img", { name: "Rendered source page 2", exact: true })).toBeVisible();
    await page.unroute(workerRoute);
    await page.getByRole("button", { name: "Retry formatting", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Original remains readable", exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Page number", exact: true })).toHaveValue("2");
});

test("Markdown workers survive tab round trips but are released with their viewer", async ({ page }) => {
    await trackSourceResources(page);
    const host = `/@fs/${resolve("tests", "e2e", "source-inputs.html").replaceAll("\\", "/")}`;
    await page.goto(host);
    await page.getByRole("combobox", { name: "Source input", exact: true }).selectOption("ArrayBuffer");
    await page.getByRole("button", { name: "Load PDF", exact: true }).click();
    await ready(page);
    await expect.poll(async () => (await alive(page)).workers).toBe(1);
    await page.getByRole("tab", { name: "Markdown", exact: true }).click();
    await expect(page.getByRole("heading", { name: "INVOICE", exact: true })).toBeVisible();
    await expect.poll(async () => (await alive(page)).workers).toBe(2);
    await page.getByRole("tab", { name: "Fields", exact: true }).click();
    await expect.poll(async () => (await alive(page)).workers).toBe(2);
    await page.getByRole("button", { name: "Unmount viewer", exact: true }).click();
    await expect.poll(async () => (await alive(page)).workers).toBe(0);
});

test("local figure crops leave ordinary text, external images and the source page unchanged", async ({ page }) => {
    const imageRequests: string[] = [];
    page.on("request", request => {
        if (/\/figures\/|example\.invalid/.test(request.url())) imageRequests.push(request.url());
    });
    const sourcePage = page.getByRole("textbox", { name: "Page number", exact: true });
    await sourcePage.fill("4"); await sourcePage.press("Enter");
    await expect(page.getByRole("img", { name: "Rendered source page 4", exact: true })).toBeVisible();
    const markdown = `# Cropped logo\n\n![Local logo](figures/1.1)\n\n` +
        `![Remote](https://user:pass@example.invalid/tracker?sig=secret)\n\n${"First page. ".repeat(3000)}\n\n` +
        `<!-- PageBreak -->\n\n# Text remains text\n\n\u2713 YES BANK\n\n${"Second page. ".repeat(3000)}`;
    await loadFigureMarkdown(page, markdown, [{ id: "1.1", source: "D(1,0,0,8.5,3)" }]);
    const pane = page.getByRole("region", { name: "Extraction results", exact: true });
    const image = pane.getByRole("img", { name: "Local logo", exact: true });
    await expect(image).toBeVisible();
    expect(await image.evaluate(canvas => {
        if (!(canvas instanceof HTMLCanvasElement)) throw new Error("The local figure is not a canvas.");
        const pixels = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
        if (!pixels) throw new Error("The local figure pixels are unavailable.");
        let painted = 0;
        for (let index = 0; index < pixels.length; index += 4) {
            if ((pixels[index + 3] ?? 0) > 0 && Math.min(pixels[index] ?? 255, pixels[index + 1] ?? 255, pixels[index + 2] ?? 255) < 240) painted++;
        }
        return painted;
    })).toBeGreaterThan(20);
    await expect(image).toHaveCSS("border-top-width", "0px");
    await expect(pane).toContainText("Image omitted: Remote");
    const previous = await image.elementHandle();
    if (!previous) throw new Error("The original crop canvas is unavailable.");
    const input = page.getByRole("textbox", { name: "Markdown page number", exact: true });
    await input.fill("2"); await input.press("Enter");
    await expect(pane.getByRole("heading", { name: "Text remains text", exact: true })).toBeVisible();
    await expect(pane).toContainText("\u2713 YES BANK");
    await expect(pane.getByRole("img")).toHaveCount(0);
    await expect.poll(() => previous.evaluate(canvas =>
        canvas instanceof HTMLCanvasElement && canvas.width === 0 && canvas.height === 0)).toBe(true);
    await expect(sourcePage).toHaveValue("4");
    await expect(page.getByRole("img", { name: "Rendered source page 4", exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(imageRequests).toEqual([]);
});

test("virtualized table cells resolve local figures and release offscreen crop canvases", async ({ page }) => {
    const rows = Array.from({ length: 500 }, (_, index) => `<tr><td>row-${index}</td><td>` +
        (index === 0 ? '<img src="figures/1.1" alt="First local figure">' :
            index === 499 ? '<img src="./figures/2.1" alt="Last local figure">' : "Cell") + "</td></tr>").join("");
    await loadFigureMarkdown(page, `<table><thead><tr><th>Index</th><th>Figure</th></tr></thead><tbody>${rows}</tbody></table>`,
        [{ id: "1.1", source: "D(1,0,0,8.5,3)" }, { id: "2.1", source: "D(2,0,0,8.5,3)" }]);
    const table = page.getByRole("region", { name: "Scrollable Markdown table", exact: true });
    const first = table.getByRole("img", { name: "First local figure", exact: true });
    await expect(first).toBeVisible();
    const previous = await first.elementHandle();
    if (!previous) throw new Error("The first virtual crop canvas is unavailable.");
    await table.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(table.getByRole("img", { name: "Last local figure", exact: true })).toBeVisible();
    await expect.poll(() => previous.evaluate(canvas =>
        canvas instanceof HTMLCanvasElement && canvas.width === 0 && canvas.height === 0)).toBe(true);
    expect(await table.getByTestId("source-thumbnail").count()).toBeLessThan(3);
    await expect(page.getByRole("alert")).toHaveCount(0);
});

test("unavailable figure references show local errors without hiding Markdown or blocking PDF navigation", async ({ page }) => {
    await loadFigureMarkdown(page, "# Still readable\n\n![Missing](figures/9.9)\n\n![No region](figures/unlocated)\n\n![Ambiguous](figures/duplicate)",
        [{ id: "unlocated" }, { id: "duplicate" }, { id: "duplicate" }]);
    const pane = page.getByRole("region", { name: "Extraction results", exact: true });
    await expect(pane.getByRole("heading", { name: "Still readable", exact: true })).toBeVisible();
    await expect(pane.getByRole("alert")).toHaveCount(3);
    await expect(pane).toContainText("not available in this content");
    await expect(pane).toContainText("has no source region");
    await expect(pane).toContainText("ambiguous source metadata");
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(page.getByRole("img", { name: "Rendered source page 2", exact: true })).toBeVisible();
    await expect(pane.getByRole("heading", { name: "Still readable", exact: true })).toBeVisible();
});

test("image-heavy pages keep crop canvases bounded while their final figure remains reachable", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await loadFigureMarkdown(page, Array.from({ length: 80 }, (_, index) =>
        `![Local figure ${index}](figures/1.1)`).join("\n\n"), [{ id: "1.1", source: "D(1,0,0,8.5,3)" }]);
    const scroll = page.getByRole("region", { name: "Markdown content", exact: true });
    await expect(scroll.getByRole("img", { name: "Local figure 0", exact: true })).toBeVisible();
    expect(await scroll.getByTestId("source-thumbnail").count()).toBeLessThan(32);
    await scroll.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(scroll.getByRole("img", { name: "Local figure 79", exact: true })).toBeVisible();
    expect(await scroll.getByTestId("source-thumbnail").count()).toBeLessThan(32);
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(errors).toEqual([]);
});
