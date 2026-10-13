import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import { pdfAssets } from "./tools/pdfAssets.ts";

export default defineConfig({
    plugins: [pdfAssets("pdfjs")],
    build: {
        lib: {
            entry: {
                index: resolve(import.meta.dirname, "src", "index.ts"),
                vite: resolve(import.meta.dirname, "src", "vite.ts"),
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
        include: ["src/**/*.test.{ts,tsx}"],
    },
});
