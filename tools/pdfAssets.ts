import { copyFileSync, cpSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Plugin } from "vite";

const assetKinds = new Set(["build", "standard_fonts", "cmaps", "wasm", "iccs"]);

export function pdfAssets(outputPath: string): Plugin {
    const packageRoot = resolve(import.meta.dirname, "..", "node_modules", "pdfjs-dist");
    let outputDirectory = "";
    return {
        name: "local-pdf-rendering-assets",
        configResolved(config) {
            outputDirectory = resolve(config.root, config.build.outDir, outputPath);
        },
        configureServer(server) {
            server.middlewares.use((request, response, next) => {
                const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
                const match = /\/pdfjs\/([^/]+)\/([^/]+)$/.exec(pathname);
                if (!match) return next();
                const [, kind, filename] = match;
                if (!kind || !filename || !assetKinds.has(kind) || !/^[a-zA-Z0-9_.-]+$/.test(filename) ||
                    (kind === "build" && filename !== "pdf.worker.mjs")) {
                    response.statusCode = 404;
                    response.end("Unknown PDF resource.");
                    return;
                }
                try {
                    const bytes = readFileSync(join(packageRoot, kind, filename));
                    response.setHeader("Content-Type", filename.endsWith(".mjs") ? "text/javascript" :
                        filename.endsWith(".wasm") ? "application/wasm" : "application/octet-stream");
                    response.end(bytes);
                } catch (error) {
                    const failure = error instanceof Error ? error : new Error(String(error));
                    server.config.logger.error(`PDF resource failed: ${failure.message}`);
                    response.statusCode = 500;
                    response.end("PDF resource loading failed.");
                }
            });
        },
        closeBundle() {
            mkdirSync(join(outputDirectory, "build"), { recursive: true });
            copyFileSync(join(packageRoot, "build", "pdf.worker.mjs"), join(outputDirectory, "build", "pdf.worker.mjs"));
            for (const kind of ["standard_fonts", "cmaps", "wasm", "iccs"]) {
                cpSync(join(packageRoot, kind), join(outputDirectory, kind), { recursive: true });
            }
            mkdirSync(dirname(join(outputDirectory, "LICENSE")), { recursive: true });
            copyFileSync(join(packageRoot, "LICENSE"), join(outputDirectory, "LICENSE"));
        },
    };
}
