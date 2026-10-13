import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const assetKinds = new Set(["build", "standard_fonts", "cmaps", "wasm", "iccs"]);
const heifAssets = new Set([
    "heif.worker.js",
    "heic_decoder.js",
    "heic_decoder_bg.wasm",
    "LICENSE-heic-rs-APACHE",
    "LICENSE-heic-rs-MIT",
    "LICENSE-wasm-bindgen-APACHE",
    "LICENSE-wasm-bindgen-MIT",
    "SBOM.json",
    "THIRD-PARTY-NOTICES.txt",
]);

export function viewerAssets(outputPath?: string): Plugin {
    const packageRoot = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
    const packagedHeifDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "heif");
    const hasPackagedHeif = existsSync(resolve(packagedHeifDirectory, "heif.worker.js"));
    let outputDirectory = "";
    let heifOutputDirectory = "";
    return {
        name: "local-cu-viewer-assets",
        configResolved(config) {
            const root = resolve(config.root, config.build.outDir);
            const target = resolve(root, outputPath ?? join(config.build.assetsDir, "pdfjs"));
            const child = relative(root, target);
            if (!child || child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) {
                throw new Error("Viewer resources must use a non-root subdirectory of the host build output.");
            }
            outputDirectory = target;
            heifOutputDirectory = resolve(dirname(target), "heif");
            const heifChild = relative(root, heifOutputDirectory);
            if (!heifChild || heifChild === ".." || heifChild.startsWith(`..${sep}`) || isAbsolute(heifChild)) {
                throw new Error("Viewer HEIF resources must use a non-root subdirectory of the host build output.");
            }
        },
        configureServer(server) {
            server.middlewares.use((request, response, next) => {
                const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
                const heifMatch = /\/heif\/([^/]+)$/.exec(pathname);
                if (heifMatch && hasPackagedHeif) {
                    const filename = heifMatch[1];
                    if (!filename || !heifAssets.has(filename)) {
                        response.statusCode = 404;
                        response.end("Unknown viewer HEIF resource.");
                        return;
                    }
                    try {
                        const bytes = readFileSync(resolve(packagedHeifDirectory, filename));
                        response.setHeader("Content-Type", filename.endsWith(".js") ? "text/javascript" :
                            filename.endsWith(".wasm") ? "application/wasm" : "text/plain; charset=utf-8");
                        response.end(bytes);
                    } catch (error) {
                        server.config.logger.error(`Viewer HEIF resource failed: ${error instanceof Error ? error.message : String(error)}`);
                        response.statusCode = 500;
                        response.end("Viewer HEIF resource loading failed.");
                    }
                    return;
                }
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
            if (hasPackagedHeif) {
                cpSync(packagedHeifDirectory, heifOutputDirectory, { recursive: true });
            }
        },
    };
}
