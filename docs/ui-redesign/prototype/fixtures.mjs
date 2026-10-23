const region = (page, x, y, width, height) => ({ page, x, y, width, height });

function value(id, name, content, confidence, regions = [], extra = {}) {
    return { id, name, value: content, confidence, regions, kind: "value", extraction: "field", ...extra };
}

function object(id, name, children, extra = {}) {
    return { id, name, kind: "object", children, ...extra };
}

const invoiceItems = [
    ["3/4/2021", "A123", "Consulting Services", 2, "hours", "$30.00", "$6.00", "$60.00"],
    ["3/5/2021", "B456", "Document Fee", 3, "", "$10.00", "$3.00", "$30.00"],
    ["3/6/2021", "C789", "Printing Fee", 10, "pages", "$1.00", "$1.00", "$10.00"],
];
const itemColumns = ["Date", "ItemCode", "Description", "Qty", "UM", "Price", "Tax", "Amount"];
const itemWidths = [75, 70, 206, 44, 55, 80, 60, 74];
const rows = invoiceItems.map((row, rowIndex) => {
    let x = 48;
    return row.map((content, columnIndex) => {
        const cell = value(`/LineItems/${rowIndex}/${itemColumns[columnIndex]}`, itemColumns[columnIndex],
            content, rowIndex === 2 && columnIndex === 4 ? 0.41 : 0.9 + ((rowIndex + columnIndex) % 6) / 100,
            content === "" ? [] : [region(1, x + 3, 505 + rowIndex * 26, itemWidths[columnIndex] - 6, 20)],
            { extraction: "table" });
        x += itemWidths[columnIndex];
        return cell;
    });
});

