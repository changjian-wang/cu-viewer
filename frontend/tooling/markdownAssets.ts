import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { build } from "vite";
import type { Plugin } from "vite";

const sourceDirectory = resolve(import.meta.dirname, "..", "src", "markdown");

async function workerCode(): Promise<string> {
    const result = await build({
        configFile: false,
        logLevel: "silent",
        resolve: {
            // Some parser packages otherwise select a document-based entity decoder.
            conditions: ["worker", "browser", "module", "production"],
        },
        build: {
            write: false,
            emptyOutDir: false,
            target: "es2022",
            minify: true,
            lib: {
                entry: resolve(sourceDirectory, "markdown.worker.ts"),
                formats: ["iife"],
                name: "CuMarkdownWorker",
            },
        },
    });
    const outputs = Array.isArray(result) ? result : [result];
    const chunks = outputs.flatMap(output => "output" in output ? output.output : []).filter(output => output.type === "chunk");
    if (chunks.length !== 1 || !chunks[0]) throw new Error("The Markdown worker must build into one self-contained script.");
    return chunks[0].code;
}

export function markdownAssets(outputPath: string): Plugin {
    let outputDirectory = "";
    let code: Promise<string> | undefined;
    const load = (): Promise<string> => code ??= workerCode();
    return {
        name: "cu-viewer-markdown-assets",
        configResolved(config) {
            const root = resolve(config.root, config.build.outDir);
            const target = resolve(root, outputPath);
            const child = relative(root, target);
            if (!child || child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) {
                throw new Error("Markdown resources must use a non-root subdirectory of the build output.");
            }
            outputDirectory = target;
        },
        configureServer(server) {
            server.watcher.add(sourceDirectory);
            const invalidate = (path: string): void => {
                const child = relative(sourceDirectory, path);
                if (child && child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child)) {
                    code = undefined;
                    server.ws.send({ type: "full-reload" });
                }
            };
            server.watcher.on("change", invalidate);
            server.httpServer?.once("close", () => server.watcher.off("change", invalidate));
            server.middlewares.use((request, response, next) => {
                const path = new URL(request.url ?? "/", "http://localhost").pathname;
                if (!/\/markdown\/markdown\.worker\.js$/.test(path)) return next();
                void load().then(body => {
                    response.setHeader("Content-Type", "text/javascript; charset=utf-8");
                    response.setHeader("Cache-Control", "no-store");
                    response.end(body);
                }).catch((error: unknown) => {
                    server.config.logger.error(`Markdown worker build failed: ${error instanceof Error ? error.message : String(error)}`);
                    response.statusCode = 500;
                    response.end("The Markdown worker could not be built.");
                });
            });
        },
        async closeBundle() {
            if (!outputDirectory) throw new Error("The Markdown resource build directory is not configured.");
            const body = await load();
            mkdirSync(outputDirectory, { recursive: true });
            writeFileSync(resolve(outputDirectory, "markdown.worker.js"), body);
        },
    };
}
