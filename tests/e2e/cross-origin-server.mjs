import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const host = "127.0.0.1";
const port = Number(process.env.CU_CROSS_ORIGIN_PORT ?? 4175);
const viewerOrigin = process.env.CU_VIEWER_ORIGIN ?? "http://127.0.0.1:5173";
const fixtureDirectory = resolve(import.meta.dirname, "..", "fixtures");
const fixtures = new Map([
    ["/cors/mixed-financial-docs.pdf", {
        path: resolve(fixtureDirectory, "mixed-financial-docs.pdf"),
        contentType: "application/pdf",
    }],
    ["/cors/receipt.png", {
        path: resolve(fixtureDirectory, "receipt.png"),
        contentType: "image/png",
    }],
    ["/cors/example.heic", {
        path: resolve(fixtureDirectory, "images", "example.heic"),
        contentType: "image/heic",
    }],
    ["/no-cors/receipt.png", {
        path: resolve(fixtureDirectory, "receipt.png"),
        contentType: "image/png",
    }],
]);
const requests = new Map();

const server = createServer(async (request, response) => {
    try {
        const url = new URL(request.url ?? "/", `http://${host}:${port}`);
        if (url.pathname === "/health") {
            response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
            response.end("ready");
            return;
        }
        if (url.pathname.startsWith("/requests/")) {
            const requestId = decodeURIComponent(url.pathname.slice("/requests/".length));
            const observation = requests.get(requestId);
            response.writeHead(observation ? 200 : 404, {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-store",
            });
            response.end(JSON.stringify(observation ?? { error: "Unknown request id." }));
            return;
        }
        const fixture = fixtures.get(url.pathname);
        if (!fixture) {
            response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
            response.end("Unknown cross-origin fixture.");
            return;
        }
        const requestId = url.searchParams.get("requestId");
        if (requestId) {
            requests.set(requestId, {
                method: request.method,
                origin: request.headers.origin ?? null,
                referer: request.headers.referer ?? null,
                cookie: request.headers.cookie ?? null,
                authorization: request.headers.authorization ?? null,
                secFetchSite: request.headers["sec-fetch-site"] ?? null,
            });
        }
        const headers = {
            "content-type": fixture.contentType,
            "cache-control": "no-store",
        };
        if (url.pathname.startsWith("/cors/")) {
            headers["access-control-allow-origin"] = viewerOrigin;
            headers.vary = "Origin";
        }
        response.writeHead(200, headers);
        response.end(await readFile(fixture.path));
    } catch (error) {
        console.error("Cross-origin fixture request failed.", error);
        if (!response.headersSent) response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        response.end("Cross-origin fixture request failed.");
    }
});

server.on("error", error => {
    console.error("Cross-origin fixture server failed.", error);
    process.exitCode = 1;
});
server.listen(port, host, () => {
    console.log(`Cross-origin fixture server listening at http://${host}:${port}`);
});

const close = () => {
    server.close(error => {
        if (error) {
            console.error("Cross-origin fixture server shutdown failed.", error);
            process.exitCode = 1;
        }
    });
};
process.once("SIGINT", close);
process.once("SIGTERM", close);
