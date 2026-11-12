import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { MAX_JSON_CHARACTERS, MAX_JSON_VALUES } from "../../frontend/src/components/JsonPane";
import { MARKDOWN_STATIC_CHARACTERS } from "../../frontend/src/components/MarkdownPane";
import { parseCuResult } from "../../frontend/src/model/parseCuResult";
import { ready } from "./viewerAssertions";

const COLD_VIEW_BUDGET_MS = 1000;
const WARM_VIEW_BUDGET_MS = 350;
const LONG_TASK_BUDGET_MS = 100;
const HEAP_GROWTH_BUDGET_BYTES = 64 * 1024 * 1024;

interface PerformanceMeasurement {
    elapsedMs: number;
    maxLongTaskMs: number;
    heapGrowthBytes: number | null;
}

function syntheticResult(markdown?: string, extra: Record<string, unknown> = {}): unknown {
    return {
        apiVersion: "2025-11-01",
        analyzerId: "synthetic-performance-boundary",
        contents: [{
            kind: "document",
            unit: "pixel",
            pages: [{ pageNumber: 1, width: 1743, height: 878, angle: 0 }],
            fields: { Synthetic: { type: "string", valueString: "Synthetic performance fixture" } },
            ...(markdown === undefined ? {} : { markdown }),
        }],
        ...extra,
    };
}

async function uploadResult(page: Page, name: string, result: unknown): Promise<void> {
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name,
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(result)),
    });
}

async function measure(page: Page, action: () => Promise<void>, readyForView: () => Promise<void>): Promise<PerformanceMeasurement> {
    await page.evaluate(() => {
        const longTasks: number[] = [];
        const observer = new PerformanceObserver(list => {
            for (const entry of list.getEntries()) longTasks.push(entry.duration);
        });
        observer.observe({ type: "longtask", buffered: false });
        Reflect.set(globalThis, "__cuPerformanceMeasurement", { longTasks, observer });
    });
    const before = await page.evaluate(() => {
        const memory: unknown = Reflect.get(performance, "memory");
        const heap = typeof memory === "object" && memory !== null && "usedJSHeapSize" in memory
            ? Reflect.get(memory, "usedJSHeapSize")
            : null;
        return { start: performance.now(), heap: typeof heap === "number" ? heap : null };
    });
    await action();
    await readyForView();
    await page.evaluate(() => new Promise(requestAnimationFrame));
    return page.evaluate(({ start, heap }) => {
        const stored: unknown = Reflect.get(globalThis, "__cuPerformanceMeasurement");
        if (typeof stored !== "object" || stored === null || !("longTasks" in stored) || !("observer" in stored)) {
            throw new Error("Performance observer state is unavailable.");
        }
        const longTasks = Reflect.get(stored, "longTasks");
        const observer = Reflect.get(stored, "observer");
        if (!Array.isArray(longTasks) || !(observer instanceof PerformanceObserver) ||
            !longTasks.every(value => typeof value === "number")) {
            throw new Error("Performance observer state is invalid.");
        }
        observer.disconnect();
        const memory: unknown = Reflect.get(performance, "memory");
        const currentHeap = typeof memory === "object" && memory !== null && "usedJSHeapSize" in memory
            ? Reflect.get(memory, "usedJSHeapSize")
            : null;
        return {
            elapsedMs: performance.now() - start,
            maxLongTaskMs: longTasks.length === 0 ? 0 : Math.max(...longTasks),
            heapGrowthBytes: heap !== null && typeof currentHeap === "number" ? Math.max(0, currentHeap - heap) : null,
        };
    }, before);
}

function expectWithinBudget(measurement: PerformanceMeasurement, elapsedBudget: number): void {
    expect(measurement.elapsedMs).toBeLessThanOrEqual(elapsedBudget);
    expect(measurement.maxLongTaskMs).toBeLessThanOrEqual(LONG_TASK_BUDGET_MS);
    if (measurement.heapGrowthBytes !== null) {
        expect(measurement.heapGrowthBytes).toBeLessThanOrEqual(HEAP_GROWTH_BUDGET_BYTES);
    }
}

test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await ready(page);
});

