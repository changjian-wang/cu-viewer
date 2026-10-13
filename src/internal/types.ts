export type CuUnit = "inch" | "pixel";
export type CuApiVersion = "2025-11-01" | "2026-06-01-preview";
export type CuDetailRecord = Readonly<Record<string, unknown>>;
export type CuDetailView = "paragraphs" | "tables" | "figures" | "signatures";

export interface CuPoint {
    x: number;
    y: number;
}

export interface CuRegion {
    pageNumber: number;
    polygon: [CuPoint, CuPoint, CuPoint, CuPoint];
}

export interface CuPage {
    pageNumber: number;
    width?: number;
    height?: number;
    textAngle?: number;
}

export interface CuField {
    id: string;
    path: string;
    name: string;
    type: string;
    valueKey?: string;
    hasValue: boolean;
    value: unknown;
    confidence?: number;
    source?: string;
    regions: CuRegion[];
    children: CuField[];
    detailView?: CuDetailView;
}

export interface CuDetailItem {
    id: string;
    raw: CuDetailRecord;
    field: CuField;
    role?: string;
}

export interface CuParagraph extends CuDetailItem {
    content: string;
}

export interface CuTableCell extends CuDetailItem {
    content: string;
    kind: string;
    rowIndex: number;
    columnIndex: number;
    rowSpan: number;
    columnSpan: number;
}

export interface CuTable {
    id: string;
    raw: CuDetailRecord;
    rowCount: number;
    columnCount: number;
    cells: CuTableCell[];
    rows: (CuTableCell | null | undefined)[][];
    layoutError?: string;
    caption?: string;
    footnotes: string[];
}

export interface CuFigure extends CuDetailItem {
    figureId: string;
    kind: string;
    caption?: string;
    description?: string;
    footnotes: string[];
}

export interface CuSignature extends CuDetailItem {
    signatureId: string;
}

export interface CuContent {
    id: string;
    kind: string;
    analyzerId?: string;
    unit?: CuUnit;
    startPageNumber?: number;
    endPageNumber?: number;
    markdown?: string;
    paragraphs?: readonly CuParagraph[];
    tables?: readonly CuTable[];
    figures?: readonly CuFigure[];
    signatures?: readonly CuSignature[];
    metadata?: Readonly<Record<string, string>>;
    pages: CuPage[];
    fields: CuField[];
}

export interface CuParseIssue {
    code: string;
    path: string;
    message: string;
}

export interface CuResultModel {
    apiVersion: CuApiVersion;
    analyzerId?: string;
    original: unknown;
    contents: CuContent[];
    issues: CuParseIssue[];
}
