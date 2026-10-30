import type { ViewerFieldOrder } from "../index";
import type { CuContent, CuField } from "../model/types";
import { displayValue, flattenFields, formatConfidence as formatScore, isFieldGroup } from "./interaction";

export { formatScore, isFieldGroup };

export const defaultSourceCategories = {
    field: true, table: true, lowField: true, lowTable: true, unavailable: true,
} as const;
export type SourceHighlightCategory = keyof typeof defaultSourceCategories;
export type SourceCategoryVisibility = Readonly<Record<SourceHighlightCategory, boolean>>;

export interface ReviewSettings {
    threshold: number;
    showFields: boolean;
    showTables: boolean;
    highlightLow: boolean;
    sourceCategories: SourceCategoryVisibility;
    columns: 2 | 3;
    paneRatio: number;
    fieldRatio: number;
}

export const defaultReviewSettings: Readonly<ReviewSettings> = {
    threshold: 0.7, showFields: true, showTables: true, highlightLow: true,
    sourceCategories: defaultSourceCategories,
    columns: 2, paneRatio: 0.58, fieldRatio: 0.46,
};

export function sourceCategoryVisibility(settings: { sourceCategories?: SourceCategoryVisibility }): SourceCategoryVisibility {
    // Older in-memory preference snapshots can predate category visibility.
    return settings.sourceCategories === undefined ? defaultSourceCategories : settings.sourceCategories;
}

export function leafFields(fields: readonly CuField[]): CuField[] {
    return flattenFields([...fields]).filter(field => field.children.length === 0);
}

export function isTableValue(field: CuField): boolean {
    return field.type === "array" || field.detailView === "tables" || field.id.includes("/valueArray/");
}

export function isLowConfidence(field: CuField, threshold: number): boolean {
    return field.confidence !== undefined && field.confidence < threshold;
}

export function appearance(field: Pick<CuField, "confidence">, table: boolean, settings: ReviewSettings) {
    const enabled = table ? settings.showTables : settings.showFields;
    const low = field.confidence !== undefined && field.confidence < settings.threshold && settings.highlightLow;
    const unavailable = field.confidence === undefined;
    return {
        enabled, low, unavailable,
        background: unavailable ? "#F1F3F5" : low ? table ? "#FFE8EC" : "#FCE8E6" : table ? "#E8F1FF" : "#E8F5E9",
        color: unavailable ? "#374151" : low ? "#9B1C1C" : table ? "#1E40AF" : "#1E3A2A",
    };
}

export function sourceAppearance(field: Pick<CuField, "confidence">, table: boolean, settings: ReviewSettings) {
    const style = appearance(field, table, settings);
    const category: SourceHighlightCategory = style.unavailable ? "unavailable" :
        style.low ? table ? "lowTable" : "lowField" : table ? "table" : "field";
    return { ...style, enabled: style.enabled && sourceCategoryVisibility(settings)[category] };
}

export function sourceCategoryDisabledReason(category: SourceHighlightCategory, settings: ReviewSettings): string | null {
    if ((category === "field" || category === "lowField") && !settings.showFields) {
        return "Enable Show field highlights in settings.";
    }
    if ((category === "table" || category === "lowTable") && !settings.showTables) {
        return "Enable Show table highlights in settings.";
    }
    if ((category === "lowField" || category === "lowTable") && !settings.highlightLow) {
        return "Enable Show low confidence highlight in settings.";
    }
    if (category === "unavailable" && !settings.showFields && !settings.showTables) {
        return "Enable field or table highlights in settings.";
    }
    return null;
}

export function parseThreshold(text: string): number {
    if (!text.trim()) throw new Error("Enter a confidence threshold from 0 to 1.");
    const value = Number(text);
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("Enter a finite confidence threshold from 0 to 1.");
    return value;
}

export function formatThreshold(value: number): string {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError("Threshold must be a finite number from 0 to 1.");
    const text = String(value);
    if (text.includes("e")) return text;
    return text.includes(".") ? text.padEnd(Math.max(text.length, text.indexOf(".") + 3), "0") : `${text}.00`;
}

export function confidenceDescription(field: Pick<CuField, "confidence">, threshold: number): string {
    return field.confidence === undefined ? "Confidence unavailable" :
        `Confidence ${formatScore(field.confidence, threshold)}, ${field.confidence < threshold ? "below" : "at or above"} threshold ${formatThreshold(threshold)}`;
}