const invoiceFields = [
    value("/InvoiceId", "InvoiceId", "INV-100", 0.38,
        [region(1, 560, 113, 151, 20), region(2, 535, 51, 176, 22)]),
    value("/InvoiceDate", "InvoiceDate", "2019-11-15", 0.91, [region(1, 560, 137, 151, 20)],
        { sourceText: "11/15/2019" }),
    value("/DueDate", "DueDate", "2019-12-15", 0.92, [region(1, 560, 161, 151, 20)],
        { sourceText: "12/15/2019" }),
    object("/Customer", "Customer", [
        value("/Customer/CustomerName", "CustomerName", "MICROSOFT CORPORATION", 0.95,
            [region(1, 490, 185, 221, 20)]),
        value("/Customer/CustomerId", "CustomerId", "CID-12345", 0.95, [region(1, 560, 233, 151, 20)]),
        value("/Customer/Recipient", "CustomerAddressRecipient", "Microsoft Corp", 0.29,
            [region(1, 48, 211, 172, 20)]),
    ]),
    object("/CustomerAddress", "CustomerAddress", [
        value("/CustomerAddress/Line1", "Line1", "123 Other St", 0.32, [region(1, 48, 235, 172, 20)]),
        value("/CustomerAddress/Line2", "Line2", undefined, undefined, [], { missing: true }),
        value("/CustomerAddress/City", "City", "Redmond", 0.91, [region(1, 48, 259, 76, 20)]),
        value("/CustomerAddress/State", "State", "WA", 0.92, [region(1, 126, 259, 28, 20)]),
        value("/CustomerAddress/PostalCode", "PostalCode", "98052", 0.9, [region(1, 156, 259, 64, 20)]),
        value("/CustomerAddress/CountryRegion", "CountryRegion", "USA", 0.88),
    ]),
    object("/BillingAddress", "BillingAddress", [
        value("/BillingAddress/Recipient", "Recipient", "Microsoft Finance", 0.93, [region(1, 48, 325, 194, 20)]),
        value("/BillingAddress/Line1", "Line1", "123 Bill St", 0.92, [region(1, 48, 349, 194, 20)]),
        value("/BillingAddress/City", "City", "Redmond", 0.91, [region(1, 48, 373, 76, 20)]),
        value("/BillingAddress/State", "State", "WA", 0.92, [region(1, 126, 373, 28, 20)]),
        value("/BillingAddress/PostalCode", "PostalCode", "98052", 0.9, [region(1, 156, 373, 64, 20)]),
    ]),
    object("/ShippingAddress", "ShippingAddress", [
        value("/ShippingAddress/Recipient", "Recipient", "Microsoft Delivery", 0.93, [region(1, 276, 325, 192, 20)]),
        value("/ShippingAddress/Line1", "Line1", "123 Ship St", 0.57, [region(1, 276, 349, 192, 20)]),
        value("/ShippingAddress/City", "City", "Redmond", 0.91, [region(1, 276, 373, 76, 20)]),
        value("/ShippingAddress/State", "State", "WA", 0.92, [region(1, 354, 373, 28, 20)]),
        value("/ShippingAddress/PostalCode", "PostalCode", "98052", 0.9, [region(1, 384, 373, 64, 20)]),
    ]),
    object("/ServiceAddress", "ServiceAddress", [
        value("/ServiceAddress/Recipient", "Recipient", "Microsoft Services", 0.93, [region(1, 510, 325, 202, 20)]),
        value("/ServiceAddress/Line1", "Line1", "123 Service St", 0.92, [region(1, 510, 349, 202, 20)]),
        value("/ServiceAddress/City", "City", "Redmond", 0.91, [region(1, 510, 373, 76, 20)]),
        value("/ServiceAddress/State", "State", "WA", 0.92, [region(1, 588, 373, 28, 20)]),
        value("/ServiceAddress/PostalCode", "PostalCode", "98052", 0.9, [region(1, 618, 373, 64, 20)]),
    ], { summary: "123 Service St, Redmond WA 98052" }),
    { id: "/LineItems", name: "LineItems", kind: "table", columns: itemColumns, rows },
    value("/AmountDue", "AmountDue", 610, 0.64, [region(1, 600, 742, 112, 26)], { display: "$610.00" }),
    value("/Subtotal", "Subtotal", 100, 0.93, [region(1, 600, 622, 112, 22)], { display: "$100.00" }),
    value("/SalesTax", "SalesTax", 10, 0.95, [region(1, 600, 650, 112, 22)], { display: "$10.00" }),
    value("/Total", "Total", 110, 0.94, [region(1, 600, 678, 112, 22)], { display: "$110.00" }),
    value("/PreviousBalance", "PreviousUnpaidBalance", 500, 0.9,
        [region(1, 600, 710, 112, 22)], { display: "$500.00" }),
    value("/PurchaseOrder", "PurchaseOrder", "PO-3333", 0.96, [region(1, 165, 432, 123, 20)]),
    value("/PaymentTerms", "PaymentTerms", "Net 30", 0.86, [region(2, 267, 163, 250, 24)]),
    value("/PaymentReference", "PaymentReference", "Use INV-100 as reference", undefined,
        [region(2, 267, 207, 386, 24)]),
    object("/BankDetails", "BankDetails", [
        value("/BankDetails/Beneficiary", "Beneficiary", "Contoso Ltd.", 0.97, [region(2, 267, 320, 280, 24)]),
        value("/BankDetails/Account", "AccountEnding", "4402", 0.95, [region(2, 267, 364, 150, 24)]),
    ]),
    value("/Discount", "Discount", 0, 0.7, [region(2, 267, 474, 150, 24)]),
    value("/Paid", "Paid", false, 0.96, [region(2, 267, 518, 150, 24)]),
    value("/TaxId", "TaxId", null, undefined),
    value("/Memo", "Memo", "", undefined),
    value("/VendorName", "VendorName", "CONTOSO LTD.", 0.98, [region(1, 48, 44, 242, 34)],
        { fontSize: 28, fontWeight: 750 }),
    value("/VendorAddress", "VendorAddress", "Contoso Headquarters, 123 456th St, New York, NY 10001", 0.96,
        [region(1, 48, 104, 222, 20), region(1, 48, 128, 170, 20), region(1, 48, 152, 196, 20)],
        { sourceTexts: ["Contoso Headquarters", "123 456th St", "New York, NY 10001"] }),
    value("/ServicePeriod", "ServicePeriod", "10/14/2019 - 11/14/2019", 0.94, [region(1, 490, 209, 221, 20)]),
];

