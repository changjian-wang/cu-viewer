import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import ts from "typescript";
import type { Plugin } from "vite";

const repository = resolve(import.meta.dirname, "..");
const assetDirectory = resolve(repository, "assets", "heif");
const workerSource = resolve(repository, "src", "internal", "heif.worker.ts");
const assetHashes = new Map([
    ["heic_decoder.js", "37e9954f836e53cf877418a4ad419fa82f6187ade49e047543b10fe80340fbec"],
    ["heic_decoder_bg.wasm", "354ab3f20c1d11ff26f83f8c427ba32c2233f183151b579ea416b8b2fef39c52"],
]);
const copiedAssets = [
    ...assetHashes.keys(),
    "LICENSE-heic-rs-APACHE",
    "LICENSE-heic-rs-MIT",
    "LICENSE-wasm-bindgen-APACHE",
    "LICENSE-wasm-bindgen-MIT",
    "SBOM.json",
    "THIRD-PARTY-NOTICES.txt",
];

function asset(name: string): Buffer {
    const bytes = readFileSync(resolve(assetDirectory, name));
    const expected = assetHashes.get(name);
    if (expected && createHash("sha256").update(bytes).digest("hex") !== expected) {
        throw new Error(`${name} does not match the reviewed HEIC decoder build.`);
    }
    return bytes;
}

function worker(): string {
    return ts.transpileModule(readFileSync(workerSource, "utf8"), {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.None,
            removeComments: true,
        },
        fileName: workerSource,
        reportDiagnostics: true,
    }).outputText;
}

function contentType(name: string): string {
    if (name.endsWith(".js")) return "text/javascript";
    if (name.endsWith(".wasm")) return "application/wasm";
    return "text/plain; charset=utf-8";
}

export function heifAssets(outputPath: string): Plugin {
    let outputDirectory = "";
    return {
        name: "cu-viewer-heif-assets",
        configResolved(config) {
            const root = resolve(config.root, config.build.outDir);
            const target = resolve(root, outputPath);
            const child = relative(root, target);
            if (!child || child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) {
                throw new Error("HEIF resources must use a non-root subdirectory of the build output.");
            }
            outputDirectory = target;
        },
        configureServer(server) {
            server.middlewares.use((request, response, next) => {
                const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
                const match = /\/heif\/([^/]+)$/.exec(pathname);
                if (!match) return next();
                const name = match[1];
                if (!name || (name !== "heif.worker.js" && !copiedAssets.includes(name))) {
                    response.statusCode = 404;
                    response.end("Unknown viewer HEIF resource.");
                    return;
                }
                try {
                    const body = name === "heif.worker.js" ? worker() : asset(name);
                    response.setHeader("Content-Type", contentType(name));
                    response.end(body);
                } catch (error) {
                    server.config.logger.error(`Viewer HEIF resource failed: ${error instanceof Error ? error.message : String(error)}`);
                    response.statusCode = 500;
                    response.end("Viewer HEIF resource loading failed.");
                }
            });
        },
        closeBundle() {
            if (!outputDirectory) throw new Error("The HEIF resource build directory is not configured.");
            mkdirSync(outputDirectory, { recursive: true });
            writeFileSync(resolve(outputDirectory, "heif.worker.js"), worker());
            for (const name of copiedAssets) {
                asset(name);
                copyFileSync(resolve(assetDirectory, name), resolve(outputDirectory, name));
            }
        },
    };
}
