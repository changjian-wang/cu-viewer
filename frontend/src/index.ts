export type ViewerSource = File | Blob | ArrayBuffer | string;

export type ViewerFieldOrder = Readonly<Record<string, readonly string[]>>;

export interface ContentUnderstandingResultViewerProps {
    source: ViewerSource;
    result: unknown;
    fieldOrder?: ViewerFieldOrder;
    defaultFieldOrder?: ViewerFieldOrder;
    onFieldOrderChange?: (order: ViewerFieldOrder) => void;
}

export { ContentUnderstandingResultViewer } from "./ContentUnderstandingResultViewer";