const receiptFields = [
    value("/MerchantName", "MerchantName", "CONTOSO COFFEE", 0.98, [region(1, 58, 70, 324, 33)],
        { fontSize: 27, fontWeight: 750 }),
    value("/MerchantAddress", "MerchantAddress", "123 Market Street", 0.92, [region(1, 114, 117, 218, 22)]),
    value("/TransactionDate", "TransactionDate", "2026-10-23", 0.9, [region(1, 220, 190, 166, 22)]),
    value("/ReceiptNumber", "ReceiptNumber", "R-2084", 0.48, [region(1, 220, 224, 166, 22)]),
    {
        id: "/Items", name: "Items", kind: "table", columns: ["Description", "Qty", "Amount"],
        rows: [
            [
                value("/Items/0/Description", "Description", "Flat white", 0.94, [region(1, 44, 320, 206, 24)], { extraction: "table" }),
                value("/Items/0/Qty", "Qty", 2, 0.93, [region(1, 256, 320, 42, 24)], { extraction: "table" }),
                value("/Items/0/Amount", "Amount", "$9.00", 0.95, [region(1, 310, 320, 84, 24)], { extraction: "table" }),
            ],
            [
                value("/Items/1/Description", "Description", "Croissant", 0.94, [region(1, 44, 356, 206, 24)], { extraction: "table" }),
                value("/Items/1/Qty", "Qty", 1, 0.93, [region(1, 256, 356, 42, 24)], { extraction: "table" }),
                value("/Items/1/Amount", "Amount", "$4.50", 0.44, [region(1, 310, 356, 84, 24)], { extraction: "table" }),
            ],
        ],
    },
    value("/Subtotal", "Subtotal", 13.5, 0.96, [region(1, 292, 433, 102, 24)], { display: "$13.50" }),
    value("/Tax", "Tax", 1.35, undefined, [region(1, 292, 469, 102, 24)], { display: "$1.35" }),
    value("/Total", "Total", 14.85, 0.66, [region(1, 278, 517, 116, 32)], { display: "$14.85", fontSize: 24, fontWeight: 700 }),
    value("/PaymentMethod", "PaymentMethod", "VISA **** 4402", 0.96, [region(1, 157, 591, 236, 24)]),
];

export const PROFILES = [
    {
        id: "invoice", schemaId: "invoice-example", name: "sample_invoice.pdf", label: "Invoice / 2 pages",
        kind: "pdf", pages: [{ width: 760, height: 850 }, { width: 760, height: 850 }],
        fields: invoiceFields, expanded: ["/Customer", "/CustomerAddress", "/LineItems"],
        markdown: "# Invoice INV-100\n\n**Contoso Ltd.** to Microsoft Corporation.\n\nAmount due: **$610.00**\n\n## Payment\n\nNet 30. Use INV-100 as reference.\n\n_Illustrative data for UI review, not a service response._",
    },
    {
        id: "receipt", schemaId: "receipt-example", name: "sample_receipt.png", label: "Receipt / image",
        kind: "image", pages: [{ width: 440, height: 720 }], fields: receiptFields, expanded: ["/Items"],
        markdown: "# Contoso Coffee\n\nReceipt **R-2084** - 2026-10-23.\n\n- 2 flat whites: $9.00\n- 1 croissant: $4.50\n\n**Total: $14.85**\n\n_Illustrative data for UI review, not a service response._",
    },
];

const text = (x, y, content, options = "") =>
    `<text x="${x}" y="${y}" ${options}>${content}</text>`;

