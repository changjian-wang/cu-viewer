import type { CuField } from "./types";

export type ComparisonStatus = "uncompared" | "matched" | "different" | "extra" | "missing";
export type ComparisonFilter = "all" | "matched" | "errors";

export interface FieldComparisonNode {
    path: string;
    field: CuField;
    label: CuField | undefined;
    extracted: CuField | undefined;
    children: FieldComparisonNode[];
    status: ComparisonStatus;
    matched: number;
    errors: number;
    array: FieldComparisonNode | undefined;
}

export interface FieldComparison {
    comparable: boolean;
    roots: FieldComparisonNode[];
    fields: CuField[];
    nodes: FieldComparisonNode[];
    byFieldId: ReadonlyMap<string, FieldComparisonNode>;
    matched: number;
    errors: number;
}

export function isComparisonError(status: ComparisonStatus): boolean {
    return status === "different" || status === "extra" || status === "missing";
}

function equalJson(first: unknown, second: unknown): boolean {
    const stack: [unknown, unknown][] = [[first, second]];
    while (stack.length) {
        const [left, right] = stack.pop()!;
        if (left === right) continue;
        if (!left || !right || typeof left !== "object" || typeof right !== "object" ||
            Array.isArray(left) !== Array.isArray(right)) return false;
        const keys = Object.keys(left);
        if (keys.length !== Object.keys(right).length) return false;
        for (const key of keys) {
            if (!Object.hasOwn(right, key)) return false;
            stack.push([Reflect.get(left, key), Reflect.get(right, key)]);
        }
    }
    return true;
}

export function compareFields(labels: readonly CuField[], extracted: readonly CuField[], comparable: boolean): FieldComparison {
    const comparison: FieldComparison = {
        comparable, roots: [], fields: [], nodes: [], byFieldId: new Map(), matched: 0, errors: 0,
    };
    const byId = new Map<string, FieldComparisonNode>();
    const stack: { labels: readonly CuField[]; extracted: readonly CuField[]; path: string;
        nodes: FieldComparisonNode[]; fields: CuField[]; array: FieldComparisonNode | undefined }[] = [
        { labels, extracted: comparable ? extracted : [], path: "", nodes: comparison.roots, fields: comparison.fields, array: undefined },
    ];
    while (stack.length) {
        const frame = stack.pop()!;
        const labelByName = new Map(frame.labels.map(field => [field.name, field]));
        const extractedByName = new Map(frame.extracted.map(field => [field.name, field]));
        const names = new Set([...labelByName.keys(), ...extractedByName.keys()]);
        for (const name of names) {
            const label = labelByName.get(name), value = extractedByName.get(name);
            const primary = label ?? value;
            if (!primary) throw new Error("A comparison field has no original value.");
            const display = primary.hasValue ? primary : value?.hasValue ? value : primary;
            const field: CuField = { ...display, id: primary.id, path: primary.path, children: [] };
            const node: FieldComparisonNode = {
                path: `${frame.path}/${name.replaceAll("~", "~0").replaceAll("/", "~1")}`,
                field, label, extracted: value, children: [], status: "uncompared", matched: 0, errors: 0, array: frame.array,
            };
            frame.nodes.push(node); frame.fields.push(field); comparison.nodes.push(node);
            if (label) byId.set(label.id, node);
            if (value) byId.set(value.id, node);
            const conflict = label?.hasValue && value?.hasValue &&
                (label.type !== value.type || (label.value === null) !== (value.value === null));
            if (!conflict && ((label?.children.length ?? 0) > 0 || (value?.children.length ?? 0) > 0)) {
                stack.push({ labels: label?.children ?? [], extracted: value?.children ?? [], path: node.path,
                    nodes: node.children, fields: field.children, array: field.type === "array" ? node : frame.array });
            } else if (comparable) {
                node.status = !label?.hasValue ? value?.hasValue ? "extra" : "uncompared" :
                    !value?.hasValue ? "missing" : label.type === value.type && equalJson(label.value, value.value) ? "matched" : "different";
            }
        }
    }
    for (const node of comparison.nodes.slice().reverse()) {
        if (node.children.length) {
            node.matched = node.children.reduce((sum, child) => sum + child.matched, 0);
            node.errors = node.children.reduce((sum, child) => sum + child.errors, 0);
            node.status = node.errors ? "different" : node.matched ? "matched" : "uncompared";
        } else {
            node.matched = Number(node.status === "matched");
            node.errors = Number(isComparisonError(node.status));
        }
    }
    comparison.byFieldId = byId;
    comparison.matched = comparison.roots.reduce((sum, node) => sum + node.matched, 0);
    comparison.errors = comparison.roots.reduce((sum, node) => sum + node.errors, 0);
    return comparison;
}

export function comparisonStatusText(status: ComparisonStatus): string {
    switch (status) {
        case "matched": return "Matches label";
        case "different": return "Does not match label";
        case "extra": return "Extracted value without a label";
        case "missing": return "Label value was not extracted";
        case "uncompared": return "Not compared";
    }
}

export function comparisonOriginal(comparison: FieldComparison | undefined, field: CuField): CuField {
    const node = comparison?.byFieldId.get(field.id);
    return node?.extracted?.hasValue ? node.extracted : node?.label ?? node?.extracted ?? field;
}
