import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { loadEnv } from "vite";
import { checkPolygon, ready } from "./viewerAssertions";
import { alive, holdRequest, trackSourceResources } from "./sourceResources";

const hostUrl = `/@fs/${resolve("tests", "e2e", "source-inputs.html").replaceAll("\\", "/")}`;
const imageDirectory = resolve("tests", "fixtures", "images");
const heifBytes = readFileSync(resolve(imageDirectory, "example.heic"));
const localHeifConfigured = Boolean(loadEnv("development", resolve("demo"), "CU_HEIF_").CU_HEIF_DEV_ASSET_DIR);
const localHeifRequired = "Local HEIF validation requires CU_HEIF_DEV_ASSET_DIR; no decoder is distributed with this repository.";
const heifPoints = [{ x: 0.5, y: 85 / 854 }, { x: 0.8, y: 85 / 854 }, { x: 0.8, y: 512 / 854 }, { x: 0.5, y: 512 / 854 }];
const receiptPoints = [{ x: 775 / 1743, y: 73 / 878 }, { x: 973 / 1743, y: 72 / 878 },
    { x: 973 / 1743, y: 111 / 878 }, { x: 775 / 1743, y: 112 / 878 }];

test.beforeEach(async ({ page, context }) => {
    await trackSourceResources(page);
    await context.route("**/*", route => {
        const url = route.request().url();
        if (url.startsWith("http://127.0.0.1:5173/") || url.startsWith("blob:") || url.startsWith("data:")) return route.continue();
        throw new Error(`Unexpected external image-test request: ${url}`);
    });
});

async function release(page: Page): Promise<void> {
    await page.getByRole("button", { name: "Release host input", exact: true }).click();
    await expect.poll(() => alive(page)).toEqual({ workers: 0, bitmaps: 0, urls: 0 });
}

test("native PNG/JPG/JPEG/JPE/BMP render the full licensed receipt canvas and grounded fields", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await page.getByRole("button", { name: "Receipt PNG", exact: true }).click();
    await ready(page);
    for (const extension of ["png", "jpg", "jpeg", "jpe", "bmp"]) {
        const source = extension === "png" ? resolve("tests", "fixtures", "receipt.png") :
            resolve(imageDirectory, extension === "bmp" ? "receipt-derived.bmp" : "receipt-derived.jpg");
        await page.getByLabel("Choose source file").setInputFiles({
            name: `receipt.${extension}`, mimeType: "application/octet-stream", buffer: readFileSync(source),
        });
        await expect(page.locator(".cu-source-heading")).toContainText(`receipt.${extension}`);
        await ready(page);
        await expect(page.locator(".cu-source-heading")).toContainText("1743 × 878 px");
        await expect(page.locator("[data-field-depth='0']")).toHaveCount(11);
        await page.getByRole("button", { name: "MerchantName", exact: true }).click();
        await page.locator(".prototype-banner").hover();
        for (let rotation = 0; rotation < 360; rotation += 90) {
            await checkPolygon(page, receiptPoints, rotation);
            await page.getByRole("button", { name: "Rotate 90°", exact: true }).click();
            await ready(page);
        }
        await expect(page.locator('[data-field-id="/contents/0/fields/MerchantName"] .cu-field-value')).toHaveText("Contoso");
    }
});

