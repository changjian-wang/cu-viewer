import type { Plugin } from "vite";
import { viewerAssets } from "../src/vite.ts";

export function pdfAssets(outputPath: string): Plugin {
    return viewerAssets(outputPath);
}
