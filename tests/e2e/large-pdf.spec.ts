import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { build, preview } from "vite";
import type { PreviewServer } from "vite";
import { ready } from "./viewerAssertions";

let server: PreviewServer | undefined;
let directory: string | undefined;
let productionOrigin: string;

test.beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "cu-viewer-large-pdf-"));
    const configFile = resolve("frontend", "demo", "vite.config.ts");
    await build({ configFile, logLevel: "silent", build: { outDir: directory } });
    server = await preview({
        configFile, logLevel: "silent", build: { outDir: directory },
        preview: { host: "127.0.0.1", port: 0, strictPort: false },
    });
    const address = server.httpServer.address();
    if (!address || typeof address === "string") throw new Error("The Large PDF preview has no TCP address.");
    productionOrigin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
    const httpServer = server?.httpServer;
    if (httpServer) await new Promise<void>((complete, reject) => {
        httpServer.close(error => error ? reject(error) : complete());
    });
    if (directory) await rm(directory, { recursive: true, force: true });
});

for (const mode of ["development", "production"] as const) {
    test(`${mode}: Large PDF is a project-backed sample alongside PDF and Receipt PNG`, async ({ page, baseURL }) => {
        const origin = mode === "production" ? productionOrigin : baseURL;
        if (!origin) throw new Error("The demo origin is unavailable.");
        const external: string[] = [], errors: string[] = [];
        const assets = new Map<string, string>();
        page.on("pageerror", error => errors.push(error.message));
        page.on("response", response => {
            if (!response.url().includes("large-bank-statement")) return;
            const type = response.headers()["content-type"] ?? "";
            if (type.includes("application/pdf")) assets.set("large-bank-statement.pdf", response.url());
            if (type.includes("application/json")) assets.set("large-bank-statement.pdf.result.json", response.url());
        });
        await page.route("**/*", route => {
            const url = new URL(route.request().url());
            if (url.origin === origin || url.protocol === "blob:" || url.protocol === "data:") return route.continue();
            external.push(url.origin);
            return route.abort();
        });
        await page.goto(origin);
        await ready(page);
        await expect(page.locator(".prototype-samples button")).toHaveText(["PDF", "Receipt PNG", "Large PDF", "PDF + Labels", "Multi-page Invoice"]);
        await expect(page.getByRole("button", { name: "PDF", exact: true })).toHaveAttribute("aria-pressed", "true");
        expect(assets.size).toBe(0);

        const large = page.getByRole("button", { name: "Large PDF", exact: true });
        await large.click();
        await ready(page);
        await expect(large).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByLabel("Source information")).toHaveText("large-bank-statement.pdf · PDF · 41 pages");
        await expect(page.locator(".prototype-picker").filter({ hasText: "Result" })).toContainText("large-bank-statement.pdf.result.json");
        await expect(page.locator('.cu-fields-table > tbody > tr[data-field-depth="0"]')).toHaveCount(24);
        for (const name of ["large-bank-statement.pdf", "large-bank-statement.pdf.result.json"]) {
            const url = assets.get(name);
            if (!url) throw new Error(`The built-in sample did not load ${name}.`);
            const response = await page.request.get(url);
            expect(response.ok()).toBe(true);
            const actual = createHash("sha256").update(await response.body()).digest("hex");
            const expected = createHash("sha256").update(readFileSync(resolve("tests", "fixtures", name))).digest("hex");
            expect(actual).toBe(expected);
        }
        await page.getByRole("tab", { name: "Markdown", exact: true }).click();
        await expect(page.getByRole("group", { name: "Markdown pagination" })).toBeVisible();
        await expect(page.getByLabel("Total Markdown pages")).toHaveText("/ 41");
        await expect(page.getByRole("region", { name: "Extraction results" }).getByRole("img", { name: "YES BANK", exact: true })).toBeVisible();
        await expect(page.getByRole("alert")).toHaveCount(0);

        await page.getByRole("button", { name: "Receipt PNG", exact: true }).click();
        await ready(page);
        await expect(page.getByLabel("Source information")).toContainText("receipt.png");
        await expect(page.locator("[data-field-depth='0']")).toHaveCount(12);
        await page.getByRole("button", { name: "PDF", exact: true }).click();
        await ready(page);
        await expect(page.getByLabel("Source information")).toContainText("mixed-financial-docs.pdf");
        await expect(page.locator("[data-field-depth='0']")).toHaveCount(31);

        await page.goto(`${origin}/?sample=large`);
        await ready(page);
        await page.reload();
        await ready(page);
        await expect(large).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByLabel("Source information")).toHaveText("large-bank-statement.pdf · PDF · 41 pages");
        expect(external).toEqual([]);
        expect(errors).toEqual([]);
    });
}

