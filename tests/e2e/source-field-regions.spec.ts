import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { reviewPdf } from "./pdfFixtures";
import { expandField, fitSource, ready, rotateSource } from "./viewerAssertions";

test.use({ reducedMotion: "reduce" });

const fieldId = (name: string): string => `/contents/0/fields/${name}`;
const sourceParts = (page: Page, id: string): Locator =>
    page.getByTestId("result-overlay").locator(`polygon[data-outline-id="${id}"]`);
const pinnedParts = (page: Page): Locator => page.getByTestId("source-overlay").locator("polygon");
const popup = (page: Page): Locator => page.getByRole("tooltip", { name: "Field preview", exact: true });

async function expectCompleteSelection(page: Page, id: string, count: number, frameCount = 1,
    layer: "source-overlay" | "preview-overlay" = "source-overlay"): Promise<void> {
    await expect(sourceParts(page, id)).toHaveCount(count);
    await expect(page.getByTestId(layer).locator("polygon")).toHaveCount(frameCount);
    const selection = await page.evaluate(({ field, layer }) => {
        const points = (element: Element) => {
            if (!(element instanceof SVGPolygonElement)) throw new Error("Expected a source polygon.");
            return Array.from({ length: element.points.numberOfItems }, (_, index) => ({
                x: element.points.getItem(index).x, y: element.points.getItem(index).y,
            }));
        };
        return {
            sources: [...document.querySelectorAll(`[data-testid="result-overlay"] polygon[data-outline-id="${field}"]`)]
                .map(element => ({ index: Number(element.getAttribute("data-region-index")), points: points(element) })),
            frames: [...document.querySelectorAll(`[data-testid="${layer}"] polygon`)].map(element => ({
                field: element.getAttribute("data-source-id"), fill: element.getAttribute("fill"),
                indices: (element.getAttribute("data-region-indices") ?? "").split(" ").map(Number), points: points(element),
            })),
        };
    }, { field: id, layer });
    expect(selection.frames.flatMap(frame => frame.indices).sort((a, b) => a - b))
        .toEqual(selection.sources.map(source => source.index).sort((a, b) => a - b));
    for (const frame of selection.frames) {
        expect(frame.field).toBe(id);
        expect(frame.fill).toBe("none");
        const original = selection.sources.filter(source => frame.indices.includes(source.index)).flatMap(source => source.points);
        if (frame.indices.length === 1) expect(frame.points).toEqual(original);
        else {
            const left = Math.min(...original.map(point => point.x)), right = Math.max(...original.map(point => point.x));
            const top = Math.min(...original.map(point => point.y)), bottom = Math.max(...original.map(point => point.y));
            expect(frame.points).toEqual([{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }]);
        }
    }
}

async function expectBelow(page: Page, parts: Locator): Promise<void> {
    await expect(popup(page)).toBeVisible();
    await expect.poll(async () => {
        const bottom = await parts.evaluateAll(elements => Math.max(...elements.map(element => element.getBoundingClientRect().bottom)));
        const card = await popup(page).boundingBox();
        return card ? Math.abs(card.y - bottom - 12) : Infinity;
    }).toBeLessThanOrEqual(1.1);
}

