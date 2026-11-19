import type { CuContent, CuField, CuRegion } from "../model/types";
import { polygonContainsPolygon } from "../source/geometry";
import { fieldEntries } from "./reviewFields";
import { flattenFields } from "./interaction";

export interface TableFieldMatch {
    targets: readonly CuField[];
    fields: readonly CuField[];
    ambiguous: number;
}

export interface TableFieldLocation {
    table: CuField;
    match: TableFieldMatch;
}

export function tableLocationMessage({ table, match }: TableFieldLocation): string {
    if (match.fields.length) return `${table.name}: ${match.fields.length} related fields located in Fields.${
        match.ambiguous ? ` ${match.ambiguous} ambiguous fields were not located.` : ""}`;
    return match.ambiguous ?
        `${table.name}: field association is ambiguous; no field was chosen. Inspect the original tables in Result.` :
        `${table.name}: no corresponding extracted fields. Inspect the original tables in Result.`;
}

export function tableFieldIds(match: TableFieldMatch): ReadonlySet<string> {
    return new Set(flattenFields([...match.targets]).map(field => field.id));
}

function contains(outer: CuRegion, inner: CuRegion): boolean {
    return outer.pageNumber === inner.pageNumber && polygonContainsPolygon(outer.polygon, inner.polygon);
}

export function matchTableFields(content: CuContent, table: CuField): TableFieldMatch {
    if (!content.tables?.some(item => item.field === table)) throw new Error("The source table does not belong to the current content.");
    const tablesByPage = new Map<number, { field: CuField; region: CuRegion }[]>();
    for (const item of content.tables) for (const region of item.field.regions) {
        const regions = tablesByPage.get(region.pageNumber) ?? [];
        regions.push({ field: item.field, region });
        tablesByPage.set(region.pageNumber, regions);
    }
    interface MatchNode extends TableFieldMatch { grounded: boolean; complete: boolean }
    const nodes = new Map<CuField, MatchNode>();
    const entries = fieldEntries(content.fields);
    for (const { field, inArray } of entries.slice().reverse()) {
        const children = field.children.map(child => nodes.get(child)!);
        const grounded = children.filter(child => child.grounded);
        if (grounded.length) {
            const matched = grounded.flatMap(child => child.fields);
            const complete = grounded.every(child => child.complete);
            nodes.set(field, { grounded: true, complete, fields: matched,
                targets: complete && matched.length && !inArray ? [field] : grounded.flatMap(child => child.targets),
                ambiguous: grounded.reduce((count, child) => count + child.ambiguous, 0) });
            continue;
        }
        let matched = false, complete = field.hasValue && field.regions.length > 0, ambiguous = false;
        if (field.hasValue) for (const region of field.regions) {
            const owners = new Set((tablesByPage.get(region.pageNumber) ?? []).filter(item => contains(item.region, region)).map(item => item.field));
            const unique = owners.has(table) && owners.size === 1;
            matched ||= unique;
            complete &&= unique;
            ambiguous ||= owners.has(table) && owners.size > 1;
        }
        // A region shared by overlapping tables is not evidence for either association.
        if (ambiguous || (inArray && field.children.length > 0)) { matched = false; complete = false; }
        nodes.set(field, { grounded: field.hasValue && field.regions.length > 0, complete,
            fields: matched ? [field] : [], targets: matched ? [field] : [], ambiguous: ambiguous ? 1 : 0 });
    }
    const roots = content.fields.map(field => nodes.get(field)!);
    return { fields: roots.flatMap(node => node.fields), targets: roots.flatMap(node => node.targets),
        ambiguous: roots.reduce((count, node) => count + node.ambiguous, 0) };
}
