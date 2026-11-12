import { defineConfig } from "vite";
import { heifAssets } from "../tooling/heifAssets.ts";
import { pdfAssets } from "../tooling/pdfAssets.ts";
import { markdownAssets } from "../tooling/markdownAssets.ts";

export default defineConfig({
    root: import.meta.dirname,
    base: "./",
    plugins: [pdfAssets("assets/pdfjs"), heifAssets("assets/heif"), markdownAssets("assets/markdown")],
    build: {
        outDir: "../../dist-app",
        emptyOutDir: true,
    },
});
