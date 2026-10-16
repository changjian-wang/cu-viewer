import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { ready, selectResultView } from "./viewerAssertions";

const labels = ["Fields", "Markdown", "Paragraphs", "Tables", "Figures", "Signatures", "Metadata", "Result"];

async function setResultsWidth(page: Page, width: number): Promise<void> {
    await page.locator(".cu-viewer").evaluate((element, width) => {
        const pane = element.querySelector(".cu-fields-pane");
        const bar = element.querySelector(".cu-result-tabs");
        if (!(element instanceof HTMLElement) || !pane || !bar) throw new Error("Result layout is unavailable.");
        const borders = pane.getBoundingClientRect().width - bar.getBoundingClientRect().width;
        element.style.gridTemplateColumns = `minmax(400px, 1fr) ${width + borders}px`;
    }, width);
}

test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "synthetic-overflow-tabs.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({
            apiVersion: "2026-06-01-preview", analyzerId: "saved-analyzer",
            contents: [{
                kind: "document", fields: { Name: { type: "string", valueString: "Retained field" } },
                markdown: "# Saved Markdown", paragraphs: [{ content: "Saved paragraph" }],
                tables: [{ rowCount: 1, columnCount: 1, cells: [{ rowIndex: 0, columnIndex: 0, content: "Saved cell" }] }],
                figures: [{ id: "figure" }], signatures: [{ id: "signature" }], metadata: { Author: "Contoso" },
            }],
        })),
    });
    const pane = page.getByRole("region", { name: "Extraction results" });
    await expect(pane.getByRole("tab", { includeHidden: true })).toHaveText(labels);
    await page.evaluate(async () => { await document.fonts.ready; });
});

