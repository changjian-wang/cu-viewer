import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

const expectedHash = "804551ee35288509d5bde23c480e956f9d7b2a0dfc0b36a6a9a8a5b01234d276";

export function heifDevelopmentAssets(directory: string | undefined): Plugin {
    return {
        name: "development-only-heif-codec",
        apply: "serve",
        configureServer(server) {
            server.middlewares.use((request, response, next) => {
                const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
                if (!pathname.endsWith("/heif-codec/libheif-asm.js")) return next();
                if (!directory) {
                    response.statusCode = 503;
                    response.end("Local HEIF validation requires CU_HEIF_DEV_ASSET_DIR; decoder distribution is not approved.");
                    return;
                }
                try {
                    const bytes = readFileSync(join(directory, "libheif-asm.js"));
                    if (createHash("sha256").update(bytes).digest("hex") !== expectedHash) {
                        throw new Error("The local HEIF decoder does not match the evaluated libheif 1.23.5 artifact.");
                    }
                    response.setHeader("Content-Type", "text/javascript");
                    response.end(bytes);
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    server.config.logger.error(`Local HEIF resource failed: ${message}`);
                    response.statusCode = 500;
                    response.end("Local HEIF decoder loading failed.");
                }
            });
        },
    };
}
