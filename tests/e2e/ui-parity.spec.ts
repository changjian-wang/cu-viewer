import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { fieldRow, loadReviewFixture, openValueMenu, recipientId, reviewFixture } from "./uiRedesignFixtures";
import { locateGroup, ready } from "./viewerAssertions";
import { standardFontPdf } from "./pdfFixtures";

const arrayId = "/contents/0/fields/LineItems";
const cellId = `${arrayId}/valueArray/0/valueObject/Column1`;
const source = (page: Page, id: string) => page.getByTestId("result-overlay").locator(`[data-outline-id="${id}"]`).first();

test.use({ reducedMotion: "reduce", deviceScaleFactor: 1 });

test("BUG-006 settings and legend share the requested highlight terminology", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const settingsTrigger = page.getByRole("button", { name: "Highlighting settings", exact: true });
    await settingsTrigger.click();
    const settings = page.getByRole("dialog", { name: "Highlighting", exact: true });
    const threshold = settings.getByRole("spinbutton", { name: "Confidence threshold", exact: true });
    const value = await threshold.inputValue();
    await expect(settings.locator(".cu-setting-hint")).toHaveText(`Values below ${value} receive low-confidence highlight.`);
    await expect(threshold).toHaveAccessibleDescription(/receive low-confidence highlight\./);
    await expect(settings.getByRole("switch")).toHaveCount(3);
    const low = settings.getByRole("switch", { name: "Show low confidence highlight", exact: true });
    await expect(settings.getByRole("switch", { name: "Highlight low confidences", exact: true })).toHaveCount(0);
    await expect(low).toBeChecked();
    await low.uncheck();
    await expect(threshold).toHaveValue(value);
    await expect(settings.getByRole("switch", { name: "Show field highlights", exact: true })).toBeChecked();
    await expect(settings.getByRole("switch", { name: "Show table highlights", exact: true })).toBeChecked();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Highlighting legend", exact: true }).click();
    const legend = page.getByRole("dialog", { name: "Legend", exact: true });
    await expect(legend.getByText("All scored values while low-confidence highlight is off", { exact: true })).toHaveCount(2);
    for (const name of ["Low-confidence field", "Low-confidence table value"]) {
        const category = legend.getByRole("button", { name, exact: true });
        await expect(category).toBeDisabled();
        await expect(category).toHaveAccessibleDescription(/Enable Show low confidence highlight in settings\./);
    }
    await expect(legend).not.toContainText("emphasis");
    await page.keyboard.press("Escape");
    await settingsTrigger.click();
    await low.check();
    await expect(threshold).toHaveValue(value);
    await page.keyboard.press("Escape");
    await expect(settingsTrigger).toBeFocused();
});

for (const sample of ["PDF", "Receipt PNG"]) {
    test(`BUG-004 ${sample} keeps working fit commands only in the Zoom dropdown`, async ({ page }) => {
        await page.goto("/");
        await ready(page);
        if (sample === "PDF") {
            const input = page.getByRole("textbox", { name: "Page number", exact: true });
            await input.fill("4");
            await input.press("Enter");
        } else await page.getByRole("button", { name: sample, exact: true }).click();
        await ready(page);
        const zoom = page.getByRole("combobox", { name: "Zoom", exact: true });
        const viewport = page.getByRole("group", { name: "Source viewport", exact: true });
        const measure = () => viewport.evaluate(element => {
            const frame = element.querySelector(".cu-rendered-page")?.getBoundingClientRect();
            if (!frame) throw new Error("The fitted document is not laid out.");
            return { width: frame.width, height: frame.height,
                availableWidth: element.clientWidth - 64, availableHeight: element.clientHeight - 60 };
        });
        for (const width of [1030, 1800]) {
            await page.setViewportSize({ width, height: 1000 });
            await ready(page);
            await expect(page.getByRole("button", { name: "More document actions", exact: true })).toHaveCount(0);
            await expect(page.getByRole("menu", { name: "Document actions", exact: true })).toHaveCount(0);
            await expect(page.getByRole("button", { name: "Rotate 90°", exact: true })).toBeVisible();
            await expect(zoom.getByRole("option", { name: "Fit page", exact: true })).toHaveCount(1);
            await expect(zoom.getByRole("option", { name: "Fit width", exact: true })).toHaveCount(1);
            await zoom.selectOption("width");
            await ready(page);
            await expect(zoom).toHaveAttribute("title", "Fit width");
            await expect.poll(async () => {
                const frame = await measure();
                return Math.abs(frame.width - frame.availableWidth);
            }).toBeLessThanOrEqual(1);
            await zoom.selectOption("page");
            await ready(page);
            await expect(zoom).toHaveAttribute("title", "Fit page");
            await expect.poll(async () => {
                const frame = await measure();
                return frame.width <= frame.availableWidth + 1 && frame.height <= frame.availableHeight + 1 &&
                    Math.min(Math.abs(frame.width - frame.availableWidth), Math.abs(frame.height - frame.availableHeight)) <= 1;
            }).toBe(true);
            if (sample === "PDF") await expect(page.getByRole("textbox", { name: "Page number", exact: true })).toHaveValue("4");
            else await expect(page.getByText("Image \u00b7 single page", { exact: true })).toBeVisible();
        }
    });
}

