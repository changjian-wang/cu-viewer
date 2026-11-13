import type { CuApiVersion, CuContent } from "./types";
import { resultInfoEntries } from "./resultInfo";

export const RESULT_TABS = [
    { id: "fields", label: "Fields" },
    { id: "markdown", label: "Markdown" },
    { id: "paragraphs", label: "Paragraphs" },
    { id: "figures", label: "Figures" },
    { id: "signatures", label: "Signatures" },
    { id: "info", label: "Info" },
    { id: "result", label: "Result" },
] as const;

export type ResultTab = typeof RESULT_TABS[number];
export type ResultView = typeof RESULT_TABS[number]["id"];

export function isFieldView(view: ResultView | undefined): boolean {
    return view === "fields";
}

export function availableResultTabs(
    content: CuContent | undefined,
    result: unknown,
    apiVersion?: CuApiVersion,
    hasLabels = false,
) {
    const available: Record<ResultView, boolean> = {
        fields: hasLabels || (content?.fields.length ?? 0) > 0,
        markdown: Boolean(content?.markdown?.trim()),
        paragraphs: (content?.paragraphs?.length ?? 0) > 0,
        figures: (content?.figures?.length ?? 0) > 0,
        signatures: apiVersion === "2026-06-01-preview" && (content?.signatures?.length ?? 0) > 0,
        info: resultInfoEntries(result).length > 0,
        result: result !== undefined,
    };
    return RESULT_TABS.filter(tab => available[tab.id]);
}
