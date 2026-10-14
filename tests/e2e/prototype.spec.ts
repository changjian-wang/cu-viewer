import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { checkPolygon, ready } from "./viewerAssertions";
import { croppedRotatedPdf, standardFontPdf } from "./pdfFixtures";

const amountId = "/contents/0/fields/AmountDue/valueObject/Amount";
const amountRow = `[data-field-id="${amountId}"]`;
const realReceipt: unknown = JSON.parse(readFileSync(resolve("tests", "fixtures", "receipt.cu.json"), "utf8"));

async function leave(page: Page): Promise<void> {
    await page.locator(".prototype-banner").hover();
}

test("real PDF, pin/hover, transforms, manual page precedence and local assets", async ({ page, context }) => {
    const errors: string[] = [];
    const requests: string[] = [];
    const external: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    context.on("request", request => {
        const url = request.url();
        if (url.startsWith("http://127.0.0.1:5173/")) requests.push(url);
        else if (/^https?:/.test(url)) external.push(url);
    });
    await page.goto("/");
    await ready(page);
    await expect(page.locator("[data-field-depth='0']")).toHaveCount(28);
    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
    await page.getByRole("button", { name: "Expand AmountDue", exact: true }).click();
    await page.locator(amountRow).getByRole("button", { name: "Amount", exact: true }).click();
    await leave(page);
    await expect(page.getByTestId("source-overlay")).toBeVisible();
    await expect(page.locator(amountRow).getByRole("button", { name: "Amount", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.locator('[data-field-id="/contents/0/fields/BillingAddress"]').hover();
    await expect(page.getByRole("tooltip", { name: "Field preview" })).toContainText("BillingAddress");
    await leave(page);
    await expect(page.getByRole("tooltip", { name: "Field preview" })).toHaveCount(0);
    const sourcePoints = [[7.3628, 8.0513], [7.9272, 8.0513], [7.9272, 8.2124], [7.3628, 8.2124]] as const;
    const points = sourcePoints.map(([x, y]) => ({ x: x / 8.5, y: y / 11 }));
    for (let rotation = 0; rotation < 360; rotation += 90) {
        for (const fitName of ["Fit page", "Fit width"]) {
            await page.getByRole("button", { name: fitName, exact: true }).click();
            await ready(page);
            await checkPolygon(page, points, rotation);
        }
        await page.getByRole("button", { name: "Zoom in", exact: true }).click();
        await ready(page);
        await checkPolygon(page, points, rotation);
        await page.getByRole("button", { name: "Rotate 90°", exact: true }).click();
        await ready(page);
    }
    await page.getByRole("button", { name: "Fit page", exact: true }).click();
    await ready(page);
    const beforePan = await page.getByTestId("rendered-page").boundingBox();
    const container = await page.locator(".cu-document-container").boundingBox();
    if (!beforePan || !container) throw new Error("Source is not laid out.");
    await page.mouse.move(container.x + 20, container.y + 20);
    await page.mouse.down();
    await page.mouse.move(container.x + 57, container.y + 41);
    await page.mouse.up();
    const afterPan = await page.getByTestId("rendered-page").boundingBox();
    if (!afterPan) throw new Error("Panned source is not laid out.");
    expect(afterPan.x - beforePan.x).toBeCloseTo(37, 0);
    expect(afterPan.y - beforePan.y).toBeCloseTo(21, 0);
    await checkPolygon(page, points, 0);
    await page.getByRole("textbox", { name: "Page number" }).fill("4");
    await page.getByRole("textbox", { name: "Page number" }).press("Enter");
    await ready(page);
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("4");
    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
    await page.locator('[data-field-id="/contents/0/fields/CountryRegion"]').hover();
    await leave(page);
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("4");
    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
    await page.locator(amountRow).hover();
    await ready(page);
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("1");
    await leave(page);
    await page.getByRole("button", { name: "Next page" }).click();
    await ready(page);
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("2");
    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
    await expect(page.locator(amountRow).getByRole("button", { name: "Amount", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("textbox", { name: "Page number" }).fill("0");
    await page.getByRole("textbox", { name: "Page number" }).press("Enter");
    await expect(page.getByRole("alert")).toContainText("Enter an existing page number");
    await page.getByRole("textbox", { name: "Page number" }).fill("1");
    await page.getByRole("textbox", { name: "Page number" }).press("Enter");
    await ready(page);
    expect(requests.some(url => url.includes("pdfjs/build/pdf.worker.mjs"))).toBe(true);
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
});

test("real PNG and truthful empty/invalid/source-failure states", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await page.getByRole("button", { name: "Receipt PNG", exact: true }).click();
    await ready(page);
    await expect(page.locator("[data-field-depth='0']")).toHaveCount(11);
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveCount(0);
    await page.locator('[data-field-id="/contents/0/fields/MerchantName"]').getByRole("button", { name: "MerchantName", exact: true }).click();
    await leave(page);
    const merchantPoints = [{ x: 775 / 1743, y: 73 / 878 }, { x: 973 / 1743, y: 72 / 878 },
        { x: 973 / 1743, y: 111 / 878 }, { x: 775 / 1743, y: 112 / 878 }];
    await checkPolygon(page, merchantPoints, 0);
    for (let rotation = 90; rotation < 360; rotation += 90) {
        await page.getByRole("button", { name: "Rotate 90°", exact: true }).click();
        await ready(page);
        await checkPolygon(page, merchantPoints, rotation);
    }
    await page.getByRole("button", { name: "Rotate 90°", exact: true }).click();
    await page.getByRole("button", { name: "Fit width", exact: true }).click();
    await ready(page);
    await checkPolygon(page, merchantPoints, 0);
    await page.locator('[data-field-id="/contents/0/fields/CountryRegion"]').getByRole("button", { name: "CountryRegion", exact: true }).click();
    await leave(page);
    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
    await expect(page.locator(".cu-preview-hint")).toContainText("no source region");
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "empty.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ apiVersion: "2025-11-01", contents: [] })),
    });
    await expect(page.getByRole("heading", { name: "No extracted fields" })).toBeVisible();
    await expect(page.getByTestId("rendered-page")).toBeVisible();
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from("{") });
    await expect(page.getByRole("heading", { name: "Result could not be read" })).toBeVisible();
    await expect(page.getByTestId("rendered-page")).toBeVisible();
    await page.getByRole("button", { name: "Receipt PNG", exact: true }).click();
    await ready(page);
    await page.getByLabel("Choose source file").setInputFiles({ name: "bad.pdf", mimeType: "application/pdf", buffer: Buffer.from("corrupt") });
    await expect(page.getByRole("heading", { name: "Source could not be displayed" })).toBeVisible();
    await expect(page.locator("[data-field-depth='0']")).toHaveCount(11);
    await page.getByRole("button", { name: "Receipt PNG", exact: true }).click();
    await ready(page);
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({ name: "receipt.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(realReceipt)) });
    await expect(page.locator("[data-field-depth='0']")).toHaveCount(11);
});

test("local standard font assets render without depending on a system font or CDN", async ({ page, context }) => {
    const fonts: string[] = [];
    context.on("request", request => {
        if (request.url().includes("pdfjs/standard_fonts/")) fonts.push(request.url());
    });
    await page.goto("/");
    await ready(page);
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "empty-synthetic-result.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ apiVersion: "2025-11-01", contents: [] })),
    });
    await expect(page.getByRole("heading", { name: "No extracted fields" })).toBeVisible();
    await page.getByLabel("Choose source file").setInputFiles({
        name: "synthetic-font.pdf", mimeType: "application/pdf", buffer: standardFontPdf(),
    });
    await ready(page);
    await expect(page.locator(".cu-source-heading")).toContainText("synthetic-font.pdf");
    expect(fonts.some(url => url.startsWith("http://127.0.0.1:5173/"))).toBe(true);
});

for (const dpr of [1, 2]) {
    test.describe(`PDF page boxes at DPR ${dpr}`, () => {
        test.use({ deviceScaleFactor: dpr });
        test("uses CropBox dimensions, intrinsic page rotation and first/last navigation", async ({ page }) => {
            await page.goto("/");
            await ready(page);
            await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
                name: "empty-synthetic-result.json",
                mimeType: "application/json",
                buffer: Buffer.from(JSON.stringify({ apiVersion: "2025-11-01", contents: [] })),
            });
            await page.getByLabel("Choose source file").setInputFiles({
                name: "synthetic-page-boxes.pdf",
                mimeType: "application/pdf",
                buffer: croppedRotatedPdf(),
            });
            await ready(page);
            await expect(page.locator(".cu-source-heading")).toContainText("PDF · 2 pages");
            const first = await page.getByTestId("rendered-page").boundingBox();
            if (!first) throw new Error("The cropped first page is not laid out.");
            expect(first.width / first.height).toBeCloseTo(1.5, 2);
            const firstRasterRatio = await page.getByTestId("source-canvas").evaluate(canvas => {
                if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Expected the PDF canvas.");
                return canvas.width / canvas.getBoundingClientRect().width;
            });
            expect(firstRasterRatio).toBeCloseTo(dpr, 1);

            await page.getByRole("button", { name: "Next page" }).click();
            await ready(page);
            await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("2");
            const rotated = await page.getByTestId("rendered-page").boundingBox();
            if (!rotated) throw new Error("The intrinsically rotated last page is not laid out.");
            expect(rotated.width / rotated.height).toBeCloseTo(2 / 3, 2);

            await page.getByRole("button", { name: "Rotate 90°" }).click();
            await ready(page);
            const viewerRotated = await page.getByTestId("rendered-page").boundingBox();
            if (!viewerRotated) throw new Error("The viewer-rotated last page is not laid out.");
            expect(viewerRotated.width / viewerRotated.height).toBeCloseTo(1.5, 2);
            await page.getByRole("button", { name: "Previous page" }).click();
            await ready(page);
            await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("1");
        });
    });
}