test("Markdown stays lazy and within the production interaction budget", async ({ page }, testInfo) => {
    const initialResources = await page.evaluate(() => performance.getEntriesByType("resource").map(entry => entry.name));
    expect(initialResources.some(url => url.includes("MarkdownPane-"))).toBe(false);
    expect(initialResources.some(url => url.includes("JsonPane-"))).toBe(false);
    expect(initialResources.some(url => /(?:ParagraphsPane|FiguresPane|SignaturesPane|InfoPane)-/.test(url))).toBe(false);

    const cold = await measure(
        page,
        () => page.getByRole("tab", { name: "Markdown", exact: true }).click(),
        () => page.getByRole("heading", { name: "INVOICE", exact: true }).waitFor(),
    );
    expectWithinBudget(cold, COLD_VIEW_BUDGET_MS);
    await expect.poll(() => page.evaluate(() =>
        performance.getEntriesByType("resource").some(entry => entry.name.includes("MarkdownPane-")))).toBe(true);

    await page.getByRole("tab", { name: "Fields", exact: true }).click();
    await uploadResult(page, "near-static-markdown-budget.json", syntheticResult("x".repeat(MARKDOWN_STATIC_CHARACTERS - 1)));
    const warm = await measure(
        page,
        () => page.getByRole("tab", { name: "Markdown", exact: true }).click(),
        () => page.locator(".cu-markdown").waitFor(),
    );
    expectWithinBudget(warm, WARM_VIEW_BUDGET_MS);
    testInfo.annotations.push({
        type: "performance",
        description: `cold=${cold.elapsedMs.toFixed(1)}ms warm=${warm.elapsedMs.toFixed(1)}ms long=${warm.maxLongTaskMs.toFixed(1)}ms heap=${warm.heapGrowthBytes ?? "unavailable"}`,
    });
});

test("JSON stays lazy and within the production interaction budget", async ({ page }, testInfo) => {
    const initialResources = await page.evaluate(() => performance.getEntriesByType("resource").map(entry => entry.name));
    expect(initialResources.some(url => url.includes("MarkdownPane-"))).toBe(false);
    expect(initialResources.some(url => url.includes("JsonPane-"))).toBe(false);
    expect(initialResources.some(url => /(?:ParagraphsPane|FiguresPane|SignaturesPane|InfoPane)-/.test(url))).toBe(false);

    const cold = await measure(
        page,
        () => page.getByRole("tab", { name: "Result", exact: true }).click(),
        () => page.getByRole("tree", { name: "Original Analyze result JSON" }).waitFor(),
    );
    expectWithinBudget(cold, COLD_VIEW_BUDGET_MS);
    await expect.poll(() => page.evaluate(() =>
        performance.getEntriesByType("resource").some(entry => entry.name.includes("JsonPane-")))).toBe(true);

    await page.getByRole("tab", { name: "Fields", exact: true }).click();
    await uploadResult(page, "near-json-limit.json", syntheticResult(undefined, {
        payload: "x".repeat(MAX_JSON_CHARACTERS - 300),
    }));
    const warm = await measure(
        page,
        () => page.getByRole("tab", { name: "Result", exact: true }).click(),
        () => page.getByRole("tree", { name: "Original Analyze result JSON" }).waitFor(),
    );
    expectWithinBudget(warm, WARM_VIEW_BUDGET_MS);
    testInfo.annotations.push({
        type: "performance",
        description: `cold=${cold.elapsedMs.toFixed(1)}ms warm=${warm.elapsedMs.toFixed(1)}ms long=${warm.maxLongTaskMs.toFixed(1)}ms heap=${warm.heapGrowthBytes ?? "unavailable"}`,
    });
});

test("large Markdown and JSON stay bounded while every page remains reachable", async ({ page }, testInfo) => {
    const markdown = Array.from({ length: 41 }, (_, index) =>
        `# Document page ${index + 1}\n\n${"Saved text. ".repeat(150)}\n`).join("\n<!-- PageBreak -->\n\n");
    await uploadResult(page, "large-paged-result.json", syntheticResult(markdown, {
        largeValues: Array.from({ length: MAX_JSON_VALUES + 1 }, (_, index) =>
            index === MAX_JSON_VALUES ? "last original value" : index),
    }));
    const firstMarkdown = await measure(page,
        () => page.getByRole("tab", { name: "Markdown", exact: true }).click(),
        () => page.getByRole("heading", { name: "Document page 1", exact: true }).waitFor());
    expectWithinBudget(firstMarkdown, COLD_VIEW_BUDGET_MS);
    const lastMarkdown = await measure(page,
        async () => {
            const input = page.getByRole("textbox", { name: "Markdown page number", exact: true });
            await input.fill("41");
            await input.press("Enter");
        },
        () => page.getByRole("heading", { name: "Document page 41", exact: true }).waitFor());
    expectWithinBudget(lastMarkdown, WARM_VIEW_BUDGET_MS);
    const json = await measure(page,
        () => page.getByRole("tab", { name: "Result", exact: true }).click(),
        () => page.getByRole("tree", { name: "Original Analyze result JSON" }).waitFor());
    expectWithinBudget(json, COLD_VIEW_BUDGET_MS);
    const array = page.locator('[data-json-path="/largeValues"]');
    await array.getByRole("button", { name: "Expand JSON node", exact: true }).click();
    await expect(array.getByRole("treeitem")).toHaveCount(100);
    const lastJson = await measure(page,
        () => array.getByRole("button", { name: "Last JSON entries at /largeValues page", exact: true }).click(),
        () => page.getByText('"last original value"', { exact: true }).waitFor());
    expectWithinBudget(lastJson, WARM_VIEW_BUDGET_MS);
    testInfo.annotations.push({
        type: "large-result-performance",
        description: JSON.stringify({ firstMarkdown, lastMarkdown, json, lastJson }),
    });
});

