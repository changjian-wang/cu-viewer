import { defineConfig } from "vite";
import { heifAssets } from "../tooling/heifAssets.ts";
import { pdfAssets } from "../tooling/pdfAssets.ts";

export default defineConfig({
    root: import.meta.dirname,
    base: "./",
    plugins: [pdfAssets("assets/pdfjs"), heifAssets("assets/heif")],
    build: {
        outDir: "../../dist-cli",
        emptyOutDir: true,
    },
});