async function loadSynthetic(page: Page, image = false): Promise<void> {
    await page.goto("/");
    await ready(page);
    if (image) await page.getByLabel("Choose source file").setInputFiles(resolve("tests", "fixtures", "images", "orientation-marker.png"));
    else await page.getByLabel("Choose source file").setInputFiles({
        name: "synthetic-field-regions.pdf", mimeType: "application/pdf", buffer: reviewPdf(),
    });
    await ready(page);
    const width = image ? 96 : 600, height = image ? 64 : 800;
    const source = (...parts: [number, number, number, number, number][]): string => parts.map(([pageNumber, x, y, w, h]) =>
        `D(${pageNumber},${x * width},${y * height},${w * width},${h * height})`).join(";");
    const wrapped = source([1, 0.1, 0.1, 0.2, 0.015], [1, 0.1, 0.12, 0.3, 0.015], [1, 0.1, 0.14, 0.15, 0.015]) +
        (image ? "" : `;${source([2, 0.12, 0.12, 0.2, 0.015], [2, 0.12, 0.14, 0.25, 0.015])}`);
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "synthetic-field-regions.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ apiVersion: "2025-11-01", analyzerId: "synthetic-field-regions",
            contents: [{ kind: "document", unit: "pixel",
                pages: (image ? [1] : [1, 2]).map(pageNumber => ({ pageNumber, width, height })),
                fields: {
                    Wrapped: { type: "string", valueString: "Line A / Line B / Line C", confidence: 0.6, source: wrapped },
                    Scattered: { type: "string", valueString: "Separated locations", source:
                        source([1, 0.1, 0.06, 0.2, 0.015], [1, 0.72, 0.86, 0.2, 0.015]) },
                    Nested: { type: "object", valueObject: {
                        Reference: { type: "string", valueString: "Nested two-line reference", source:
                            source([1, 0.4, 0.4, 0.25, 0.015], [1, 0.4, 0.42, 0.2, 0.015]) },
                    } },
                    Rows: { type: "array", valueArray: [{ type: "object", valueObject: {
                        Memo: { type: "string", valueString: "Array multi-line value", source:
                            source([1, 0.4, 0.52, 0.2, 0.015], [1, 0.4, 0.54, 0.25, 0.015]) },
                    } }] },
                    BottomBlock: { type: "string", valueString: "Bottom line A / B / C", source:
                        source([1, 0.1, 0.9, 0.2, 0.015], [1, 0.1, 0.92, 0.25, 0.015], [1, 0.1, 0.94, 0.2, 0.015]) },
                    Obstructed: { type: "string", valueString: "Keep real source outlines", source:
                        source([1, 0.1, 0.3, 0.1, 0.015], [1, 0.1, 0.32, 0.3, 0.015]) },
                    HiddenNeighbor: { type: "string", source: source([1, 0.25, 0.302, 0.1, 0.01]) },
                    CrossColumn: { type: "string", valueString: "Separate columns", source:
                        source([1, 0.52, 0.67, 0.12, 0.015], [1, 0.65, 0.69, 0.12, 0.015]) },
                    RepeatBlocks: { type: "string", valueString: "Two separate multiline blocks", source:
                        source([1, 0.1, 0.6, 0.15, 0.015], [1, 0.1, 0.62, 0.2, 0.015],
                            [1, 0.65, 0.1, 0.15, 0.015], [1, 0.65, 0.12, 0.2, 0.015]) },
                    Ungrounded: { type: "string", valueString: "No fabricated source" },
                },
            }] })),
    });
    await expect(page.getByRole("button", { name: "Wrapped", exact: true })).toBeVisible();
    await expandField(page, "Nested");
    await expandField(page, "Rows");
}

test("UI-43 all six real multi-line fields select both actual fragments and keep a complete preview", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    for (const name of ["BillingAddress", "CustomerAddress", "RemittanceAddress", "ServiceAddress", "ShippingAddress", "VendorAddress"]) {
        const id = fieldId(name);
        await page.getByRole("button", { name, exact: true }).click();
        await expectCompleteSelection(page, id, 2);
        await expect(pinnedParts(page)).toHaveAttribute("data-selection-frame", "merged");
        await expectBelow(page, sourceParts(page, id));
        await sourceParts(page, id).nth(1).press("Enter");
        await expectCompleteSelection(page, id, 2);
        await expect(page.locator(".cu-region-controls")).toContainText("2 regions on p.1 · Location 2 of 2");
        await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
        await expectBelow(page, sourceParts(page, id));
    }
});

for (const image of [false, true]) {
    test(`UI-43 arbitrary nested and array values keep every real fragment on ${image ? "images" : "PDFs"}`, async ({ page }) => {
        await loadSynthetic(page, image);
        for (const [id, count, inline] of [
            [fieldId("Wrapped"), 3, false],
            [fieldId("Nested/valueObject/Reference"), 2, false],
            [fieldId("Rows/valueArray/0/valueObject/Memo"), 2, true],
        ] as const) {
            const button = page.locator(`[data-field-id="${id}"]`).locator(inline ? ".cu-cell-value" : ".cu-field-name");
            await button.click();
            await expectCompleteSelection(page, id, count);
            await expectBelow(page, sourceParts(page, id));
            await expect(button).toHaveAttribute("aria-pressed", "true");
        }
        await page.getByRole("button", { name: "Ungrounded", exact: true }).click();
        await expect(page.getByTestId("source-overlay")).toHaveCount(0);
        await expect(popup(page)).toHaveCount(0);
        await expect(page.locator(".cu-preview-hint")).toContainText("no source region");
    });
}