test("built-in Large PDF renders every Markdown page and the final original JSON paragraph", async ({ page }, testInfo) => {
    const input: unknown = JSON.parse(readFileSync(resolve("tests", "fixtures", "large-bank-statement.cu.json"), "utf8"));
    const content = parseCuResult(input).contents[0];
    if (!content?.markdown || content.markdown.length <= MARKDOWN_STATIC_CHARACTERS ||
        content.pages.length < 2 || !content.paragraphs?.length) {
        throw new Error("The built-in Large PDF sample must have large paged Markdown and original paragraphs.");
    }
    const paragraphCount = content.paragraphs.length;
    const lastParagraph = content.paragraphs[paragraphCount - 1];
    if (!lastParagraph) throw new Error("The final original paragraph is unavailable.");
    const resultPath = typeof input === "object" && input !== null && Object.hasOwn(input, "result") ? "/result" : "";
    const contentPath = `${resultPath}/contents/0`;
    const paragraphsPath = `${contentPath}/paragraphs`;
    await page.getByRole("button", { name: "Large PDF", exact: true }).click();
    await expect(page.locator('.cu-fields-table > tbody > tr[data-field-depth="0"]')).toHaveCount(content.fields.length);
    await ready(page);
    const firstMarkdown = await measure(page,
        () => page.getByRole("tab", { name: "Markdown", exact: true }).click(),
        () => page.getByRole("group", { name: "Markdown pagination", exact: true }).waitFor());
    expectWithinBudget(firstMarkdown, COLD_VIEW_BUDGET_MS);
    const pager = page.getByRole("group", { name: "Markdown pagination", exact: true });
    let tables = 0;
    for (let index = 0; index < content.pages.length; index++) {
        await expect(pager.getByRole("status")).toHaveText(`Page ${index + 1} of ${content.pages.length}`);
        await expect(page.locator(".cu-markdown")).toContainText(/\S/);
        tables += await page.locator(".cu-markdown table").count();
        if (index + 1 < content.pages.length) await pager.getByRole("button", { name: "Next Markdown page", exact: true }).click();
    }
    expect(tables).toBe(content.tables?.length ?? 0);
    const json = await measure(page,
        () => page.getByRole("tab", { name: "Result", exact: true }).click(),
        () => page.getByRole("tree", { name: "Original Analyze result JSON" }).waitFor());
    expectWithinBudget(json, COLD_VIEW_BUDGET_MS);
    for (const path of [...(resultPath ? [resultPath] : []), `${resultPath}/contents`, contentPath, paragraphsPath]) {
        await page.locator(`[data-json-path="${path}"]`).getByRole("button", { name: "Expand JSON node", exact: true }).click();
    }
    const paragraphs = page.locator(`[data-json-path="${paragraphsPath}"]`);
    await paragraphs.getByRole("button", { name: `Last JSON entries at ${paragraphsPath} page`, exact: true }).click();
    const final = page.locator(`[data-json-path="${paragraphsPath}/${paragraphCount - 1}"]`);
    await final.getByRole("button", { name: "Expand JSON node", exact: true }).click();
    await expect(final.locator(`[data-json-path$="/content"] .cu-json-string`)).toHaveText(JSON.stringify(lastParagraph.content));
    await expect(page.getByRole("alert")).toHaveCount(0);
    testInfo.annotations.push({
        type: "builtin-large-result-performance",
        description: JSON.stringify({ pages: content.pages.length, tables, paragraphCount, firstMarkdown, json }),
    });
});
