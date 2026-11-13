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
        await expect(page.locator(".prototype-samples button")).toHaveText(["PDF", "Receipt PNG", "Large PDF", "PDF + Labels"]);
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
    test(`${mode}: PDF + Labels loads the existing project pair without inventing analysis results`, async ({ page, baseURL }) => {
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
            if (type.includes("application/json")) assets.set("invoice.pdf.labels.json", response.url());
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
        await expect(page.locator(".prototype-picker").filter({ hasText: "Result" })).toContainText("Choose .result.json");
        const pane = page.getByRole("region", { name: "Extraction results", exact: true });
        await expect(pane.getByRole("tab", { name: "Fields", exact: true })).toHaveAttribute("aria-selected", "true");
        await expect(pane.locator(".cu-comparison-fields > thead th")).toHaveText(["Field Name", "Label Value"]);
        await expect(pane.getByRole("tab", { name: "Label", exact: true })).toHaveCount(0);
        await expect(pane.getByRole("tab", { name: "Result", exact: true })).toHaveCount(0);
        await expect(pane.getByRole("button", { name: /Show matching fields/ })).toHaveCount(0);
        await expect(pane.getByRole("button", { name: "Select label value of InvoiceNumber", exact: true })).toHaveText("INV-100");
        for (const name of ["invoice.pdf", "invoice.pdf.labels.json"]) {
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
        await expect(pane.locator(".cu-comparison-fields > thead th")).toHaveText(["Field Name", "Label Value"]);
        expect(external).toEqual([]);
        expect(errors).toEqual([]);
    });
}
