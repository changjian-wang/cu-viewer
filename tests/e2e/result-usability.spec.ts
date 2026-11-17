import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { ready } from "./viewerAssertions";

async function upload(page: Page, value: unknown, name = "result-usability.json") {
    await page.getByLabel("Choose saved Analyze JSON", { exact: true }).setInputFiles({
        name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)),
    });
    await page.getByRole("tab", { name: "Result", exact: true }).click();
    await expect(page.getByRole("tree", { name: "Original Analyze result JSON", exact: true })).toBeVisible();
}

function document(markdown = "Original Markdown") {
    return { kind: "document", unit: "inch", pages: [{ pageNumber: 1, width: 8.5, height: 11 }],
        markdown, fields: { Anchor: { type: "string", valueString: "Keep source", source: "D(1,1,1,2,0.2)" } } };
}

async function expand(page: Page, paths: readonly string[]) {
    for (const path of paths) {
        const toggle = page.locator(`[data-json-path="${path}"]`)
            .locator(":scope > .cu-json-toggle, :scope > .cu-json-span-trigger > .cu-json-toggle");
        if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
    }
}

async function visibleMatch(viewport: Locator) {
    await expect.poll(async () => {
        const match = await viewport.locator("[data-json-search-active]").first().boundingBox();
        const bounds = await viewport.boundingBox();
        return Boolean(match && bounds && match.y >= bounds.y && match.y + match.height <= bounds.y + bounds.height);
    }).toBe(true);
}

test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await ready(page);
});

test("Result spans preview their own content in all declared encodings without changing source or raw data", async ({ page }) => {
    for (const [encoding, offset] of [["codePoint", 3], ["utf16", 4], ["utf8", 8]] as const) {
        const value = { result: { apiVersion: "2025-11-01", stringEncoding: encoding, contents: [
            document("WRONG CONTENT"), { ...document("A😀中$610.00"), fields: {
                Amount: { type: "number", valueNumber: 610, spans: [{ offset, length: 7 }] },
                Invalid: { type: "string", valueString: "Invalid source", spans: [{ offset: 999, length: 7 }] },
            } },
        ] } };
        await upload(page, value, `${encoding}.result.json`);
        await expand(page, ["/result", "/result/contents", "/result/contents/1", "/result/contents/1/fields",
            "/result/contents/1/fields/Amount"]);
        const spans = page.locator('[data-json-path="/result/contents/1/fields/Amount/spans"]');
        await spans.locator(":scope > .cu-json-span-trigger").hover();
        const popup = page.getByRole("tooltip", { name: "Span preview", exact: true });
        await expect(popup).toHaveText("$610.00");
        await expect(spans).not.toHaveAttribute("title");
        const preview = await popup.evaluate(element => {
            const bounds = element.getBoundingClientRect();
            return { arrow: getComputedStyle(element, "::before").content,
                insideViewport: bounds.left >= 8 && bounds.top >= 8 &&
                    bounds.right <= innerWidth - 8 && bounds.bottom <= innerHeight - 8 };
        });
        expect(preview.arrow).not.toBe("none");
        expect(preview.insideViewport).toBe(true);
        const triggerBounds = await spans.locator(":scope > .cu-json-span-trigger").boundingBox();
        const popupBounds = await popup.boundingBox();
        if (!triggerBounds || !popupBounds) throw new Error("The span preview or its trigger is not visible.");
        const gapY = await popup.getAttribute("data-side") === "above" ?
            (popupBounds.y + popupBounds.height + triggerBounds.y) / 2 :
            (triggerBounds.y + triggerBounds.height + popupBounds.y) / 2;
        await page.mouse.move(triggerBounds.x + Math.min(18, triggerBounds.width / 2), gapY);
        await expect(popup).toBeVisible();
        await popup.hover();
        await expect(popup).toBeVisible();
        await expand(page, ["/result/contents/1/fields/Amount/spans"]);
        const entry = page.locator('[data-json-path="/result/contents/1/fields/Amount/spans/0"]');
        const toggle = entry.locator(":scope > .cu-json-span-trigger > .cu-json-toggle");
        await toggle.focus();
        await expect(popup).toHaveText("$610.00");
        await expect(toggle).toHaveAttribute("aria-description", "$610.00");
        await expect(toggle).toHaveAttribute("aria-describedby", `${await popup.getAttribute("id")}-content`);
        await expand(page, ["/result/contents/1/fields/Amount/spans/0"]);
        await expect(entry.locator('[data-json-path$="/offset"]')).toContainText(String(offset));
        await expect(entry.locator('[data-json-path$="/length"]')).toContainText("7");
        await toggle.press("Escape");
        await expect(popup).toHaveCount(0);
        await expect(toggle).toBeFocused();
        await expand(page, ["/result/contents/1/fields/Invalid"]);
        await page.locator('[data-json-path="/result/contents/1/fields/Invalid/spans"] > .cu-json-span-trigger').hover();
        await expect(popup).toHaveText(/Span preview unavailable/);
        await expect(page.getByTestId("rendered-page")).toBeVisible();
    }
});