for (const sample of ["PDF", "Receipt PNG"]) {
    test(`BUG-009 / BUG-003 ${sample} shares one row with status, centered navigation and right-aligned zoom`, async ({ page }) => {
        await page.setViewportSize({ width: 1800, height: 1000 });
        await page.goto("/");
        await ready(page);
        if (sample !== "PDF") {
            await page.getByRole("button", { name: sample, exact: true }).click();
            await ready(page);
        }
        const splitter = page.getByRole("separator", { name: "Source and results width", exact: true });
        for (const width of [570, 740, 1040]) {
            const pane = await page.locator(".cu-source-pane").boundingBox(), handle = await splitter.boundingBox();
            if (!pane || !handle) throw new Error("The Source resize handle is unavailable.");
            await page.mouse.move(handle.x + handle.width / 2, handle.y + 30);
            await page.mouse.down();
            await page.mouse.move(handle.x + handle.width / 2 + width - pane.width, handle.y + 30, { steps: 4 });
            await page.mouse.up();
            await ready(page);
            await expect(page.locator(".cu-preview-dock")).toHaveCount(0);
            await expect(page.getByText("Ctrl / Cmd + scroll to zoom \u00b7 Drag to pan", { exact: true })).toHaveCount(0);
            const geometry = await page.locator(".cu-source-pane").evaluate(element => {
                const bounds = element.getBoundingClientRect();
                const rect = (selector: string) => {
                    const node = element.querySelector(selector);
                    if (!node) throw new Error(`Missing Source control: ${selector}`);
                    const box = node.getBoundingClientRect();
                    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, height: box.height };
                };
                const bar = element.querySelector(".cu-source-view-toolbar")!;
                return { left: bounds.left, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height,
                    header: rect(".cu-source-toolbar"),
                    bar: rect(".cu-source-view-toolbar"), navigation: rect(".cu-page-controls"),
                    zoom: rect(".cu-view-controls"), viewport: rect(".cu-document-container"),
                    status: rect(".cu-document-status"), overflow: bar.scrollWidth - bar.clientWidth };
            });
            expect(Math.abs(geometry.width - width)).toBeLessThanOrEqual(1);
            expect(geometry.bar.height).toBe(44);
            expect(Math.abs((geometry.navigation.left + geometry.navigation.right) / 2 -
                (geometry.left + geometry.right) / 2)).toBeLessThanOrEqual(1);
            expect(geometry.zoom.left - geometry.navigation.right).toBeGreaterThanOrEqual(16);
            expect(Math.abs(geometry.right - geometry.zoom.right - (width <= 740 ? 10 : 16))).toBeLessThanOrEqual(1);
            expect(geometry.bar.top - geometry.viewport.bottom).toBeGreaterThanOrEqual(0);
            expect(Math.abs(geometry.bar.bottom - geometry.bottom)).toBeLessThanOrEqual(1);
            expect(Math.abs(geometry.viewport.height - (geometry.height - geometry.header.height - geometry.bar.height))).toBeLessThanOrEqual(1);
            expect(geometry.status.left).toBeGreaterThanOrEqual(geometry.left);
            expect(geometry.status.right).toBeLessThanOrEqual(geometry.navigation.left + 1);
            expect(geometry.status.top).toBeGreaterThanOrEqual(geometry.bar.top);
            expect(geometry.status.bottom).toBeLessThanOrEqual(geometry.bar.bottom);
            expect(geometry.overflow).toBeLessThanOrEqual(1);
            await expect(page.locator(".cu-source-toolbar .cu-page-controls, .cu-source-toolbar .cu-view-controls")).toHaveCount(0);
            await expect(page.getByRole("button", { name: "Clear selection", exact: true })).toHaveCount(0);
            await expect(page.locator(".cu-document-status button")).toHaveCount(0);
            if (sample === "PDF") {
                await page.getByRole("button", { name: "Next page", exact: true }).click();
                await ready(page);
            } else await expect(page.getByText("Image \u00b7 single page", { exact: true })).toBeVisible();
            const input = page.getByRole("textbox", { name: "Page number", exact: true });
            const pageNumber = sample === "PDF" ? await input.inputValue() : null;
            const zoom = page.getByRole("combobox", { name: "Zoom", exact: true });
            const before = Number(await zoom.inputValue());
            const zoomIn = page.getByRole("button", { name: "Zoom in", exact: true });
            await zoomIn.click();
            await ready(page);
            expect(Number(await zoom.inputValue())).toBeGreaterThan(before);
            await expect(zoomIn).toBeFocused();
            if (pageNumber !== null) await expect(input).toHaveValue(pageNumber);
            await zoom.selectOption("page");
            await ready(page);
        }
    });
}