test.describe("real PDF at DPR 2", () => {
    test.use({ deviceScaleFactor: 2 });
    test("keeps first/last-page geometry through fit, zoom and four viewer rotations", async ({ page }) => {
        await page.goto("/");
        await ready(page);
        await page.getByRole("button", { name: "Expand AmountDue", exact: true }).click();
        await page.locator(amountRow).getByRole("button", { name: "Amount", exact: true }).click();
        await leave(page);
        const points = ([[7.3628, 8.0513], [7.9272, 8.0513], [7.9272, 8.2124], [7.3628, 8.2124]] as const)
            .map(([x, y]) => ({ x: x / 8.5, y: y / 11 }));
        for (let rotation = 0; rotation < 360; rotation += 90) {
            await page.getByRole("button", { name: rotation % 180 === 0 ? "Fit page" : "Fit width", exact: true }).click();
            await ready(page);
            await checkPolygon(page, points, rotation);
            await page.getByRole("button", { name: "Zoom in", exact: true }).click();
            await ready(page);
            await checkPolygon(page, points, rotation);
            await page.getByRole("button", { name: "Rotate 90°", exact: true }).click();
            await ready(page);
        }
        await page.getByRole("textbox", { name: "Page number" }).fill("4");
        await page.getByRole("textbox", { name: "Page number" }).press("Enter");
        await ready(page);
        await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("4");
        await page.getByRole("textbox", { name: "Page number" }).fill("1");
        await page.getByRole("textbox", { name: "Page number" }).press("Enter");
        await ready(page);
        await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("1");
    });
});