test("Result keeps expansion, collection pages and scroll across tabs/content changes, then resets on replacement", async ({ page }) => {
    const value = { apiVersion: "2025-11-01", contents: [document(), document("Second content")],
        diagnostic: { entries: Array.from({ length: 250 }, (_, index) => ({ value: `node-${index}` })) } };
    await upload(page, value);
    await expand(page, ["/diagnostic", "/diagnostic/entries"]);
    await page.getByRole("button", { name: "Next JSON entries at /diagnostic/entries page", exact: true }).click();
    await expand(page, ["/diagnostic/entries/100"]);
    const scroll = page.getByRole("tree", { name: "Original Analyze result JSON", exact: true }).locator("..");
    const position = await scroll.evaluate(element => {
        element.scrollTop = Math.min(320, element.scrollHeight - element.clientHeight);
        return element.scrollTop;
    });
    expect(position).toBeGreaterThan(0);
    await page.getByRole("tab", { name: "Fields", exact: true }).click();
    await page.getByRole("tab", { name: "Result", exact: true }).click();
    await expect(page.locator('[data-json-path="/diagnostic/entries/100"] > .cu-json-toggle')).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator('[data-json-path="/diagnostic/entries/0"]')).toHaveCount(0);
    await expect.poll(() => scroll.evaluate(element => element.scrollTop)).toBe(position);
    await page.getByRole("combobox", { name: "Result content", exact: true }).selectOption("1");
    await expect(page.locator('[data-json-path="/diagnostic/entries/100"] > .cu-json-toggle')).toHaveAttribute("aria-expanded", "true");
    expect(await page.getByRole("treeitem").count()).toBeLessThan(120);
    await upload(page, { ...value, diagnostic: { entries: ["replacement"] } }, "replacement.result.json");
    await expect(page.locator('[data-json-path="/diagnostic"] > .cu-json-toggle')).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator('[data-json-path="/diagnostic/entries/100"]')).toHaveCount(0);
    await expect.poll(() => scroll.evaluate(element => element.scrollTop)).toBe(0);
});

test("full-text search reaches late and cross-fragment matches, preserves escapes/copy and keeps a bounded viewport", async ({ page }) => {
    const raw = "x".repeat(4_093) + "Needle " + String.raw`\n` + "\n<b>Needle</b>\n" +
        "padding ".repeat(12_000) + "NEEDLE_TAIL [a+b]";
    await upload(page, { apiVersion: "2025-11-01", contents: [document(raw)] });
    await expand(page, ["/contents", "/contents/0"]);
    const trigger = page.getByRole("button", { name: "View full text for /contents/0/markdown", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "markdown", exact: true });
    const input = dialog.getByRole("searchbox", { name: "Search full text", exact: true });
    const status = dialog.getByRole("status", { name: "Full text search results", exact: true });
    const text = dialog.getByRole("region", { name: "Full JSON string", exact: true });
    await text.press(process.platform === "darwin" ? "Meta+f" : "Control+f");
    await expect(input).toBeFocused();
    await input.fill("needle");
    await expect(status).toHaveText("1 / 3");
    await expect.poll(async () => (await text.locator("[data-json-search-active]").allTextContents()).join("")).toBe("Needle");
    await input.press("Enter");
    await expect(status).toHaveText("2 / 3");
    await input.press("Enter");
    await expect(status).toHaveText("3 / 3");
    await visibleMatch(text);
    expect(await text.locator("pre").count()).toBeLessThan(8);
    await input.press("Enter");
    await expect(status).toHaveText("1 / 3");
    await input.press("Shift+Enter");
    await expect(status).toHaveText("3 / 3");
    await visibleMatch(text);
    await input.fill("[a+b]");
    await expect(status).toHaveText("1 / 1");
    await visibleMatch(text);
    await input.fill(String.raw`\n`);
    const escapes = JSON.stringify(raw).split(String.raw`\n`).length - 1;
    await expect(status).toHaveText(`1 / ${escapes}`);
    await page.evaluate(() => {
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
            writeText: (value: string): Promise<void> => { Reflect.set(globalThis, "__searchCopiedText", value); return Promise.resolve(); },
        } });
    });
    await dialog.getByRole("button", { name: "Copy full text", exact: true }).click();
    expect(await page.evaluate(() => {
        const value: unknown = Reflect.get(globalThis, "__searchCopiedText");
        return typeof value === "string" ? value : null;
    })).toBe(raw);
    await input.fill("not-present");
    await expect(status).toHaveText("No matches");
    await expect(dialog.getByRole("button", { name: "Next text match", exact: true })).toBeDisabled();
    await input.fill("");
    await expect(text.locator(".cu-json-find-match")).toHaveCount(0);
    await input.fill("needle");
    await expect(status).toHaveText("1 / 3");
    await input.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
});

test("dense full-text matches stay bounded and a replacement query reveals a Unicode boundary match", async ({ page }) => {
    const count = 4_096 * 147 - 2;
    const raw = "a".repeat(count) + "😀END";
    await upload(page, { apiVersion: "2025-11-01", contents: [document(raw)] });
    await expand(page, ["/contents", "/contents/0"]);
    await page.getByRole("button", { name: "View full text for /contents/0/markdown", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "markdown", exact: true });
    const input = dialog.getByRole("searchbox", { name: "Search full text", exact: true });
    const status = dialog.getByRole("status", { name: "Full text search results", exact: true });
    const text = dialog.getByRole("region", { name: "Full JSON string", exact: true });
    await input.fill("a");
    await expect(status).toHaveText(`1 / ${count.toLocaleString("en-US")}`);
    expect(await text.locator(".cu-json-find-match").count()).toBeLessThan(20);
    await input.fill("aa");
    await input.fill("😀END");
    await expect(status).toHaveText("1 / 1");
    await visibleMatch(text);
    await expect.poll(async () => (await text.locator("[data-json-search-active]").allTextContents()).join("")).toBe("😀END");
    expect(await text.locator("pre").count()).toBeLessThan(8);
});