test("UI-43 clicking any source fragment selects its complete field without selecting another field", async ({ page }) => {
    await loadSynthetic(page);
    const id = fieldId("Wrapped");
    await sourceParts(page, id).nth(2).click();
    await expectCompleteSelection(page, id, 3);
    await expectBelow(page, sourceParts(page, id));
    await expect(page.locator(".cu-fields-table > tbody > tr.is-current-value")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Wrapped", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".cu-region-controls")).toContainText("3 regions on p.1 · Location 3 of 5");
    await expect(page.getByRole("group", { name: "Source viewport", exact: true })).toBeFocused();
});

test("UI-43 separated same-page locations stay selected while navigation reveals only the active location", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await loadSynthetic(page);
    await fitSource(page, "width");
    const id = fieldId("Scattered");
    await page.getByRole("button", { name: "Scattered", exact: true }).click();
    await expectCompleteSelection(page, id, 2, 2);
    await expectBelow(page, sourceParts(page, id).first());
    await page.getByRole("button", { name: "Next source region", exact: true }).click();
    await expectBelow(page, sourceParts(page, id).nth(1));
    await expectCompleteSelection(page, id, 2, 2);
    const first = await sourceParts(page, id).first().boundingBox();
    const viewport = await page.getByRole("group", { name: "Source viewport", exact: true }).boundingBox();
    if (!first || !viewport) throw new Error("Source location bounds are unavailable.");
    expect(first.y + first.height).toBeLessThan(viewport.y);
    await expect(page.locator(".cu-region-controls")).toContainText("Location 2 of 2");
});

test("UI-43 cross-page navigation retains the field, current-page fragments, zoom and exact location", async ({ page }) => {
    await loadSynthetic(page);
    const id = fieldId("Wrapped");
    await page.getByRole("button", { name: "Wrapped", exact: true }).click();
    const zoom = await page.getByLabel("Zoom percentage").textContent();
    await expectCompleteSelection(page, id, 3);
    for (let index = 0; index < 3; index++) await page.getByRole("button", { name: "Next source region", exact: true }).click();
    await ready(page);
    await expect(page.getByRole("textbox", { name: "Page number" })).toHaveValue("2");
    await expectCompleteSelection(page, id, 2);
    expect(await pinnedParts(page).evaluateAll(elements => elements.flatMap(element =>
        (element.getAttribute("data-region-indices") ?? "").split(" ").map(Number)))).toEqual([3, 4]);
    await expect(page.locator(".cu-region-controls")).toContainText("2 regions on p.2 · Location 4 of 5");
    await expect(page.getByLabel("Zoom percentage")).toHaveText(zoom ?? "");
    await expectBelow(page, sourceParts(page, id));
    await page.getByRole("textbox", { name: "Page number" }).fill("1");
    await page.getByRole("textbox", { name: "Page number" }).press("Enter");
    await ready(page);
    await expectCompleteSelection(page, id, 3);
    await expect(popup(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Wrapped", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("UI-43 hover preserves the complete pinned field without panning and anchors below the hovered multi-line value", async ({ page }) => {
    await loadSynthetic(page);
    await page.getByRole("button", { name: "Wrapped", exact: true }).click();
    const before = await page.getByTestId("rendered-page").boundingBox();
    const id = fieldId("Nested/valueObject/Reference");
    await page.getByRole("button", { name: "Reference", exact: true }).hover();
    await expectCompleteSelection(page, id, 2, 1, "preview-overlay");
    await expect(page.getByTestId("preview-overlay").locator("polygon")).toHaveCSS("stroke-dasharray", "none");
    await expectCompleteSelection(page, fieldId("Wrapped"), 3);
    await expectBelow(page, sourceParts(page, id));
    expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(before);
    await expect(page.getByRole("button", { name: "Reference", exact: true })).toHaveAttribute("aria-pressed", "false");
});

test("UI-43 an unavailable source location reports its error without fabricating a card or dropping visible selection", async ({ page }) => {
    await loadSynthetic(page);
    await page.getByLabel("Choose source file").setInputFiles(resolve("tests", "fixtures", "images", "orientation-marker.png"));
    await expect(page.getByRole("group", { name: "Source viewport", exact: true })).toHaveAttribute("aria-disabled", "false");
    await page.getByRole("button", { name: "Wrapped", exact: true }).click();
    await expectCompleteSelection(page, fieldId("Wrapped"), 3);
    for (let index = 0; index < 2; index++) await page.getByRole("button", { name: "Next source region", exact: true }).click();
    const before = await page.getByTestId("rendered-page").boundingBox();
    await page.getByRole("button", { name: "Next source region", exact: true }).click();
    await expect(page.getByTestId("source-canvas")).toHaveAttribute("aria-label", "Rendered source page 1");
    await expect(page.getByRole("alert").filter({ hasText: /Source region:.*page 2/i })).toBeVisible();
    await expectCompleteSelection(page, fieldId("Wrapped"), 3);
    await expect(popup(page)).toHaveCount(0);
    expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(before);
});

test("UI-43 a page-bottom multi-line hover never pans, while explicit selection reveals the complete block and card", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 540 });
    await loadSynthetic(page);
    await fitSource(page, "width");
    const id = fieldId("BottomBlock");
    await sourceParts(page, id).first().evaluate(element => {
        const viewport = element.closest(".cu-document-container")!;
        const last = viewport.querySelector(`[data-outline-id="${element.getAttribute("data-outline-id")}"][aria-label$="region 3"]`)!;
        viewport.scrollTop += last.getBoundingClientRect().bottom - viewport.getBoundingClientRect().bottom + 8;
    });
    const before = await page.getByTestId("rendered-page").boundingBox();
    await sourceParts(page, id).first().hover();
    await expect(page.getByTestId("preview-overlay")).toBeVisible();
    await expect(popup(page)).toBeHidden();
    expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(before);
    await sourceParts(page, id).first().press("Enter");
    await expectCompleteSelection(page, id, 3);
    await expectBelow(page, sourceParts(page, id));
    const card = await popup(page).boundingBox();
    const viewport = await page.getByRole("group", { name: "Source viewport", exact: true }).boundingBox();
    if (!card || !viewport) throw new Error("The selected source card is unavailable.");
    expect(card.y + card.height).toBeLessThanOrEqual(viewport.y + viewport.height);
});

