import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = resolve(process.argv[2] ?? resolve(repository, "tests", "fixtures", "labels"));
const filename = "invoice-multipage.pdf";
if (existsSync(resolve(directory, `${filename}.result.json`))) {
    throw new Error("A saved analysis already exists. Generate into another directory to avoid invalidating its paired source.");
}
const pageCount = 12, rowsPerPage = 10;
const string = value => ({ type: "string", valueString: value });
const date = value => ({ type: "date", valueDate: value });
const number = value => ({ type: "number", valueNumber: value });
const object = valueObject => ({ type: "object", valueObject });
const money = cents => (cents / 100).toFixed(2);
const rows = Array.from({ length: pageCount * rowsPerPage }, (_, index) => {
    const quantity = index % 4 + 1, unitCents = 2000 + index * 50;
    return { quantity, unitCents, netCents: quantity * unitCents, taxCents: quantity * unitCents / 10,
        code: `MP-${String(index + 1).padStart(3, "0")}`,
        description: `Document review service ${String(index + 1).padStart(3, "0")}`,
        date: `2026-10-${String(index % 28 + 1).padStart(2, "0")}` };
});
const subtotal = rows.reduce((sum, row) => sum + row.netCents, 0);
const tax = rows.reduce((sum, row) => sum + row.taxCents, 0);
const previous = 12500;
const fieldLabels = {
    InvoiceNumber: string("INV-MP-2026-012"),
    InvoiceDate: date("2026-11-01"),
    DueDate: date("2026-12-01"),
    SellerName: string("Example Services Ltd."),
    SellerAddress: string("100 Example Avenue, Sample City, WA 98000"),
    CustomerName: string("Sample Research Group"),
    CustomerId: string("CUST-MP-012"),
    ServicePeriod: object({ StartDate: date("2026-10-01"), EndDate: date("2026-10-31") }),
    BillTo: string("Sample Research Group, 200 Test Road, Sample City, WA 98000"),
    ShipTo: string("Sample Research Group, 210 Test Road, Sample City, WA 98000"),
    ServiceAddress: string("300 Demo Lane, Sample City, WA 98000"),
    OrderInformation: object({
        Salesperson: string("Demo Agent"),
        PurchaseOrderNumber: string("PO-MP-120"),
        Requisitioner: string("Test Coordinator"),
        ShippedVia: string("Electronic delivery"),
        FobPoint: string("Service location"),
        Terms: string("Net 30"),
    }),
    LineItems: { type: "array", valueArray: rows.map(row => object({
        Date: date(row.date), ItemCode: string(row.code), Description: string(row.description),
        Quantity: number(row.quantity), UnitOfMeasure: string("hours"),
        UnitPriceAmount: number(row.unitCents / 100), TaxAmount: number(row.taxCents / 100),
        LineAmount: number(row.netCents / 100),
    })) },
    SubtotalAmount: number(subtotal / 100),
    SalesTaxAmount: number(tax / 100),
    TotalAmount: number((subtotal + tax) / 100),
    PreviousUnpaidBalanceAmount: number(previous / 100),
    AmountDueAmount: number((subtotal + tax + previous) / 100),
    RemitTo: string("Example Services Ltd., 400 Sample Way, Sample City, WA 98000"),
};
const fieldAt = path => {
    const [first, ...parts] = path.split("/");
    let field = fieldLabels[first];
    for (const part of parts) {
        field = field?.type === "array" ? field.valueArray[Number(part)] : field?.valueObject?.[part];
    }
    if (!field) throw new Error(`Unknown authored label path: ${path}`);
    return field;
};
const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const value = (path, display) => {
    const field = fieldAt(path);
    const key = Object.keys(field).find(key => key.startsWith("value"));
    if (!key || ["object", "array"].includes(field.type)) throw new Error(`Expected a scalar label: ${path}`);
    return `<span data-field="${escape(path)}">${escape(display ?? field[key])}</span>`;
};
const detail = (title, path) => `<div class="detail"><small>${escape(title)}</small>${value(path)}</div>`;
const metadata = [
    detail("Invoice date", "InvoiceDate"), detail("Payment due date", "DueDate"),
    detail("Customer", "CustomerName"), detail("Customer ID", "CustomerId"),
    detail("Service period start", "ServicePeriod/StartDate"), detail("Service period end", "ServicePeriod/EndDate"),
    detail("Bill to", "BillTo"), detail("Ship to", "ShipTo"), detail("Service address", "ServiceAddress"),
].join("");
const order = [
    ["Salesperson", "Salesperson"], ["Purchase order", "PurchaseOrderNumber"], ["Requisitioner", "Requisitioner"],
    ["Shipped via", "ShippedVia"], ["FOB point", "FobPoint"], ["Payment terms", "Terms"],
].map(([title, key]) => detail(title, `OrderInformation/${key}`)).join("");
const totals = [
    ["Subtotal", "SubtotalAmount", subtotal], ["Sales tax (10%)", "SalesTaxAmount", tax],
    ["Invoice total", "TotalAmount", subtotal + tax], ["Previous unpaid balance", "PreviousUnpaidBalanceAmount", previous],
    ["Amount due (USD)", "AmountDueAmount", subtotal + tax + previous],
].map(([title, path, cents]) => `<div><span>${title}</span>${value(path, money(cents))}</div>`).join("");
const columns = [
    ["Date", "Date", 76], ["Item code", "ItemCode", 55], ["Description", "Description", 180],
    ["Qty", "Quantity", 40], ["Unit", "UnitOfMeasure", 44], ["Unit price", "UnitPriceAmount", 78],
    ["Tax (10%)", "TaxAmount", 66], ["Line amount", "LineAmount", 93],
];
const sheets = Array.from({ length: pageCount }, (_, page) => {
    const start = page * rowsPerPage;
    const items = rows.slice(start, start + rowsPerPage).map((row, offset) => {
        const index = start + offset;
        const displays = { UnitPriceAmount: money(row.unitCents), TaxAmount: money(row.taxCents), LineAmount: money(row.netCents) };
        return `<tr>${columns.map(([, key]) => `<td>${value(`LineItems/${index}/${key}`, displays[key])}</td>`).join("")}</tr>`;
    }).join("");
    return `<section class="sheet" data-page="${page + 1}">
        <header><div><h1>${value("SellerName")}</h1>
            ${page === 0 ? `<p>${value("SellerAddress")}</p>` : "<p>Professional document review services</p>"}</div>
            <div class="invoice"><strong>INVOICE</strong><p>${value("InvoiceNumber")}</p><small>Currency: USD</small></div></header>
        ${page === 0 ? `<div class="details">${metadata}</div>` : ""}
        ${page === 1 ? `<h2>Order information</h2><div class="details">${order}</div>` : ""}
        <h2>Line items ${start + 1}-${start + rowsPerPage} of ${rows.length}</h2>
        <table><colgroup>${columns.map(([, , width]) => `<col style="width:${width}px">`).join("")}</colgroup>
            <thead><tr>${columns.map(([title]) => `<th>${title}</th>`).join("")}</tr></thead><tbody>${items}</tbody></table>
        ${page === pageCount - 1 ? `<div class="closing"><div><h2>Remit to</h2><p>${value("RemitTo")}</p>
            <p>Payment terms: Net 30. All amounts are in USD.</p></div><div class="totals">${totals}</div></div>` :
            `<p class="continued">This invoice continues on page ${page + 2}. Document totals appear on the final page.</p>`}
        <footer><span>SYNTHETIC TEST DOCUMENT - no real customer or bank data</span><span>Page ${page + 1} of ${pageCount}</span></footer>
    </section>`;
}).join("");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Independent multi-page invoice fixture</title>
<style>
@page { size: letter; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; color: #233144; font: 11px/1.4 Arial, sans-serif; print-color-adjust: exact; }
.sheet { position: relative; width: 816px; height: 1056px; padding: 42px; overflow: hidden; break-after: page; }
.sheet:last-child { break-after: auto; }
header { display: flex; justify-content: space-between; gap: 20px; padding-bottom: 16px; border-bottom: 3px solid #405a75; }
h1 { margin: 0; font-size: 23px; line-height: 1.3; }
header p { margin: 7px 0 0; font-size: 10px; }
.invoice { min-width: 180px; text-align: right; }
.invoice strong { font-size: 24px; letter-spacing: 3px; }
.invoice p { font-size: 14px; font-weight: 600; }
small { color: #536579; font-size: 10px; }
.details { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 24px; margin: 18px 0; }
.detail { min-width: 0; }
.detail small { display: block; margin-bottom: 2px; }
h2 { margin: 22px 0 9px; font-size: 13px; font-weight: 600; }
table { width: 732px; border-collapse: collapse; table-layout: fixed; font-size: 10px; }
th { padding: 8px 5px; background: #e8eef5; border: 1px solid #ccd6e1; text-align: left; }
td { height: 32px; padding: 7px 5px; border: 1px solid #dce3eb; vertical-align: middle; white-space: nowrap; }
td:nth-child(4), td:nth-child(n+6) { text-align: right; }
.continued { margin-top: 16px; color: #536579; }
.closing { display: grid; grid-template-columns: 1fr 300px; gap: 30px; margin-top: 20px; }
.closing h2 { margin-top: 0; }
.closing p { margin: 6px 0; }
.totals > div { display: flex; justify-content: space-between; gap: 12px; padding: 6px 8px; border-bottom: 1px solid #dce3eb; }
.totals > div:last-child { background: #e8eef5; font-size: 13px; font-weight: 600; }
footer { position: absolute; left: 42px; right: 42px; bottom: 26px; display: flex; justify-content: space-between;
    border-top: 1px solid #dce3eb; padding-top: 8px; color: #637287; font-size: 9px; }
</style></head><body>${sheets}</body></html>`;

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
    const page = await browser.newPage();
    await page.emulateMedia({ media: "print" });
    await page.setContent(html);
    const regions = await page.locator("[data-field]").evaluateAll(elements => elements.map(element => {
        const sheet = element.closest(".sheet");
        if (!(sheet instanceof HTMLElement)) throw new Error("An authored value has no PDF page.");
        const page = Number(sheet.dataset.page), bounds = sheet.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(element);
        return { path: element.getAttribute("data-field"), page, rectangles: [...range.getClientRects()]
            .filter(rect => rect.width > 0 && rect.height > 0)
            .map(rect => ({ x: (rect.left - bounds.left) / 96, y: (rect.top - bounds.top) / 96,
                width: rect.width / 96, height: rect.height / 96 })) };
    }));
    for (const region of regions) {
        assert.ok(region.path && region.rectangles.length, "Every authored value needs a source rectangle.");
        const field = fieldAt(region.path);
        const sources = region.rectangles.map(rect => {
            assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 8.5 && rect.y + rect.height <= 11,
                `An authored value extends outside page ${region.page}: ${region.path}`);
            return `D(${region.page},${[rect.x, rect.y, rect.width, rect.height].map(value => value.toFixed(5)).join(",")})`;
        });
        field.source = [field.source, ...sources].filter(Boolean).join(";");
    }
    const stack = Object.values(fieldLabels);
    let leaves = 0;
    while (stack.length) {
        const field = stack.pop();
        if (field.type === "object") stack.push(...Object.values(field.valueObject));
        else if (field.type === "array") stack.push(...field.valueArray);
        else { assert.ok(field.source, "Every independent scalar label must appear in the PDF."); leaves++; }
    }
    const pdf = await page.pdf({ format: "Letter", printBackground: true, preferCSSPageSize: true });
    const labels = {
        $schema: "https://schema.ai.azure.com/mmi/2024-12-01-preview/labels.json",
        fileId: filename, fieldLabels,
        metadata: {
            provenance: "Independently authored synthetic ground truth; not copied from an Analyze response.",
            generator: "scripts/generate-multipage-invoice.mjs",
            pageCount, lineItemCount: rows.length, leafValueCount: leaves,
            sourceCoordinates: "Authored text rectangles in PDF inches, measured before any service analysis.",
        },
    };
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, filename), pdf);
    writeFileSync(resolve(directory, `${filename}.labels.json`), JSON.stringify(labels, null, 2) + "\n");
    console.log(JSON.stringify({ directory, pageCount, lineItems: rows.length, independentLeafValues: leaves,
        subtotal: subtotal / 100, tax: tax / 100, amountDue: (subtotal + tax + previous) / 100,
        analysisCalls: 0 }));
} finally {
    await browser.close();
}
