import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { checkPolygon, ready } from "./viewerAssertions";
import { alive, trackSourceResources } from "./sourceResources";
import { standardFontPdf } from "./pdfFixtures";

const observations = new WeakMap<Page, {
    errors: string[]; external: string[]; failed: string[]; workers: string[]; fonts: string[]; heif: string[];
}>();
const amountRow = '[data-field-id="/contents/0/fields/AmountDue/valueObject/Amount"]';
const amountPoints = ([[7.3628, 8.0513], [7.9272, 8.0513], [7.9272, 8.2124], [7.3628, 8.2124]] as const)
    .map(([x, y]) => ({ x: x / 8.5, y: y / 11 }));
const receiptPoints = [{ x: 775 / 1743, y: 73 / 878 }, { x: 973 / 1743, y: 72 / 878 },
    { x: 973 / 1743, y: 111 / 878 }, { x: 775 / 1743, y: 112 / 878 }];
const heifPoints = [{ x: 0.5, y: 85 / 854 }, { x: 0.8, y: 85 / 854 }, { x: 0.8, y: 512 / 854 }, { x: 0.5, y: 512 / 854 }];
const verifyProductScreenshots = process.env.CU_VERIFY_PRODUCT_SCREENSHOTS !== "false";

test.beforeEach(async ({ page, context }, testInfo) => {
    const directory: unknown = testInfo.project.metadata.consumerDirectory;
    const reactVersion: unknown = testInfo.project.metadata.reactVersion;
    const mode: unknown = testInfo.project.metadata.mode;
    const base = testInfo.project.use.baseURL;
    if (typeof directory !== "string" || typeof reactVersion !== "string" || typeof base !== "string") {
        throw new Error("The isolated consumer test profile is incomplete.");
    }
    const installed = join(directory, "node_modules", "cu-result-viewer");
    expect(lstatSync(installed).isSymbolicLink()).toBe(false);
    const location = relative(realpathSync(directory), realpathSync(installed));
    expect(location.startsWith(`..${sep}`)).toBe(false);
    expect(location).toBe(join("node_modules", "cu-result-viewer"));
    const packageJson: unknown = JSON.parse(readFileSync(join(directory, "node_modules", "react", "package.json"), "utf8"));
    if (!packageJson || typeof packageJson !== "object" || !("version" in packageJson)) throw new Error("Installed React metadata is missing.");
    expect(packageJson.version).toBe(reactVersion);

    const origin = new URL(base).origin;
    const websocket = mode === "development" ? ` ws://127.0.0.1:${new URL(base).port}` : "";
    const wasm = testInfo.title.includes("HEIF") ? " 'wasm-unsafe-eval'" : "";
    const policy = `default-src 'self'; script-src 'self'${wasm}; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'${websocket}; object-src 'none'`;
    const observed: { errors: string[]; external: string[]; failed: string[]; workers: string[]; fonts: string[]; heif: string[] } = {
        errors: [], external: [], failed: [], workers: [], fonts: [], heif: [],
    };
    observations.set(page, observed);
    page.on("pageerror", error => observed.errors.push(error.message));
    page.on("response", response => {
        const url = response.url();
        if (response.status() >= 400) observed.failed.push(`${response.status()} ${url}`);
        if (url.includes("pdfjs/build/pdf.worker.mjs")) {
            observed.workers.push(url);
            expect(response.headers()["content-security-policy"]).toBe(policy);
        }
        if (url.includes("pdfjs/standard_fonts/")) observed.fonts.push(url);
        if (url.includes("/heif/")) {
            observed.heif.push(url);
            if (url.endsWith("/heif.worker.js")) {
                expect(response.headers()["content-security-policy"]).toBe(policy);
            }
            if (url.endsWith(".wasm")) expect(response.headers()["content-type"]).toContain("application/wasm");
        }
    });
    await context.route("**/*", async route => {
        const url = route.request().url();
        if (url.startsWith(origin + "/")) {
            const response = await route.fetch();
            await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": policy } });
        } else if (url.startsWith("blob:") || url.startsWith("data:")) {
            await route.continue();
        } else {
            observed.external.push(url);
            await route.abort();
        }
    });
    await trackSourceResources(page);
    const response = await page.goto("/");
    expect(response?.headers()["content-security-policy"]).toBe(policy);
    await ready(page);
    await page.locator(".prototype-banner").click({ position: { x: 10, y: 10 } });
});

test.afterEach(({ page }) => {
    const observed = observations.get(page);
    expect(observed?.errors).toEqual([]);
    expect(observed?.external).toEqual([]);
    expect(observed?.failed).toEqual([]);
    expect(observed?.workers.length).toBeGreaterThan(0);
});

