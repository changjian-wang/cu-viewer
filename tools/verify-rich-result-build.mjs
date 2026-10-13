import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const MAX_ENTRY_BYTES = 500_000;

function files(directory) {
    return readdirSync(directory).map(name => ({
        name,
        path: resolve(directory, name),
        bytes: statSync(resolve(directory, name)).size,
    }));
}

function requireSingle(items, pattern, label) {
    const matches = items.filter(item => pattern.test(item.name));
    if (matches.length !== 1) {
        throw new Error(`Expected one ${label}, found ${matches.length}.`);
    }
    return matches[0];
}

function verifyEntry(entry, label) {
    if (entry.bytes > MAX_ENTRY_BYTES) {
        throw new Error(`${label} is ${entry.bytes} bytes, above the ${MAX_ENTRY_BYTES}-byte entry budget.`);
    }
}

const library = files(resolve("dist"));
const demo = files(resolve("dist-demo", "assets"));
const libraryEntry = requireSingle(library, /^index\.js$/, "library entry");
const libraryMarkdown = requireSingle(library, /^MarkdownPane-.*\.js$/, "library Markdown chunk");
const libraryJson = requireSingle(library, /^JsonPane-.*\.js$/, "library JSON chunk");
const demoEntry = requireSingle(demo, /^index-.*\.js$/, "demo entry");
const demoMarkdown = requireSingle(demo, /^MarkdownPane-.*\.js$/, "demo Markdown chunk");
const demoJson = requireSingle(demo, /^JsonPane-.*\.js$/, "demo JSON chunk");

verifyEntry(libraryEntry, "Library entry");
verifyEntry(demoEntry, "Demo entry");

console.log(JSON.stringify({
    maxEntryBytes: MAX_ENTRY_BYTES,
    library: {
        entryBytes: libraryEntry.bytes,
        markdownChunkBytes: libraryMarkdown.bytes,
        jsonChunkBytes: libraryJson.bytes,
    },
    demo: {
        entryBytes: demoEntry.bytes,
        markdownChunkBytes: demoMarkdown.bytes,
        jsonChunkBytes: demoJson.bytes,
    },
}, null, 2));
