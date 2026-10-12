import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { checkPolygon, ready } from "./viewerAssertions";
import { alive, holdRequest, trackSourceResources } from "./sourceResources";

const hostUrl = `/@fs/${resolve("tests", "e2e", "source-inputs.html").replaceAll("\\", "/")}`;
const pdfUrl = `/@fs/${resolve("tests", "fixtures", "mixed-financial-docs.pdf").replaceAll("\\", "/")}`;
const fixtures = {
    PDF: { filename: "mixed-financial-docs.pdf", count: 28, aspect: 8.5 / 11,
        points: ([[7.3628, 8.0513], [7.9272, 8.0513], [7.9272, 8.2124], [7.3628, 8.2124]] as const)
            .map(([x, y]) => ({ x: x / 8.5, y: y / 11 })) },
    PNG: { filename: "receipt.png", count: 11, aspect: 1743 / 878,
        points: [{ x: 775 / 1743, y: 73 / 878 }, { x: 973 / 1743, y: 72 / 878 },
            { x: 973 / 1743, y: 111 / 878 }, { x: 775 / 1743, y: 112 / 878 }] },
};
const observations = new WeakMap<Page, { errors: string[]; external: string[]; cleanupErrors: string[] }>();

test.beforeEach(async ({ page, context }) => {
    const observed: { errors: string[]; external: string[]; cleanupErrors: string[] } = {
        errors: [], external: [], cleanupErrors: [],
    };
    observations.set(page, observed);
    page.on("pageerror", error => observed.errors.push(error.message));
    page.on("console", message => {
        if (message.type() === "error" && /(?:Source disposal|Obsolete source disposal|PDF loading cancellation) failed/.test(message.text())) {
            observed.cleanupErrors.push(message.text());
        }
    });
    await context.route("**/*", route => {
        const url = route.request().url();
        if (url.startsWith("http://127.0.0.1:5173/") || url.startsWith("blob:") || url.startsWith("data:")) return route.continue();
        observed.external.push(url);
        return route.abort();
    });
    await trackSourceResources(page);
    await page.goto(hostUrl);
    await expect(page.getByRole("heading", { name: "Public-source input test host" })).toBeVisible();
});

test.afterEach(({ page }) => {
    const observed = observations.get(page);
    expect(observed?.errors).toEqual([]);
    expect(observed?.external).toEqual([]);
    expect(observed?.cleanupErrors).toEqual([]);
});

async function releaseInput(page: Page): Promise<void> {
    await page.getByRole("button", { name: "Release host input", exact: true }).click();
    await expect(page.getByRole("region", { name: "Source document" })).toHaveCount(0);
    await expect.poll(() => alive(page)).toEqual({ workers: 0, bitmaps: 0, urls: 0 });
}

async function rasterDigest(page: Page): Promise<string> {
    return page.getByTestId("source-canvas").evaluate(async element => {
        if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected the actual source canvas.");
        const context = element.getContext("2d");
        if (!context) throw new Error("Canvas inspection is unavailable.");
        const pixels = context.getImageData(0, 0, element.width, element.height).data;
        if (!pixels.some(value => value !== 0)) throw new Error("The source raster is empty.");
        const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(pixels));
        return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, "0")).join("");
    });
}

async function selectGrounded(page: Page, sample: keyof typeof fixtures): Promise<void> {
    if (sample === "PDF") {
        await page.getByRole("button", { name: "Expand AmountDue", exact: true }).click();
        const row = page.locator('[data-field-id="/contents/0/fields/AmountDue/valueObject/Amount"]');
        await expect(row.locator(".cu-field-value")).toHaveText("610");
        await row.getByRole("button", { name: "Amount", exact: true }).click();
    } else {
        const row = page.locator('[data-field-id="/contents/0/fields/MerchantName"]');
        await expect(row.locator(".cu-field-value")).toHaveText("Contoso");
        await row.getByRole("button", { name: "MerchantName", exact: true }).click();
    }
    await page.getByRole("heading", { name: "Public-source input test host" }).hover();
    await expect(page.getByTestId("source-overlay")).toBeVisible();
    await checkPolygon(page, fixtures[sample].points, 0);
}

