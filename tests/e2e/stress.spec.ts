import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { checkPolygon, ready } from "./viewerAssertions";
import { alive, holdRequest, trackSourceResources } from "./sourceResources";

const rounds = 100;
const hostUrl = `/@fs/${resolve("tests", "e2e", "source-inputs.html").replaceAll("\\", "/")}`;
const pdfUrl = `/@fs/${resolve("tests", "fixtures", "mixed-financial-docs.pdf").replaceAll("\\", "/")}`;
const amountRow = '[data-field-id="/contents/0/fields/AmountDue/valueObject/Amount"]';
const amountPoints = ([[7.3628, 8.0513], [7.9272, 8.0513], [7.9272, 8.2124], [7.3628, 8.2124]] as const)
    .map(([x, y]) => ({ x: x / 8.5, y: y / 11 }));
const receiptPoints = [{ x: 775 / 1743, y: 73 / 878 }, { x: 973 / 1743, y: 72 / 878 },
    { x: 973 / 1743, y: 111 / 878 }, { x: 775 / 1743, y: 112 / 878 }];
const inputKinds = ["File", "Blob", "ArrayBuffer", "HTTP URL", "Blob URL"] as const;
const observations = new WeakMap<Page, { errors: string[]; external: string[]; cleanupErrors: string[] }>();

test.use({
    viewport: { width: 1600, height: 1040 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
    launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] },
});
test.setTimeout(300000);

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
});

test.afterEach(({ page }) => {
    const observed = observations.get(page);
    expect(observed?.errors).toEqual([]);
    expect(observed?.external).toEqual([]);
    expect(observed?.cleanupErrors).toEqual([]);
});

async function neutral(page: Page): Promise<void> {
    await page.getByRole("heading", { level: 1 }).click({ position: { x: 4, y: 4 } });
}

async function pin(page: Page, sample: "PDF" | "PNG"): Promise<void> {
    if (sample === "PDF") {
        const expand = page.getByRole("button", { name: "Expand AmountDue", exact: true });
        if (await expand.count()) await expand.click();
        await expect(page.locator(`${amountRow} .cu-field-value`)).toHaveText("610");
        await page.locator(amountRow).getByRole("button", { name: "Amount", exact: true }).click();
    } else {
        const row = page.locator('[data-field-id="/contents/0/fields/MerchantName"]');
        await expect(row.locator(".cu-field-value")).toHaveText("Contoso");
        await row.getByRole("button", { name: "MerchantName", exact: true }).click();
    }
    await neutral(page);
    await checkPolygon(page, sample === "PDF" ? amountPoints : receiptPoints, 0);
}

async function loadHostSample(page: Page, sample: "PDF" | "PNG"): Promise<void> {
    await page.getByRole("button", { name: `Load ${sample}`, exact: true }).click();
    await expect(page.locator(".cu-source-heading")).toContainText(sample === "PDF" ? "PDF · 4 pages" : "1743 × 878 px");
    await ready(page);
    await expect(page.locator("[data-field-depth='0']")).toHaveCount(sample === "PDF" ? 28 : 11);
}

async function releaseHost(page: Page): Promise<void> {
    await page.getByRole("button", { name: "Release host input", exact: true }).click();
    await expect(page.getByTestId("source-canvas")).toHaveCount(0);
    await expect.poll(() => alive(page)).toEqual({ workers: 0, bitmaps: 0, urls: 0 });
}

