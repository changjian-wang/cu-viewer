import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

const { positionals } = parseArgs({ allowPositionals: true });
if (positionals.length !== 1) throw new Error("Pass the CLI resources\\viewer destination directory.");
const destination = resolve(positionals[0]);
if (basename(destination) !== "viewer" || basename(dirname(destination)) !== "resources") {
    throw new Error("The export destination must be a resources\\viewer directory.");
}
const source = resolve("dist-cli");
if (!existsSync(join(source, "index.html"))) throw new Error("Build the CLI page before exporting it.");

function safePath(root, name) {
    if (typeof name !== "string" || !name || name.includes("\\") ||
        name.split("/").some(part => !/^[a-zA-Z0-9_.-]+$/.test(part) || part === "." || part === "..")) {
        throw new Error("Invalid generated viewer resource path.");
    }
    const parts = name.split("/");
    let current = root;
    for (const part of ["", ...parts]) {
        current = join(current, part);
        if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
            throw new Error("Viewer export does not follow symbolic links.");
        }
    }
    return current;
}

function collect(directory, prefix = "") {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        if (entry.isSymbolicLink()) throw new Error("The viewer build contains a symbolic link.");
        const name = `${prefix}${entry.name}`;
        return entry.isDirectory() ? collect(join(directory, entry.name), `${name}/`) :
            [{ path: name, bytes: readFileSync(join(directory, entry.name)) }];
    });
}

const content = [
    ...collect(source),
    { path: "LICENSE.txt", bytes: readFileSync("LICENSE") },
    { path: "THIRD-PARTY-NOTICES.txt", bytes: readFileSync("THIRD-PARTY-NOTICES.txt") },
].sort((left, right) => left.path.localeCompare(right.path));
const manifestPath = safePath(destination, "manifest.json");
const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { files: [] };
if (!Array.isArray(previous.files)) throw new Error("The existing viewer resource manifest is invalid.");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const previousPaths = new Set();
for (const file of previous.files) {
    const target = safePath(destination, file.path);
    if (!existsSync(target) || digest(readFileSync(target)) !== file.sha256) {
        throw new Error(`Generated resource was modified or removed: ${file.path}`);
    }
    previousPaths.add(file.path);
}
for (const file of content) {
    const target = safePath(destination, file.path);
    if (existsSync(target) && !previousPaths.has(file.path)) {
        throw new Error(`Refusing to overwrite an untracked resource: ${file.path}`);
    }
}
const nextPaths = new Set(content.map(file => file.path));
for (const name of previousPaths) {
    if (!nextPaths.has(name)) unlinkSync(safePath(destination, name));
}
for (const file of content) {
    const target = safePath(destination, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.bytes);
}
writeFileSync(manifestPath, `${JSON.stringify({
    schemaVersion: 1,
    files: content.map(file => ({ path: file.path, bytes: file.bytes.length, sha256: digest(file.bytes) })),
}, null, 2)}\n`);
console.log(`Exported ${content.length} viewer resources to ${destination}.`);