test("UI-43 rotated and zoomed images retain each exact source polygon and complete multi-line placement", async ({ page }) => {
    await loadSynthetic(page, true);
    const id = fieldId("Wrapped");
    await page.getByRole("button", { name: "Wrapped", exact: true }).click();
    for (let rotation = 0; rotation < 4; rotation++) {
        if (rotation) await rotateSource(page);
        await fitSource(page, "page");
        await expectCompleteSelection(page, id, 3);
        await expectBelow(page, sourceParts(page, id));
    }
    await page.getByRole("combobox", { name: "Zoom", exact: true }).selectOption("200");
    await ready(page);
    await expectCompleteSelection(page, id, 3);
});

test("UI-44 another field inside the new envelope prevents merging even when missing fields are hidden", async ({ page }) => {
    await loadSynthetic(page);
    const id = fieldId("Obstructed");
    await page.getByRole("button", { name: "Obstructed", exact: true }).click();
    await expectCompleteSelection(page, id, 2, 2);
    await expect(sourceParts(page, fieldId("HiddenNeighbor"))).toHaveCount(1);
    await page.getByRole("switch", { name: "Hide missing fields", exact: true }).check();
    await expect(sourceParts(page, fieldId("HiddenNeighbor"))).toHaveCount(0);
    await expectCompleteSelection(page, id, 2, 2);
    await expect(page.getByTestId("source-overlay").locator('polygon[data-selection-frame="merged"]')).toHaveCount(0);
});

test("UI-44 nearby sources across columns retain their original individual outlines", async ({ page }) => {
    await loadSynthetic(page);
    await page.getByRole("button", { name: "CrossColumn", exact: true }).click();
    await expectCompleteSelection(page, fieldId("CrossColumn"), 2, 2);
    await page.getByRole("button", { name: "Next source region", exact: true }).click();
    await expectCompleteSelection(page, fieldId("CrossColumn"), 2, 2);
    await expect(page.locator(".cu-region-controls")).toContainText("Location 2 of 2");
});

