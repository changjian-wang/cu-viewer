export type CuUnit = "inch" | "pixel";
export type CuApiVersion = "2025-11-01" | "2026-06-01-preview";
export type CuDetailRecord = Readonly<Record<string, unknown>>;

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
}

export interface CuContent {
    id: string;
    kind: string;
    analyzerId?: string;
    unit?: CuUnit;
    startPageNumber?: number;
    endPageNumber?: number;
    markdown?: string;
    paragraphs?: readonly CuDetailRecord[];
    tables?: readonly CuDetailRecord[];
    figures?: readonly CuDetailRecord[];
    signatures?: readonly CuDetailRecord[];
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
