export const PALETTE = Object.freeze({
    field: { background: "#E8F5E9", text: "#1E3A2A" },
    fieldLow: { background: "#FCE8E6", text: "#9B1C1C" },
    table: { background: "#E8F1FF", text: "#1E40AF" },
    tableLow: { background: "#FFE8EC", text: "#9B1C1C" },
    unavailable: { background: "#F1F3F5", text: "#374151" },
});

export const DEFAULT_SETTINGS = Object.freeze({
    threshold: 0.7,
    showFields: true,
    showTables: true,
    highlightLow: true,
    layout: "two",
    paneRatio: 0.58,
    fieldRatio: 0.46,
});

export class PreferenceError extends Error {}

export function validThreshold(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function formatThreshold(value) {
    if (!validThreshold(value)) throw new RangeError("Threshold must be a finite number from 0 to 1.");
    const text = String(value);
    if (text.includes("e")) return text;
    return text.includes(".") ? text.padEnd(Math.max(text.length, text.indexOf(".") + 3), "0") : `${text}.00`;
}

export function isLow(field, settings) {
    return !field.missing && field.confidence !== undefined && field.confidence < settings.threshold;
}

export function sourceColor(field, settings) {
    if (field.missing || (field.extraction === "table" ? !settings.showTables : !settings.showFields)) return null;
    if (field.confidence === undefined) return PALETTE.unavailable;
    if (isLow(field, settings) && settings.highlightLow) {
        return field.extraction === "table" ? PALETTE.tableLow : PALETTE.fieldLow;
    }
    return field.extraction === "table" ? PALETTE.table : PALETTE.field;
}

export function valueColor(field, settings) {
    return settings.highlightLow && isLow(field, settings) ?
        (field.extraction === "table" ? PALETTE.tableLow : PALETTE.fieldLow) : null;
}

export function displayValue(field) {
    if (field.missing) return "Not returned";
    if (field.kind === "object") return field.summary ?? "";
    if (field.kind === "table") return `${field.rows.length} items`;
    if (field.display !== undefined) return field.display;
    if (field.value === null) return "null";
    if (field.value === "") return '"" (empty string)';
    return String(field.value);
}

export function confidenceLabel(field) {
    return field.confidence === undefined ? "N/A" : field.confidence.toFixed(2);
}

export function confidenceDescription(field, settings) {
    if (field.confidence === undefined) return "Confidence unavailable";
    return `Confidence ${confidenceLabel(field)}, ${isLow(field, settings) ? "below" : "at or above"} threshold ${formatThreshold(settings.threshold)}`;
}

export function copyValue(field) {
    if (field.kind !== "value" || field.missing) throw new RangeError("This field has no returned value to copy.");
    return field.value === "" ? "" : displayValue(field);
}

export function childFields(field) {
    return field.children ?? field.rows?.flat() ?? [];
}

export function allFields(fields) {
    return fields.flatMap(field => [field, ...allFields(childFields(field))]);
}

export function leafFields(fields) {
    return allFields(fields).filter(field => field.kind === "value");
}

export function fieldSummary(fields, query, lowOnly, settings) {
    const leaves = leafFields(fields);
    const missing = leaves.filter(field => field.missing).length;
    return {
        total: leaves.length,
        returned: leaves.length - missing,
        missing,
        low: leaves.filter(field => isLow(field, settings)).length,
        matched: leaves.filter(field => fieldMatches(field, query, lowOnly, settings)).length,
    };
}

export function paneWidth(workspaceWidth, ratio) {
    if (!Number.isFinite(workspaceWidth) || workspaceWidth < 1018 ||
        !Number.isFinite(ratio) || ratio < 0.3 || ratio > 0.7) {
        throw new RangeError("Pane dimensions must preserve the desktop minimum widths.");
    }
    const available = workspaceWidth - 8;
    return Math.round(Math.max(570, Math.min(available - 440, available * ratio)));
}

export function orderedFields(fields, parentId, order) {
    const preferred = order[parentId] ?? [];
    const rank = new Map(preferred.map((id, index) => [id, index]));
    return fields.map((field, index) => ({ field, rank: rank.get(field.id) ?? preferred.length + index }))
        .sort((a, b) => a.rank - b.rank).map(item => item.field);
}

export function fieldMatches(field, query, lowOnly, settings) {
    const needle = query.trim().toLowerCase();
    const ownMatch = !needle || `${field.name} ${field.id} ${displayValue(field)}`.toLowerCase().includes(needle);
    if (field.kind === "value") return ownMatch && (!lowOnly || isLow(field, settings));
    const descendants = leafFields(childFields(field));
    return (ownMatch && descendants.some(item => !lowOnly || isLow(item, settings))) ||
        childFields(field).some(item => fieldMatches(item, query, lowOnly, settings));
}

function siblingsFor(fields, id, parentId = "$root") {
    if (fields.some(field => field.id === id)) return { fields, parentId };
    for (const field of fields) {
        if (field.kind !== "object") continue;
        const found = siblingsFor(field.children, id, field.id);
        if (found) return found;
    }
    return null;
}

export function moveField(fields, order, sourceId, targetId, placement = "before") {
    if (!["before", "after"].includes(placement)) throw new RangeError("Unknown drop placement.");
    const source = siblingsFor(fields, sourceId);
    const target = siblingsFor(fields, targetId);
    if (!source || !target || source.parentId !== target.parentId) {
        throw new RangeError("Only sibling fields can be reordered. Array rows cannot be reordered.");
    }
    if (sourceId === targetId) return order;
    const ids = orderedFields(source.fields, source.parentId, order).map(field => field.id);
    ids.splice(ids.indexOf(sourceId), 1);
    ids.splice(ids.indexOf(targetId) + (placement === "after" ? 1 : 0), 0, sourceId);
    return { ...order, [source.parentId]: ids };
}

export function moveFieldBy(fields, order, sourceId, direction) {
    const source = siblingsFor(fields, sourceId);
    if (!source || ![-1, 1].includes(direction)) throw new RangeError("Choose a sibling field and a direction.");
    const ids = orderedFields(source.fields, source.parentId, order).map(field => field.id);
    const index = ids.indexOf(sourceId);
    const next = index + direction;
    if (next < 0 || next >= ids.length) return order;
    return moveField(fields, order, sourceId, ids[next], direction < 0 ? "before" : "after");
}

export function preferenceKey(schemaId) {
    return `cu-viewer:ui-prototype:v1:${schemaId}`;
}

export function readPreferences(storage, schemaId) {
    let raw;
    try {
        raw = storage.getItem(preferenceKey(schemaId));
    } catch (error) {
        throw new PreferenceError(`Browser preferences could not be read: ${error.message}`);
    }
    if (raw === null) return { settings: { ...DEFAULT_SETTINGS }, order: {} };
    let record;
    try {
        record = JSON.parse(raw);
    } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        throw new PreferenceError("Saved preferences contain invalid JSON. Reset them to enable saving.");
    }
    if (!record || record.format !== "cu-viewer-ui-prototype" || record.version !== 1 ||
        record.schemaId !== schemaId || !record.settings || !validThreshold(record.settings.threshold) ||
        !["two", "three"].includes(record.settings.layout) ||
        !["showFields", "showTables", "highlightLow"].every(key => typeof record.settings[key] === "boolean") ||
        !["paneRatio", "fieldRatio"].every(key => record.settings[key] === undefined ||
            (typeof record.settings[key] === "number" && Number.isFinite(record.settings[key]) &&
                record.settings[key] >= 0.3 && record.settings[key] <= 0.7)) ||
        !record.order || typeof record.order !== "object" || Array.isArray(record.order) ||
        !Object.values(record.order).every(ids => Array.isArray(ids) &&
            ids.every(id => typeof id === "string") && new Set(ids).size === ids.length)) {
        throw new PreferenceError("Saved preferences have an unsupported format. Reset them to enable saving.");
    }
    return { settings: { ...DEFAULT_SETTINGS, ...record.settings }, order: { ...record.order } };
}

export function writePreferences(storage, schemaId, settings, order) {
    const record = { format: "cu-viewer-ui-prototype", version: 1, schemaId, settings, order };
    try {
        storage.setItem(preferenceKey(schemaId), JSON.stringify(record));
    } catch (error) {
        throw new PreferenceError(`Changes were not saved in this browser: ${error.message}`);
    }
}

export function resetPreferences(storage, schemaId) {
    try {
        storage.removeItem(preferenceKey(schemaId));
    } catch (error) {
        throw new PreferenceError(`Saved preferences could not be reset: ${error.message}`);
    }
}

export function clampZoom(zoom) {
    return Math.max(0.25, Math.min(3, zoom));
}

export function rotatedSize(page, rotation) {
    return rotation % 180 ? { width: page.height, height: page.width } : { width: page.width, height: page.height };
}

export function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
}