for (const sample of ["PDF", "PNG"] as const) {
    test(`real ${sample} accepts all public source inputs without changing caller data or raster/grounding`, async ({ page }) => {
        const fixture = fixtures[sample];
        const bytes = readFileSync(resolve("tests", "fixtures", fixture.filename));
        const sha256 = createHash("sha256").update(bytes).digest("hex");
        let referenceRaster: string | undefined;
        for (const kind of ["File", "Blob", "ArrayBuffer", "HTTP URL", "Blob URL"]) {
            await test.step(kind, async () => {
                await page.getByRole("combobox", { name: "Source input", exact: true }).selectOption(kind);
                await page.getByRole("button", { name: `Load ${sample}`, exact: true }).click();
                await ready(page);
                await expect(page.locator("[data-field-depth='0']")).toHaveCount(fixture.count);
                if (sample === "PDF") {
                    await expect(page.locator(".cu-source-heading")).toContainText("PDF · 4 pages");
                    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("1");
                } else {
                    await expect(page.locator(".cu-source-heading")).toContainText("1743 × 878 px");
                    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveCount(0);
                }
                const box = await page.getByTestId("rendered-page").boundingBox();
                if (!box) throw new Error("The real source is not laid out.");
                expect(box.width / box.height).toBeCloseTo(fixture.aspect, 4);
                const actualRaster = await rasterDigest(page);
                referenceRaster ??= actualRaster;
                expect(actualRaster).toBe(referenceRaster);
                await selectGrounded(page, sample);
                await page.getByRole("button", { name: "Unmount viewer", exact: true }).click();
                await expect.poll(() => alive(page)).toEqual({ workers: 0, bitmaps: 0, urls: kind === "Blob URL" ? 1 : 0 });
                await page.getByRole("button", { name: "Inspect caller data", exact: true }).click();
                await expect(page.getByTestId("caller-result-unchanged")).toHaveText("true");
                if (kind !== "HTTP URL") {
                    await expect(page.getByTestId("caller-byte-length")).toHaveText(String(bytes.length));
                    await expect(page.getByTestId("caller-sha256")).toHaveText(sha256);
                }
                if (kind === "Blob URL") await expect(page.getByTestId("caller-blob-url-readable")).toHaveText("true");
                if (kind === "ArrayBuffer") {
                    await page.getByRole("button", { name: "Mount viewer", exact: true }).click();
                    await ready(page);
                    expect(await rasterDigest(page)).toBe(referenceRaster);
                }
                await releaseInput(page);
            });
        }
    });
}

test("empty and corrupt File/Blob/ArrayBuffer inputs retain valid fields and recover with real PDF/PNG", async ({ page }) => {
    for (const sample of ["PDF", "PNG"] as const) {
        for (const kind of ["File", "Blob", "ArrayBuffer"]) {
            for (const condition of ["empty", "corrupt"]) {
                await test.step(`${sample} ${kind} ${condition}`, async () => {
                    await page.getByRole("combobox", { name: "Source input", exact: true }).selectOption(kind);
                    await page.getByRole("combobox", { name: "Source condition", exact: true }).selectOption(condition);
                    await page.getByRole("button", { name: `Load ${sample}`, exact: true }).click();
                    await expect(page.getByRole("heading", { name: "Source could not be displayed" })).toBeVisible();
                    if (condition === "empty") await expect(page.getByRole("alert")).toContainText("The source file is empty");
                    await expect(page.locator("[data-field-depth='0']")).toHaveCount(fixtures[sample].count);
                    await expect(page.getByRole("button", { name: "Zoom in", exact: true })).toBeDisabled();
                    await expect(page.locator(".cu-page-badge").first()).toBeDisabled();
                    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
                    await page.getByRole("combobox", { name: "Source condition", exact: true }).selectOption("valid");
                    await page.getByRole("button", { name: `Load ${sample}`, exact: true }).click();
                    await ready(page);
                    await selectGrounded(page, sample);
                    await releaseInput(page);
                });
            }
        }
    }
});

test("HTTP errors, empty responses and rejected source URL schemes surface errors and recover", async ({ page, context }) => {
    await context.route("**/source-input-failure/*", route => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith("/network")) return route.abort("connectionfailed");
        if (path.endsWith("/empty")) return route.fulfill({ status: 200, body: "" });
        return route.fulfill({ status: 404, body: "Synthetic missing source" });
    });
    await page.getByRole("combobox", { name: "Source input", exact: true }).selectOption("HTTP URL");
    const failures = [
        { url: "/source-input-failure/missing", text: "Source request failed (404)" },
        { url: "/source-input-failure/empty", text: "The source file is empty" },
        { url: "/source-input-failure/network", text: /fetch|network/i },
        { url: "file:///C:/synthetic-source.pdf", text: "Source strings must be HTTP" },
        { url: "data:application/pdf;base64,AAAA", text: "Source strings must be HTTP" },
    ];
    for (const failure of failures) {
        await page.getByRole("textbox", { name: "URL override" }).fill(failure.url);
        await page.getByRole("button", { name: "Load PDF", exact: true }).click();
        await expect(page.getByRole("alert")).toContainText(failure.text);
        await expect(page.locator("[data-field-depth='0']")).toHaveCount(28);
        await expect(page.locator(".cu-page-badge").first()).toBeDisabled();
        await page.getByRole("textbox", { name: "URL override" }).fill("");
        await page.getByRole("button", { name: "Load PDF", exact: true }).click();
        await ready(page);
        await selectGrounded(page, "PDF");
        await releaseInput(page);
    }
});