for (const mode of ["development", "production"] as const) {
    test(`${mode}: Multi-page Invoice compares independent labels and locates the first, middle and last pages`, async ({ page, baseURL }) => {
        const origin = mode === "production" ? productionOrigin : baseURL;
        if (!origin) throw new Error("The demo origin is unavailable.");
        const errors: string[] = [], external: string[] = [];
        const assets = new Map<string, string>();
        page.on("pageerror", error => errors.push(error.message));
        page.on("response", response => {
            const name = decodeURIComponent(new URL(response.url()).pathname).split("/").at(-1)?.split("?")[0];
            if (name?.startsWith("invoice-multipage")) assets.set(name, response.url());
        });
        await page.route("**/*", route => {
            const url = new URL(route.request().url());
            if (url.origin === origin || url.protocol === "blob:" || url.protocol === "data:") return route.continue();
            external.push(url.origin);
            return route.abort();
        });
        await page.goto(`${origin}/?sample=multipage`);
        await ready(page);
        await expect(page.getByLabel("Source information")).toHaveText("invoice-multipage.pdf · PDF · 12 pages");
        await expect(page.getByRole("button", { name: "Multi-page Invoice", exact: true })).toHaveAttribute("aria-pressed", "true");
        const pane = page.getByRole("region", { name: "Extraction results", exact: true });
        await expect(pane.locator(".cu-comparison-fields > thead th")).toHaveText(["Field Name", "Label Value", "Extracted Value"]);
        for (const name of ["invoice-multipage.pdf", "invoice-multipage.pdf.labels.json", "invoice-multipage.pdf.result.json"]) {
            const asset = [...assets.entries()].find(([key]) => key.startsWith(name.replace(/\.([^.]+)$/, "-")) ||
                key === name)?.[1];
            if (!asset) throw new Error(`The multi-page sample did not load ${name}.`);
            const response = await page.request.get(asset);
            expect(response.ok()).toBe(true);
            expect(createHash("sha256").update(await response.body()).digest("hex")).toBe(
                createHash("sha256").update(readFileSync(resolve("tests", "fixtures", "labels", name))).digest("hex"),
            );
        }
        const counts = await pane.locator(".cu-comparison-filters button").allTextContents();
        const incorrect = pane.getByRole("button", { name: "Show incorrect fields (1 value)", exact: true });
        await incorrect.click();
        const missing = pane.locator('[data-comparison-path="/OrderInformation/FobPoint"]');
        await expect(missing.getByRole("button", { name: "Select label value of OrderInformation / FobPoint", exact: true }))
            .toHaveText("Service location");
        await expect(missing.getByLabel("Not extracted", { exact: true })).toBeVisible();
        await missing.getByRole("button", { name: "Select label value of OrderInformation / FobPoint", exact: true }).click();
        await expect(page.getByRole("textbox", { name: "Page number", exact: true })).toHaveValue("2");
        await ready(page);
        await incorrect.click();
        const targets = [
            { pageNumber: 1, path: "/InvoiceDate", source: "InvoiceDate" },
            { pageNumber: 6, path: "/LineItems/50/ItemCode", source: "LineItems/valueArray/50/valueObject/ItemCode" },
            { pageNumber: 12, path: "/LineItems/119/ItemCode", source: "LineItems/valueArray/119/valueObject/ItemCode" },
        ];
        const search = pane.getByRole("searchbox", { name: "Search field names, label values or extracted values", exact: true });
        for (const target of targets) {
            await search.fill(target.path);
            await pane.getByRole("button", { name: "Next field", exact: true }).click();
            const id = `/labels/fields/${target.source}`;
            await pane.locator(`button.cu-field-value[data-source-field-id="${id}"]`).click();
            await expect(page.getByRole("textbox", { name: "Page number", exact: true })).toHaveValue(String(target.pageNumber));
            await ready(page);
            await expect(page.getByTestId("source-overlay").locator(`polygon[data-source-id="${id}"]`).first()).toBeVisible();
            expect(await pane.locator("[data-comparison-row]").count()).toBeLessThan(200);
        }
        expect(await pane.locator(".cu-comparison-filters button").allTextContents()).toEqual(counts);
        await search.fill("");
        await page.getByRole("button", { name: "PDF + Labels", exact: true }).click();
        await ready(page);
        await expect(page.getByLabel("Source information")).toContainText("invoice.pdf");
        await expect(page.getByRole("button", { name: "Next page", exact: true })).toBeDisabled();
        expect(external).toEqual([]);
        expect(errors).toEqual([]);
    });

    test(`${mode}: PDF + Labels loads the real saved invoice comparison without service calls`, async ({ page, baseURL }) => {
        const origin = mode === "production" ? productionOrigin : baseURL;
        if (!origin) throw new Error("The demo origin is unavailable.");
        await page.setViewportSize({ width: 1030, height: 900 });
        const errors: string[] = [], external: string[] = [];
        const assets = new Map<string, string>();
        page.on("pageerror", error => errors.push(error.message));
        page.on("response", response => {
            if (!response.url().includes("invoice")) return;
            const type = response.headers()["content-type"] ?? "";
            if (type.includes("application/pdf")) assets.set("invoice.pdf", response.url());
            if (type.includes("application/json") && response.url().includes("invoice.pdf.labels")) assets.set("invoice.pdf.labels.json", response.url());
            if (type.includes("application/json") && response.url().includes("invoice.pdf.result")) assets.set("invoice.pdf.result.json", response.url());
        });
        await page.route("**/*", route => {
            const url = new URL(route.request().url());
            if (url.origin === origin || url.protocol === "blob:" || url.protocol === "data:") return route.continue();
            external.push(url.origin);
            return route.abort();
        });
        await page.goto(`${origin}/?sample=labels`);
        await ready(page);
        const sample = page.getByRole("button", { name: "PDF + Labels", exact: true });
        await expect(sample).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByLabel("Source information")).toContainText("invoice.pdf");
        await expect(page.locator(".prototype-picker").filter({ hasText: "Labels" })).toContainText("invoice.pdf.labels.json");
        await expect(page.locator(".prototype-picker").filter({ hasText: "Result" })).toContainText("invoice.pdf.result.json");
        const pane = page.getByRole("region", { name: "Extraction results", exact: true });
        await expect(pane.getByRole("tab", { name: "Fields", exact: true })).toHaveAttribute("aria-selected", "true");
        await expect(pane.locator(".cu-comparison-fields > thead th")).toHaveText(["Field Name", "Label Value", "Extracted Value"]);
        await expect(pane.getByRole("tab", { name: "Label", exact: true })).toHaveCount(0);
        await expect(pane.getByRole("tab", { name: "Result", exact: true })).toBeVisible();
        await expect(pane.getByRole("button", { name: /Show matching fields/ })).toBeVisible();
        await expect(pane.getByRole("button", { name: "Select label value of InvoiceNumber", exact: true })).toHaveText("INV-100");
        for (const name of ["invoice.pdf", "invoice.pdf.labels.json", "invoice.pdf.result.json"]) {
            const url = assets.get(name);
            if (!url) throw new Error(`The labeled sample did not load ${name}.`);
            const response = await page.request.get(url);
            expect(response.ok()).toBe(true);
            expect(createHash("sha256").update(await response.body()).digest("hex")).toBe(
                createHash("sha256").update(readFileSync(resolve("tests", "fixtures", "labels", name))).digest("hex"),
            );
        }
        await pane.getByRole("button", { name: "Select label value of InvoiceNumber", exact: true }).click();
        await expect(page.getByTestId("source-overlay").locator("polygon").first()).toHaveAttribute("data-source-id", "/labels/fields/InvoiceNumber");
        await page.reload();
        await ready(page);
        await expect(sample).toHaveAttribute("aria-pressed", "true");
        await page.getByRole("button", { name: "PDF", exact: true }).click();
        await ready(page);
        await expect(page.locator(".prototype-picker").filter({ hasText: "Labels" })).toContainText("Choose .labels.json");
        await expect(page.locator(".prototype-picker").filter({ hasText: "Result" })).toContainText("mixed-financial-docs.pdf.result.json");
        await sample.click();
        await ready(page);
        await expect(pane.locator(".cu-comparison-fields > thead th")).toHaveText(["Field Name", "Label Value", "Extracted Value"]);
        expect(external).toEqual([]);
        expect(errors).toEqual([]);
    });
}
