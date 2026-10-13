import { copyFileSync, cpSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Plugin } from "vite";

const assetKinds = new Set(["build", "standard_fonts", "cmaps", "wasm", "iccs"]);

export function viewerAssets(outputPath?: string): Plugin {
    const packageRoot = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
    let outputDirectory = "";
    return {
        name: "local-cu-viewer-pdf-assets",
        configResolved(config) {
            const root = resolve(config.root, config.build.outDir);
            const target = resolve(root, outputPath ?? join(config.build.assetsDir, "pdfjs"));
            const child = relative(root, target);
            if (!child || child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) {
                throw new Error("Viewer resources must use a non-root subdirectory of the host build output.");
            }
            outputDirectory = target;
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
                    response.end("Unknown viewer PDF resource.");
                    return;
                }
                try {
                    const bytes = readFileSync(join(packageRoot, kind, filename));
                    response.setHeader("Content-Type", filename.endsWith(".mjs") ? "text/javascript" :
                        filename.endsWith(".wasm") ? "application/wasm" : "application/octet-stream");
                    response.end(bytes);
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    server.config.logger.error(`Viewer PDF resource failed: ${message}`);
                    response.statusCode = 500;
                    response.end("Viewer PDF resource loading failed.");
                }
            });
        },
        closeBundle() {
            if (!outputDirectory) throw new Error("The viewer resource build directory is not configured.");
            mkdirSync(join(outputDirectory, "build"), { recursive: true });
            copyFileSync(join(packageRoot, "build", "pdf.worker.mjs"), join(outputDirectory, "build", "pdf.worker.mjs"));
            for (const kind of ["standard_fonts", "cmaps", "wasm", "iccs"]) {
                cpSync(join(packageRoot, kind), join(outputDirectory, kind), { recursive: true });
            }
            copyFileSync(join(packageRoot, "LICENSE"), join(outputDirectory, "LICENSE"));
        },
    };
}
