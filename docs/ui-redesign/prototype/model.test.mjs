import assert from "node:assert/strict";
import test from "node:test";
import {
    PALETTE, DEFAULT_SETTINGS, PreferenceError, validThreshold, formatThreshold, sourceColor, valueColor,
    displayValue, confidenceDescription, copyValue, fieldSummary, paneWidth,
    allFields, leafFields, orderedFields, fieldMatches, moveField, moveFieldBy,
    preferenceKey, readPreferences, writePreferences, resetPreferences, clampZoom, rotatedSize, escapeHtml,
} from "./model.mjs";
import { PROFILES } from "./fixtures.mjs";

const settings = { ...DEFAULT_SETTINGS };
const field = (confidence, extraction = "field") => ({ confidence, extraction, kind: "value", value: 0, name: "Test", id: "/Test" });
const storage = () => {
    const records = new Map();
    return {
        getItem: key => records.get(key) ?? null,
        setItem: (key, value) => records.set(key, value),
        removeItem: key => records.delete(key),
    };
};

test("threshold accepts exactly 0 through 1 and rejects missing or non-finite input", () => {
    for (const value of [0, 0.7, 1]) assert.equal(validThreshold(value), true);
    for (const value of [-0.01, 1.01, NaN, Infinity, "", null, undefined]) assert.equal(validThreshold(value), false);
});

test("threshold display preserves precision across settings reloads", () => {
    assert.equal(formatThreshold(0.7), "0.70");
    assert.equal(formatThreshold(0), "0.00");
    assert.equal(formatThreshold(1), "1.00");
    assert.equal(formatThreshold(0.385), "0.385");
    assert.equal(Number(formatThreshold(1e-12)), 1e-12);
    assert.throws(() => formatThreshold(NaN), RangeError);
});

test("source palette uses the exact threshold, extraction type and unavailable state", () => {
    assert.deepEqual(sourceColor(field(0.7), settings), { background: "#E8F5E9", text: "#1E3A2A" });
    assert.deepEqual(sourceColor(field(0.69999), settings), { background: "#FCE8E6", text: "#9B1C1C" });
    assert.deepEqual(sourceColor(field(0.7, "table"), settings), { background: "#E8F1FF", text: "#1E40AF" });
    assert.deepEqual(sourceColor(field(0.69999, "table"), settings), { background: "#FFE8EC", text: "#9B1C1C" });
    assert.deepEqual(sourceColor(field(undefined), settings), { background: "#F1F3F5", text: "#374151" });
    assert.deepEqual(sourceColor(field(undefined, "table"), settings), PALETTE.unavailable);
    assert.equal(sourceColor(field(0), settings), PALETTE.fieldLow);
    assert.equal(sourceColor({ ...field(0.1), missing: true }, settings), null);
});

test("category switches take priority and low-confidence off restores base colors", () => {
    for (const highlightLow of [true, false]) {
        assert.equal(sourceColor(field(0.1), { ...settings, showFields: false, highlightLow }), null);
        assert.equal(sourceColor(field(0.1, "table"), { ...settings, showTables: false, highlightLow }), null);
    }
    assert.equal(sourceColor(field(0.1), { ...settings, highlightLow: false }), PALETTE.field);
    assert.equal(sourceColor(field(0.1, "table"), { ...settings, highlightLow: false }), PALETTE.table);
    assert.equal(valueColor(field(0.1), { ...settings, highlightLow: false }), null);
    assert.equal(valueColor(field(0.9), settings), null);
    assert.equal(valueColor(field(undefined), settings), null);
});

test("zero, false, null, empty strings and missing values remain distinct", () => {
    assert.equal(displayValue({ ...field(0), value: 0 }), "0");
    assert.equal(displayValue({ ...field(0), value: false }), "false");
    assert.equal(displayValue({ ...field(0), value: null }), "null");
    assert.equal(displayValue({ ...field(0), value: "" }), '"" (empty string)');
    assert.equal(displayValue({ ...field(0), missing: true }), "Not returned");
});