for (const dpr of [1, 2]) {
    test.describe(`native EXIF direction at DPR ${dpr}`, () => {
        test.use({ deviceScaleFactor: dpr });
        test("all eight orientations normalize dimensions, colored corners and quarter-turn grounding", async ({ page }) => {
            await page.goto("/");
            await ready(page);
            const corners = [[209, 52, 56], [140, 189, 24], [0, 120, 212], [255, 170, 68]];
            const orders = [[0, 1, 2, 3], [1, 0, 3, 2], [3, 2, 1, 0], [2, 3, 0, 1],
                [0, 2, 1, 3], [2, 0, 3, 1], [3, 1, 2, 0], [1, 3, 0, 2]];
            const points = [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.1 }, { x: 0.4, y: 0.4 }, { x: 0.1, y: 0.4 }];
            for (let orientation = 1; orientation <= 8; orientation++) {
                const width = orientation >= 5 ? 64 : 96;
                const height = orientation >= 5 ? 96 : 64;
                const result = { apiVersion: "2025-11-01", contents: [{
                    kind: "document", unit: "pixel", pages: [{ pageNumber: 1, width, height }],
                    fields: { SyntheticCorner: { type: "string", valueString: `Synthetic EXIF ${orientation}, not a service result`,
                        source: `D(1,${width * 0.1},${height * 0.1},${width * 0.4},${height * 0.1},${width * 0.4},${height * 0.4},${width * 0.1},${height * 0.4})` } },
                }] };
                await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
                    name: "synthetic-exif-grounding.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(result)),
                });
                await page.getByLabel("Choose source file").setInputFiles(resolve(imageDirectory, `orientation-${orientation}.jpg`));
                await expect(page.locator(".cu-source-heading")).toContainText(`orientation-${orientation}.jpg`);
                await ready(page);
                await expect(page.locator(".cu-source-heading")).toContainText(`${width} × ${height} px`);
                await page.getByRole("button", { name: "SyntheticCorner", exact: true }).click();
                await page.locator(".prototype-banner").hover();
                let order = orders[orientation - 1];
                if (!order) throw new Error("The independent EXIF corner order is missing.");
                for (let rotation = 0; rotation < 360; rotation += 90) {
                    await checkPolygon(page, points, rotation);
                    const pixels = await page.getByTestId("source-canvas").evaluate(element => {
                        if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected a source raster.");
                        const context = element.getContext("2d");
                        if (!context) throw new Error("Source pixels are unavailable.");
                        return [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]].map(([x = 0, y = 0]) =>
                            Array.from(context.getImageData(Math.floor(element.width * x), Math.floor(element.height * y), 1, 1).data).slice(0, 3));
                    });
                    for (const [index, color] of pixels.entries()) {
                        const expected = corners[order[index] ?? -1];
                        if (!expected) throw new Error("Expected orientation color is unavailable.");
                        expected.forEach((channel, component) => expect(Math.abs((color[component] ?? -1000) - channel)).toBeLessThanOrEqual(5));
                    }
                    order = [order[2] ?? -1, order[0] ?? -1, order[3] ?? -1, order[1] ?? -1];
                    await page.getByRole("button", { name: "Rotate 90°", exact: true }).click();
                    await ready(page);
                }
            }
        });
    });
}

test("local HEIF/HEIC primary decoding is lazy, keeps caller bytes and shares source geometry across input representations", async ({ page }) => {
    test.skip(!localHeifConfigured, localHeifRequired);
    const codecRequests: string[] = [];
    page.on("request", request => { if (request.url().includes("/heif-codec/")) codecRequests.push(request.url()); });
    await page.goto(hostUrl);
    expect(codecRequests).toHaveLength(0);
    for (const kind of ["File", "Blob", "ArrayBuffer", "HTTP URL", "Blob URL"]) {
        await page.getByRole("combobox", { name: "Source input", exact: true }).selectOption(kind);
        await page.getByRole("button", { name: "Load HEIF", exact: true }).click();
        await ready(page);
        await expect(page.locator(".cu-source-heading")).toContainText("1280 × 854 px");
        await page.getByRole("button", { name: "SyntheticRegion", exact: true }).click();
        await page.getByRole("heading", { name: "Public-source input test host" }).hover();
        await checkPolygon(page, heifPoints, 0);
        await expect.poll(async () => (await alive(page)).workers).toBe(0);
        await page.getByRole("button", { name: "Unmount viewer", exact: true }).click();
        await page.getByRole("button", { name: "Inspect caller data", exact: true }).click();
        await expect(page.getByTestId("caller-result-unchanged")).toHaveText("true");
        if (kind !== "HTTP URL") {
            await expect(page.getByTestId("caller-byte-length")).toHaveText(String(heifBytes.length));
            await expect(page.getByTestId("caller-sha256")).toHaveText(createHash("sha256").update(heifBytes).digest("hex"));
        }
        if (kind === "Blob URL") await expect(page.getByTestId("caller-blob-url-readable")).toHaveText("true");
        await release(page);
    }
    expect(codecRequests.length).toBeGreaterThan(0);
    await page.goto("/");
    await ready(page);
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles(resolve(imageDirectory, "example.synthetic.cu.json"));
    await page.getByLabel("Choose source file").setInputFiles({ name: "example.heif", mimeType: "image/heif", buffer: heifBytes });
    await expect(page.locator(".cu-source-heading")).toContainText("example.heif");
    await ready(page);
    await page.getByRole("button", { name: "SyntheticRegion", exact: true }).click();
    await page.locator(".prototype-banner").hover();
    for (let rotation = 0; rotation < 360; rotation += 90) {
        await checkPolygon(page, heifPoints, rotation);
        await page.getByRole("button", { name: "Rotate 90°", exact: true }).click();
        await ready(page);
    }
});