export function documentBase(profile, page) {
    if (profile.kind === "image") {
        return `<g fill="#263444" font-family="Arial, sans-serif" font-size="13">
            ${text(220, 151, "Fresh coffee. Good company.", 'text-anchor="middle" fill="#6b7280" font-size="12"')}
            ${text(44, 206, "DATE", 'font-size="11"')}
            ${text(44, 240, "RECEIPT", 'font-size="11"')}
            <path d="M44 274H394M44 400H394M44 571H394" stroke="#a7b0bc" stroke-dasharray="4 4"/>
            ${text(48, 303, "ITEM", 'font-size="11" font-weight="700"')}
            ${text(260, 303, "QTY", 'font-size="11" font-weight="700"')}
            ${text(346, 303, "AMOUNT", 'font-size="11" text-anchor="middle" font-weight="700"')}
            ${text(44, 450, "SUBTOTAL")}${text(44, 486, "TAX")}${text(44, 540, "TOTAL", 'font-size="22" font-weight="700"')}
            ${text(44, 608, "PAID BY", 'font-size="11"')}
            ${text(220, 662, "THANK YOU FOR STOPPING BY", 'text-anchor="middle" font-size="12"')}
            ${text(220, 686, "Please come again.", 'text-anchor="middle" font-size="11" fill="#6b7280"')}
        </g>`;
    }
    if (page === 2) {
        return `<g fill="#263444" font-family="Arial, sans-serif" font-size="13">
            ${text(48, 67, "PAYMENT DETAILS", 'font-size="24" font-weight="700"')}
            <path d="M48 104H712M48 270H712M48 422H712M48 580H712" stroke="#d4dae1"/>
            ${text(48, 134, "INVOICE INFORMATION", 'font-size="11" font-weight="700" fill="#697586"')}
            ${text(48, 180, "PAYMENT TERMS")}${text(48, 224, "REFERENCE")}
            ${text(48, 298, "BANK TRANSFER", 'font-size="11" font-weight="700" fill="#697586"')}
            ${text(48, 337, "BENEFICIARY")}${text(48, 381, "ACCOUNT ENDING")}
            ${text(48, 450, "ADDITIONAL INFORMATION", 'font-size="11" font-weight="700" fill="#697586"')}
            ${text(48, 491, "DISCOUNT")}${text(48, 535, "PAID")}
            ${text(48, 626, "Thank you for your business.", 'font-size="17" font-weight="600"')}
            ${text(48, 654, "Please include the invoice reference with your payment.", 'fill="#697586"')}
            ${text(48, 798, "CONTOSO LTD. / ILLUSTRATIVE DOCUMENT", 'font-size="10" fill="#8793a1"')}
            ${text(712, 798, "2 / 2", 'text-anchor="end" font-size="10" fill="#8793a1"')}
        </g>`;
    }
    let x = 48;
    const columns = itemColumns.map((label, index) => {
        const start = x;
        x += itemWidths[index];
        return `${text(start + 5, 493, label.toUpperCase(), 'font-size="9" font-weight="700"')}
            <path d="M${start} 478V582" stroke="#aab3bf"/>`;
    }).join("");
    return `<g fill="#263444" font-family="Arial, sans-serif" font-size="12">
        ${text(712, 70, "INVOICE", 'text-anchor="end" font-size="27" font-weight="700"')}
        ${text(550, 128, "INVOICE:", 'text-anchor="end" font-size="10"')}
        ${text(550, 152, "INVOICE DATE:", 'text-anchor="end" font-size="10"')}
        ${text(550, 176, "DUE DATE:", 'text-anchor="end" font-size="10"')}
        ${text(480, 200, "CUSTOMER NAME:", 'text-anchor="end" font-size="10"')}
        ${text(480, 224, "SERVICE PERIOD:", 'text-anchor="end" font-size="10"')}
        ${text(550, 248, "CUSTOMER ID:", 'text-anchor="end" font-size="10"')}
        ${text(48, 313, "BILL TO:", 'font-weight="700"')}${text(276, 313, "SHIP TO:", 'font-weight="700"')}
        ${text(510, 313, "SERVICE ADDRESS:", 'font-weight="700"')}
        <path d="M48 408H712V454H48ZM48 430H712M155 408V454M294 408V454M430 408V454M557 408V454" fill="none" stroke="#aab3bf"/>
        ${text(55, 424, "SALESPERSON", 'font-size="9" font-weight="700"')}
        ${text(165, 424, "P.O. NUMBER", 'font-size="9" font-weight="700"')}
        ${text(305, 424, "REQUISITIONER", 'font-size="9" font-weight="700"')}
        ${text(442, 424, "SHIPPED VIA", 'font-size="9" font-weight="700"')}
        ${text(569, 424, "TERMS", 'font-size="9" font-weight="700"')}
        <rect x="48" y="478" width="664" height="104" fill="none" stroke="#aab3bf"/>
        <path d="M48 502H712M48 528H712M48 554H712" stroke="#aab3bf"/>
        ${columns}
        ${text(590, 638, "SUBTOTAL", 'text-anchor="end" font-size="10"')}
        ${text(590, 666, "SALES TAX", 'text-anchor="end" font-size="10"')}
        ${text(590, 694, "TOTAL", 'text-anchor="end" font-size="10"')}
        ${text(590, 726, "PREVIOUS UNPAID BALANCE", 'text-anchor="end" font-size="10"')}
        ${text(590, 760, "AMOUNT DUE", 'text-anchor="end" font-size="12" font-weight="700"')}
        ${text(48, 690, "REMIT TO:", 'font-size="11" font-weight="700"')}
        ${text(48, 714, "Contoso Billing")}${text(48, 735, "123 Remit St")}
        ${text(48, 756, "New York, NY 10001")}
        ${text(380, 816, "THANK YOU FOR YOUR BUSINESS!", 'text-anchor="middle" font-size="10" font-weight="700"')}
    </g>`;
}
