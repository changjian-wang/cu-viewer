import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--port" || !/^\d+$/.test(args[1]))) {
    throw new Error("Usage: node serve.mjs [--port 0..65535]");
}
const port = args.length ? Number(args[1]) : 5188;
if (port > 65535) throw new Error("Port must be between 0 and 65535.");

const resources = new Map([
    ["/", ["index.html", "text/html; charset=utf-8"]],
    ["/index.html", ["index.html", "text/html; charset=utf-8"]],
    ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
    ["/app.mjs", ["app.mjs", "text/javascript; charset=utf-8"]],
    ["/model.mjs", ["model.mjs", "text/javascript; charset=utf-8"]],
    ["/fixtures.mjs", ["fixtures.mjs", "text/javascript; charset=utf-8"]],
    ["/requirements", ["../requirements.md", "text/plain; charset=utf-8"]],
]);

const server = createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    if (!["GET", "HEAD"].includes(request.method)) {
        response.writeHead(405, { Allow: "GET, HEAD" }).end("Read-only prototype.");
        return;
    }
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    if (pathname === "/health") {
        response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ name: "cu-viewer-ui-prototype", ready: true }));
        return;
    }
    const resource = resources.get(pathname);
    if (!resource) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Resource not found.");
        return;
    }
    try {
        const contents = await readFile(fileURLToPath(new URL(resource[0], import.meta.url)));
        response.writeHead(200, { "Content-Type": resource[1] });
        response.end(request.method === "HEAD" ? undefined : contents);
    } catch (error) {
        console.error(`Prototype resource failed: ${pathname}`, error);
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end("Prototype resource could not be loaded. Check the server output.");
    }
});

server.on("error", error => {
    console.error("The prototype server could not start.", error);
    process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
    const address = server.address();
    console.log(`CU Viewer UI prototype: http://127.0.0.1:${address.port}/`);
    console.log("Local, read-only, simulated data. Press Ctrl+C to stop.");
});
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => server.close());
}
