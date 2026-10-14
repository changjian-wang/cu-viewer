import type { CuContent, CuField, CuRegion } from "./types";

const fieldColors = ["#d13438", "#ffaa44", "#8cbd18", "#005b70", "#0078d4", "#8378de", "#e3008c", "#a4262c"];

export function fieldRegions(field: CuField | null): CuRegion[] {
    if (!field) return [];
    if (field.regions.length > 0) return field.regions;
    const regions: CuRegion[] = [];
    const stack = field.children.slice().reverse();
    while (stack.length) {
        const current = stack.pop();
        if (!current) break;
        regions.push(...current.regions);
        stack.push(...current.children.slice().reverse());
    }
    return regions;
}

export function primaryRegion(field: CuField | null): CuRegion | undefined {
    return fieldRegions(field)[0];
}

export function fieldRegion(field: CuField | null, index: number): CuRegion | undefined {
    return Number.isSafeInteger(index) && index >= 0 ? fieldRegions(field)[index] : undefined;
}

export function fieldColor(field: CuField, topLevelFields: CuField[]): string {
    const index = topLevelFields.findIndex(root => field.id === root.id || field.id.startsWith(`${root.id}/`));
    return fieldColors[Math.max(0, index) % fieldColors.length] ?? "#0078d4";
}

export interface InteractionState {
    pageNumber: number;
    hovered: CuField | null;
    selected: CuField | null;
    selectedRegionIndex: number;
}

export type InteractionAction =
    | { type: "hover"; field: CuField; pageAvailable: boolean }
    | { type: "leave"; fieldId: string; restorePageAvailable: boolean }
    | { type: "select"; field: CuField; pageAvailable: boolean }
    | { type: "region"; fieldId: string; index: number; pageAvailable: boolean }
    | { type: "page"; pageNumber: number }
    | { type: "dismiss-preview" }
    | { type: "clear" };

export const initialInteraction: InteractionState = { pageNumber: 1, hovered: null, selected: null, selectedRegionIndex: 0 };

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
                    fieldRegion(state.selected, state.selectedRegionIndex)?.pageNumber ?? state.pageNumber : state.pageNumber,
            };
        case "select":
            return {
                ...state, selected: action.field, hovered: null, selectedRegionIndex: 0,
                pageNumber: action.pageAvailable ? primaryRegion(action.field)?.pageNumber ?? state.pageNumber : state.pageNumber,
            };
        case "region": {
            if (state.selected?.id !== action.fieldId) return state;
            const region = fieldRegion(state.selected, action.index);
            if (!region) return state;
            return {
                ...state, hovered: null, selectedRegionIndex: action.index,
                pageNumber: action.pageAvailable ? region.pageNumber : state.pageNumber,
            };
        }
        case "page":
            return { ...state, pageNumber: action.pageNumber, hovered: null };
        case "dismiss-preview":
            return { ...state, hovered: null };
        case "clear":
            return { ...state, hovered: null, selected: null, selectedRegionIndex: 0 };
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
        .map(segment => /^\d+$/.test(segment) ? `Item ${Number(segment) + 1}` :
            segment.replaceAll("~1", "/").replaceAll("~0", "~"))
        .join(" / ") ?? field.name;
}

export function fieldDisplayName(field: CuField): string {
    return /^\d+$/.test(field.name) && field.id.includes(`/valueArray/${field.name}`) ?
        `Item ${Number(field.name) + 1}` : field.name;
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

export function selectableFields(content: CuContent | undefined): CuField[] {
    if (!content) return [];
    return [
        ...flattenFields(content.fields),
        ...(content.paragraphs ?? []).map(item => item.field),
        ...(content.tables ?? []).flatMap(table => [table.field, ...table.cells.map(cell => cell.field)]),
        ...(content.figures ?? []).map(item => item.field),
        ...(content.signatures ?? []).map(item => item.field),
    ];
}
