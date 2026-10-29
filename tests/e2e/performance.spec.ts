import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { MAX_JSON_CHARACTERS } from "../../frontend/src/components/JsonPane";
import { MAX_MARKDOWN_CHARACTERS } from "../../frontend/src/components/MarkdownPane";
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
    expect(initialResources.some(url => /(?:ParagraphsPane|FiguresPane|SignaturesPane|MetadataPane)-/.test(url))).toBe(false);

    const cold = await measure(
        page,
        () => page.getByRole("tab", { name: "Markdown", exact: true }).click(),
        () => page.getByRole("heading", { name: "INVOICE", exact: true }).waitFor(),
    );
    expectWithinBudget(cold, COLD_VIEW_BUDGET_MS);
    await expect.poll(() => page.evaluate(() =>
        performance.getEntriesByType("resource").some(entry => entry.name.includes("MarkdownPane-")))).toBe(true);

    await page.getByRole("tab", { name: "Fields", exact: true }).click();
    await uploadResult(page, "near-markdown-limit.json", syntheticResult("x".repeat(MAX_MARKDOWN_CHARACTERS - 1)));
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
    expect(initialResources.some(url => /(?:ParagraphsPane|FiguresPane|SignaturesPane|MetadataPane)-/.test(url))).toBe(false);

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
