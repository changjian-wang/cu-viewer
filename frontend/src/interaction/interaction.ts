import type { CuContent, CuField, CuRegion } from "../model/types";

export function isFieldGroup(field: CuField): boolean {
    return field.type === "object" || field.type === "array" || field.children.length > 0;
}

export function fieldRegions(field: CuField | null): CuRegion[] {
    if (!field) return [];
    const regions = new Map<CuField, CuRegion[]>();
    const stack = [{ field, visited: false }];
    while (stack.length) {
        const current = stack.pop();
        if (!current) break;
        if (!current.visited && current.field.children.length) {
            stack.push({ ...current, visited: true });
            stack.push(...current.field.children.slice().reverse().map(child => ({ field: child, visited: false })));
        } else {
            const descendants = current.field.children.flatMap(child => regions.get(child) ?? []);
            regions.set(current.field, descendants.length ? descendants : current.field.regions);
        }
    }
    return regions.get(field) ?? [];
}

export function primaryRegion(field: CuField | null): CuRegion | undefined {
    return fieldRegions(field)[0];
}

export function fieldRegion(field: CuField | null, index: number): CuRegion | undefined {
    return Number.isSafeInteger(index) && index >= 0 ? fieldRegions(field)[index] : undefined;
}

export interface InteractionState {
    pageNumber: number;
    hovered: CuField | null;
    selected: CuField | null;
    selectedRegionIndex: number;
    hoveredRegionIndex?: number | undefined;
}

export type InteractionAction =
    | { type: "hover"; field: CuField; pageAvailable: boolean; regionIndex?: number }
    | { type: "leave"; fieldId: string; restorePageAvailable: boolean }
    | { type: "select"; field: CuField; pageAvailable: boolean; regionIndex?: number }
    | { type: "region"; fieldId: string; index: number; pageAvailable: boolean }
    | { type: "page"; pageNumber: number }
    | { type: "dismiss-preview" }
    | { type: "clear" };

export const initialInteraction: InteractionState = { pageNumber: 1, hovered: null, selected: null, selectedRegionIndex: 0 };

export function interaction(state: InteractionState, action: InteractionAction): InteractionState {
    switch (action.type) {
        case "hover":
            if (isFieldGroup(action.field)) return state.hovered ? { ...state, hovered: null } : state;
            if (state.selected?.id === action.field.id &&
                (action.regionIndex === undefined || action.regionIndex === state.selectedRegionIndex)) {
                return state.hovered ? { ...state, hovered: null } : state;
            }
            if (state.hovered === action.field && state.hoveredRegionIndex === action.regionIndex) return state;
            return { ...state, hovered: action.field, hoveredRegionIndex: action.regionIndex };
        case "leave":
            if (state.hovered?.id !== action.fieldId) return state;
            return { ...state, hovered: null };
        case "select": {
            const index = action.regionIndex ?? Math.max(0, fieldRegions(action.field).findIndex(region => region.pageNumber === state.pageNumber));
            return {
                ...state, selected: action.field, hovered: null, selectedRegionIndex: index,
                pageNumber: action.pageAvailable ? fieldRegion(action.field, index)?.pageNumber ?? state.pageNumber : state.pageNumber,
            };
        }
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
            return state.hovered ? { ...state, hovered: null } : state;
        case "clear":
            return { ...state, hovered: null, selected: null, selectedRegionIndex: 0 };
    }
}

export function displayValue(field: CuField): string {
    if (!field.hasValue) return "Not returned";
    if (field.value === null) return "null";
    if (field.value === "") return '"" (empty string)';
    if (field.type === "object") return "";
    if (field.type === "array") return `${field.children.length} items`;
    if (typeof field.value === "string") return field.value;
    if (typeof field.value === "number" || typeof field.value === "boolean") return String(field.value);
    const serialized = JSON.stringify(field.value);
    if (serialized === undefined) throw new Error("The parsed field value cannot be displayed as JSON.");
    return serialized;
}

export function formatConfidence(confidence: number, threshold = 0.7): string {
    for (let precision = 2; precision <= 15; precision++) {
        const label = confidence.toFixed(precision);
        if ((Number(label) < threshold) === (confidence < threshold)) return label;
    }
    return String(confidence);
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