test("HEIF decoding succeeds under actual same-origin no-eval/no-WASM worker CSP", async ({ page, context }) => {
    test.skip(!localHeifConfigured, localHeifRequired);
    const policy = "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'; object-src 'none'";
    await context.route("http://127.0.0.1:5173/**", async route => {
        const response = await route.fetch();
        await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": policy } });
    });
    const response = await page.goto(hostUrl);
    expect(response?.headers()["content-security-policy"]).toBe(policy);
    await page.getByRole("button", { name: "Load HEIF", exact: true }).click();
    await ready(page);
    await expect(page.locator(".cu-source-heading")).toContainText("1280 × 854 px");
    await release(page);
});

test("corrupt HEIF and missing local decoder retain field data, terminate workers and recover", async ({ page, context }) => {
    test.skip(!localHeifConfigured, localHeifRequired);
    await page.goto(hostUrl);
    await page.getByRole("combobox", { name: "Source condition", exact: true }).selectOption("corrupt");
    await page.getByRole("button", { name: "Load HEIF", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Source could not be displayed" })).toBeVisible();
    await expect(page.locator(".cu-field-value")).toContainText("not a CU service extraction");
    await expect.poll(async () => (await alive(page)).workers).toBe(0);
    await page.getByRole("combobox", { name: "Source condition", exact: true }).selectOption("valid");
    await page.getByRole("combobox", { name: "Source input", exact: true }).selectOption("HTTP URL");
    await page.getByRole("textbox", { name: "URL override" }).fill("/synthetic-corrupt-heif.heic");
    await context.route("**/synthetic-corrupt-heif.heic", route =>
        route.fulfill({ status: 200, contentType: "image/heic", body: heifBytes.subarray(0, 64) }));
    const workersBefore = await page.evaluate(() => window.cuSourceResources.workersCreated);
    await page.getByRole("button", { name: "Load HEIF", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("primary HEIF image");
    expect(await page.evaluate(() => window.cuSourceResources.workersCreated)).toBeGreaterThan(workersBefore);
    await expect.poll(async () => (await alive(page)).workers).toBe(0);
    await expect(page.locator(".cu-field-value")).toContainText("not a CU service extraction");
    await context.unroute("**/synthetic-corrupt-heif.heic");
    await page.getByRole("combobox", { name: "Source input", exact: true }).selectOption("File");
    await context.route("**/heif-codec/libheif-asm.js", route => route.fulfill({ status: 503, body: "Synthetic missing local codec" }));
    await page.getByRole("button", { name: "Load HEIF", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Configure CU_HEIF_DEV_ASSET_DIR");
    await expect.poll(async () => (await alive(page)).workers).toBe(0);
    await context.unroute("**/heif-codec/libheif-asm.js");
    await page.getByRole("button", { name: "Load HEIF", exact: true }).click();
    await ready(page);
    await release(page);
});

for (const action of ["replace", "unmount"] as const) {
    test(`HEIF loading on ${action} terminates its owned worker without committing an obsolete image`, async ({ page, context }) => {
        test.skip(!localHeifConfigured, localHeifRequired);
        await page.goto(hostUrl);
        const held = await holdRequest(context, "**/heif-codec/libheif-asm.js");
        try {
            await page.getByRole("button", { name: "Load HEIF", exact: true }).click();
            await held.started;
            await expect.poll(async () => (await alive(page)).workers).toBeGreaterThan(0);
            if (action === "replace") {
                await page.getByRole("button", { name: "Load PNG", exact: true }).click();
                await ready(page);
                await held.release();
                await expect(page.locator(".cu-source-heading")).toContainText("1743 × 878 px");
                await expect(page.locator(".cu-field-value").first()).toHaveText("Contoso");
            } else {
                await page.getByRole("button", { name: "Unmount viewer", exact: true }).click();
                await held.release();
                await expect(page.getByRole("region", { name: "Source document" })).toHaveCount(0);
            }
            await expect.poll(async () => (await alive(page)).workers).toBe(0);
            await release(page);
        } finally {
            await held.release();
        }
    });
}
