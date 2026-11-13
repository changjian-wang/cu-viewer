import type { ViewerFieldOrder } from "../index";
import type { CuContent, CuField } from "../model/types";
import { displayValue, fieldDisplayName, flattenFields, formatConfidence as formatScore, isFieldGroup } from "./interaction";
import { isComparisonError } from "../model/fieldComparison";
import type { ComparisonStatus } from "../model/fieldComparison";

export { formatScore, isFieldGroup };

export interface ReviewSettings {
    threshold: number;
    showFields: boolean;
    showTables: boolean;
    highlightLow: boolean;
    columns: 2 | 3;
    paneRatio: number;
    fieldRatio: number;
}

export const defaultReviewSettings: Readonly<ReviewSettings> = {
    threshold: 0.7, showFields: true, showTables: true, highlightLow: true,
    columns: 2, paneRatio: 0.58, fieldRatio: 0.46,
};

export const FIELD_REVIEW_COLORS = {
    default: "#ECF3FC", matched: "#DCFBD7", error: "#FFDADD", lowStroke: "#B43C4B99",
} as const;

export function fieldAppearance(field: Pick<CuField, "confidence">, settings: ReviewSettings, status: ComparisonStatus = "uncompared") {
    const low = field.confidence !== undefined && field.confidence < settings.threshold && settings.highlightLow;
    return {
        low, color: "#243447",
        background: status === "matched" ? FIELD_REVIEW_COLORS.matched : isComparisonError(status) ?
            FIELD_REVIEW_COLORS.error : FIELD_REVIEW_COLORS.default,
        boxShadow: low ? `inset 0 0 0 1px ${FIELD_REVIEW_COLORS.lowStroke}` : undefined,
    };
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

export function appearance(field: Pick<CuField, "confidence">, table: boolean, settings: ReviewSettings, labelMode = false) {
    const enabled = table ? settings.showTables : settings.showFields;
    const low = !labelMode && field.confidence !== undefined && field.confidence < settings.threshold && settings.highlightLow;
    const unavailable = !labelMode && field.confidence === undefined;
    return {
        enabled, low, unavailable,
        background: unavailable ? "#F1F3F5" : low ? table ? "#F6C5CC" : "#FCE8E6" : table ? "#E8F1FF" : "#E8F5E9",
        color: unavailable ? "#374151" : low ? "#9B1C1C" : table ? "#1E40AF" : "#1E3A2A",
    };
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

export function labelSummary(field: CuField): string {
    if (!field.children.length) return isFieldGroup(field) ? collapsedValue(field) : displayValue(field);
    const values: string[] = [];
    const stack = field.children.slice().reverse().map(child => ({ field: child, path: fieldDisplayName(child) }));
    while (stack.length) {
        const entry = stack.pop()!;
        if (entry.field.children.length) {
            stack.push(...entry.field.children.slice().reverse().map(child => ({
                field: child, path: `${entry.path} / ${fieldDisplayName(child)}`,
            })));
        } else values.push(`${entry.path}: ${isFieldGroup(entry.field) ? collapsedValue(entry.field) : displayValue(entry.field)}`);
    }
    return values.join("; ");
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

export function orderedLeafFields(fields: readonly CuField[], order: ViewerFieldOrder,
    included: ReadonlySet<string>): CuField[] {
    const result: CuField[] = [];
    const stack = orderedFields(fields, "$root", order).map(field => ({
        field, path: `/${segment(field.name)}`, inArray: false,
    })).reverse();
    while (stack.length) {
        const entry = stack.pop();
        if (!entry) break;
        const field = entry.field;
        if (!field.children.length) {
            if (included.has(field.id)) result.push(field);
            continue;
        }
        const projection = field.type === "array" ? inlineArrayProjection(field) : null;
        if (projection) {
            for (const row of projection.rows) for (const column of projection.columns) {
                const child = row.cells.get(column.key);
                if (child && included.has(child.id)) result.push(child);
            }
            continue;
        }
        const inArray = entry.inArray || field.type === "array";
        const children = inArray ? field.children : orderedFields(field.children, entry.path, order);
        stack.push(...children.map(field => ({
            field, path: `${entry.path}/${segment(field.name)}`, inArray,
        })).reverse());
    }
    return result;
}

export function initialExpandedFields(fields: readonly CuField[]): Set<string> {
    return new Set(flattenFields([...fields])
        .filter(field => field.type === "array" && field.children.length > 0).map(field => field.id));
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