test("isolated packed React consumer preserves real PDF/PNG behavior and approved product appearance under host CSP", async ({ page }) => {
    await expect(page.locator("[data-field-depth='0']")).toHaveCount(28);
    if (process.platform === "win32" && verifyProductScreenshots) await expect(page).toHaveScreenshot("default-pdf.png", { fullPage: true });
    await page.getByRole("button", { name: "Expand AmountDue", exact: true }).click();
    await page.locator(amountRow).getByRole("button", { name: "Amount", exact: true }).click();
    await page.locator(".prototype-banner").click({ position: { x: 10, y: 10 } });
    await checkPolygon(page, amountPoints, 0);
    if (process.platform === "win32" && verifyProductScreenshots) await expect(page).toHaveScreenshot("pdf-pinned.png", { fullPage: true });
    await page.getByRole("textbox", { name: "Page number" }).fill("4");
    await page.getByRole("textbox", { name: "Page number" }).press("Enter");
    await ready(page);
    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
    await page.locator(amountRow).hover();
    await ready(page);
    await page.locator(".prototype-banner").click({ position: { x: 10, y: 10 } });
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("1");
    await checkPolygon(page, amountPoints, 0);
    await page.getByRole("button", { name: "Receipt PNG", exact: true }).click();
    await expect(page.locator(".cu-source-heading")).toContainText("receipt.png");
    await ready(page);
    await page.getByRole("button", { name: "MerchantName", exact: true }).click();
    await page.locator(".prototype-banner").click({ position: { x: 10, y: 10 } });
    await checkPolygon(page, receiptPoints, 0);
    if (process.platform === "win32" && verifyProductScreenshots) await expect(page).toHaveScreenshot("png-pinned.png", { fullPage: true });
    await expect.poll(() => alive(page)).toEqual({ workers: 0, bitmaps: 1, urls: 0 });
    await expect(page.getByRole("button", { name: "Clear", exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "PDF", exact: true }).click();
    await ready(page);
    const pane = page.getByRole("region", { name: "Extraction results" });
    await pane.getByRole("tab", { name: "Markdown", exact: true }).click();
    await expect(pane.getByRole("heading", { name: "INVOICE", exact: true })).toBeVisible();
    await expect(pane.getByRole("table")).toHaveCount(9);
    await pane.getByRole("tab", { name: "JSON", exact: true }).click();
    await expect(pane.getByRole("tree", { name: "Original Analyze result JSON" })).toBeVisible();
    await expect(pane.locator(".cu-json-label", { hasText: "usage:" })).toBeVisible();
});

test("isolated packed consumer loads local standard fonts rather than relying on repository middleware or a CDN", async ({ page }) => {
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "empty-synthetic-result.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ apiVersion: "2025-11-01", contents: [] })),
    });
    await page.getByLabel("Choose source file").setInputFiles({
        name: "synthetic-font.pdf", mimeType: "application/pdf", buffer: standardFontPdf(),
    });
    await expect(page.locator(".cu-source-heading")).toContainText("synthetic-font.pdf");
    await ready(page);
    expect(observations.get(page)?.fonts.length).toBeGreaterThan(0);
    await expect(page.getByRole("heading", { name: "No extracted fields" })).toBeVisible();
    const workerUrl = observations.get(page)?.workers.at(-1);
    if (!workerUrl) throw new Error("No actual local PDF worker was requested.");
    const assets = new URL("../", workerUrl);
    for (const filename of ["cmaps/Adobe-Japan1-UCS2.bcmap", "wasm/openjpeg.wasm", "iccs/CGATS001Compat-v2-micro.icc"]) {
        const response = await page.request.get(new URL(filename, assets).href);
        expect(response.status()).toBe(200);
        expect((await response.body()).length).toBeGreaterThan(0);
        if (filename.endsWith(".wasm")) expect(response.headers()["content-type"]).toContain("application/wasm");
    }
});

test("isolated packed consumer decodes packaged HEIF under a WASM-only worker CSP", async ({ page }, testInfo) => {
    const directory: unknown = testInfo.project.metadata.consumerDirectory;
    if (typeof directory !== "string") throw new Error("The isolated consumer directory is unavailable.");
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles(join(directory, "fixtures", "example.synthetic.cu.json"));
    await page.getByLabel("Choose source file").setInputFiles(join(directory, "fixtures", "example.heic"));
    await expect(page.locator(".cu-source-heading")).toContainText("example.heic");
    await ready(page);
    await expect(page.locator(".cu-source-heading")).toContainText("1280 × 854 px");
    await page.getByRole("button", { name: "SyntheticRegion", exact: true }).click();
    await page.locator(".prototype-banner").click({ position: { x: 10, y: 10 } });
    await checkPolygon(page, heifPoints, 0);
    await expect.poll(() => alive(page)).toEqual({ workers: 0, bitmaps: 1, urls: 0 });
    const heif = observations.get(page)?.heif ?? [];
    expect(heif.some(url => url.endsWith("/heif/heif.worker.js"))).toBe(true);
    expect(heif.some(url => url.endsWith("/heif/heic_decoder.js"))).toBe(true);
    expect(heif.some(url => url.endsWith("/heif/heic_decoder_bg.wasm"))).toBe(true);
    expect(heif.every(url => !url.toLowerCase().includes("libheif"))).toBe(true);
});
