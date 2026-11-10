export interface ResultInfoEntry {
    name: string;
    path: string;
    value: unknown;
    children?: readonly ResultInfoEntry[];
}

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resultInfoEntries(input: unknown): ResultInfoEntry[] {
    if (!record(input)) return [];
    const wrapped = Object.hasOwn(input, "result");
    const result = wrapped ? input.result : input;
    if (!record(result)) return [];
    const prefix = wrapped ? "/result" : "";
    const entries: ResultInfoEntry[] = [];
    const metadata: ResultInfoEntry[] = [];
    const contents = result.contents;
    if (Array.isArray(contents)) contents.forEach((content: unknown, index: number) => {
        if (record(content) && Object.hasOwn(content, "metadata")) metadata.push({
            name: `contents[${index}]`,
            path: `${prefix}/contents/${index}/metadata`, value: content.metadata,
        });
    });
    if (metadata.length) entries.push({
        name: "metadata", path: "$metadata",
        value: Object.fromEntries(metadata.map(entry => [entry.name, entry.value])), children: metadata,
    });
    if (Object.hasOwn(input, "usage")) entries.push({ name: "usage", path: "/usage", value: input.usage });
    for (const name of ["infos", "warnings"] as const) {
        if (Object.hasOwn(result, name)) entries.push({ name, path: `${prefix}/${name}`, value: result[name] });
    }
    return entries;
}
