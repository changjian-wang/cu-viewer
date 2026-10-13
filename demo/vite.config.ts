import { resolve } from "node:path";
import { defineConfig } from "vite";
import { heifAssets } from "../tools/heifAssets.ts";
import { pdfAssets } from "../tools/pdfAssets.ts";

export default defineConfig({
    root: import.meta.dirname,
    plugins: [
        pdfAssets("assets/pdfjs"),
        heifAssets("assets/heif"),
    ],
    server: {
        host: "127.0.0.1",
        port: 5173,
        strictPort: true,
        fs: { allow: [resolve(import.meta.dirname, "..")] },
    },
    build: {
        outDir: "../dist-demo",
        emptyOutDir: true,
    },
});