test("field counts consistently include missing fields and count table cells individually", () => {
    const fields = PROFILES[0].fields;
    assert.deepEqual(fieldSummary(fields, "", false, settings),
        { total: 68, returned: 67, missing: 1, low: 6, matched: 68 });
    assert.equal(fieldSummary(fields, "", true, settings).matched, 6);
    assert.equal(fieldSummary(fields, "Printing Fee", false, settings).matched, 1);
});

test("value copying preserves display formatting and real empty, zero and false values", () => {
    assert.equal(copyValue({ ...field(0.9), value: "", display: undefined }), "");
    assert.equal(copyValue({ ...field(0.9), value: 0 }), "0");
    assert.equal(copyValue({ ...field(0.9), value: false }), "false");
    assert.equal(copyValue({ ...field(0.9), value: null }), "null");
    assert.equal(copyValue({ ...field(0.9), value: 610, display: "$610.00" }), "$610.00");
    assert.throws(() => copyValue({ ...field(0.9), missing: true }), /no returned value/);
});

test("confidence descriptions provide status without relying on color", () => {
    assert.equal(confidenceDescription(field(undefined), settings), "Confidence unavailable");
    assert.match(confidenceDescription(field(0.38), settings), /0.38, below threshold 0.70/);
    assert.match(confidenceDescription(field(0.7), settings), /at or above threshold/);
});

test("pane sizing respects both minimum widths at desktop sizes", () => {
    for (const width of [1030, 1280, 1536, 1920]) {
        for (const ratio of [0.3, 0.46, 0.58, 0.7]) {
            const source = paneWidth(width, ratio);
            assert.ok(source >= 570);
            assert.ok(width - 8 - source >= 440);
        }
    }
    assert.equal(paneWidth(1536, 0.58), 886);
    assert.throws(() => paneWidth(800, 0.58), RangeError);
    assert.throws(() => paneWidth(1536, NaN), RangeError);
});

test("search includes nested values and retains matching ancestor groups", () => {
    const customer = PROFILES[0].fields.find(item => item.id === "/Customer");
    assert.equal(fieldMatches(customer, "microsoft corporation", false, settings), true);
    assert.equal(fieldMatches(customer, "RECIPIENT", true, settings), true);
    assert.equal(fieldMatches(customer, "not a field", false, settings), false);
    assert.equal(fieldMatches(customer.children[0], "", true, settings), false);
});

test("sibling ordering is immutable and groups move with their children", () => {
    const fields = PROFILES[0].fields;
    const before = JSON.stringify(fields);
    const order = moveField(fields, {}, "/AmountDue", "/InvoiceId");
    assert.equal(orderedFields(fields, "$root", order)[0].id, "/AmountDue");
    const nested = moveField(fields, order, "/Customer/Recipient", "/Customer/CustomerName");
    const customer = fields.find(item => item.id === "/Customer");
    assert.equal(orderedFields(customer.children, customer.id, nested)[0].id, "/Customer/Recipient");
    const movedGroup = moveField(fields, {}, "/Customer", "/InvoiceId");
    assert.equal(orderedFields(fields, "$root", movedGroup)[0], customer);
    assert.equal(JSON.stringify(fields), before);
});

test("cross-parent, array-cell and business-row moves are rejected", () => {
    const fields = PROFILES[0].fields;
    assert.throws(() => moveField(fields, {}, "/Customer/Recipient", "/InvoiceId"), /sibling/);
    assert.throws(() => moveField(fields, {}, "/LineItems/0/Date", "/LineItems/0/Qty"), /Array rows/);
    assert.throws(() => moveField(fields, {}, "/InvoiceId", "/DueDate", "replace"), /placement/);
});

test("keyboard ordering handles boundaries and new fields remain visible", () => {
    const fields = PROFILES[0].fields;
    const order = moveFieldBy(fields, {}, "/InvoiceDate", -1);
    assert.equal(orderedFields(fields, "$root", order)[0].id, "/InvoiceDate");
    assert.deepEqual(moveFieldBy(fields, {}, "/InvoiceId", -1), {});
    const withNew = [...fields, field(0.9)];
    const ordered = orderedFields(withNew, "$root", { $root: ["/Removed", "/AmountDue"] });
    assert.equal(ordered[0].id, "/AmountDue");
    assert.equal(ordered.at(-1).id, "/Test");
    assert.equal(ordered.length, withNew.length);
});

