import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { checkPolygon, expandField, locateGroup, ready } from "./viewerAssertions";
import { trackSourceResources } from "./sourceResources";

const amountRow = '[data-field-id="/contents/0/fields/AmountDue/valueObject/Amount"]';
const amountPoints = ([[7.3628, 8.0513], [7.9272, 8.0513], [7.9272, 8.2124], [7.3628, 8.2124]] as const)
    .map(([x, y]) => ({ x: x / 8.5, y: y / 11 }));
const receiptPoints = [{ x: 775 / 1743, y: 73 / 878 }, { x: 973 / 1743, y: 72 / 878 },
    { x: 973 / 1743, y: 111 / 878 }, { x: 775 / 1743, y: 112 / 878 }];
const captureCandidates = Boolean(process.env.CU_VISUAL_CANDIDATE_ROOT);
const observations = new WeakMap<Page, { errors: string[]; external: string[] }>();

test.use({
    viewport: { width: 1600, height: 1040 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
    launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] },
});

test.skip(process.platform !== "win32", "Approved visual references use Windows Segoe UI and installed Chrome/Edge.");

test.beforeEach(async ({ page, context, browser }, testInfo) => {
    testInfo.annotations.push({ type: "visual-browser-version", description: browser.version() });
    const observed: { errors: string[]; external: string[] } = { errors: [], external: [] };
    observations.set(page, observed);
    page.on("pageerror", error => observed.errors.push(error.message));
    await context.route("**/*", route => {
        const url = route.request().url();
        if (url.startsWith("http://127.0.0.1:5173/") || url.startsWith("blob:") || url.startsWith("data:")) return route.continue();
        observed.external.push(url);
        return route.abort();
    });
    await trackSourceResources(page);
    await page.goto("/");
    await ready(page);
    await neutral(page);
    await expect(page.getByRole("button", { name: "Clear", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Unmount viewer", exact: true })).toHaveCount(0);
});

test.afterEach(({ page }) => {
    const observed = observations.get(page);
    expect(observed?.errors).toEqual([]);
    expect(observed?.external).toEqual([]);
});

async function neutral(page: Page): Promise<void> {
    await page.locator(".prototype-banner").click({ position: { x: 10, y: 10 } });
}

async function snapshot(page: Page, name: string): Promise<void> {
    await page.evaluate(async () => { await document.fonts.ready; });
    await expect(page).toHaveScreenshot(name, { fullPage: true });
}

async function pinAmount(page: Page): Promise<void> {
    await expandField(page, "AmountDue");
    await page.locator(amountRow).getByRole("button", { name: "Amount", exact: true }).click();
    await neutral(page);
    await expect(page.locator(amountRow).getByRole("button", { name: "Amount", exact: true })).toHaveAttribute("aria-pressed", "true");
    await checkPolygon(page, amountPoints, 0);
}

test("default product layout and Fields match the approved prototype-aligned reference", async ({ page }) => {
    await expect(page.locator("[data-field-depth='0']")).toHaveCount(31);
    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
    await expect(page.getByRole("switch", { name: "Hide missing fields" })).not.toBeChecked();
    await snapshot(page, "default-pdf.png");

    await page.setViewportSize({ width: 1458, height: 861 });
    await ready(page);
    await neutral(page);
    const pane = page.getByRole("region", { name: "Extraction results" });
    await expect(pane.getByRole("button", { name: "BillingAddress", exact: true })).toHaveAccessibleDescription(/Confidence 0\.32/);
    await expect(pane.locator('[data-field-id="/contents/0/fields/CountryRegion"] .cu-field-value')).toHaveText("USA");
    const box = await pane.boundingBox();
    if (!box) throw new Error("The Fields reference pane is not laid out.");
    expect(box.height).toBe(781);
    expect(Math.abs(box.width - 609)).toBeLessThan(1);
    await expect(pane.locator(".cu-field-name").first()).toHaveCSS("font-size", "12.5px");
    await expect(pane.locator(".cu-dot")).toHaveCount(0);
    await expect(pane).toHaveScreenshot("fields-reference.png");
});

test("hover preview and pinned selection retain the approved layout, colors and primary geometry", async ({ page }) => {
    const address = page.locator('[data-field-id="/contents/0/fields/BillingAddress"]');
    await address.hover();
    await expect(address).toHaveClass(/is-hovered/);
    await expect(page.getByRole("tooltip", { name: "Field preview" }).locator("dd").last()).toHaveText("0.32");
    await expect(page.getByTestId("preview-overlay").locator("polygon")).toHaveCSS("stroke-dasharray", "none");
    await expect(page.getByTestId("preview-overlay").locator("polygon")).toHaveCSS("stroke", "rgb(140, 112, 194)");
    await snapshot(page, "pdf-hover.png");

    await neutral(page);
    await pinAmount(page);
    await expect(page.getByRole("tooltip", { name: "Field preview" })).toContainText("AmountDue / Amount");
    await expect(page.getByTestId("source-overlay").locator("polygon")).toHaveCSS("stroke", "rgb(91, 33, 182)");
    await snapshot(page, "pdf-pinned.png");
});

test("expanded and collapsed groups and missing filtering preserve Fields appearance without Clear", async ({ page }) => {
    const pane = page.getByRole("region", { name: "Extraction results" });
    await pinAmount(page);
    await expect(pane).toHaveScreenshot("fields-expanded.png");
    await page.getByRole("button", { name: "Collapse AmountDue", exact: true }).click();
    await neutral(page);
    await expect(page.locator(amountRow)).toHaveCount(0);
    await expect(pane.locator('[data-field-id="/contents/0/fields/AmountDue"]')).toHaveClass(/is-selected/);
    await checkPolygon(page, amountPoints, 0);
    await expect(pane).toHaveScreenshot("fields-collapsed-pin.png");

    await page.getByRole("switch", { name: "Hide missing fields" }).click();
    await expect(page.locator("[data-field-depth='0']")).toHaveCount(27);
    await page.getByRole("switch", { name: "Hide missing fields" }).uncheck();
    await expect(page.locator("[data-field-depth='0']")).toHaveCount(31);
    const missing = page.locator('[data-field-id="/contents/0/fields/PaymentTerm"]');
    await missing.getByRole("button", { name: "PaymentTerm", exact: true }).click();
    await neutral(page);
    await expect(missing.locator(".cu-field-value")).toHaveText("Not returned");
    await expect(missing.getByRole("button", { name: "PaymentTerm", exact: true })).toHaveAccessibleDescription(/Confidence 0\.84/);
    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
    await expect(pane).toHaveScreenshot("fields-missing-visible.png");

    await page.getByRole("switch", { name: "Hide missing fields" }).click();
    await pane.locator(".cu-fields-scroll").evaluate(element => element.scrollTo(0, 0));
    await neutral(page);
    await expect(pane.getByRole("status")).toHaveText("No field selected");
    await page.getByRole("switch", { name: "Hide missing fields" }).uncheck();
    await expandField(page, "AmountDue");
    await neutral(page);
    await expect(page.getByRole("button", { name: "Clear", exact: true })).toHaveCount(0);
    await snapshot(page, "default-pdf.png");
});

test("cross-page navigation and ungrounded selection match the prototype without inventing a region", async ({ page }) => {
    await page.getByRole("textbox", { name: "Page number" }).fill("4");
    await page.getByRole("textbox", { name: "Page number" }).press("Enter");
    await ready(page);
    await neutral(page);
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("4");
    await snapshot(page, "pdf-page-4.png");

    await page.getByRole("button", { name: "CountryRegion", exact: true }).click();
    await neutral(page);
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("4");
    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
    await expect(page.locator(".cu-preview-hint")).toHaveText("CountryRegion: no source region");
    await snapshot(page, "pdf-no-source.png");

    await locateGroup(page, "/contents/0/fields/AmountDue");
    await ready(page);
    await neutral(page);
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("1");
    await checkPolygon(page, amountPoints, 0);
    await snapshot(page, "pdf-cross-page-pinned.png");
});

test("real PNG uses the same approved panes and controls without PDF page navigation", async ({ page }) => {
    await page.getByRole("button", { name: "Receipt PNG", exact: true }).click();
    await expect(page.getByLabel("Source information")).toContainText("receipt.png");
    await ready(page);
    await page.getByRole("button", { name: "MerchantName", exact: true }).click();
    await neutral(page);
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveCount(0);
    await checkPolygon(page, receiptPoints, 0);
    await snapshot(page, "png-pinned.png");
});

test("source loading preserves valid Fields and disables source-dependent controls", async ({ page }) => {
    await page.evaluate(() => { window.cuHoldImageDecode = true; });
    try {
        await page.getByRole("button", { name: "Receipt PNG", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Loading source..." })).toBeVisible();
        await expect(page.locator("[data-field-depth='0']")).toHaveCount(12);
        await expect(page.getByRole("button", { name: "Zoom in", exact: true })).toBeDisabled();
        await expect(page.locator(".cu-page-badge").first()).toBeDisabled();
        await expect(page.getByTestId("source-overlay")).toHaveCount(0);
        await neutral(page);
        await snapshot(page, "source-loading.png");
    } finally {
        await page.evaluate(() => window.cuReleaseImageDecode());
    }
    await ready(page);
});

test("empty result keeps the document available in the approved independent empty state", async ({ page }) => {
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "synthetic-empty.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ apiVersion: "2025-11-01", contents: [] })),
    });
    await expect(page.getByRole("heading", { name: "No extracted fields" })).toBeVisible();
    await expect(page.getByRole("tree", { name: "Original Analyze result JSON" })).toBeVisible();
    await expect(page.getByTestId("rendered-page")).toBeVisible();
    await neutral(page);
    await snapshot(page, "empty-result.png");
});

test("source and result errors stay independent and recovery restores the original product layout", async ({ page }) => {
    await page.getByLabel("Choose source file").setInputFiles({
        name: "synthetic-corrupt.pdf", mimeType: "application/pdf", buffer: Buffer.from("corrupt"),
    });
    await expect(page.getByRole("heading", { name: "Source could not be displayed" })).toBeVisible();
    await expect(page.locator("[data-field-depth='0']")).toHaveCount(31);
    await expect(page.locator(".cu-page-badge").first()).toBeDisabled();
    await neutral(page);
    await snapshot(page, "source-error.png");

    await page.getByRole("button", { name: "PDF", exact: true }).click();
    await ready(page);
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "synthetic-invalid.json", mimeType: "application/json", buffer: Buffer.from("{"),
    });
    await expect(page.getByRole("heading", { name: "Result could not be read" })).toBeVisible();
    await expect(page.getByTestId("rendered-page")).toBeVisible();
    await neutral(page);
    await snapshot(page, "result-error.png");

    await page.getByRole("button", { name: "PDF", exact: true }).click();
    await ready(page);
    await neutral(page);
    await snapshot(page, "default-pdf.png");
});

test("visual guard detects a real icon-size drift instead of silently accepting a new baseline", async ({ page }) => {
    test.skip(captureCandidates, "Candidate capture is not drift-probe acceptance; rerun this guard against approved references.");
    await page.setViewportSize({ width: 1458, height: 861 });
    await ready(page);
    await neutral(page);
    const pane = page.getByRole("region", { name: "Extraction results" });
    await expect(pane).toHaveScreenshot("fields-reference.png");
    const style = await page.addStyleTag({ content: ".cu-expand .cu-icon { width: 14px !important; height: 14px !important; }" });
    try {
        const box = await pane.locator(".cu-expand .cu-icon").first().boundingBox();
        expect(box?.width).toBe(14);
        await expect(pane).not.toHaveScreenshot("fields-reference.png");
    } finally {
        await style.evaluate(element => {
            if (!(element instanceof HTMLStyleElement)) throw new Error("The visual drift probe style is unavailable.");
            element.remove();
        });
    }
    await expect(pane).toHaveScreenshot("fields-reference.png");
});
