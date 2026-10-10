import type { CuField, CuRegion } from "./types";

const fieldColors = ["#d13438", "#ffaa44", "#8cbd18", "#005b70", "#0078d4", "#8378de", "#e3008c", "#a4262c"];

export function primaryRegion(field: CuField | null): CuRegion | undefined {
    const stack = field ? [field] : [];
    while (stack.length) {
        const current = stack.pop();
        if (!current) break;
        if (current.regions[0]) return current.regions[0];
        stack.push(...current.children.slice().reverse());
    }
    return undefined;
}

export function fieldColor(field: CuField, topLevelFields: CuField[]): string {
    const index = topLevelFields.findIndex(root => field.id === root.id || field.id.startsWith(`${root.id}/`));
    return fieldColors[Math.max(0, index) % fieldColors.length] ?? "#0078d4";
}

export interface InteractionState {
    pageNumber: number;
    hovered: CuField | null;
    selected: CuField | null;
}

export type InteractionAction =
    | { type: "hover"; field: CuField; pageAvailable: boolean }
    | { type: "leave"; fieldId: string; restorePageAvailable: boolean }
    | { type: "select"; field: CuField; pageAvailable: boolean }
    | { type: "page"; pageNumber: number }
    | { type: "clear" };

export const initialInteraction: InteractionState = { pageNumber: 1, hovered: null, selected: null };

export function interaction(state: InteractionState, action: InteractionAction): InteractionState {
    switch (action.type) {
        case "hover":
            return {
                ...state, hovered: action.field,
                pageNumber: action.pageAvailable ? primaryRegion(action.field)?.pageNumber ?? state.pageNumber : state.pageNumber,
            };
        case "leave":
            if (state.hovered?.id !== action.fieldId) return state;
            return {
                ...state, hovered: null,
                pageNumber: action.restorePageAvailable && primaryRegion(state.hovered)?.pageNumber === state.pageNumber ?
                    primaryRegion(state.selected)?.pageNumber ?? state.pageNumber : state.pageNumber,
            };
        case "select":
            return {
                ...state, selected: action.field, hovered: null,
                pageNumber: action.pageAvailable ? primaryRegion(action.field)?.pageNumber ?? state.pageNumber : state.pageNumber,
            };
        case "page":
            return { ...state, pageNumber: action.pageNumber, hovered: null };
        case "clear":
            return { ...state, hovered: null, selected: null };
    }
}

export function displayValue(field: CuField): string {
    if (!field.hasValue) return "Not returned";
    if (field.value === null) return "null";
    if (field.value === "") return '"" (empty string)';
    if (field.type === "object") return `${field.children.length} properties`;
    if (field.type === "array") return `${field.children.length} items`;
    if (typeof field.value === "string") return field.value;
    if (typeof field.value === "number" || typeof field.value === "boolean") return String(field.value);
    const serialized = JSON.stringify(field.value);
    if (serialized === undefined) throw new Error("The parsed field value cannot be displayed as JSON.");
    return serialized;
}

export function formatConfidence(confidence: number): string {
    return `${(confidence * 100).toFixed(2)}%`;
}

export function fieldLabel(field: CuField): string {
    return field.id.split("/fields/")[1]?.split("/")
        .filter((_, index) => index % 2 === 0)
        .map(segment => segment.replaceAll("~1", "/").replaceAll("~0", "~"))
        .join(" / ") ?? field.name;
}

export function flattenFields(fields: CuField[]): CuField[] {
    const result: CuField[] = [];
    const stack = fields.slice().reverse();
    while (stack.length) {
        const field = stack.pop();
        if (!field) break;
        result.push(field);
        stack.push(...field.children.slice().reverse());
    }
    return result;
}