test("100 PDF page/transform rounds preserve selection, primary geometry, resources and the approved pinned UI", async ({ page }, testInfo) => {
    await page.goto("/");
    await ready(page);
    await pin(page, "PDF");
    const initialWorkers = await page.evaluate(() => window.cuSourceResources.workersCreated);
    let completed = 0;
    for (let index = 0; index < rounds; index++) {
        await test.step(`PDF page/transform round ${index + 1}`, async () => {
            const number = page.getByRole("textbox", { name: "Page number" });
            await number.fill("4");
            await number.press("Enter");
            await ready(page);
            await expect(number).toHaveValue("4");
            await expect(page.getByTestId("source-overlay")).toHaveCount(0);
            await page.getByRole("button", { name: "CountryRegion", exact: true }).hover();
            await neutral(page);
            await expect(number).toHaveValue("4");
            await page.locator(amountRow).hover();
            await ready(page);
            await neutral(page);
            await expect(number).toHaveValue("1");
            await expect(page.locator(amountRow).getByRole("button", { name: "Amount", exact: true })).toHaveAttribute("aria-pressed", "true");

            await page.getByRole("button", { name: "Rotate 90°", exact: true }).click();
            await ready(page);
            const rotation = (index + 1) * 90 % 360;
            await page.getByRole("button", { name: index % 2 ? "Fit page" : "Fit width", exact: true }).click();
            await ready(page);
            await checkPolygon(page, amountPoints, rotation);
            await page.getByRole("button", { name: "Zoom in", exact: true }).click();
            await ready(page);
            await checkPolygon(page, amountPoints, rotation);
            await page.getByRole("button", { name: "Zoom out", exact: true }).click();
            await ready(page);

            const before = await page.getByTestId("rendered-page").boundingBox();
            const container = await page.locator(".cu-document-container").boundingBox();
            if (!before || !container) throw new Error("The source frame is missing during the stress round.");
            await page.mouse.move(container.x + 20, container.y + 20);
            await page.mouse.down();
            await page.mouse.move(container.x + 57, container.y + 41);
            await page.mouse.up();
            const after = await page.getByTestId("rendered-page").boundingBox();
            if (!after) throw new Error("The panned source frame is missing.");
            expect(after.x - before.x).toBeCloseTo(37, 0);
            expect(after.y - before.y).toBeCloseTo(21, 0);
            await checkPolygon(page, amountPoints, rotation);
            await page.getByRole("button", { name: "Fit page", exact: true }).click();
            await ready(page);
            await checkPolygon(page, amountPoints, rotation);
            await expect.poll(() => alive(page)).toEqual({ workers: 1, bitmaps: 0, urls: 0 });
            expect(await page.evaluate(() => window.cuSourceResources.workersCreated)).toBe(initialWorkers);
            completed++;
        });
    }
    expect(completed).toBe(100);
    await neutral(page);
    if (process.platform === "win32") await expect(page).toHaveScreenshot("pdf-pinned.png", { fullPage: true });
    await page.getByRole("button", { name: "Receipt PNG", exact: true }).click();
    await expect(page.locator(".cu-source-heading")).toContainText("receipt.png");
    await ready(page);
    await pin(page, "PNG");
    await expect.poll(() => alive(page)).toEqual({ workers: 0, bitmaps: 1, urls: 0 });
    if (process.platform === "win32") await expect(page).toHaveScreenshot("png-pinned.png", { fullPage: true });
    await testInfo.attach("page-transform-stress", {
        contentType: "application/json",
        body: JSON.stringify({ completedRounds: completed, pageTransitions: completed * 2, quarterTurns: completed,
            geometryLimitCssPixels: 1, dpr: 1, approvedProductSnapshotsCompared: process.platform === "win32",
            resourcesAfterPdfReplacement: await alive(page) }),
    });
});