test("multiple contents and synthetic scalar values remain truthful and inspectable", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const contents = [0, 1].map(index => ({
        kind: "document", unit: "pixel", pages: [{ pageNumber: 1, width: 100, height: 100 }],
        fields: index === 0 ? {
            Zero: { type: "integer", valueInteger: 0, confidence: 0, source: "D(1,10,10,20,10,20,20,10,20)" },
            False: { type: "boolean", valueBoolean: false },
            Null: { type: "string", valueString: null },
            Empty: { type: "string", valueString: "", source: "D(1,30,30,40,30,40,40,30,40)" },
            Missing: { type: "string" },
            Warning: { type: "string", valueString: "retained", confidence: 2, source: "bad" },
        } : { OtherContent: { type: "string", valueString: "second content" } },
    }));
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "synthetic-boundaries.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ apiVersion: "2025-11-01", contents })),
    });
    await expect(page.locator('[data-field-id="/contents/0/fields/Zero"] .cu-field-value')).toHaveText("0");
    await expect(page.locator('[data-field-id="/contents/0/fields/Zero"] .cu-confidence')).toHaveText("0.00%");
    await expect(page.locator('[data-field-id="/contents/0/fields/False"] .cu-field-value')).toHaveText("false");
    await expect(page.locator('[data-field-id="/contents/0/fields/Null"] .cu-field-value')).toHaveText("null");
    await expect(page.locator('[data-field-id="/contents/0/fields/Empty"] .cu-field-value')).toHaveText('"" (empty string)');
    await page.locator('[data-field-id="/contents/0/fields/Zero"]').hover();
    await expect(page.getByRole("tooltip", { name: "Field preview" }).locator("dd").last()).toHaveText("0.00%");
    await page.locator('[data-field-id="/contents/0/fields/Empty"]').hover();
    await expect(page.getByRole("tooltip", { name: "Field preview" }).locator("dt")).toHaveText(["Value"]);
    await expect(page.locator('[data-field-id="/contents/0/fields/Empty"] .cu-confidence')).toHaveCount(0);
    await leave(page);
    await expect(page.locator('[data-field-id="/contents/0/fields/Missing"]')).toHaveCount(0);
    await page.getByRole("switch", { name: "Hide missing fields" }).click();
    await expect(page.locator('[data-field-id="/contents/0/fields/Missing"] .cu-field-value')).toHaveText("Not returned");
    await page.locator(".cu-issues summary").click();
    await expect(page.locator(".cu-issues")).toContainText("invalid-confidence");
    await expect(page.locator(".cu-issues")).toContainText("invalid-source");
    await page.getByRole("combobox", { name: "Result content" }).selectOption("1");
    await expect(page.locator("[data-field-id]")).toHaveCount(1);
    await expect(page.locator(".cu-field-value")).toHaveText("second content");
    await expect(page.getByTestId("rendered-page")).toBeVisible();
});

