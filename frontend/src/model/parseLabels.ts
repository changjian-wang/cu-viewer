import { CuResultParseError, parseFields } from "./parseCuResult";
import { inspectJson } from "./resultLimits";
import type { CuContent, CuParseIssue } from "./types";
import { PDF_CSS_UNITS_PER_INCH } from "../source/pdfSource";
import type { LoadedSource } from "../source/source";

export function parseLabels(input: unknown, source: Pick<LoadedSource, "kind" | "pages"> | null, validated = false) {
    const inspection = validated ? null : inspectJson(input);
    if (inspection && inspection.status !== "ready") {
        throw new CuResultParseError("invalid-labels", "",
            inspection.status === "limit" ? "Label JSON exceeds the viewer size limit." : inspection.message);
    }
    if (!input || typeof input !== "object" || Array.isArray(input) || !("fieldLabels" in input) ||
        !input.fieldLabels || typeof input.fieldLabels !== "object" || Array.isArray(input.fieldLabels)) {
        throw new CuResultParseError("invalid-labels", "/fieldLabels", "Label JSON must contain a fieldLabels object.");
    }
    if (source && source.kind !== "pdf") {
        throw new CuResultParseError("unsupported-label-source", "", "Label view currently requires a local PDF source.");
    }
    const content: CuContent = {
        id: "/labels", kind: "document", fields: [],
        pages: source?.pages.map(page => ({
            pageNumber: page.pageNumber,
            width: page.width / PDF_CSS_UNITS_PER_INCH,
            height: page.height / PDF_CSS_UNITS_PER_INCH,
        })) ?? [],
        ...(source ? { unit: "inch" as const } : {}),
    };
    const issues: CuParseIssue[] = [];
    content.fields = parseFields(input.fieldLabels, content, "", issues, "fieldLabels");
    const stack = [...content.fields];
    while (stack.length) {
        const field = stack.pop()!;
        field.origin = "label";
        stack.push(...field.children);
    }
    const missingGeometry = !source && issues.some(issue => issue.code === "missing-source-page");
    return {
        original: input, content,
        issues: missingGeometry ? [
            ...issues.filter(issue => issue.code !== "missing-source-page"),
            { code: "unavailable-label-source", path: "/fieldLabels",
                message: "PDF source geometry is unavailable. Label values remain readable, but sources cannot be located." },
        ] : issues,
    };
}