test("100 real PDF/PNG public-input replacements release obsolete resources and preserve caller buffers and URLs", async ({ page }, testInfo) => {
    await page.goto(hostUrl);
    await loadHostSample(page, "PDF");
    const bytes = {
        PDF: readFileSync(resolve("tests", "fixtures", "mixed-financial-docs.pdf")),
        PNG: readFileSync(resolve("tests", "fixtures", "receipt.png")),
    };
    const counts = { File: 0, Blob: 0, ArrayBuffer: 0, "HTTP URL": 0, "Blob URL": 0 };
    let completed = 0;
    let callerChecks = 0;
    for (let index = 0; index < rounds; index++) {
        await test.step(`Source replacement ${index + 1}`, async () => {
            const kind = inputKinds[index % inputKinds.length];
            if (!kind) throw new Error("The stress input representation is missing.");
            const sample = index % 2 === 0 ? "PNG" : "PDF";
            await page.getByRole("combobox", { name: "Source input", exact: true }).selectOption(kind);
            await loadHostSample(page, sample);
            await expect(page.getByTestId("source-overlay")).toHaveCount(0);
            await expect(page.getByRole("region", { name: "Extraction results" }).getByRole("status")).toHaveText("No field selected");
            await pin(page, sample);
            await expect.poll(() => alive(page)).toEqual({
                workers: sample === "PDF" ? 1 : 0,
                bitmaps: sample === "PNG" ? 1 : 0,
                urls: kind === "Blob URL" ? 1 : 0,
            });
            if (kind === "ArrayBuffer" || kind === "Blob URL") {
                await page.getByRole("button", { name: "Inspect caller data", exact: true }).click();
                await expect(page.getByTestId("caller-byte-length")).toHaveText(String(bytes[sample].length));
                await expect(page.getByTestId("caller-sha256")).toHaveText(createHash("sha256").update(bytes[sample]).digest("hex"));
                await expect(page.getByTestId("caller-result-unchanged")).toHaveText("true");
                if (kind === "Blob URL") await expect(page.getByTestId("caller-blob-url-readable")).toHaveText("true");
                callerChecks++;
            }
            counts[kind]++;
            completed++;
        });
    }
    expect(completed).toBe(100);
    expect(Object.values(counts)).toEqual([20, 20, 20, 20, 20]);
    expect(callerChecks).toBe(40);
    await releaseHost(page);
    const resources = await page.evaluate(() => window.cuSourceResources);
    expect(resources.workersTerminated).toBe(resources.workersCreated);
    expect(resources.bitmapsClosed).toBe(resources.bitmapsCreated);
    expect(resources.urlsRevoked).toBe(resources.urlsCreated);
    expect(resources.workersCreated).toBeGreaterThanOrEqual(50);
    expect(resources.bitmapsCreated).toBeGreaterThanOrEqual(50);
    expect(resources.urlsCreated).toBe(20);
    await testInfo.attach("source-replacement-stress", {
        contentType: "application/json",
        body: JSON.stringify({ completedReplacements: completed, representations: counts, callerIntegrityChecks: callerChecks, resources }),
    });
});

test("100 pending HTTP loads cancel on replacement or unmount without accepting late responses or retaining resources", async ({ page, context }, testInfo) => {
    await page.goto(hostUrl);
    const successfulLateResponses: string[] = [];
    page.on("response", response => {
        if (response.url().includes("?stress-pending=") && response.ok()) successfulLateResponses.push(response.url());
    });
    let replacements = 0;
    let unmounts = 0;
    let requestCount = 0;
    for (let index = 0; index < rounds; index++) {
        const pattern = `**/mixed-financial-docs.pdf?stress-pending=${index}`;
        const held = await holdRequest(context, pattern);
        try {
            await test.step(`Pending load cancellation ${index + 1}`, async () => {
                await page.getByRole("combobox", { name: "Source input", exact: true }).selectOption("HTTP URL");
                await page.getByRole("textbox", { name: "URL override" }).fill(`${pdfUrl}?stress-pending=${index}`);
                await page.getByRole("button", { name: "Load PDF", exact: true }).click();
                await held.started;
                await expect(page.getByRole("heading", { name: "Loading source..." })).toBeVisible();
                await expect(page.locator("[data-field-depth='0']")).toHaveCount(28);
                if (index % 2 === 0) {
                    await page.getByRole("combobox", { name: "Source input", exact: true }).selectOption("File");
                    await loadHostSample(page, "PNG");
                    await held.release();
                    await pin(page, "PNG");
                    await expect(page.locator(".cu-source-heading")).toContainText("1743 × 878 px");
                    replacements++;
                } else {
                    await page.getByRole("button", { name: "Unmount viewer", exact: true }).click();
                    await held.release();
                    await expect(page.getByTestId("source-canvas")).toHaveCount(0);
                    unmounts++;
                }
                await expect.poll(() => held.requests.length > 0 &&
                    held.requests.every(request => request.failure()?.errorText === "net::ERR_ABORTED")).toBe(true);
                requestCount += held.requests.length;
                expect(successfulLateResponses).toEqual([]);
                await releaseHost(page);
            });
        } finally {
            await held.release();
            await context.unroute(pattern);
        }
    }
    expect(replacements).toBe(50);
    expect(unmounts).toBe(50);
    expect(requestCount).toBeGreaterThanOrEqual(100);
    await expect.poll(() => alive(page)).toEqual({ workers: 0, bitmaps: 0, urls: 0 });
    await testInfo.attach("pending-cancellation-stress", {
        contentType: "application/json",
        body: JSON.stringify({ completedCancellations: replacements + unmounts, replacements, unmounts,
            abortedRequests: requestCount, successfulLateResponses: successfulLateResponses.length }),
    });
});
