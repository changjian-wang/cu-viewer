import type { ViewerFieldOrder } from "../index";
import { defaultReviewSettings, validateFieldOrder, validateObjectExpansion } from "./reviewFields";
import type { ObjectExpansion, ReviewSettings } from "./reviewFields";

export interface ReviewPreferences {
    settings: ReviewSettings;
    order: ViewerFieldOrder;
    objectExpansion?: ObjectExpansion | undefined;
    useCustomizedFieldOrder?: boolean | undefined;
}

export function preferenceKey(schema: string): string {
    let hash = 2166136261;
    for (let index = 0; index < schema.length; index++) hash = Math.imul(hash ^ schema.charCodeAt(index), 16777619);
    return `cu-viewer:review:v1:${(hash >>> 0).toString(16)}:${schema.length}`;
}

export function validateSettings(value: unknown): ReviewSettings {
    if (!value || typeof value !== "object") throw new Error("Viewer settings must be an object.");
    const settings = { ...defaultReviewSettings, ...value };
    if (!Number.isFinite(settings.threshold) || settings.threshold < 0 || settings.threshold > 1 ||
        typeof settings.showFields !== "boolean" || typeof settings.showTables !== "boolean" ||
        typeof settings.highlightLow !== "boolean" || ![2, 3].includes(settings.columns) ||
        !Number.isFinite(settings.paneRatio) || settings.paneRatio < 0.1 || settings.paneRatio > 0.9 ||
        !Number.isFinite(settings.fieldRatio) || settings.fieldRatio < 0.25 || settings.fieldRatio > 0.7) {
        throw new Error("Viewer preferences contain invalid highlighting or layout settings.");
    }
    // Validate legacy masks, but do not retain filters that no longer have controls.
    if ("sourceCategories" in value) {
        const categories = value.sourceCategories;
        const keys = ["field", "table", "lowField", "lowTable", "unavailable"];
        if (!categories || typeof categories !== "object" || Array.isArray(categories) ||
            Object.keys(categories).length !== keys.length || keys.some(key => !Object.hasOwn(categories, key)) ||
            Object.values(categories).some(value => typeof value !== "boolean")) {
            throw new Error("Viewer preferences contain invalid source highlight categories.");
        }
    }
    return {
        threshold: settings.threshold, showFields: settings.showFields, showTables: settings.showTables,
        highlightLow: settings.highlightLow, columns: settings.columns, paneRatio: settings.paneRatio,
        fieldRatio: settings.fieldRatio,
    };
}

export function readPreferences(storage: Pick<Storage, "getItem">, schema: string): ReviewPreferences | null {
    const text = storage.getItem(preferenceKey(schema));
    if (text === null) return null;
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || !("format" in value) || value.format !== "cu-viewer-review" ||
        !("version" in value) || value.version !== 1 || !("schema" in value) || value.schema !== schema ||
        !("settings" in value) || !("order" in value)) {
        throw new Error("Unrecognized or mismatched Viewer preference record. Reset it explicitly to recover.");
    }
    const customized = "useCustomizedFieldOrder" in value ? value.useCustomizedFieldOrder : undefined;
    if (customized !== undefined && typeof customized !== "boolean") {
        throw new Error("Use Customized Field Order must be a boolean.");
    }
    return { settings: validateSettings(value.settings), order: validateFieldOrder(value.order),
        objectExpansion: "objectExpansion" in value ? validateObjectExpansion(value.objectExpansion) : undefined,
        useCustomizedFieldOrder: customized };
}

export function writePreferences(storage: Pick<Storage, "setItem">, schema: string, preferences: ReviewPreferences): void {
    storage.setItem(preferenceKey(schema), JSON.stringify({
        format: "cu-viewer-review", version: 1, schema, settings: preferences.settings, order: preferences.order,
        objectExpansion: preferences.objectExpansion, useCustomizedFieldOrder: preferences.useCustomizedFieldOrder,
    }));
}