test("overflow selection keeps the active tab visible and preserves the loaded source", async ({ page }) => {
    const pane = page.getByRole("region", { name: "Extraction results" });
    await setResultsWidth(page, 330);
    const more = pane.getByRole("button", { name: "More result views" });
    await expect(more).toBeVisible();
    const visible = await pane.getByRole("tab").allTextContents();
    expect(visible.length).toBeGreaterThan(1);
    expect(visible.length).toBeLessThan(labels.length);
    await expect(pane.getByRole("tab", { name: "Code", includeHidden: true, exact: true })).toHaveCount(0);
    const source = await page.getByTestId("rendered-page").elementHandle();
    if (!source) throw new Error("The loaded source is unavailable.");
    const zoom = await page.getByLabel("Zoom percentage").textContent();
    const number = await page.getByRole("textbox", { name: "Page number" }).inputValue();
    await more.click();
    await expect(pane.getByRole("menuitem")).toHaveText(labels.filter(label => !visible.includes(label)));
    await pane.getByRole("menuitem", { name: "Metadata", exact: true }).click();
    const metadata = pane.getByRole("tab", { name: "Metadata", exact: true });
    await expect(metadata).toBeVisible();
    await expect(metadata).toBeFocused();
    await expect(metadata).toHaveAttribute("aria-selected", "true");
    await expect(pane.getByRole("menu")).toHaveCount(0);
    await expect(pane.getByRole("table", { name: "Returned metadata" })).toBeVisible();
    await expect(pane.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", await metadata.getAttribute("id") ?? "");
    await expect(page.getByLabel("Zoom percentage")).toHaveText(zoom ?? "");
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue(number);
    expect(await page.getByTestId("rendered-page").evaluate((element, original) => element === original, source)).toBe(true);
    await more.click();
    await page.locator(".prototype-banner").click();
    await expect(pane.getByRole("menu")).toHaveCount(0);
});

test("keyboard operates overflow items, dismissal and every tab with correct focus", async ({ page }) => {
    const pane = page.getByRole("region", { name: "Extraction results" });
    await setResultsWidth(page, 330);
    const more = pane.getByRole("button", { name: "More result views" });
    await more.press("ArrowDown");
    await expect(pane.getByRole("menuitem").first()).toBeFocused();
    await page.keyboard.press("End");
    await expect(pane.getByRole("menuitem").last()).toBeFocused();
    await page.keyboard.press("Home");
    await expect(pane.getByRole("menuitem").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(more).toBeFocused();
    await expect(pane.getByRole("menu")).toHaveCount(0);
    await more.press("Space");
    await pane.getByRole("menuitem", { name: "Metadata", exact: true }).press("Enter");
    const metadata = pane.getByRole("tab", { name: "Metadata", exact: true });
    await expect(metadata).toBeFocused();
    await expect(pane.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
    await metadata.press("End");
    const result = pane.getByRole("tab", { name: "Result", exact: true });
    await expect(result).toBeFocused();
    await expect(pane.getByRole("tree", { name: "Original Analyze result JSON" })).toBeVisible();
    await result.press("ArrowRight");
    await expect(pane.getByRole("tab", { name: "Fields", exact: true })).toBeFocused();
    await more.press("ArrowUp");
    await expect(pane.getByRole("menuitem").last()).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(pane.getByRole("menu")).toHaveCount(0);
    await expect(pane.getByRole("tabpanel")).toBeFocused();
    await more.press("ArrowDown");
    await pane.getByRole("menuitem", { name: "Tables", exact: true }).press("Space");
    await expect(pane.getByRole("tab", { name: "Tables", exact: true })).toBeFocused();
    await expect(pane.getByRole("table")).toHaveCount(1);
});

test("container resizing uses the exact fit threshold without a window resize and retains selection", async ({ page }) => {
    const pane = page.getByRole("region", { name: "Extraction results" });
    const bar = pane.locator(".cu-result-tabs");
    await setResultsWidth(page, 330);
    await selectResultView(pane, "Metadata");
    const requiredWidth = await bar.evaluate(element => {
        const tabs = Array.from(element.querySelectorAll('[role="tab"]'));
        const gap = Number.parseFloat(getComputedStyle(element).columnGap);
        return tabs.reduce((width, tab) => width + tab.getBoundingClientRect().width, 0) + gap * (tabs.length - 1);
    });
    await pane.getByRole("button", { name: "More result views" }).click();
    await setResultsWidth(page, requiredWidth);
    await expect(pane.getByRole("tab")).toHaveText(labels);
    await expect(pane.getByRole("button", { name: "More result views" })).toHaveCount(0);
    await expect(pane.getByRole("menu")).toHaveCount(0);
    const metadata = pane.getByRole("tab", { name: "Metadata", exact: true });
    await expect(metadata).toBeFocused();
    await setResultsWidth(page, requiredWidth - 1);
    await expect(pane.getByRole("button", { name: "More result views" })).toBeVisible();
    expect(await pane.getByRole("tab").count()).toBeLessThan(labels.length);
    await expect(metadata).toHaveAttribute("aria-selected", "true");
    await expect(metadata).toBeFocused();
});

test("viewport widths keep visible controls in one row without horizontal tab scrolling", async ({ page }) => {
    const pane = page.getByRole("region", { name: "Extraction results" });
    let previousCount = 0;
    for (const width of [880, 1280, 2400]) {
        await page.setViewportSize({ width, height: 900 });
        await expect.poll(async () => pane.locator(".cu-result-tabs").evaluate(element => {
            const bounds = element.getBoundingClientRect();
            const controls = Array.from(element.querySelectorAll('button[role="tab"], .cu-result-tab-more'))
                .filter(button => getComputedStyle(button).visibility !== "hidden");
            return element.scrollWidth <= element.clientWidth && controls.every(button => {
                const rect = button.getBoundingClientRect();
                return rect.x >= bounds.x && rect.right <= bounds.right && rect.top >= bounds.top && rect.bottom <= bounds.bottom;
            });
        })).toBe(true);
        const count = await pane.getByRole("tab").count();
        expect(count).toBeGreaterThanOrEqual(previousCount);
        previousCount = count;
    }
    await expect(pane.getByRole("tab")).toHaveText(labels);
    await expect(pane.getByRole("button", { name: "More result views" })).toHaveCount(0);
});
