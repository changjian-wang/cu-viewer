import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import { pdfAssets } from "../tools/pdfAssets.ts";
import { heifDevelopmentAssets } from "../tools/heifDevelopmentAssets.ts";

export default defineConfig(({ mode }) => ({
    root: import.meta.dirname,
    plugins: [
        pdfAssets("assets/pdfjs"),
        heifDevelopmentAssets(loadEnv(mode, import.meta.dirname, "CU_HEIF_").CU_HEIF_DEV_ASSET_DIR),
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
}));