test("preferences persist by schema with a versioned format and can reset", () => {
    const local = storage();
    const order = { $root: ["/AmountDue", "/InvoiceId"] };
    writePreferences(local, "invoice-example", { ...settings, layout: "three" }, order);
    assert.deepEqual(readPreferences(local, "invoice-example").order, order);
    assert.equal(readPreferences(local, "invoice-example").settings.layout, "three");
    assert.deepEqual(readPreferences(local, "receipt-example").order, {});
    resetPreferences(local, "invoice-example");
    assert.deepEqual(readPreferences(local, "invoice-example").settings, settings);
});

test("older saved preferences retain order and receive new layout defaults", () => {
    const local = storage();
    const legacySettings = { threshold: 0.7, showFields: true, showTables: true, highlightLow: true, layout: "three" };
    local.setItem(preferenceKey("invoice"), JSON.stringify({
        format: "cu-viewer-ui-prototype", version: 1, schemaId: "invoice",
        settings: legacySettings, order: { $root: ["/AmountDue"] },
    }));
    const record = readPreferences(local, "invoice");
    assert.equal(record.settings.layout, "three");
    assert.equal(record.settings.paneRatio, 0.58);
    assert.equal(record.settings.fieldRatio, 0.46);
    assert.deepEqual(record.order.$root, ["/AmountDue"]);
    writePreferences(local, "invoice", { ...record.settings, paneRatio: 0.52, fieldRatio: 0.6 }, record.order);
    assert.equal(readPreferences(local, "invoice").settings.fieldRatio, 0.6);
    local.setItem(preferenceKey("invoice"), JSON.stringify({
        format: "cu-viewer-ui-prototype", version: 1, schemaId: "invoice",
        settings: { ...settings, paneRatio: 2 }, order: {},
    }));
    assert.throws(() => readPreferences(local, "invoice"), PreferenceError);
});

test("corrupt and incompatible preferences are reported without overwriting", () => {
    const local = storage();
    const key = preferenceKey("invoice");
    for (const invalid of ["{broken", "null", '{"version":99}', JSON.stringify({
        format: "cu-viewer-ui-prototype", version: 1, schemaId: "invoice",
        settings: { ...settings, threshold: 4 }, order: {},
    })]) {
        local.setItem(key, invalid);
        assert.throws(() => readPreferences(local, "invoice"), PreferenceError);
        assert.equal(local.getItem(key), invalid);
    }
});

test("unavailable browser storage never reports a successful save", () => {
    const unavailable = {
        getItem() { throw new Error("blocked"); },
        setItem() { throw new Error("quota exceeded"); },
        removeItem() { throw new Error("blocked"); },
    };
    assert.throws(() => readPreferences(unavailable, "invoice"), /could not be read/);
    assert.throws(() => writePreferences(unavailable, "invoice", settings, {}), /not saved/);
    assert.throws(() => resetPreferences(unavailable, "invoice"), /could not be reset/);
});

test("all simulated values have unique stable identities and valid source coordinates", () => {
    for (const profile of PROFILES) {
        const fields = allFields(profile.fields);
        assert.equal(new Set(fields.map(item => item.id)).size, fields.length);
        for (const item of leafFields(profile.fields)) {
            assert.ok(item.confidence === undefined || validThreshold(item.confidence));
            for (const region of item.regions) {
                const page = profile.pages[region.page - 1];
                assert.ok(page && region.x >= 0 && region.y >= 0);
                assert.ok(region.width > 0 && region.height > 0);
                assert.ok(region.x + region.width <= page.width && region.y + region.height <= page.height);
            }
        }
    }
});

test("geometry bounds and HTML escaping preserve the expected shapes", () => {
    assert.equal(clampZoom(0.01), 0.25);
    assert.equal(clampZoom(10), 3);
    assert.deepEqual(rotatedSize({ width: 760, height: 850 }, 90), { width: 850, height: 760 });
    assert.equal(escapeHtml('<img src="x">&'), "&lt;img src=&quot;x&quot;&gt;&amp;");
});
