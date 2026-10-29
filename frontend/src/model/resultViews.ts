import type { CuApiVersion, CuContent } from "./types";

export const RESULT_TABS = [
    { id: "fields", label: "Fields" },
    { id: "markdown", label: "Markdown" },
    { id: "paragraphs", label: "Paragraphs" },
    { id: "figures", label: "Figures" },
    { id: "signatures", label: "Signatures" },
    { id: "metadata", label: "Metadata" },
    { id: "result", label: "Result" },
] as const;

export type ResultTab = typeof RESULT_TABS[number];
export type ResultView = typeof RESULT_TABS[number]["id"];

export function availableResultTabs(
    content: CuContent | undefined,
    result: unknown,
    apiVersion?: CuApiVersion,
) {
    const available: Record<ResultView, boolean> = {
        fields: (content?.fields.length ?? 0) > 0 || (content?.tables?.length ?? 0) > 0,
        markdown: Boolean(content?.markdown?.trim()),
        paragraphs: (content?.paragraphs?.length ?? 0) > 0,
        figures: (content?.figures?.length ?? 0) > 0,
        signatures: apiVersion === "2026-06-01-preview" && (content?.signatures?.length ?? 0) > 0,
        metadata: apiVersion === "2026-06-01-preview" &&
            Object.values(content?.metadata ?? {}).some(value => value.trim().length > 0),
        result: result !== undefined,
    };
    return RESULT_TABS.filter(tab => available[tab.id]);
}
