import { expect, test } from "@playwright/test";
import { croppedRotatedPdf } from "./pdfFixtures";
import { loadReviewFixture } from "./uiRedesignFixtures";
import { fitSource, ready, rotateSource } from "./viewerAssertions";

for (const dpr of [1, 2]) {
    test.describe(`real-source wheel at DPR ${dpr}`, () => {
        test.use({ deviceScaleFactor: dpr });
        for (const source of ["pdf", "image", "cropped/rotated pdf"] as const) {
            for (const rotation of [0, 90]) {
                test(`UI5 ${source} anchored zoom at rotation ${rotation}`, async ({ page }) => {
                    await loadReviewFixture(page);
                    if (source === "image") {
                        await page.getByRole("button", { name: "Receipt PNG", exact: true }).click();
                        await ready(page);
                    } else if (source === "cropped/rotated pdf") {
                        await page.getByLabel("Choose source file").setInputFiles({
                            name: "synthetic-cropped-rotated.pdf", mimeType: "application/pdf", buffer: croppedRotatedPdf(),
                        });
                        await ready(page);
                        await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
                            name: "synthetic-cropped-rotated.cu.json", mimeType: "application/json",
                            buffer: Buffer.from(JSON.stringify({ apiVersion: "2025-11-01", contents: [{
                                kind: "document", unit: "pixel", pages: [
                                    { pageNumber: 1, width: 300, height: 200 }, { pageNumber: 2, width: 240, height: 360 },
                                ], fields: {},
                            }] })),
                        });
                        await page.getByRole("textbox", { name: "Page number", exact: true }).fill("2");
                        await page.getByRole("textbox", { name: "Page number", exact: true }).press("Enter");
                        await ready(page);
                    }
                    await fitSource(page, "page");
                    if (rotation) await rotateSource(page);
                    const viewport = page.getByRole("group", { name: "Source viewport", exact: true });
                    const bounds = await viewport.boundingBox(), before = await page.getByTestId("rendered-page").boundingBox();
                    if (!bounds || !before) throw new Error("Real rendered frame is unavailable.");
                    const pointer = { x: bounds.x + bounds.width * 0.55, y: bounds.y + bounds.height * 0.45 };
                    expect(pointer.x).toBeGreaterThan(before.x);
                    expect(pointer.x).toBeLessThan(before.x + before.width);
                    expect(pointer.y).toBeGreaterThan(before.y);
                    expect(pointer.y).toBeLessThan(before.y + before.height);
                    await page.mouse.move(pointer.x, pointer.y);
                    const zoom = await page.getByLabel("Zoom percentage").textContent();
                    await page.mouse.wheel(0, 80);
                    await expect(page.getByLabel("Zoom percentage")).toHaveText(zoom!);
                    const current = await page.getByTestId("rendered-page").boundingBox();
                    if (!current) throw new Error("Source disappeared during ordinary scrolling.");
                    const stableFraction = { x: (pointer.x - current.x) / current.width, y: (pointer.y - current.y) / current.height };
                    await page.keyboard.down("Control");
                    await page.mouse.wheel(0, -120);
                    await page.keyboard.up("Control");
                    await ready(page);
                    await expect.poll(async () => {
                        const frame = await page.getByTestId("rendered-page").boundingBox();
                        if (!frame) return Infinity;
                        return Math.hypot(frame.x + stableFraction.x * frame.width - pointer.x,
                            frame.y + stableFraction.y * frame.height - pointer.y);
                    }).toBeLessThanOrEqual(1);
                    expect(await page.getByLabel("Zoom percentage").textContent()).not.toBe(zoom);
                    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(dpr);
                });

            }
        }
    });
}

test("UI5 ordinary wheel scrolls, real pan does not clear a pin, and blank click clears it", async ({ page }) => {
    await loadReviewFixture(page);
    await fitSource(page, "width");
    await page.getByRole("button", { name: "InvoiceId", exact: true }).click();
    const viewport = page.getByRole("group", { name: "Source viewport", exact: true });
    const box = await viewport.boundingBox();
    if (!box) throw new Error("Source viewport is unavailable.");
    await page.mouse.move(box.x + 12, box.y + 20);
    const zoom = await page.getByLabel("Zoom percentage").textContent();
    const scroll = await viewport.evaluate(element => element.scrollTop);
    await page.mouse.wheel(0, 120);
    await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBeGreaterThan(scroll);
    await expect(page.getByLabel("Zoom percentage")).toHaveText(zoom!);
    const before = await page.getByTestId("rendered-page").boundingBox();
    await page.mouse.down(); await page.mouse.move(box.x + 49, box.y + 41); await page.mouse.up();
    const after = await page.getByTestId("rendered-page").boundingBox();
    if (!before || !after) throw new Error("Source pan frame is unavailable.");
    expect(after.x - before.x).toBeCloseTo(37, 0);
    expect(after.y - before.y).toBeCloseTo(21, 0);
    await expect(page.getByRole("button", { name: "InvoiceId", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.mouse.click(box.x + 5, box.y + 5);
    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "InvoiceId", exact: true })).toHaveAttribute("aria-pressed", "false");
});

test("UI5 wheel limits and Command-wheel use the same source-only zoom path", async ({ page }) => {
    await loadReviewFixture(page);
    const viewport = await page.getByRole("group", { name: "Source viewport", exact: true }).boundingBox();
    if (!viewport) throw new Error("Source viewport is unavailable.");
    await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
    await page.keyboard.down("Meta"); await page.mouse.wheel(0, -120); await page.keyboard.up("Meta");
    await ready(page);
    const zoom = await page.getByLabel("Zoom percentage").textContent();
    await page.getByRole("combobox", { name: "Zoom", exact: true }).selectOption("300");
    await ready(page);
    await page.keyboard.down("Control"); await page.mouse.wheel(0, -4000); await page.keyboard.up("Control");
    await ready(page);
    await expect(page.getByLabel("Zoom percentage")).toHaveText("300%");
    await expect(page.getByRole("button", { name: "Zoom in", exact: true })).toBeDisabled();
    await page.getByRole("combobox", { name: "Zoom", exact: true }).selectOption("25");
    await ready(page);
    await page.keyboard.down("Control"); await page.mouse.wheel(0, 4000); await page.keyboard.up("Control");
    await ready(page);
    await expect(page.getByLabel("Zoom percentage")).toHaveText("25%");
    await expect(page.getByRole("button", { name: "Zoom out", exact: true })).toBeDisabled();
    const beforePan = await page.getByTestId("rendered-page").boundingBox();
    await page.mouse.down(); await page.mouse.move(viewport.x + viewport.width / 2 + 20, viewport.y + viewport.height / 2 + 12); await page.mouse.up();
    const afterPan = await page.getByTestId("rendered-page").boundingBox();
    if (!beforePan || !afterPan) throw new Error("Clamped-zoom pan frame is unavailable.");
    expect(afterPan.x - beforePan.x).toBeCloseTo(20, 0);
    expect(afterPan.y - beforePan.y).toBeCloseTo(12, 0);
    expect(zoom).not.toBe("300%");
});