for (const width of [1030, 1800]) {
    test(`BUG-009 functional source status stays usable without changing the viewport at ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await loadReviewFixture(page);
        const content = reviewFixture.contents[0];
        if (!content) throw new Error("The review content fixture is unavailable.");
        const groupName = "ReviewGroupWithALongNameAndCrossPageSources";
        await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
            name: "source-status-review.json", mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify({ ...reviewFixture, contents: [{ ...content,
                fields: { ...content.fields, [groupName]: { type: "object", valueObject: {
                    First: content.fields.InvoiceId, Second: content.fields.CrossPage,
                } } },
            }] })),
        });
        await ready(page);
        const viewport = page.getByRole("group", { name: "Source viewport", exact: true });
        const initial = await viewport.boundingBox();
        const initialZoom = await page.getByLabel("Zoom percentage").textContent();
        if (!initial || !initialZoom) throw new Error("The fitted source viewport is unavailable.");
        const status = page.getByRole("group", { name: "Source selection and location", exact: true });
        const stable = async (): Promise<void> => {
            await ready(page);
            await expect(status.getByRole("button", { name: "Clear selection", exact: true })).toHaveCount(0);
            const current = await viewport.boundingBox();
            if (!current) throw new Error("The source viewport disappeared.");
            expect(current).toEqual(initial);
            await expect(page.getByLabel("Zoom percentage")).toHaveText(initialZoom);
            const layout = await status.evaluate(element => {
                const bounds = element.getBoundingClientRect();
                return { overflow: element.scrollWidth - element.clientWidth,
                    controls: [...element.querySelectorAll("button, select")].map(control => {
                        const rect = control.getBoundingClientRect();
                        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
                        return { left: rect.left - bounds.left, right: rect.right - bounds.right,
                            top: rect.top - bounds.top, bottom: rect.bottom - bounds.bottom,
                            width: rect.width, height: rect.height, hit: hit === control || control.contains(hit) };
                    }) };
            });
            expect(layout.overflow).toBeLessThanOrEqual(1);
            for (const control of layout.controls) {
                expect(control.left).toBeGreaterThanOrEqual(0);
                expect(control.right).toBeLessThanOrEqual(0);
                expect(control.top).toBeGreaterThanOrEqual(0);
                expect(control.bottom).toBeLessThanOrEqual(0);
                expect(control.width).toBeGreaterThanOrEqual(24);
                expect(control.height).toBeGreaterThanOrEqual(24);
                expect(control.hit).toBe(true);
            }
        };
        await expect(viewport).toHaveAccessibleDescription(/Ctrl or Command with scroll zooms at the pointer/);
        await expect(page.locator(".cu-preview-dock")).toHaveCount(0);
        await expect(status.getByRole("button")).toHaveCount(0);
        await page.getByRole("button", { name: "Ungrounded", exact: true }).hover();
        await expect(status.locator(".cu-preview-hint")).toHaveText("Ungrounded: no source region");
        await stable();
        await page.getByRole("button", { name: "InvoiceId", exact: true }).click();
        await expect(page.getByTestId("source-overlay")).toBeVisible();
        await stable();
        await viewport.press("Escape");
        await expect(page.getByTestId("source-overlay")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "InvoiceId", exact: true })).toHaveAttribute("aria-pressed", "false");
        await stable();
        await page.getByRole("button", { name: "MultiRegion", exact: true }).click();
        const next = status.getByRole("button", { name: "Next source region", exact: true });
        const previous = status.getByRole("button", { name: "Previous source region", exact: true });
        await expect(status.getByText("1 / 2", { exact: true })).toBeVisible();
        await expect(next).toHaveAccessibleDescription("1 region on p.1 \u00b7 Location 1 of 2");
        await stable();
        await next.click();
        await ready(page);
        await expect(page.getByRole("textbox", { name: "Page number", exact: true })).toHaveValue("2");
        await expect(status.getByText("2 / 2", { exact: true })).toBeVisible();
        await expect(previous).toHaveAccessibleDescription("1 region on p.2 \u00b7 Location 2 of 2");
        await expect(previous).toBeFocused();
        await stable();
        await previous.click();
        await stable();
        await page.getByRole("button", { name: "CrossPage", exact: true }).click();
        await ready(page);
        await page.getByRole("textbox", { name: "Page number", exact: true }).fill("1");
        await page.getByRole("textbox", { name: "Page number", exact: true }).press("Enter");
        await expect(status.locator(".cu-preview-hint")).toHaveText("Selected source is on page 2");
        await stable();
        await locateGroup(page, `/contents/0/fields/${groupName}`);
        const groupPage = status.getByRole("combobox", { name: "Selected group source page", exact: true });
        await expect(status.locator(".cu-group-source-controls strong")).toHaveAttribute("title", groupName);
        await expect(groupPage).toHaveAccessibleDescription(/2 fields.*regions on p\.1/);
        await stable();
        await groupPage.focus();
        await groupPage.selectOption("2");
        await ready(page);
        await expect(groupPage).toHaveValue("2");
        await expect(groupPage).toHaveAccessibleDescription(/2 fields.*regions on p\.2/);
        await expect(groupPage).toBeFocused();
        await stable();
        await page.mouse.click(initial.x + 5, initial.y + 5);
        await expect(status.locator(".cu-group-source-controls, .cu-region-controls, .cu-preview-hint")).toHaveCount(0);
        await expect(status.getByRole("button")).toHaveCount(0);
        await expect(page.getByTestId("source-overlay")).toHaveCount(0);
        await stable();
        await page.getByRole("button", { name: "Previous page", exact: true }).focus();
        await page.keyboard.press("Tab");
        await expect(page.getByRole("textbox", { name: "Page number", exact: true })).toBeFocused();
    });
}

test("BUG-003 bottom page input keeps validation, keyboard navigation and focus after redraw", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const input = page.getByRole("textbox", { name: "Page number", exact: true });
    await input.fill("2");
    await input.press("Enter");
    await ready(page);
    await expect(input).toHaveValue("2");
    await expect(input).toBeFocused();
    await input.fill("5");
    await input.press("Enter");
    await expect(page.getByRole("alert")).toHaveText("Enter an existing page number.");
    await input.fill("1");
    await input.press("Tab");
    await ready(page);
    await expect(input).toHaveValue("1");
    await expect(page.getByRole("button", { name: "Next page", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Zoom out", exact: true })).toBeFocused();
    await expect(page.getByRole("group", { name: "Document navigation and zoom", exact: true })).toBeVisible();
});

for (const pageError of [false, true]) {
    test(`BUG-003 short-window panels leave bottom controls reachable with page error ${pageError}`, async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 540 });
        await page.goto("/");
        await ready(page);
        const pageInput = page.getByRole("textbox", { name: "Page number", exact: true });
        if (pageError) {
            await pageInput.fill("5");
            await pageInput.press("Enter");
            await expect(page.getByRole("alert")).toHaveText("Enter an existing page number.");
        }
        for (const [trigger, name] of [["Highlighting settings", "Highlighting"], ["Highlighting legend", "Legend"]] as const) {
            await page.getByRole("button", { name: trigger, exact: true }).click();
            const panel = page.getByRole("dialog", { name, exact: true });
            if (name === "Highlighting") await panel.getByRole("spinbutton", { name: "Confidence threshold", exact: true }).fill("");
            await expect.poll(async () => {
                const popup = await panel.boundingBox(), controls = await page.locator(".cu-source-view-toolbar").boundingBox();
                if (!popup || !controls) throw new Error("Source panel bounds are unavailable.");
                return controls.y - popup.y - popup.height;
            }).toBeGreaterThanOrEqual(7);
            await expect(page.getByRole("group", { name: "Source viewport", exact: true })).toHaveAttribute("aria-disabled", "false");
            const zoomIn = page.getByRole("button", { name: "Zoom in", exact: true });
            expect(await zoomIn.evaluate(element => {
                const rect = element.getBoundingClientRect();
                return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest("button") === element;
            })).toBe(true);
            await zoomIn.click();
            await expect(panel).toHaveCount(0);
            await expect(page.getByRole("group", { name: "Source viewport", exact: true })).toHaveAttribute("aria-disabled", "false");
            await expect(zoomIn).toBeFocused();
        }
        if (pageError) {
            await pageInput.fill("1");
            await pageInput.press("Enter");
        }
        await ready(page);
    });
}

test("BUG-002 file-type colors affect only the decorative glyph", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const palette = [
        ["filePdf", "rgb(59, 111, 182)"], ["fileImage", "rgb(8, 126, 139)"],
        ["fileDocument", "rgb(37, 99, 235)"], ["fileSpreadsheet", "rgb(21, 128, 61)"],
        ["fileSlides", "rgb(192, 86, 33)"], ["fileBook", "rgb(124, 58, 237)"],
        ["fileText", "rgb(102, 116, 135)"], ["fileCode", "rgb(79, 70, 229)"],
        ["fileMail", "rgb(3, 105, 161)"], ["file", "rgb(102, 116, 135)"],
    ] as const;
    const filename = page.locator(".cu-file-name strong");
    const textColor = await filename.evaluate(element => getComputedStyle(element).color);
    const actual = await page.locator(".cu-file-icon").evaluate((element, kinds) => {
        const svg = element.querySelector("svg"), host = element.parentElement;
        if (!svg || !host) throw new Error("The decorative file icon is missing.");
        const glyph = svg.cloneNode(true);
        if (!(glyph instanceof SVGElement)) throw new Error("Expected an SVG glyph.");
        const probe = document.createElement("span");
        probe.className = "cu-file-icon";
        probe.setAttribute("aria-hidden", "true");
        probe.appendChild(glyph);
        host.appendChild(probe);
        try {
            return kinds.map(kind => {
                probe.dataset.fileIcon = kind;
                const style = getComputedStyle(probe);
                return { color: style.color, glyphColor: getComputedStyle(glyph).color,
                    border: style.borderWidth, background: style.backgroundColor };
            });
        } finally {
            probe.remove();
        }
    }, palette.map(([kind]) => kind));
    expect(actual).toEqual(palette.map(([, color]) => ({
        color, glyphColor: color, border: "0px", background: "rgba(0, 0, 0, 0)",
    })));
    await expect(filename).toHaveCSS("color", textColor);
    await expect(page.locator(".cu-file-icon")).toHaveCount(1);
});

for (const [sample, name, details] of [
    ["PDF", "mixed-financial-docs.pdf", "PDF \u00b7 4 pages"],
    ["Receipt PNG", "receipt.png", "1743 \u00d7 878 px"],
] as const) {
    test(`BUG-002 ${sample} shows a borderless decorative file icon at compact and wide widths`, async ({ page }) => {
        await page.goto("/");
        await ready(page);
        if (sample !== "PDF") {
            await page.getByRole("button", { name: sample, exact: true }).click();
            await ready(page);
        } else {
            const input = page.getByRole("textbox", { name: "Page number", exact: true });
            await input.fill("4");
            await input.press("Enter");
            await ready(page);
        }
        const file = page.locator(".cu-file-name"), filename = file.locator("strong"), icon = file.locator(".cu-file-icon");
        const information = page.getByLabel("Source information");
        const summary = `${name} \u00b7 ${details}`;
        for (const width of [1030, 1800, 2100]) {
            await page.setViewportSize({ width, height: 1000 });
            await ready(page);
            await expect(file.locator(":scope > *")).toHaveCount(2);
            await expect(icon).toHaveAttribute("aria-hidden", "true");
            await expect(icon).toHaveAttribute("data-file-icon", sample === "PDF" ? "filePdf" : "fileImage");
            await expect(icon.locator("svg")).toHaveCount(1);
            await expect(icon.locator("svg")).toHaveAttribute("focusable", "false");
            await expect(icon.locator("svg")).toHaveAttribute("viewBox", "0 0 16 16");
            await expect(icon.locator("svg")).toHaveCSS("fill", sample === "PDF" ? "rgb(59, 111, 182)" : "rgb(8, 126, 139)");
            await expect(icon.locator("svg")).toHaveCSS("stroke", "none");
            await expect(file.getByRole("img")).toHaveCount(0);
            await expect(file.locator("button, a, [role='button'], [tabindex]")).toHaveCount(0);
            await expect(icon).toHaveCSS("width", "16px");
            await expect(icon).toHaveCSS("height", "16px");
            await expect(icon).toHaveCSS("border-width", "0px");
            await expect(icon).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
            await expect(icon).toHaveCSS("box-shadow", "none");
            await expect(icon).toHaveCSS("pointer-events", "none");
            await expect(icon).toHaveCSS("color", sample === "PDF" ? "rgb(59, 111, 182)" : "rgb(8, 126, 139)");
            await expect(page.locator(".cu-kind-badge")).toHaveCount(0);
            await expect(filename).toHaveText(name);
            await expect(filename).toHaveAttribute("title", summary);
            await expect(information).toHaveText(summary);
            const summaryId = await information.getAttribute("id");
            if (!summaryId) throw new Error("The source summary has no accessible description target.");
            expect((await page.getByRole("group", { name: "Source viewport", exact: true })
                .getAttribute("aria-describedby"))?.split(/\s+/)).toContain(summaryId);
            const layout = await page.locator(".cu-source-toolbar").evaluate(element => {
                const bounds = element.getBoundingClientRect();
                const slots = [".cu-file-name", ".cu-toolbar-legend", ".cu-source-actions"].map(selector => {
                    const child = element.querySelector(selector);
                    if (!child) throw new Error(`The toolbar slot ${selector} is missing.`);
                    const rect = child.getBoundingClientRect();
                    return { left: rect.left, right: rect.right };
                });
                return { left: bounds.left, right: bounds.right, height: bounds.height,
                    overflow: element.scrollWidth - element.clientWidth, slots };
            });
            expect(layout.height).toBe(57);
            expect(layout.overflow).toBeLessThanOrEqual(1);
            for (const [index, slot] of layout.slots.entries()) {
                expect(slot.left).toBeGreaterThanOrEqual(layout.left);
                expect(slot.right).toBeLessThanOrEqual(layout.right);
                if (index) expect(slot.left - layout.slots[index - 1]!.right).toBeGreaterThanOrEqual(4);
            }
            const zoom = await page.getByRole("combobox", { name: "Zoom", exact: true }).inputValue();
            const iconBounds = await icon.boundingBox();
            if (!iconBounds) throw new Error("The decorative file icon is not laid out.");
            await page.mouse.click(iconBounds.x + iconBounds.width / 2, iconBounds.y + iconBounds.height / 2);
            await filename.hover();
            await filename.click();
            await expect(page.getByRole("combobox", { name: "Zoom", exact: true })).toHaveValue(zoom);
            if (sample === "PDF") await expect(page.getByRole("textbox", { name: "Page number", exact: true })).toHaveValue("4");
            else await expect(page.getByText("Image \u00b7 single page", { exact: true })).toBeVisible();
        }
    });
}

test("BUG-002 long filenames keep full hover and accessible text while truncating without overflow", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const name = `quarterly-statement-${"review-copy-".repeat(12)}.pdf`;
    await page.getByLabel("Choose source file").setInputFiles({
        name, mimeType: "application/pdf", buffer: standardFontPdf(),
    });
    await expect(page.getByLabel("Source information")).toContainText(name);
    await ready(page);
    const filename = page.locator(".cu-file-name strong");
    for (const width of [1030, 2100]) {
        await page.setViewportSize({ width, height: 1000 });
        await ready(page);
        await expect(filename).toHaveText(name);
        await expect(filename).toHaveAttribute("title", `${name} \u00b7 PDF \u00b7 1 pages`);
        await expect(filename).toHaveCSS("text-overflow", "ellipsis");
        const layout = await filename.evaluate(element => ({
            truncated: element.scrollWidth > element.clientWidth, width: element.clientWidth,
            overflow: element.closest(".cu-source-toolbar")!.scrollWidth - element.closest(".cu-source-toolbar")!.clientWidth,
        }));
        expect(layout.truncated).toBe(true);
        expect(layout.width).toBeGreaterThan(0);
        expect(layout.overflow).toBeLessThanOrEqual(1);
        await expect(page.locator(".cu-file-icon")).toHaveCount(1);
        await expect(page.locator(".cu-file-icon")).toHaveAttribute("data-file-icon", "filePdf");
        await expect(page.locator(".cu-kind-badge")).toHaveCount(0);
    }
});

for (const sample of ["PDF", "Receipt PNG"]) {
    test(`BUG-001/005 ${sample} keeps one direct rotation command at every supported width`, async ({ page }) => {
        await page.setViewportSize({ width: 1800, height: 1000 });
        await page.goto("/");
        await ready(page);
        if (sample !== "PDF") {
            await page.getByRole("button", { name: sample, exact: true }).click();
            await ready(page);
        }
        const splitter = page.getByRole("separator", { name: "Source and results width", exact: true });
        const rotate = page.getByRole("button", { name: "Rotate 90°", exact: true });
        for (const width of [741, 740, 570, 1040]) {
            const pane = await page.locator(".cu-source-pane").boundingBox(), handle = await splitter.boundingBox();
            if (!pane || !handle) throw new Error("The source resize handle is unavailable.");
            await page.mouse.move(handle.x + handle.width / 2, handle.y + 30);
            await page.mouse.down();
            await page.mouse.move(handle.x + handle.width / 2 + width - pane.width, handle.y + 30, { steps: 4 });
            await page.mouse.up();
            await expect.poll(async () => Math.abs(await page.locator(".cu-source-pane").evaluate(element =>
                element.getBoundingClientRect().width) - width)).toBeLessThanOrEqual(1);
            await ready(page);
            await expect(rotate).toHaveCount(1);
            await expect(rotate).toBeVisible();
            await expect(rotate).toBeEnabled();
            await expect(page.getByRole("button", { name: "More document actions", exact: true })).toHaveCount(0);
            await expect(page.getByRole("menu", { name: "Document actions", exact: true })).toHaveCount(0);
            const expectedRatio = await page.getByTestId("rendered-page").evaluate(element => {
                const bounds = element.getBoundingClientRect();
                return bounds.height / bounds.width;
            });
            const pageNumber = sample === "PDF" ? await page.getByRole("textbox", { name: "Page number", exact: true }).inputValue() : null;
            await rotate.press("Enter");
            await expect.poll(() => page.getByTestId("rendered-page").evaluate(element => {
                const bounds = element.getBoundingClientRect();
                return bounds.width / bounds.height;
            })).toBeCloseTo(expectedRatio, 3);
            await ready(page);
            await expect(rotate).toBeFocused();
            if (pageNumber !== null) await expect(page.getByRole("textbox", { name: "Page number", exact: true })).toHaveValue(pageNumber);
            else await expect(page.getByText("Image \u00b7 single page", { exact: true })).toBeVisible();
        }
    });
}

test("BUG-005 compact controls expose rotation directly in the native keyboard order", async ({ page }) => {
    await page.setViewportSize({ width: 1030, height: 760 });
    await page.goto("/");
    await ready(page);
    const rotate = page.getByRole("button", { name: "Rotate 90°", exact: true });
    await expect(rotate).toBeVisible();
    await page.getByRole("button", { name: "Zoom in", exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(rotate).toBeFocused();
    await page.keyboard.press("Enter");
    await ready(page);
    await expect(rotate).toBeFocused();
    await expect(page.getByRole("button", { name: "More document actions", exact: true })).toHaveCount(0);
});

test("BUG-005 removing the layout menu retains both separator double-click defaults", async ({ page }) => {
    await page.setViewportSize({ width: 1800, height: 1000 });
    await page.goto("/");
    await ready(page);
    for (const name of ["Source and results width", "Field column width"]) {
        const handle = page.getByRole("separator", { name, exact: true });
        const initial = Number(await handle.getAttribute("aria-valuenow"));
        await handle.focus();
        await page.keyboard.press("ArrowLeft");
        await expect.poll(async () => Number(await handle.getAttribute("aria-valuenow"))).toBeLessThan(initial);
        await handle.dblclick();
        await expect.poll(async () => Math.abs(Number(await handle.getAttribute("aria-valuenow")) - initial)).toBeLessThanOrEqual(1);
        await ready(page);
    }
    await expect(page.getByRole("button", { name: "More document actions", exact: true })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Reset layout widths", exact: true })).toHaveCount(0);
});

for (const viewport of [{ width: 1536, height: 960 }, { width: 1440, height: 1000 }, { width: 1280, height: 800 }, { width: 1030, height: 760 }]) {
    test(`BUG-007 / UI-33/54 settings and compact review toolbar at ${viewport.width}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await loadReviewFixture(page);
        await expect(page.getByRole("button", { name: "View selected value", exact: true })).toHaveCount(0);
        for (const columns of [2, 3]) {
            await page.getByRole("button", { name: `${columns} columns`, exact: true }).click();
            await expect(page.locator(".cu-field-navigation > button")).toHaveCount(2);
            await expect(page.getByRole("button", { name: "Previous field", exact: true })).toBeEnabled();
            await expect(page.getByRole("button", { name: "Next field", exact: true })).toBeEnabled();
            const layout = await page.locator(".cu-fields-pane").evaluate(element => ({
                controlsHeight: element.querySelector(".cu-fields-controls")!.getBoundingClientRect().bottom - element.getBoundingClientRect().top,
                overflow: element.scrollWidth - element.clientWidth,
                toolbarOverflow: element.querySelector(".cu-review-toolbar")!.scrollWidth - element.querySelector(".cu-review-toolbar")!.clientWidth,
            }));
            expect(layout.controlsHeight).toBeLessThanOrEqual(150);
            expect(layout.overflow).toBeLessThanOrEqual(1);
            expect(layout.toolbarOverflow).toBeLessThanOrEqual(1);
        }
        await expect(page.getByRole("button", { name: "Previous page", exact: true })).toHaveCSS("width", "30px");
        await expect(page.getByRole("button", { name: "Next page", exact: true })).toHaveCSS("height", "30px");
        await page.getByRole("button", { name: "Highlighting settings", exact: true }).click();
        const panel = page.getByRole("dialog", { name: "Highlighting", exact: true });
        await expect(panel).toHaveCSS("width", "326px");
        await expect(panel.getByRole("heading", { name: "Highlighting", exact: true })).toHaveCSS("font-size", "18px");
        const threshold = panel.getByRole("spinbutton", { name: "Confidence threshold", exact: true });
        await expect(threshold).toHaveValue("0.70");
        await expect(threshold).toHaveCSS("width", "116px");
        await expect(threshold).toHaveCSS("font-size", "12px");
        await expect(threshold).toHaveAttribute("min", "0");
        await expect(threshold).toHaveAttribute("max", "1");
        await expect(threshold).toHaveAttribute("step", "0.01");
        await expect(threshold).toBeFocused();
        await threshold.press("ArrowUp");
        await expect(threshold).toHaveJSProperty("valueAsNumber", 0.71);
        await threshold.press("ArrowDown");
        await expect(threshold).toHaveJSProperty("valueAsNumber", 0.7);
        await expect(panel.locator(".cu-switch-row").first()).toHaveCSS("font-size", "11px");
        await expect(panel.getByText("Highlighting never changes the extracted data.", { exact: true })).toHaveCount(0);
        await expect(panel.locator(".cu-panel-footnote")).toHaveCount(0);
        expect(await panel.evaluate(element => element.lastElementChild?.classList.contains("cu-highlight-options"))).toBe(true);
        await expect(panel.locator(".cu-switch-track")).toHaveCount(3);
        await expect(panel.locator(".cu-switch-track").first()).toHaveCSS("width", "35px");
        await expect(panel.locator(".cu-switch-track").first()).toHaveCSS("height", "21px");
        await expect(panel.locator(".cu-legend-swatch")).toHaveCount(0);
        expect(await panel.locator(".cu-switch-track").first().evaluate(element =>
            getComputedStyle(element, "::after").transitionDuration)).toBe("0s");
        const bounds = await panel.boundingBox(), pane = await page.locator(".cu-source-pane").boundingBox();
        if (!bounds || !pane) throw new Error("Highlighting panel is not laid out.");
        expect(bounds.y).toBe(pane.y + 50);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(pane.y + pane.height);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("button", { name: "Highlighting settings", exact: true })).toBeFocused();
        await page.getByRole("button", { name: "Highlighting legend", exact: true }).click();
        const legend = page.getByRole("dialog", { name: "Legend", exact: true });
        await expect(legend.locator(".cu-legend-swatch")).toHaveCount(5);
        await expect(legend.locator(".cu-legend-swatch").first()).toHaveCSS("width", "33px");
        await expect(legend.locator(".cu-legend-swatch").first()).toHaveCSS("height", "28px");
        await page.keyboard.press("Escape");
        await expect(page.getByRole("button", { name: "Highlighting legend", exact: true })).toBeFocused();
    });

    test(`UI-33 below-source flyover uses the shared 12px gap at ${viewport.width}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await loadReviewFixture(page);
        const target = source(page, "/contents/0/fields/InvoiceId");
        await target.click();
        const popup = page.getByRole("tooltip", { name: "Field preview", exact: true });
        await expect(popup).toBeVisible();
        await expect.poll(async () => {
            const card = await popup.boundingBox(), anchor = await target.boundingBox();
            if (!card || !anchor) throw new Error("Source/flyover geometry is unavailable.");
            return Math.abs(card.y - anchor.y - anchor.height - 12);
        }).toBeLessThanOrEqual(1);
        const card = await popup.boundingBox(), viewportBounds = await page.getByRole("group", { name: "Source viewport", exact: true }).boundingBox();
        if (!card || !viewportBounds) throw new Error("Complete source preview is unavailable.");
        expect(card.width).toBeGreaterThanOrEqual(148);
        expect(card.width).toBeLessThanOrEqual(248);
        expect(card.y + card.height).toBeLessThanOrEqual(viewportBounds.y + viewportBounds.height);
    });
}

test("UI-33 source visibility never clears right-hand low-confidence emphasis", async ({ page }) => {
    await loadReviewFixture(page);
    await page.getByRole("button", { name: "Expand LineItems", exact: true }).click();
    const field = page.locator(fieldRow(recipientId)).locator(".cu-value-chip");
    const cell = page.locator(`.cu-cell-content${fieldRow(cellId)}`).locator(".cu-value-chip");
    const pixels = await page.getByTestId("source-canvas").evaluate(element => {
        if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected an original source canvas.");
        return element.toDataURL();
    });
    await page.getByRole("button", { name: "Highlighting settings", exact: true }).click();
    await page.getByRole("switch", { name: "Show field highlights", exact: true }).uncheck();
    await page.getByRole("switch", { name: "Show table highlights", exact: true }).uncheck();
    await expect(source(page, recipientId)).toHaveAttribute("fill", "none");
    await expect(source(page, cellId)).toHaveAttribute("fill", "none");
    await expect(field).toHaveCSS("background-color", "rgb(252, 232, 230)");
    await expect(cell).toHaveCSS("background-color", "rgb(255, 232, 236)");
    await page.getByRole("button", { name: "Close highlighting settings", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Tables", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Highlighting settings", exact: true }).click();
    await page.getByRole("switch", { name: "Show low confidence highlight", exact: true }).uncheck();
    await expect(cell).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await page.getByRole("button", { name: "Close highlighting settings", exact: true }).click();
    await page.getByRole("tab", { name: "Fields", exact: true }).click();
    await expect(field).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(cell).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    expect(await page.getByTestId("source-canvas").evaluate(element => {
        if (!(element instanceof HTMLCanvasElement)) throw new Error("Original source canvas disappeared.");
        return element.toDataURL();
    })).toBe(pixels);
});

test("UI-55 field-level F2 survives shortcut removal without relocating source or stealing later source focus", async ({ page }) => {
    await loadReviewFixture(page);
    await source(page, recipientId).click();
    await expect(page.getByRole("button", { name: "View selected value", exact: true })).toHaveCount(0);
    const button = page.locator(fieldRow(recipientId)).locator(".cu-field-name");
    const frame = await page.getByTestId("rendered-page").boundingBox();
    const viewport = page.getByRole("group", { name: "Source viewport", exact: true });
    const scroll = await viewport.evaluate(element => element.scrollTop);
    await button.press("F2");
    await expect(page.getByRole("region", { name: "Full value and confidence" })).toContainText("Microsoft Corp");
    await expect(button).toBeFocused();
    expect(await page.getByTestId("rendered-page").boundingBox()).toEqual(frame);
    expect(await viewport.evaluate(element => element.scrollTop)).toBe(scroll);
    await source(page, "/contents/0/fields/Zero").click();
    await expect(page.getByLabel("Full extracted value", { exact: true })).toHaveText("0");
    await expect(viewport).toBeFocused();
    await page.getByRole("button", { name: "Close full value details", exact: true }).click();
    await viewport.press("Escape");
    await expect(page.getByRole("button", { name: "View selected value", exact: true })).toHaveCount(0);
    await locateGroup(page, "/contents/0/fields/Customer");
    await expect(page.getByRole("button", { name: "View selected value", exact: true })).toHaveCount(0);
});

test("UI-55 field counts and previous/next navigation remain without an information shortcut", async ({ page }) => {
    await loadReviewFixture(page);
    const navigation = page.locator(".cu-field-navigation");
    const count = await navigation.locator("span").textContent();
    await expect(navigation.locator("button")).toHaveCount(2);
    await page.getByRole("button", { name: "Next field", exact: true }).click();
    const pin = page.getByTestId("source-overlay").locator("polygon").first();
    const first = await pin.getAttribute("data-source-id");
    if (!first) throw new Error("The first navigated field has no source selection.");
    await page.getByRole("button", { name: "Next field", exact: true }).click();
    await expect(pin).not.toHaveAttribute("data-source-id", first);
    await page.getByRole("button", { name: "Previous field", exact: true }).click();
    await expect(pin).toHaveAttribute("data-source-id", first);
    expect(await navigation.locator("span").textContent()).toBe(count);
    await expect(page.getByRole("button", { name: "View selected value", exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Full value and confidence" })).toHaveCount(0);
});

test("UI-33/47 groups keep blank confidence and hover-only page actions without selected-count labels", async ({ page }) => {
    await loadReviewFixture(page);
    await page.getByRole("button", { name: "3 columns", exact: true }).click();
    const row = page.locator(fieldRow("/contents/0/fields/CustomerAddress"));
    await page.locator(".prototype-banner").hover();
    await expect(row.locator(".cu-page-badge")).toBeHidden();
    await expect(row.locator(".cu-confidence")).toHaveText("");
    const before = await row.evaluate(element => ({ height: element.getBoundingClientRect().height, width: element.getBoundingClientRect().width }));
    await row.hover();
    await expect(row.locator(".cu-page-badge")).toBeVisible();
    await locateGroup(page, "/contents/0/fields/CustomerAddress");
    await expect(row.locator(".cu-group-selection-count")).toHaveCount(0);
    await expect(page.getByTestId("source-overlay").locator("polygon")).toHaveCount(2);
    expect(await row.evaluate(element => ({ height: element.getBoundingClientRect().height, width: element.getBoundingClientRect().width }))).toEqual(before);
    await page.getByRole("group", { name: "Source viewport", exact: true }).focus();
    await page.locator(".prototype-banner").hover();
    await expect(row.locator(".cu-page-badge")).toBeHidden();
});

test("UI-33 inline array defaults match the reference and value actions retain icons and keyboard behavior", async ({ page }) => {
    await loadReviewFixture(page);
    await page.getByRole("button", { name: "Expand LineItems", exact: true }).click();
    const grid = page.getByRole("table", { name: "LineItems values", exact: true });
    await expect(grid.getByRole("columnheader").nth(1)).toHaveCSS("text-align", "left");
    await expect(grid.getByRole("columnheader").nth(1)).toHaveCSS("font-weight", "600");
    await expect(grid.getByRole("rowheader").first()).toHaveCSS("font-weight", "400");
    await expect(grid.getByRole("rowheader").first()).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await openValueMenu(page, recipientId);
    const menu = page.getByRole("menu", { name: "Value actions", exact: true });
    await expect(menu).toHaveCSS("width", "240px");
    await expect(menu.locator("svg")).toHaveCount(3);
    await page.keyboard.press("End");
    await expect(menu.getByRole("menuitem", { name: "Copy value", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "Locate on page 1", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "More document actions", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Rotate 90°", exact: true })).toBeVisible();
});

test("UI-33 threshold stepping, exact precision and invalid-input feedback remain truthful", async ({ page }) => {
    await loadReviewFixture(page);
    await page.getByRole("button", { name: "Highlighting settings", exact: true }).click();
    const threshold = page.getByRole("spinbutton", { name: "Confidence threshold", exact: true });
    await threshold.press("ArrowUp");
    await expect(threshold).toHaveValue("0.71");
    await threshold.press("ArrowDown");
    await expect(threshold).toHaveValue("0.7");
    await threshold.fill("0.699");
    await expect(page.locator(".cu-setting-hint strong")).toHaveText("0.699");
    const boundary = source(page, "/contents/0/fields/Boundary");
    await expect(boundary).toHaveAttribute("fill", "#E8F5E9");
    await threshold.fill("");
    await expect(threshold).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("alert")).toContainText("Enter a confidence threshold");
    await expect(boundary).toHaveAttribute("fill", "#E8F5E9");
    await threshold.fill("1.01");
    await expect(page.getByRole("alert")).toContainText("finite");
    await threshold.fill("0.70");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(boundary).toHaveAttribute("fill", "#FCE8E6");
    await page.keyboard.press("Escape");
    await ready(page);
});

for (const kind of ["pdf", "image"] as const) {
    test(`UI-34 ${kind} displays exact reference colors without covering original glyphs`, async ({ page }) => {
        await loadReviewFixture(page);
        if (kind === "image") {
            const png = await page.getByTestId("source-canvas").evaluate(element => {
                if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected the rendered reference document.");
                return element.toDataURL("image/png").split(",")[1]!;
            });
            await page.getByLabel("Choose source file").setInputFiles({
                name: "synthetic-color-proof.png", mimeType: "image/png", buffer: Buffer.from(png, "base64"),
            });
            await ready(page);
            const content = reviewFixture.contents[0];
            if (!content) throw new Error("The reference result has no document content.");
            await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
                name: "synthetic-color-proof.cu.json", mimeType: "application/json",
                buffer: Buffer.from(JSON.stringify({ ...reviewFixture, contents: [{
                    ...content, pages: content.pages.slice(0, 1),
                    fields: { InvoiceId: content.fields.InvoiceId, Customer: content.fields.Customer,
                        Unknown: content.fields.Unknown, LineItems: content.fields.LineItems },
                }] })),
            });
            await expect(page.getByRole("button", { name: "Customer", exact: true })).toBeVisible();
        }
        await page.getByRole("group", { name: "Source viewport", exact: true }).press("Escape");
        const canvas = page.getByTestId("source-canvas");
        const original = await canvas.evaluate(element => {
            if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected an original source canvas.");
            return element.toDataURL();
        });
        const setSourceFills = async (enabled: boolean): Promise<void> => {
            await page.getByRole("button", { name: "Highlighting settings", exact: true }).click();
            await page.getByRole("switch", { name: "Show field highlights", exact: true }).setChecked(enabled);
            await page.getByRole("switch", { name: "Show table highlights", exact: true }).setChecked(enabled);
            await page.getByRole("button", { name: "Close highlighting settings", exact: true }).click();
        };
        await setSourceFills(false);
        const before = await page.screenshot();
        await setSourceFills(true);
        await expect(page.getByTestId("result-overlay")).toHaveCSS("mix-blend-mode", "multiply");
        const cases = [
            { id: "/contents/0/fields/InvoiceId", rgb: [232, 245, 233] },
            { id: recipientId, rgb: [252, 232, 230] },
            { id: "/contents/0/fields/Unknown", rgb: [241, 243, 245] },
            { id: cellId, rgb: [255, 232, 236] },
            { id: `${arrayId}/valueArray/0/valueObject/Column2`, rgb: [232, 241, 255] },
        ];
        const regions = [];
        for (const item of cases) {
            const target = source(page, item.id);
            await expect(target).toHaveAttribute("fill-opacity", "1");
            const box = await target.boundingBox();
            if (!box) throw new Error(`Missing color-proof source region: ${item.id}`);
            regions.push({ ...item, ...box });
        }
        const after = await page.screenshot();
        const samples = await page.evaluate(async ({ before, after, regions }) => {
            const decode = async (encoded: string): Promise<ImageData> => {
                const image = await createImageBitmap(new Blob([
                    Uint8Array.from(atob(encoded), character => character.charCodeAt(0)),
                ], { type: "image/png" }));
                const canvas = document.createElement("canvas");
                canvas.width = image.width; canvas.height = image.height;
                const context = canvas.getContext("2d");
                if (!context) throw new Error("Canvas pixel comparison is unavailable.");
                context.drawImage(image, 0, 0);
                return context.getImageData(0, 0, canvas.width, canvas.height);
            };
            const baseline = await decode(before), painted = await decode(after);
            if (baseline.width !== painted.width || baseline.height !== painted.height) throw new Error("Color comparison frame changed.");
            return regions.map(region => {
                let white = 0, exact = 0, dark = 0, obscured = 0;
                for (let y = Math.ceil(region.y + 2); y < Math.floor(region.y + region.height - 2); y++) {
                    for (let x = Math.ceil(region.x + 2); x < Math.floor(region.x + region.width - 2); x++) {
                        const index = (y * baseline.width + x) * 4;
                        const a = baseline.data.subarray(index, index + 3), b = painted.data.subarray(index, index + 3);
                        if (a.every(value => value === 255)) {
                            white++;
                            if (b.every((value, channel) => value === region.rgb[channel])) exact++;
                        }
                        if (a.every(value => value <= 40)) {
                            dark++;
                            if (b.some((value, channel) => value > a[channel]! + 1)) obscured++;
                        }
                    }
                }
                return { id: region.id, white, exact, dark, obscured };
            });
        }, { before: before.toString("base64"), after: after.toString("base64"), regions });
        for (const sample of samples) {
            expect(sample.white, sample.id).toBeGreaterThan(20);
            expect(sample.exact, sample.id).toBe(sample.white);
            expect(sample.obscured, sample.id).toBe(0);
        }
        expect(samples.reduce((count, sample) => count + sample.dark, 0)).toBeGreaterThan(20);
        expect(await canvas.evaluate(element => {
            if (!(element instanceof HTMLCanvasElement)) throw new Error("Original source canvas disappeared.");
            return element.toDataURL();
        })).toBe(original);
    });
}
