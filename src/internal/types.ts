export type CuUnit = "inch" | "pixel";

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
    unit?: CuUnit;
    startPageNumber?: number;
    endPageNumber?: number;
    markdown?: string;
    pages: CuPage[];
    fields: CuField[];
}

export interface CuParseIssue {
    code: string;
    path: string;
    message: string;
}

export interface CuResultModel {
    apiVersion: "2025-11-01";
    analyzerId?: string;
    original: unknown;
    contents: CuContent[];
    issues: CuParseIssue[];
}