test("UI-44 separate multiline blocks use two frames without changing their four source locations", async ({ page }) => {
    await loadSynthetic(page);
    const id = fieldId("RepeatBlocks");
    await page.getByRole("button", { name: "RepeatBlocks", exact: true }).click();
    await expectCompleteSelection(page, id, 4, 2);
    expect(await pinnedParts(page).evaluateAll(elements => elements.map(element => element.getAttribute("data-region-indices"))))
        .toEqual(["0 1", "2 3"]);
    for (let index = 0; index < 2; index++) await page.getByRole("button", { name: "Next source region", exact: true }).click();
    await expectCompleteSelection(page, id, 4, 2);
    await expect(page.locator(".cu-region-controls")).toContainText("4 regions on p.1 · Location 3 of 4");
});

test("UI-44 the merged frame never turns blank space into a source hit or changes viewer preferences", async ({ page }) => {
    await loadSynthetic(page);
    const preferences = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([key]) => key.startsWith("cu-viewer"))));
    const before = await page.getByTestId("rendered-page").boundingBox();
    const id = fieldId("Wrapped");
    await page.getByRole("button", { name: "Wrapped", exact: true }).click();
    await expectCompleteSelection(page, id, 3);
    const first = await sourceParts(page, id).first().boundingBox();
    const second = await sourceParts(page, id).nth(1).boundingBox();
    if (!first || !second) throw new Error("Source fragment bounds are unavailable.");
    const point = { x: second.x + second.width - 2, y: first.y + first.height / 2 };
    expect(point.x).toBeGreaterThan(first.x + first.width);
    await page.mouse.click(point.x, point.y);
    await expect(page.getByTestId("source-overlay")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Wrapped", exact: true })).toHaveAttribute("aria-pressed", "false");
    expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(before);
    expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([key]) => key.startsWith("cu-viewer"))))).toBe(preferences);
});

test("UI-46 every real multiline value previews with the exact fixed-selection frame without replacing another pin", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const invoice = page.getByRole("button", { name: "InvoiceId", exact: true });
    for (const name of ["BillingAddress", "CustomerAddress", "RemittanceAddress", "ServiceAddress", "ShippingAddress", "VendorAddress"]) {
        const id = fieldId(name);
        const field = page.getByRole("button", { name, exact: true });
        await field.click();
        await expectCompleteSelection(page, id, 2);
        await expect(pinnedParts(page)).toHaveCSS("stroke", "rgb(91, 33, 182)");
        const expected = await pinnedParts(page).evaluate(element => ({
            points: element.getAttribute("points"), fill: element.getAttribute("fill"),
            width: element.getAttribute("stroke-width"),
            dash: element.getAttribute("stroke-dasharray"),
        }));
        await invoice.click();
        await page.locator(".prototype-banner").hover();
        await expectCompleteSelection(page, fieldId("InvoiceId"), 1);
        const pinned = await pinnedParts(page).getAttribute("points");
        if (pinned === null) throw new Error("The fixed source frame is unavailable.");
        const before = await page.getByTestId("rendered-page").boundingBox();
        for (const index of [0, 1]) {
            await sourceParts(page, id).nth(index).hover();
            await expectCompleteSelection(page, id, 2, 1, "preview-overlay");
            await expect(page.getByTestId("preview-overlay").locator("polygon")).toHaveCSS("stroke", "rgb(140, 112, 194)");
            expect(await page.getByTestId("preview-overlay").locator("polygon").evaluate(element => ({
                points: element.getAttribute("points"), fill: element.getAttribute("fill"),
                width: element.getAttribute("stroke-width"),
                dash: element.getAttribute("stroke-dasharray"),
            }))).toEqual(expected);
            await expect(invoice).toHaveAttribute("aria-pressed", "true");
            await expect(field).toHaveAttribute("aria-pressed", "false");
            await expect(pinnedParts(page)).toHaveAttribute("points", pinned);
            expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(before);
        }
        await page.locator(".prototype-banner").hover();
        await expect(page.getByTestId("preview-overlay")).toHaveCount(0);
    }
});

for (const image of [false, true]) {
    test(`UI-46 nested and array values use complete solid preview frames without selecting on ${image ? "images" : "PDFs"}`, async ({ page }) => {
        await loadSynthetic(page, image);
        const before = await page.getByTestId("rendered-page").boundingBox();
        for (const [id, count, inline] of [
            [fieldId("Wrapped"), 3, false],
            [fieldId("Nested/valueObject/Reference"), 2, false],
            [fieldId("Rows/valueArray/0/valueObject/Memo"), 2, true],
        ] as const) {
            const button = page.locator(`[data-field-id="${id}"]`).locator(inline ? ".cu-cell-value" : ".cu-field-name");
            await button.hover();
            await expectCompleteSelection(page, id, count, 1, "preview-overlay");
            await expect(page.getByTestId("preview-overlay").locator("polygon")).toHaveCSS("stroke-dasharray", "none");
            await expect(page.getByTestId("preview-overlay").locator("polygon")).toHaveAttribute("stroke-width", "1.8");
            await expect(button).toHaveAttribute("aria-pressed", "false");
            await expect(page.getByTestId("source-overlay")).toHaveCount(0);
            expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(before);
        }
    });
}

