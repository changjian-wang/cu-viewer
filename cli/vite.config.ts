import { defineConfig } from "vite";
import { heifAssets } from "../tools/heifAssets.ts";
import { pdfAssets } from "../tools/pdfAssets.ts";

export default defineConfig({
    root: import.meta.dirname,
    base: "./",
    plugins: [pdfAssets("assets/pdfjs"), heifAssets("assets/heif")],
    build: {
        outDir: "../dist-cli",
        emptyOutDir: true,
    },
});
