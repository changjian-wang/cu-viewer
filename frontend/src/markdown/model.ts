import type { Element, Text } from "hast";

declare module "hast" {
    interface ElementData {
        cuMarkdownTable?: string;
        cuMarkdownFlow?: string;
        cuMarkdownFigure?: string;
        cuListOrdinal?: number;
    }
}

export type MarkdownNode = Element | Text;

export const MARKDOWN_STATIC_CHARACTERS = 50_000;
export const MARKDOWN_STATIC_NODES = 3_000;
export const MARKDOWN_FRAGMENT_CHARACTERS = 4_096;
export const MARKDOWN_FRAGMENT_NODES = 256;

export interface MarkdownBlockIndex {
    readonly id: string;
    readonly characters: number;
    readonly nodes: number;
    readonly estimate: number;
    readonly continuedBefore: boolean;
    readonly continuedAfter: boolean;
}

export interface MarkdownFlowIndex {
    readonly id: string;
    readonly virtual: boolean;
    readonly blocks: readonly MarkdownBlockIndex[];
}

export interface MarkdownPageIndex extends MarkdownFlowIndex {
    readonly rawStart: number;
    readonly rawEnd: number;
}

export interface MarkdownDocumentIndex {
    readonly pages: readonly MarkdownPageIndex[];
}

export interface MarkdownBlock {
    readonly id: string;
    readonly nodes: readonly MarkdownNode[];
}

export interface MarkdownTableIndex {
    readonly id: string;
    readonly rows: number;
    readonly headers: number;
    readonly columns: readonly number[];
    readonly captionFlow: string | null;
    readonly continued: boolean;
}

export interface MarkdownCell {
    readonly id: string;
    readonly row: number;
    readonly column: number;
    readonly rowSpan: number;
    readonly columnSpan: number;
    readonly node: Element;
}

export interface MarkdownTableRange {
    readonly rowStart: number;
    readonly rowEnd: number;
    readonly columnStart: number;
    readonly columnEnd: number;
}

export interface MarkdownTableWindow extends MarkdownTableRange {
    readonly id: string;
    readonly headers: readonly MarkdownCell[];
    readonly cells: readonly MarkdownCell[];
}

export type MarkdownRequest =
    | { readonly type: "parse"; readonly document: number; readonly markdown: string; readonly page: number }
    | { readonly type: "blocks"; readonly document: number; readonly request: number; readonly ids: readonly string[] }
    | { readonly type: "flow"; readonly document: number; readonly request: number; readonly id: string }
    | { readonly type: "table"; readonly document: number; readonly request: number; readonly id: string }
    | { readonly type: "rows"; readonly document: number; readonly request: number; readonly id: string; readonly range: MarkdownTableRange };

export type MarkdownResponse =
    | { readonly type: "ready"; readonly document: number; readonly index: MarkdownDocumentIndex; readonly blocks: readonly MarkdownBlock[] }
    | { readonly type: "blocks"; readonly document: number; readonly request: number; readonly blocks: readonly MarkdownBlock[] }
    | { readonly type: "flow"; readonly document: number; readonly request: number; readonly flow: MarkdownFlowIndex }
    | { readonly type: "table"; readonly document: number; readonly request: number; readonly table: MarkdownTableIndex }
    | { readonly type: "rows"; readonly document: number; readonly request: number; readonly window: MarkdownTableWindow }
    | { readonly type: "error"; readonly document: number; readonly request?: number; readonly message: string };

export function markdownReference(node: Element | undefined, name: "cuMarkdownTable" | "cuMarkdownFlow" | "cuMarkdownFigure"): string | undefined {
    const value = node?.data?.[name];
    return typeof value === "string" ? value : undefined;
}

export function textBoundary(value: string, offset: number): number {
    const before = value.charCodeAt(offset - 1), after = value.charCodeAt(offset);
    return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff ? offset - 1 : offset;
}
