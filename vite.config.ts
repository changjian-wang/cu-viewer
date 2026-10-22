import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import { heifAssets } from "./frontend/tooling/heifAssets.ts";
import { pdfAssets } from "./frontend/tooling/pdfAssets.ts";

export default defineConfig({
    plugins: [pdfAssets("pdfjs"), heifAssets("heif")],
    build: {
        lib: {
            entry: {
                index: resolve(import.meta.dirname, "frontend", "src", "index.ts"),
                vite: resolve(import.meta.dirname, "frontend", "src", "vite.ts"),
            },
            formats: ["es"],
            fileName: (_format, name) => `${name}.js`,
            cssFileName: "styles",
        },
        sourcemap: true,
        rolldownOptions: {
            external: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "pdfjs-dist", /^node:/],
        },
    },
    test: {
        environment: "node",
        include: ["frontend/src/**/*.test.{ts,tsx}"],
    },
});
