import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import { pdfAssets } from "./tools/pdfAssets.ts";

export default defineConfig({
    plugins: [pdfAssets("pdfjs")],
    build: {
        lib: {
            entry: resolve(import.meta.dirname, "src", "index.ts"),
            formats: ["es"],
            fileName: "index",
            cssFileName: "styles",
        },
        sourcemap: true,
        rolldownOptions: {
            external: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "pdfjs-dist"],
        },
    },
    test: {
        environment: "node",
        include: ["src/**/*.test.{ts,tsx}"],
    },
});
