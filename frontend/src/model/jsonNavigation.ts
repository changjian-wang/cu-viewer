import { parseSource, pointerSegment } from "./parseCuResult";
import type { CuContent, CuField, CuParseIssue } from "./types";

export interface JsonNode {
    path: string;
    parentPath: string | null;
    key: string | undefined;
    value: unknown;
    children: JsonNode[];
}

export function indexJson(value: unknown) {
    const root: JsonNode = { path: "", parentPath: null, key: undefined, value, children: [] };
    const nodes = new Map<string, JsonNode>();
    const properties: JsonNode[] = [];
    const stack = [root];
    while (stack.length) {
        const node = stack.pop()!;
        nodes.set(node.path, node);
        if (node.key !== undefined) properties.push(node);
        if (typeof node.value !== "object" || node.value === null) continue;
        const entries: [string, unknown][] = Object.entries(node.value);
        node.children = entries.map(([key, nested]) => ({
            path: `${node.path}/${pointerSegment(key)}`,
            parentPath: node.path,
            key: Array.isArray(node.value) ? undefined : key,
            value: nested,
            children: [],
        }));
        stack.push(...node.children.slice().reverse());
    }
    return { root, nodes, properties };
}

export interface JsonSourceLocation {
    contentIndex: number;
    field: CuField;
}

export type JsonSourceTarget =
    | { location: JsonSourceLocation; error?: never }
    | { location?: never; error: string };

export function jsonSourceTargets(tree: ReturnType<typeof indexJson>, contents: readonly CuContent[]): Map<string, JsonSourceTarget> {
    const targets = new Map<string, JsonSourceTarget>();
    for (const node of tree.properties) {
        if (node.key !== "source") continue;
        const match = /^(?:\/result)?\/contents\/(0|[1-9]\d*)\//.exec(node.path);
        const contentIndex = match ? Number(match[1]) : -1;
        const content = contents[contentIndex];
        if (!content) {
            targets.set(node.path, { error: "No parsed document content is available for this source." });
            continue;
        }
        const issues: CuParseIssue[] = [];
        const { source, regions } = parseSource(node.value, content, node.path, issues);
        if (issues.length || !source || !regions.length) {
            targets.set(node.path, { error: issues.map(issue => issue.message).join(" ") || "No valid source region was returned." });
            continue;
        }
        const parent = tree.nodes.get(node.parentPath ?? "");
        targets.set(node.path, { location: { contentIndex, field: {
            id: `/json${node.path}`, path: node.parentPath ?? "", name: parent?.key ?? "Source region",
            type: "string", hasValue: true, value: source, source, regions, children: [],
        } } });
    }
    return targets;
}
