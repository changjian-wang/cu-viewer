import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const MAX_ENTRY_BYTES = 500_000;
const HEIF_HASHES = {
    "heif.worker.js": "a9a7f604205223a433163e38ad4108f4bf6b0290d66245e26bb7454cf89a1dae",
    "heic_decoder.js": "37e9954f836e53cf877418a4ad419fa82f6187ade49e047543b10fe80340fbec",
    "heic_decoder_bg.wasm": "dff3cb27e4448bffad5fd1aa47eef6d92c608755e4075dd304a162ecfab19fe1",
};

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
const libraryHeif = files(resolve("dist", "heif"));
const demoHeif = files(resolve("dist-demo", "assets", "heif"));
const libraryEntry = requireSingle(library, /^index\.js$/, "library entry");
const libraryMarkdown = requireSingle(library, /^MarkdownPane-.*\.js$/, "library Markdown chunk");
const libraryJson = requireSingle(library, /^JsonPane-.*\.js$/, "library JSON chunk");
const demoEntry = requireSingle(demo, /^index-.*\.js$/, "demo entry");
const demoMarkdown = requireSingle(demo, /^MarkdownPane-.*\.js$/, "demo Markdown chunk");
const demoJson = requireSingle(demo, /^JsonPane-.*\.js$/, "demo JSON chunk");

verifyEntry(libraryEntry, "Library entry");
verifyEntry(demoEntry, "Demo entry");
for (const [name, expected] of Object.entries(HEIF_HASHES)) {
    for (const [label, directory] of [["library", libraryHeif], ["demo", demoHeif]]) {
        const file = requireSingle(directory, new RegExp(`^${name.replace(".", "\\.")}$`), `${label} ${name}`);
        const actual = createHash("sha256").update(readFileSync(file.path)).digest("hex");
        if (actual !== expected) throw new Error(`${label} ${name} hash ${actual} does not match ${expected}.`);
    }
}

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
    heif: {
        decoderJavaScriptBytes: requireSingle(libraryHeif, /^heic_decoder\.js$/, "library HEIF JavaScript").bytes,
        decoderWasmBytes: requireSingle(libraryHeif, /^heic_decoder_bg\.wasm$/, "library HEIF WASM").bytes,
        workerBytes: requireSingle(libraryHeif, /^heif\.worker\.js$/, "library HEIF worker").bytes,
    },
}, null, 2));