test("rapid source replacement and viewport changes never leave stale source content", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    for (let index = 0; index < 4; index++) {
        await page.getByRole("button", { name: "Receipt PNG", exact: true }).click();
        await ready(page);
        await expect(page.locator(".cu-source-heading")).toContainText("receipt.png");
        await page.getByRole("button", { name: "PDF", exact: true }).click();
        await ready(page);
        await expect(page.locator(".cu-source-heading")).toContainText("mixed-financial-docs.pdf");
    }
    await page.getByRole("button", { name: "Expand AmountDue", exact: true }).click();
    await page.locator(amountRow).getByRole("button", { name: "Amount", exact: true }).click();
    await leave(page);
    await page.setViewportSize({ width: 1100, height: 800 });
    await ready(page);
    await expect(page.getByTestId("source-overlay")).toBeVisible();
    await page.getByRole("button", { name: "Receipt PNG", exact: true }).click();
    await page.getByRole("button", { name: "PDF", exact: true }).click();
    await page.getByRole("button", { name: "Receipt PNG", exact: true }).click();
    await ready(page);
    await expect(page.locator(".cu-source-heading")).toContainText("receipt.png");
    await expect(page.locator("[data-field-depth='0']")).toHaveCount(11);
    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
});

test("Fields matches Studio grouping, icons, badges and spacing without altering service data", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const pane = page.getByRole("region", { name: "Extraction results" });
    const group = pane.locator('[data-field-id="/contents/0/fields/AmountDue"]');
    const address = pane.locator('[data-field-id="/contents/0/fields/BillingAddress"]');
    const country = pane.locator('[data-field-id="/contents/0/fields/CountryRegion"]');
    const clear = pane.getByRole("button", { name: "Clear", exact: true });

    await expect(clear).toHaveCount(0);
    await expect(page.getByRole("switch", { name: "Hide missing fields" })).toHaveAttribute("aria-checked", "true");
    await expect(group.getByRole("button", { name: "Expand AmountDue", exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(amountRow)).toHaveCount(0);
    await expect(group.getByRole("button", { name: "Locate AmountDue on page 1", exact: true })).toHaveText("p.1");
    await expect(group.locator(".cu-confidence")).toHaveCount(0);
    await expect(country.locator(".cu-page-badge")).toHaveCount(0);
    await expect(country.locator(".cu-confidence")).toHaveCount(0);
    await expect(country.locator(".cu-field-value")).toHaveText("USA");
    await expect(address.locator(".cu-confidence")).toHaveText("31.70%");
    await expect(pane.getByRole("tab").filter({ hasText: /Markdown|Paragraphs|Tables|Code/ })).toHaveCount(4);
    await expect(pane.getByRole("tab", { name: "Markdown", exact: true })).toBeEnabled();
    await expect(pane.getByRole("tab", { name: "Result", exact: true })).toBeEnabled();
    await expect(pane.getByRole("tab")).toHaveText(["Fields", "Markdown", "Paragraphs", "Tables", "Result", "Code"]);
    await expect(pane.locator('[role="tab"][disabled]')).toHaveCount(0);

    const appearance = await group.evaluate(element => {
        const dot = element.querySelector(".cu-dot");
        const name = element.querySelector(".cu-field-name");
        const badge = element.querySelector(".cu-page-badge");
        const arrow = element.querySelector(".cu-expand");
        if (!dot || !name || !badge || !arrow) throw new Error("The Studio-style field header is incomplete.");
        return {
            dotWidth: dot.getBoundingClientRect().width,
            dotHeight: dot.getBoundingClientRect().height,
            color: getComputedStyle(dot).backgroundColor,
            nameWeight: getComputedStyle(name).fontWeight,
            badgeHeight: badge.getBoundingClientRect().height,
            badgeAfterName: badge.getBoundingClientRect().x > name.getBoundingClientRect().right,
            arrowAfterBadge: arrow.getBoundingClientRect().x > badge.getBoundingClientRect().right,
            arrowIsSvg: Boolean(arrow.querySelector("svg path")),
            rowHeight: element.getBoundingClientRect().height,
        };
    });
    expect(appearance).toMatchObject({
        dotWidth: 12, dotHeight: 12, color: "rgb(209, 52, 56)",
        nameWeight: "400", badgeHeight: 20, badgeAfterName: true, arrowAfterBadge: true, arrowIsSvg: true, rowHeight: 56,
    });
    const scalarBox = await address.boundingBox();
    expect(scalarBox?.height).toBe(80);
    await expect(address).toHaveCSS("padding-right", "12px");
    const switchBox = await page.getByRole("switch", { name: "Hide missing fields" }).boundingBox();
    expect(switchBox?.width).toBe(40);
    expect(switchBox?.height).toBe(20);
    await expect(address.locator(".cu-dot")).toHaveCSS("background-color", "rgb(140, 189, 24)");
    await expect(country.locator(".cu-dot")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

    await address.hover();
    await expect(page.getByRole("tooltip", { name: "Field preview" }).locator("dd").last()).toHaveText("31.70%");
    await leave(page);
    await group.hover();
    await expect(group).toHaveClass(/is-hovered/);
    await expect(clear).toHaveCount(0);
    await leave(page);
    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
    await group.getByRole("button", { name: "Locate AmountDue on page 1", exact: true }).click();
    await leave(page);
    await expect(group.getByRole("button", { name: "AmountDue", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(clear).toHaveCount(0);
    await expect(page.getByTestId("source-overlay").locator("polygon")).toHaveAttribute("stroke", "#d13438");
    await group.getByRole("button", { name: "Expand AmountDue", exact: true }).click();
    await expect(page.locator(amountRow)).toBeVisible();
    await expect(clear).toHaveCount(0);
    await page.locator(amountRow).getByRole("button", { name: "Amount", exact: true }).click();
    await leave(page);
    await expect(page.getByTestId("source-overlay").locator("polygon")).toHaveAttribute("stroke", "#d13438");
    await group.getByRole("button", { name: "Collapse AmountDue", exact: true }).click();
    await leave(page);
    await expect(clear).toHaveCount(0);
    await expect(page.getByTestId("source-overlay").locator("polygon")).toHaveAttribute("stroke", "#d13438");

    for (const width of [972, 880]) {
        await page.setViewportSize({ width, height: 850 });
        const tabs = pane.locator(".cu-result-tabs");
        await expect(tabs).toHaveCSS("overflow-x", "auto");
        await pane.getByRole("tab", { name: "Fields", exact: true }).press("End");
        const strip = await tabs.boundingBox();
        const code = await pane.getByRole("tab", { name: "Code", exact: true }).boundingBox();
        if (!strip || !code) throw new Error("The dynamic tabs are not laid out.");
        expect(code.x).toBeGreaterThanOrEqual(strip.x - 1);
        expect(code.x + code.width).toBeLessThanOrEqual(strip.x + strip.width + 1);
    }
});

test("real table-like arrays and every multi-region source remain reachable without losing selection", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const address = page.locator('[data-field-id="/contents/0/fields/BillingAddress"]');
    await address.getByRole("button", { name: "BillingAddress", exact: true }).click();
    await leave(page);
    const navigation = page.getByRole("complementary", { name: "Source region navigation" });
    await expect(navigation).toContainText("Region 1 of 2");
    await checkPolygon(page, [
        { x: 0.5801 / 8.5, y: 3.9488 / 11 }, { x: 1.2856 / 8.5, y: 3.9470 / 11 },
        { x: 1.2860 / 8.5, y: 4.1130 / 11 }, { x: 0.5805 / 8.5, y: 4.1148 / 11 },
    ], 0);
    const first = await page.getByTestId("source-overlay").locator("polygon").getAttribute("points");
    await navigation.getByRole("button", { name: "Next source region", exact: true }).click();
    await expect(navigation).toContainText("Region 2 of 2");
    await expect(navigation.getByRole("button", { name: "Next source region", exact: true })).toBeDisabled();
    await checkPolygon(page, [
        { x: 0.5728 / 8.5, y: 4.1489 / 11 }, { x: 2.0254 / 8.5, y: 4.1489 / 11 },
        { x: 2.0254 / 8.5, y: 4.3167 / 11 }, { x: 0.5728 / 8.5, y: 4.3167 / 11 },
    ], 0);
    expect(await page.getByTestId("source-overlay").locator("polygon").getAttribute("points")).not.toBe(first);
    await navigation.getByRole("button", { name: "Previous source region", exact: true }).click();
    await expect(navigation).toContainText("Region 1 of 2");

    const lineItems = page.locator('[data-field-id="/contents/0/fields/LineItems"]');
    await lineItems.getByRole("button", { name: "Expand LineItems", exact: true }).click();
    for (const item of [1, 2, 3]) {
        await expect(page.getByRole("button", { name: `Item ${item}`, exact: true })).toBeVisible();
    }
    await page.getByRole("button", { name: "Expand Item 1", exact: true }).click();
    const date = page.locator('[data-field-id="/contents/0/fields/LineItems/valueArray/0/valueObject/Date"]');
    await date.getByRole("button", { name: "Date", exact: true }).click();
    await leave(page);
    await expect(date.locator(".cu-field-value")).toHaveText("2021-03-04");
    await expect(date.getByRole("button", { name: "Date", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("region", { name: "Extraction results" }).getByRole("status"))
        .toHaveText("Pinned: LineItems / Item 1 / Date");
    await lineItems.getByRole("button", { name: "Collapse LineItems", exact: true }).click();
    await leave(page);
    await expect(date).toHaveCount(0);
    await expect(lineItems).toHaveClass(/is-selected/);
    await expect(page.getByTestId("source-overlay")).toBeVisible();
    await lineItems.getByRole("button", { name: "Expand LineItems", exact: true }).click();
    await expect(date).toBeVisible();
    await expect(date.getByRole("button", { name: "Date", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("a structured group can navigate all grounded descendants across PDF pages", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const result = {
        apiVersion: "2025-11-01",
        contents: [{
            kind: "document", unit: "inch", startPageNumber: 1, endPageNumber: 4,
            pages: [
                { pageNumber: 1, width: 8.5, height: 11 },
                { pageNumber: 4, width: 8.2639, height: 11.6806 },
            ],
            fields: {
                Rows: { type: "array", valueArray: [
                    { type: "object", valueObject: {
                        Label: { type: "string", valueString: "First", source: "D(1,1,1,2,1,2,2,1,2)" },
                    } },
                    { type: "object", valueObject: {
                        Label: { type: "string", valueString: "Second", source: "D(4,1,1,2,1,2,2,1,2)" },
                    } },
                ] },
            },
        }],
    };
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "synthetic-structured-cross-page.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(result)),
    });
    const rows = page.locator('[data-field-id="/contents/0/fields/Rows"]');
    await rows.getByRole("button", { name: "Rows", exact: true }).click();
    await leave(page);
    const navigation = page.getByRole("complementary", { name: "Source region navigation" });
    await expect(navigation).toContainText("Region 1 of 2");
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("1");
    await checkPolygon(page, [
        { x: 1 / 8.5, y: 1 / 11 }, { x: 2 / 8.5, y: 1 / 11 },
        { x: 2 / 8.5, y: 2 / 11 }, { x: 1 / 8.5, y: 2 / 11 },
    ], 0);
    await navigation.getByRole("button", { name: "Next source region", exact: true }).click();
    await ready(page);
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("4");
    await expect(navigation).toContainText("Region 2 of 2");
    await checkPolygon(page, [
        { x: 1 / 8.2639, y: 1 / 11.6806 }, { x: 2 / 8.2639, y: 1 / 11.6806 },
        { x: 2 / 8.2639, y: 2 / 11.6806 }, { x: 1 / 8.2639, y: 2 / 11.6806 },
    ], 0);
    await page.getByRole("textbox", { name: "Page number" }).fill("2");
    await page.getByRole("textbox", { name: "Page number" }).press("Enter");
    await ready(page);
    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
    await navigation.getByRole("button", { name: "Previous source region", exact: true }).click();
    await ready(page);
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("1");

    await rows.getByRole("button", { name: "Expand Rows", exact: true }).click();
    await page.getByRole("button", { name: "Expand Item 2", exact: true }).click();
    const second = page.locator('[data-field-id="/contents/0/fields/Rows/valueArray/1/valueObject/Label"]');
    await second.getByRole("button", { name: "Label", exact: true }).click();
    await leave(page);
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("4");
    await expect(second.locator(".cu-field-value")).toHaveText("Second");
    await expect(page.getByRole("region", { name: "Extraction results" }).getByRole("status"))
        .toHaveText("Pinned: Rows / Item 2 / Label");
});

test("Hide missing fields changes only presentation and clears a filtered-out selection", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const missing = page.locator('[data-field-id="/contents/0/fields/PaymentTerm"]');
    const address = page.locator('[data-field-id="/contents/0/fields/BillingAddress"]');
    const toggle = page.getByRole("switch", { name: "Hide missing fields" });
    await expect(missing).toHaveCount(0);
    await expect(page.locator("[data-field-depth='0']")).toHaveCount(28);
    await expect(address.locator(".cu-dot")).toHaveCSS("background-color", "rgb(140, 189, 24)");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(page.locator("[data-field-depth='0']")).toHaveCount(31);
    await expect(missing.locator(".cu-field-value")).toHaveText("Not returned");
    await expect(missing.locator(".cu-confidence")).toHaveText("83.70%");
    await missing.getByRole("button", { name: "PaymentTerm", exact: true }).click();
    await leave(page);
    await expect(missing.getByRole("button", { name: "PaymentTerm", exact: true })).toHaveAttribute("aria-pressed", "true");
    await toggle.click();
    await expect(missing).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Extraction results" }).getByRole("status")).toHaveText("No field selected");
    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
    await expect(address.locator(".cu-dot")).toHaveCSS("background-color", "rgb(140, 189, 24)");
    await expect(page.locator('[data-field-id="/contents/0/fields/CountryRegion"] .cu-field-value')).toHaveText("USA");
});

test("unavailable source pages disable scalar and group badges while preserving values and recovering with a matching result", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const result = {
        apiVersion: "2025-11-01",
        contents: [{
            kind: "document", unit: "inch", startPageNumber: 1, endPageNumber: 5,
            pages: [{ pageNumber: 1, width: 8.5, height: 11 }, { pageNumber: 5, width: 8.5, height: 11 }],
            fields: {
                MissingPage: { type: "string", valueString: "preserved scalar", confidence: 0.317, source: "D(5,1,1,2,1,2,2,1,2)" },
                Group: { type: "object", valueObject: {
                    Child: { type: "string", valueString: "preserved child", source: "D(5,1,1,2,1,2,2,1,2)" },
                } },
            },
        }],
    };
    const upload = async (): Promise<void> => {
        await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
            name: "synthetic-source-page-mismatch.json", mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify(result)),
        });
    };
    await upload();
    const scalar = page.locator('[data-field-id="/contents/0/fields/MissingPage"]');
    const scalarBadge = scalar.getByRole("button", { name: "Locate MissingPage on page 5", exact: true });
    const groupBadge = page.getByRole("button", { name: "Locate Group on page 5", exact: true });
    await expect(scalarBadge).toBeDisabled();
    await expect(groupBadge).toBeDisabled();
    await expect(scalarBadge).toHaveAttribute("title", /Page 5 is not present in the loaded source/);
    await page.locator(".cu-issues summary").click();
    await expect(page.locator(".cu-issues")).toContainText("unavailable-source-page");
    await expect(page.locator(".cu-issues")).toContainText("/contents/0/pages/1");
    await scalar.getByRole("button", { name: "MissingPage", exact: true }).click();
    await leave(page);
    await expect(scalar.locator(".cu-field-value")).toHaveText("preserved scalar");
    await expect(scalar.locator(".cu-confidence")).toHaveText("31.70%");
    await expect(scalar.getByRole("button", { name: "MissingPage", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("1");
    await expect(page.getByRole("alert")).toContainText("Page 5 is not present in the loaded source");
    await expect(page.locator(".cu-preview-hint")).toHaveText("Source page 5 is unavailable in this file.");
    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
    await expect(page.getByTestId("rendered-page")).toBeVisible();
    await page.getByRole("button", { name: "Expand Group", exact: true }).click();
    const child = page.locator('[data-field-id="/contents/0/fields/Group/valueObject/Child"]');
    await child.getByRole("button", { name: "Child", exact: true }).click();
    await leave(page);
    await expect(child.locator(".cu-field-value")).toHaveText("preserved child");
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("1");
    await expect(page.getByRole("alert")).toContainText("Page 5 is not present in the loaded source");

    const content = result.contents[0];
    if (!content) throw new Error("The synthetic mismatch content is missing.");
    content.pages = content.pages.filter(value => value.pageNumber === 1);
    content.endPageNumber = 1;
    content.fields.MissingPage.source = "D(1,1,1,2,1,2,2,1,2)";
    content.fields.Group.valueObject.Child.source = "D(1,1,1,2,1,2,2,1,2)";
    await upload();
    await expect(page.locator(".cu-issues")).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
    const validBadge = scalar.getByRole("button", { name: "Locate MissingPage on page 1", exact: true });
    await expect(validBadge).toBeEnabled();
    await expect(page.getByRole("button", { name: "Locate Group on page 1", exact: true })).toBeEnabled();
    await validBadge.click();
    await leave(page);
    await expect(page.getByTestId("source-overlay")).toBeVisible();
    await expect(scalar.locator(".cu-field-value")).toHaveText("preserved scalar");
});