export function copyValue(field: CuField): string {
    if (!field.hasValue) throw new Error("This field was not returned and cannot be copied.");
    if (field.value === "") return "";
    if (isFieldGroup(field)) {
        const serialized = JSON.stringify(field.value, null, 2);
        if (serialized === undefined) throw new Error("The field has no serializable value.");
        return serialized;
    }
    return displayValue(field);
}

export function collapsedValue(field: CuField, included?: ReadonlySet<string>): string {
    if (!field.hasValue || field.type !== "object" || field.value === null || field.value === "") return displayValue(field);
    const values: string[] = [];
    const stack = field.children.slice().reverse();
    while (stack.length) {
        const child = stack.pop();
        if (!child || !child.hasValue) continue;
        if (child.type === "object" && child.value !== null && child.value !== "") {
            if (child.children.length) { stack.push(...child.children.slice().reverse()); continue; }
            if (!included || included.has(child.id)) values.push("{}");
        } else if (!included || included.has(child.id) ||
            (child.type === "array" && leafFields([child]).some(field => included.has(field.id)))) values.push(displayValue(child));
    }
    return values.length ? values.join(" ") : field.children.length ? "Not returned" : "{}";
}

function segment(value: string): string {
    return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

export interface FieldEntry {
    field: CuField;
    path: string;
    parent: string;
    depth: number;
    inArray: boolean;
}

export function fieldEntries(fields: readonly CuField[]): FieldEntry[] {
    const result: FieldEntry[] = [];
    const stack = fields.map(field => ({ field, path: `/${segment(field.name)}`, parent: "$root", depth: 0, inArray: false })).reverse();
    while (stack.length) {
        const entry = stack.pop();
        if (!entry) break;
        result.push(entry);
        stack.push(...entry.field.children.map(field => ({
            field, path: `${entry.path}/${segment(field.name)}`, parent: entry.path,
            depth: entry.depth + 1, inArray: entry.inArray || entry.field.type === "array",
        })).reverse());
    }
    return result;
}

const pointer = /^(?:\/(?:[^~/]|~[01])*)+$/;

export function validateFieldOrder(value: unknown): ViewerFieldOrder {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Field order must be a parent-path mapping.");
    const order: Record<string, readonly string[]> = {};
    for (const [parent, raw] of Object.entries(value)) {
        const children: unknown = raw;
        if ((parent !== "$root" && !pointer.test(parent)) || !Array.isArray(children)) {
            throw new Error(`Invalid sibling field order for ${parent}. Use unique, direct child JSON-pointer paths.`);
        }
        const paths: readonly unknown[] = children;
        const valid: string[] = [];
        for (const child of paths) {
            if (typeof child !== "string" || !pointer.test(child) ||
                (child.slice(0, child.lastIndexOf("/")) || "$root") !== parent || valid.includes(child)) {
                throw new Error(`Invalid sibling field order for ${parent}. Use unique, direct child JSON-pointer paths.`);
            }
            valid.push(child);
        }
        order[parent] = valid;
    }
    return order;
}

export function validateOrderParents(order: ViewerFieldOrder, entries: readonly FieldEntry[]): void {
    const byPath = new Map(entries.map(entry => [entry.path, entry]));
    for (const parent of Object.keys(order)) {
        const entry = byPath.get(parent);
        if (entry && (entry.inArray || entry.field.type === "array" || !isFieldGroup(entry.field))) {
            throw new Error(`Field order cannot reorder array rows, cells, or scalar children (${parent}).`);
        }
    }
}

export function orderedFields(fields: readonly CuField[], parent: string, order: ViewerFieldOrder): CuField[] {
    const rank = new Map((order[parent] ?? []).map((path, index) => [path, index]));
    const path = (field: CuField): string => `${parent === "$root" ? "" : parent}/${segment(field.name)}`;
    return [...fields].sort((a, b) => (rank.get(path(a)) ?? rank.size) - (rank.get(path(b)) ?? rank.size));
}

export function initialExpandedFields(fields: readonly CuField[], order: ViewerFieldOrder = {}, rowBudget = 40): Set<string> {
    if (!Number.isSafeInteger(rowBudget) || rowBudget < 0) throw new RangeError("Initial visible-row budget must be a nonnegative safe integer.");
    const expanded = new Set<string>();
    const roots = orderedFields(fields, "$root", order);
    let remaining = rowBudget - roots.length;
    if (remaining <= 0) return expanded;
    const array = roots.find(field => field.type === "array" && field.children.length > 0);
    if (array && array.children.length <= remaining) {
        const cost = array.children.length + (inlineArrayProjection(array) ? 1 : 0);
        if (cost <= remaining) { expanded.add(array.id); remaining -= cost; }
    }
    for (const field of roots) {
        if (field.type !== "object" || field.children.length === 0 || field.children.length > remaining) continue;
        expanded.add(field.id);
        remaining -= field.children.length;
    }
    return expanded;
}

export function moveField(entries: readonly FieldEntry[], order: ViewerFieldOrder, from: string, to: string,
    placement?: "before" | "after"): ViewerFieldOrder {
    const source = entries.find(entry => entry.field.id === from);
    const target = entries.find(entry => entry.field.id === to);
    if (!source || !target || source.parent !== target.parent || source.inArray || target.inArray) {
        throw new Error("Move fields only within the same object; array rows and cells cannot be reordered.");
    }
    if (source.field === target.field) return order;
    const siblings = entries.filter(entry => entry.parent === source.parent);
    const sorted = orderedFields(siblings.map(entry => entry.field), source.parent, order);
    const paths = new Map(siblings.map(entry => [entry.field, entry.path]));
    const fromIndex = sorted.indexOf(source.field), toIndex = sorted.indexOf(target.field);
    sorted.splice(fromIndex, 1);
    sorted.splice(placement ? sorted.indexOf(target.field) + (placement === "after" ? 1 : 0) : toIndex, 0, source.field);
    return { ...order, [source.parent]: sorted.map(field => paths.get(field)!) };
}

export function matchingLeaves(fields: readonly CuField[], query: string, lowOnly: boolean,
    hideMissing: boolean, threshold: number, summaryFields?: ReadonlySet<string>): Set<string> {
    const found = new Set<string>();
    const needle = query.trim().toLocaleLowerCase();
    const stack = fields.map(field => ({ field, parentMatched: false }));
    while (stack.length) {
        const item = stack.pop();
        if (!item) break;
        const { field } = item;
        if (hideMissing && !field.hasValue) continue;
        const matched = item.parentMatched || !needle ||
            `${field.name} ${field.path} ${collapsedValue(field, summaryFields)}`.toLocaleLowerCase().includes(needle);
        if (field.children.length) {
            stack.push(...field.children.map(child => ({ field: child, parentMatched: matched })));
        } else if (matched && (!hideMissing || field.hasValue) && (!lowOnly || isLowConfidence(field, threshold))) {
            found.add(field.id);
        }
    }
    return found;
}

export function visibleFieldIds(fields: readonly CuField[], matches: ReadonlySet<string>): Set<string> {
    const visible = new Set(matches);
    const entries = flattenFields([...fields]).reverse();
    for (const field of entries) if (field.children.some(child => visible.has(child.id))) visible.add(field.id);
    return visible;
}

export function inlineArrayProjection(field: CuField): {
    columns: { key: string; label: string }[];
    rows: { field: CuField; index: number; cells: ReadonlyMap<string, CuField> }[];
} | null {
    const columns = new Map<string, string>();
    const rows: { field: CuField; index: number; cells: ReadonlyMap<string, CuField> }[] = [];
    for (const [index, row] of field.children.entries()) {
        const cells = new Map<string, CuField>();
        const stack = row.children.length ? row.children.map(child => ({
            field: child, key: `/${segment(child.name)}`, labels: [child.name],
        })).reverse() : [{ field: row, key: "$value", labels: ["Value"] }];
        while (stack.length) {
            const entry = stack.pop();
            if (!entry) break;
            if (entry.field.type === "array" && entry.field.children.length) return null;
            if (entry.field.children.length) stack.push(...entry.field.children.map(child => ({
                field: child, key: `${entry.key}/${segment(child.name)}`, labels: [...entry.labels, child.name],
            })).reverse());
            else {
                if (!columns.has(entry.key)) columns.set(entry.key, entry.labels.join(" / "));
                cells.set(entry.key, entry.field);
            }
        }
        rows.push({ field: row, index, cells });
    }
    return { columns: [...columns].map(([key, label]) => ({ key, label })), rows };
}

export function schemaIdentity(content: CuContent | undefined, apiVersion: string | undefined, analyzerId?: string): string {
    const structure = new Set<string>();
    const stack = (content?.fields ?? []).map(field => ({ field, path: `/${segment(field.name)}` }));
    while (stack.length) {
        const entry = stack.pop();
        if (!entry) break;
        structure.add(JSON.stringify([entry.path, entry.field.type]));
        stack.push(...entry.field.children.map(field => ({
            field, path: `${entry.path}/${entry.field.type === "array" ? "*" : segment(field.name)}`,
        })));
    }
    return JSON.stringify([content?.analyzerId ?? analyzerId ?? "", apiVersion ?? "", content?.kind ?? "", [...structure].sort()]);
}