for (const action of ["replace", "unmount"] as const) {
    test(`pending source URL is cancelled on ${action} without committing its late completion`, async ({ page, context }) => {
        const delayedUrl = `${pdfUrl}?delay-source=1`;
        const held = await holdRequest(context, "**/mixed-financial-docs.pdf?delay-source=1");
        const cancelled: string[] = [];
        page.on("requestfailed", request => {
            if (request.url().endsWith("?delay-source=1")) cancelled.push(request.failure()?.errorText ?? "unknown failure");
        });
        try {
            await page.getByRole("combobox", { name: "Source input", exact: true }).selectOption("HTTP URL");
            await page.getByRole("textbox", { name: "URL override" }).fill(delayedUrl);
            await page.getByRole("button", { name: "Load PDF", exact: true }).click();
            await held.started;
            await expect(page.getByRole("heading", { name: "Loading source..." })).toBeVisible();
            await expect(page.locator("[data-field-depth='0']")).toHaveCount(28);
            if (action === "replace") {
                await page.getByRole("combobox", { name: "Source input", exact: true }).selectOption("File");
                await page.getByRole("button", { name: "Load PNG", exact: true }).click();
                await ready(page);
                const raster = await rasterDigest(page);
                await held.release();
                await expect(page.locator(".cu-source-heading")).toContainText("1743 × 878 px");
                expect(await rasterDigest(page)).toBe(raster);
                await selectGrounded(page, "PNG");
            } else {
                await page.getByRole("button", { name: "Unmount viewer", exact: true }).click();
                await held.release();
                await expect(page.getByRole("region", { name: "Source document" })).toHaveCount(0);
            }
            await expect.poll(() => cancelled.length).toBeGreaterThan(0);
            expect(cancelled.every(value => value === "net::ERR_ABORTED")).toBe(true);
            await releaseInput(page);
        } finally {
            await held.release();
        }
    });

    test(`pending PDF worker is terminated on ${action} without leaking or showing an old page`, async ({ page, context }) => {
        const held = await holdRequest(context, "**/pdfjs/build/pdf.worker.mjs");
        try {
            await page.getByRole("button", { name: "Load PDF", exact: true }).click();
            await held.started;
            await expect.poll(async () => (await alive(page)).workers).toBeGreaterThan(0);
            if (action === "replace") {
                await page.getByRole("button", { name: "Load PNG", exact: true }).click();
                await ready(page);
                await held.release();
                await expect(page.locator(".cu-source-heading")).toContainText("1743 × 878 px");
                await selectGrounded(page, "PNG");
            } else {
                await page.getByRole("button", { name: "Unmount viewer", exact: true }).click();
                await held.release();
                await expect(page.getByTestId("source-canvas")).toHaveCount(0);
            }
            await expect.poll(async () => (await alive(page)).workers).toBe(0);
            await releaseInput(page);
        } finally {
            await held.release();
        }
    });
}

for (const action of ["replace", "unmount"] as const) {
    test(`cancelled native-image decoding on ${action} closes its late bitmap without committing stale content`, async ({ page }) => {
        await page.evaluate(() => { window.cuHoldImageDecode = true; });
        try {
            await page.getByRole("button", { name: "Load PNG", exact: true }).click();
            await expect.poll(async () => (await alive(page)).bitmaps).toBeGreaterThan(0);
            await expect(page.getByRole("heading", { name: "Loading source..." })).toBeVisible();
            if (action === "replace") {
                await page.getByRole("button", { name: "Load PDF", exact: true }).click();
                await ready(page);
                const raster = await rasterDigest(page);
                await page.evaluate(() => window.cuReleaseImageDecode());
                await expect.poll(async () => (await alive(page)).bitmaps).toBe(0);
                await expect(page.locator(".cu-source-heading")).toContainText("PDF · 4 pages");
                expect(await rasterDigest(page)).toBe(raster);
                await selectGrounded(page, "PDF");
            } else {
                await page.getByRole("button", { name: "Unmount viewer", exact: true }).click();
                await page.evaluate(() => window.cuReleaseImageDecode());
                await expect.poll(async () => (await alive(page)).bitmaps).toBe(0);
                await expect(page.getByRole("region", { name: "Source document" })).toHaveCount(0);
            }
            await releaseInput(page);
        } finally {
            await page.evaluate(() => window.cuReleaseImageDecode());
        }
    });
}
