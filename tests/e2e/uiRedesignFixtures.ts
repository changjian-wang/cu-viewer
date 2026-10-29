import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { reviewPdf } from "./pdfFixtures";
import { expandField, ready } from "./viewerAssertions";

const text = (value: string, confidence?: number, source?: string) =>
    ({ type: "string", valueString: value, confidence, source });

export const reviewFixture = {
    apiVersion: "2025-11-01", analyzerId: "synthetic-ui-review",
    contents: [{
        kind: "document", unit: "inch",
        pages: [1, 2].map(pageNumber => ({ pageNumber, width: 8.5, height: 11,
            words: pageNumber === 1 ? [{ content: "Unextracted title", source: "D(1,0.7,0.5,3,0.25)" }] : [] })),
        markdown: "# Synthetic UI review\n\nOriginal source and result remain unchanged.",
        fields: {
            InvoiceId: text("INV-100", 0.95, "D(1,6,1,1.3,0.25)"),
            Customer: { type: "object", valueObject: {
                CustomerAddressRecipient: text("Microsoft Corp", 0.29, "D(1,0.7,1.8,2,0.25)"),
            } },
            CustomerAddress: { type: "object", valueObject: {
                Line1: text("123 Other St", 0.64, "D(1,0.7,2.2,2,0.25)"),
                City: text("Redmond", 0.99, "D(1,0.7,2.6,1.3,0.25)"),
                Missing: { type: "string" },
            } },
            CrossPage: text("Second page value", 0.8, "D(2,0.7,1.8,2,0.25)"),
            MultiRegion: text("Multiple source regions", 0.8, "D(1,0.7,4,2.5,0.25);D(2,0.7,1.8,2,0.25)"),
            Zero: { type: "integer", valueInteger: 0, confidence: 0, source: "D(1,0.7,3.2,0.5,0.25)" },
            Boundary: text("0.699", 0.699, "D(1,2.2,3.2,1.1,0.25)"),
            Unknown: text("No confidence", undefined, "D(1,3.5,3.2,2,0.25)"),
            False: { type: "boolean", valueBoolean: false },
            Empty: text(""),
            Null: { type: "string", valueString: null },
            Ungrounded: text("No invented source"),
            EmptyObject: { type: "object", valueObject: {} },
            EmptyArray: { type: "array", valueArray: [] },
            LineItems: { type: "array", valueArray: Array.from({ length: 3 }, (_, row) => ({
                type: "object", valueObject: Object.fromEntries(Array.from({ length: 8 }, (_, col) => [
                    `Column${col + 1}`, text(`Row ${row + 1} value ${col + 1}`, col === 0 ? 0.5 : 0.95,
                        `D(1,${0.7 + col * 0.8},${5.5 + row * 0.4},0.7,0.25)`),
                ])),
            })) },
            PageBottom: text("Page-bottom value", 0.3, "D(1,0.7,10.5,2,0.25)"),
        },
        paragraphs: [{ content: "CU Viewer synthetic review fixture", source: "D(1,0.7,0.5,3,0.25)" }],
        tables: [{ rowCount: 2, columnCount: 2, source: "D(1,0.7,5.5,2,0.8)", cells: [
            { rowIndex: 0, columnIndex: 0, columnSpan: 2, content: "Header", kind: "columnHeader" },
            { rowIndex: 1, columnIndex: 0, content: "Cell", confidence: 0.64, source: "D(1,0.7,5.5,0.7,0.25)" },
        ] }],
    }],
};

export const recipientId = "/contents/0/fields/Customer/valueObject/CustomerAddressRecipient";
export const line1Id = "/contents/0/fields/CustomerAddress/valueObject/Line1";
export const bottomId = "/contents/0/fields/PageBottom";
export const fieldRow = (id: string): string => `[data-field-id="${id}"]`;

export async function loadReviewFixture(page: Page): Promise<void> {
    await page.goto("/");
    await ready(page);
    await applyReviewFixture(page);
}

export async function applyReviewFixture(page: Page): Promise<void> {
    await page.getByLabel("Choose source file").setInputFiles({
        name: "synthetic-ui-review.pdf", mimeType: "application/pdf", buffer: reviewPdf(),
    });
    await ready(page);
    await page.getByLabel("Choose saved Analyze JSON").setInputFiles({
        name: "synthetic-ui-review.cu.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(reviewFixture)),
    });
    await expect(page.getByRole("button", { name: "Customer", exact: true })).toBeVisible();
    await expandField(page, "Customer");
    await expandField(page, "CustomerAddress");
    const collapseArray = page.getByRole("button", { name: "Collapse LineItems", exact: true });
    if (await collapseArray.isVisible()) await collapseArray.click();
    await page.getByRole("searchbox", { name: "Search fields or values" }).evaluate(element => element.focus({ preventScroll: true }));
    await page.locator(".cu-fields-scroll").evaluate(element => { element.scrollTop = 0; });
}

export async function openValueMenu(page: Page, id: string): Promise<void> {
    const row = page.locator(fieldRow(id));
    await row.hover();
    await row.getByRole("button", { name: /More value actions/ }).click();
}
