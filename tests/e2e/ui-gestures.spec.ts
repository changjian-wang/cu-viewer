import { expect, test } from "@playwright/test";
import { croppedRotatedPdf } from "./pdfFixtures";
import { loadReviewFixture } from "./uiRedesignFixtures";
import { fitSource, ready, rotateSource } from "./viewerAssertions";

test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

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
                    const delayedDrift = await viewport.evaluate(async (element, { pointer, fraction }) => {
                        const until = performance.now() + 250;
                        let maximum = 0;
                        do {
                            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
                            const frame = element.querySelector(".cu-rendered-page")?.getBoundingClientRect();
                            if (!frame) throw new Error("Source disappeared while checking the zoom anchor.");
                            maximum = Math.max(maximum, Math.hypot(frame.x + fraction.x * frame.width - pointer.x,
                                frame.y + fraction.y * frame.height - pointer.y));
                        } while (performance.now() < until);
                        return maximum;
                    }, { pointer, fraction: stableFraction });
                    expect(delayedDrift).toBeLessThanOrEqual(1);
                    expect(await page.getByLabel("Zoom percentage").textContent()).not.toBe(zoom);
                    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(dpr);
                });

            }
        }
        for (const source of ["pdf", "image"]) {
            for (const modifier of ["Control", "Meta"] as const) {
                test(`BUG-008 ${source} stays painted through continuous ${modifier}-wheel zoom`, async ({ page }) => {
                    await page.goto("/");
                    await ready(page);
                    if (source === "image") await page.getByRole("button", { name: "Receipt PNG", exact: true }).click();
                    else {
                        await page.getByRole("textbox", { name: "Page number", exact: true }).fill("4");
                        await page.getByRole("textbox", { name: "Page number", exact: true }).press("Enter");
                    }
                    await ready(page);
                    const viewport = await page.getByRole("group", { name: "Source viewport", exact: true }).boundingBox();
                    if (!viewport) throw new Error("Source viewport is unavailable.");
                    await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
                    const monitor = await page.getByTestId("rendered-page").evaluateHandle(frame => {
                        const canvas = frame.querySelector("canvas"), viewport = frame.closest(".cu-document-container");
                        const probe = document.createElement("canvas");
                        probe.width = probe.height = 48;
                        const context = probe.getContext("2d", { willReadFrequently: true });
                        if (!canvas || !context || !viewport) throw new Error("Painted source probe is unavailable.");
                        const stats = { frames: 0, hidden: 0, loading: 0, blank: 0, minWidth: Infinity, maxWidth: 0 };
                        let frameId = 0;
                        const sample = (): void => {
                            stats.frames++;
                            const bounds = frame.getBoundingClientRect();
                            if (getComputedStyle(frame).visibility !== "visible" || bounds.width <= 0 || bounds.height <= 0) stats.hidden++;
                            if (viewport.querySelector(".cu-source-state")) stats.loading++;
                            stats.minWidth = Math.min(stats.minWidth, bounds.width);
                            stats.maxWidth = Math.max(stats.maxWidth, bounds.width);
                            context.clearRect(0, 0, 48, 48);
                            context.drawImage(canvas, 0, 0, 48, 48);
                            const pixels = context.getImageData(0, 0, 48, 48).data;
                            let ink = 0;
                            for (let index = 0; index < pixels.length; index += 4) {
                                if (pixels[index + 3]! > 0 && Math.min(pixels[index]!, pixels[index + 1]!, pixels[index + 2]!) < 245) ink++;
                            }
                            if (ink === 0) stats.blank++;
                            frameId = requestAnimationFrame(sample);
                        };
                        sample();
                        return { stats, stop: () => { cancelAnimationFrame(frameId); probe.width = probe.height = 0; } };
                    });
                    try {
                        await page.keyboard.down(modifier);
                        for (const delta of [-120, -120, -90, 60, -60, 90, 120, 120]) await page.mouse.wheel(0, delta);
                        await page.keyboard.up(modifier);
                        await ready(page);
                        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
                        const stats = await monitor.evaluate(monitor => monitor.stats);
                        expect(stats.frames).toBeGreaterThan(2);
                        expect(stats.maxWidth).toBeGreaterThan(stats.minWidth * 1.05);
                        expect(stats.hidden, JSON.stringify(stats)).toBe(0);
                        expect(stats.loading, JSON.stringify(stats)).toBe(0);
                        expect(stats.blank, JSON.stringify(stats)).toBe(0);
                    } finally {
                        await page.keyboard.up(modifier);
                        await monitor.evaluate(monitor => monitor.stop());
                        await monitor.dispose();
                    }
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

for (const dpr of [1, 1.25, 2]) {
    test.describe(`fixed zoom scroll range at DPR ${dpr}`, () => {
        test.use({ deviceScaleFactor: dpr });
        for (const sample of ["PDF", "Receipt PNG"]) {
            for (const rotation of [0, 90]) {
                test(`BUG-010 ${sample} reaches every page corner at rotation ${rotation}`, async ({ page }) => {
                    for (const width of [1030, 1800]) {
                        await page.setViewportSize({ width, height: 900 });
                        await page.goto("/");
                        await ready(page);
                        if (sample !== "PDF") {
                            await page.getByRole("button", { name: sample, exact: true }).click();
                            await ready(page);
                        }
                        if (rotation) await rotateSource(page);
                        const roots = page.locator('.cu-fields-table > tbody > tr[data-field-depth="0"]');
                        if (sample === "PDF") {
                            await page.getByRole("button", { name: "Locate Table 3 in results", exact: true }).press("Enter");
                            await expect(page.getByRole("button", { name: "Show all fields", exact: true })).toBeVisible();
                        }
                        const fields = await roots.evaluateAll(elements => elements.map(element => element.getAttribute("data-field-id")));
                        const viewport = page.getByRole("group", { name: "Source viewport", exact: true });
                        const checkCorners = async (): Promise<void> => {
                            const layout = await viewport.evaluate(element => {
                                const paper = element.querySelector(".cu-rendered-page"), stage = element.querySelector(".cu-document-stage");
                                if (!paper || !stage) throw new Error("Scrollable source layout is unavailable.");
                                const p = paper.getBoundingClientRect(), s = stage.getBoundingClientRect(), v = element.getBoundingClientRect();
                                return { left: p.left - s.left, top: p.top - s.top, right: p.right - s.right, bottom: p.bottom - s.bottom,
                                    virtualLeft: p.left - v.left + element.scrollLeft, virtualTop: p.top - v.top + element.scrollTop };
                            });
                            expect(layout.left, JSON.stringify(layout)).toBeGreaterThanOrEqual(-1);
                            expect(layout.top, JSON.stringify(layout)).toBeGreaterThanOrEqual(-1);
                            expect(layout.right, JSON.stringify(layout)).toBeLessThanOrEqual(1);
                            expect(layout.bottom, JSON.stringify(layout)).toBeLessThanOrEqual(1);
                            expect(layout.virtualLeft).toBeGreaterThanOrEqual(-1);
                            expect(layout.virtualTop).toBeGreaterThanOrEqual(-1);
                            await viewport.press("Home");
                            for (const right of [false, true]) {
                                for (const bottom of [false, true]) {
                                    const edge = await viewport.evaluate(async (element, corner) => {
                                        const paper = element.querySelector(".cu-rendered-page");
                                        if (!paper) throw new Error("The source paper disappeared.");
                                        const p = paper.getBoundingClientRect(), v = element.getBoundingClientRect();
                                        element.scrollTo({
                                            left: (corner.right ? p.right - element.clientWidth : p.left) - v.left + element.scrollLeft,
                                            top: (corner.bottom ? p.bottom - element.clientHeight : p.top) - v.top + element.scrollTop,
                                        });
                                        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
                                        const frame = paper.getBoundingClientRect(), bounds = element.getBoundingClientRect();
                                        return { x: (corner.right ? frame.right : frame.left) - bounds.left,
                                            y: (corner.bottom ? frame.bottom : frame.top) - bounds.top,
                                            width: element.clientWidth, height: element.clientHeight };
                                    }, { right, bottom });
                                    expect(edge.x).toBeGreaterThanOrEqual(-1);
                                    expect(edge.x).toBeLessThanOrEqual(edge.width + 1);
                                    expect(edge.y).toBeGreaterThanOrEqual(-1);
                                    expect(edge.y).toBeLessThanOrEqual(edge.height + 1);
                                }
                            }
                        };
                        const zoom = page.getByRole("combobox", { name: "Zoom", exact: true });
                        for (const percentage of ["150", "300", "25", "50", "75", "125", "200", "100"]) {
                            await zoom.selectOption(percentage);
                            await ready(page);
                            await checkCorners();
                            await expect(zoom).toHaveValue(percentage);
                            if (percentage === "150") {
                                const bounds = await viewport.boundingBox();
                                if (!bounds) throw new Error("The source scrollbar viewport is unavailable.");
                                await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
                                await page.mouse.wheel(-10000, -10000);
                                await expect.poll(() => viewport.evaluate(element => element.scrollLeft + element.scrollTop))
                                    .toBeLessThanOrEqual(1);
                                const corner = await viewport.evaluate(element => {
                                    const paper = element.querySelector(".cu-rendered-page");
                                    if (!paper) throw new Error("The source disappeared while scrolling to its beginning.");
                                    const frame = paper.getBoundingClientRect(), bounds = element.getBoundingClientRect();
                                    return { left: frame.left - bounds.left, top: frame.top - bounds.top };
                                });
                                expect(corner.left).toBeGreaterThanOrEqual(-1);
                                expect(corner.top).toBeGreaterThanOrEqual(-1);
                            }
                            if (sample === "PDF") await expect(page.getByRole("button", { name: "Show all fields", exact: true })).toBeVisible();
                            expect(await roots.evaluateAll(elements => elements.map(element => element.getAttribute("data-field-id")))).toEqual(fields);
                        }
                        const bounds = await viewport.boundingBox(), before = await page.getByTestId("rendered-page").boundingBox();
                        if (!bounds || !before) throw new Error("Source pan layout is unavailable.");
                        await page.mouse.move(bounds.x + 8, bounds.y + 8);
                        await page.mouse.down();
                        await page.mouse.move(bounds.x + 138, bounds.y + 98);
                        await page.mouse.up();
                        const after = await page.getByTestId("rendered-page").boundingBox();
                        if (!after) throw new Error("Source disappeared after panning.");
                        expect(after.x - before.x).toBeCloseTo(130, 0);
                        expect(after.y - before.y).toBeCloseTo(90, 0);
                        await checkCorners();
                        await expect(zoom).toHaveValue("100");
                    }
                });
            }
        }
    });
}
