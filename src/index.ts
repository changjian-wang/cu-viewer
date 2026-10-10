export type ViewerSource = File | Blob | ArrayBuffer | string;

export interface ContentUnderstandingResultViewerProps {
    source: ViewerSource;
    result: unknown;
}

export { ContentUnderstandingResultViewer } from "./ContentUnderstandingResultViewer";