test("UI-46 temporary frames retain collision, hidden-field, column and separated-block safeguards", async ({ page }) => {
    await loadSynthetic(page);
    await page.getByRole("button", { name: "Wrapped", exact: true }).click();
    const before = await page.getByTestId("rendered-page").boundingBox();
    for (const [name, count, frames] of [
        ["Obstructed", 2, 2], ["CrossColumn", 2, 2], ["RepeatBlocks", 4, 2], ["Scattered", 2, 2],
    ] as const) {
        await page.getByRole("button", { name, exact: true }).hover();
        await expectCompleteSelection(page, fieldId(name), count, frames, "preview-overlay");
        for (const element of await page.getByTestId("preview-overlay").locator("polygon").all()) {
            await expect(element).toHaveCSS("stroke-dasharray", "none");
            await expect(element).toHaveAttribute("stroke-width", "1.8");
        }
        await expectCompleteSelection(page, fieldId("Wrapped"), 3);
        expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(before);
    }
    await page.getByRole("switch", { name: "Hide missing fields", exact: true }).check();
    await page.getByRole("button", { name: "Obstructed", exact: true }).hover();
    await expect(sourceParts(page, fieldId("HiddenNeighbor"))).toHaveCount(0);
    await expectCompleteSelection(page, fieldId("Obstructed"), 2, 2, "preview-overlay");
    await expectCompleteSelection(page, fieldId("Wrapped"), 3);
});

test("UI-46 keyboard focus previews a whole field and only Enter replaces the pin", async ({ page }) => {
    await loadSynthetic(page);
    const selected = fieldId("Nested/valueObject/Reference"), previewed = fieldId("Wrapped");
    await page.getByRole("button", { name: "Reference", exact: true }).click();
    const before = await page.getByTestId("rendered-page").boundingBox();
    const target = sourceParts(page, previewed).nth(2);
    await target.focus();
    await expectCompleteSelection(page, previewed, 3, 1, "preview-overlay");
    await expectCompleteSelection(page, selected, 2);
    await expect(page.getByRole("button", { name: "Wrapped", exact: true })).toHaveAttribute("aria-pressed", "false");
    expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(before);
    await target.press("Enter");
    await expectCompleteSelection(page, previewed, 3);
    await expect(page.getByTestId("preview-overlay")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Wrapped", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Reference", exact: true })).toHaveAttribute("aria-pressed", "false");
});

test("UI-46 rotated and zoomed image previews retain the exact fixed frame without panning", async ({ page }) => {
    await loadSynthetic(page, true);
    const previewed = page.getByRole("button", { name: "Wrapped", exact: true });
    const selected = page.getByRole("button", { name: "Reference", exact: true });
    for (const mode of [0, 90, 180, 270, 200]) {
        if (mode === 200) {
            await page.getByRole("combobox", { name: "Zoom", exact: true }).selectOption("200");
            await ready(page);
        } else {
            if (mode) await rotateSource(page);
            await fitSource(page, "page");
        }
        await previewed.click();
        await expectCompleteSelection(page, fieldId("Wrapped"), 3);
        const expected = await pinnedParts(page).getAttribute("points");
        if (expected === null) throw new Error("The fixed source frame is unavailable.");
        await selected.click();
        const before = await page.getByTestId("rendered-page").boundingBox();
        await previewed.hover();
        await expectCompleteSelection(page, fieldId("Wrapped"), 3, 1, "preview-overlay");
        await expect(page.getByTestId("preview-overlay").locator("polygon")).toHaveAttribute("points", expected);
        await expect(page.getByTestId("preview-overlay").locator("polygon")).toHaveCSS("stroke-dasharray", "none");
        await expectCompleteSelection(page, fieldId("Nested/valueObject/Reference"), 2);
        expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(before);
    }
});
