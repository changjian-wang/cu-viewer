import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
    readlinkSync, realpathSync, rmSync, symlinkSync, truncateSync, unlinkSync, utimesSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { inflateRawSync } from "node:zlib";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const exporter = join(repository, "scripts", "package-release.sh");
const discovery = spawnSync("bash", ["--noprofile", "--norc", "-c", `
for tool in bash zip unzip jq sha256sum find sort touch mktemp cp mv chmod realpath mkdir rm cmp wc dirname head; do
    path=$(command -v "$tool") || { printf 'Missing Bash exporter tool: %s\\n' "$tool" >&2; exit 1; }
    printf '%s\\t%s\\n' "$tool" "$path"
done`], { encoding: "utf8" });
assert.ifError(discovery.error);
assert.equal(discovery.status, 0, discovery.stderr);
const tools = discovery.stdout.trim().split(/\r?\n/).map(line => line.split("\t"));
let toolPath;
if (process.platform === "win32") {
    toolPath = [...new Set(tools.map(([, path]) => path.slice(0, path.lastIndexOf("/"))))].join(":");
} else {
    toolPath = mkdtempSync(join(tmpdir(), "cu-viewer-export-tools-"));
    after(() => rmSync(toolPath, { recursive: true, force: true }));
    for (const [name, path] of tools) symlinkSync(path, join(toolPath, name));
}
const environment = {
    ...process.env,
    CU_EXPORT_TEST_TOOL_PATH: toolPath,
    NO_COLOR: "1",
    TERM: "dumb",
};
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const bash = (args, env = {}) => {
    const result = spawnSync("bash", [
        "--noprofile", "--norc", "-c", 'export PATH="$CU_EXPORT_TEST_TOOL_PATH"; exec bash "$@"', "--", ...args,
    ], {
        cwd: repository, env: { ...environment, ...env }, encoding: "utf8",
        timeout: 60000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
    });
    assert.ifError(result.error);
    return result;
};

function fixture(t) {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), "cu-viewer-export-")));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const source = join(root, "build with spaces");
    const destination = join(root, "release with spaces");
    const licenses = join(root, "licenses");
    const content = {
        "index.html": "<!doctype html><title>Viewer</title>",
        "assets/index-app.js": "export const viewer = true;",
        "assets/MarkdownPane-app.js": "markdown",
        "assets/JsonPane-app.js": "json",
        "assets/markdown/markdown.worker.js": "markdown worker",
        "assets/pdfjs/LICENSE": "Apache",
        "assets/pdfjs/build/pdf.worker.mjs": "worker",
        "assets/pdfjs/standard_fonts/font.pfb": "font",
        "assets/pdfjs/cmaps/font.bcmap": "cmap",
        "assets/pdfjs/wasm/decoder.wasm": Buffer.from([0, 97, 115, 109]),
        "assets/pdfjs/iccs/profile.icc": "profile",
        "assets/heif/heif.worker.js": "worker",
        "assets/heif/heic_decoder.js": "decoder",
        "assets/heif/heic_decoder_bg.wasm": Buffer.from([0, 97, 115, 109]),
        "assets/heif/SBOM.json": "{}",
        "assets/empty.txt": "",
    };
    for (const [name, data] of Object.entries(content)) {
        mkdirSync(dirname(join(source, name)), { recursive: true });
        writeFileSync(join(source, name), data);
    }
    mkdirSync(licenses);
    writeFileSync(join(licenses, "LICENSE"), "MIT");
    writeFileSync(join(licenses, "THIRD-PARTY-NOTICES.txt"), "Notices");
    writeFileSync(join(licenses, "package.json"), '{"version":"0.0.0"}');
    return { root, source, destination, licenses, content };
}

function run(input, version, env = {}) {
    const arguments_ = [
        exporter, "--source", input.source,
        "--destination", input.destination, "--license-root", input.licenses,
    ];
    if (version === undefined) return bash(arguments_, env);
    // MSYS trims trailing newlines in native argv; source in-process to test the literal value.
    return bash(["-c", 'source "$@" --viewer-version "$CU_EXPORT_TEST_VERSION"', "--", ...arguments_], {
        ...env, CU_EXPORT_TEST_VERSION: version,
    });
}

function snapshot(root) {
    const entries = [];
    function walk(directory) {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name);
            if (entry.isSymbolicLink()) entries.push([relative(root, path), readlinkSync(path)]);
            else if (entry.isDirectory()) walk(path);
            else entries.push([relative(root, path), readFileSync(path)]);
        }
    }
    if (existsSync(root)) walk(root);
    return Object.fromEntries(entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}

function inspectArchive(root, includeContent = true) {
    const data = readFileSync(join(root, "viewer.zip"));
    const end = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    assert.ok(end >= 0, "Missing ZIP central directory");
    const count = data.readUInt16LE(end + 10);
    let offset = data.readUInt32LE(end + 16);
    const entries = [];
    for (let index = 0; index < count; index++) {
        assert.equal(data.readUInt32LE(offset), 0x02014b50);
        const method = data.readUInt16LE(offset + 10);
        const time = data.readUInt16LE(offset + 12);
        const date = data.readUInt16LE(offset + 14);
        const compressed = data.readUInt32LE(offset + 20);
        const bytes = data.readUInt32LE(offset + 24);
        const nameLength = data.readUInt16LE(offset + 28);
        const extraLength = data.readUInt16LE(offset + 30);
        const commentLength = data.readUInt16LE(offset + 32);
        const path = data.toString("utf8", offset + 46, offset + 46 + nameLength);
        const local = data.readUInt32LE(offset + 42);
        assert.equal(data.readUInt32LE(local), 0x04034b50);
        const start = local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28);
        const encoded = data.subarray(start, start + compressed);
        assert.ok(method === 0 || method === 8, "Unexpected ZIP compression");
        const content = method === 0 ? encoded : inflateRawSync(encoded);
        assert.equal(content.length, bytes);
        const pad = value => String(value).padStart(2, "0");
        entries.push({
            path, bytes, sha256: sha256(content),
            mode: data.readUInt32LE(offset + 38) >>> 16,
            date: `${1980 + (date >>> 9)}-${pad((date >>> 5) & 15)}-${pad(date & 31)} ` +
                `${pad(time >>> 11)}:${pad((time >>> 5) & 63)}:${pad((time & 31) * 2)}`,
            content: includeContent ? content.toString("base64") : null,
        });
        offset += 46 + nameLength + extraLength + commentLength;
    }
    assert.equal(offset, end, "Unexpected ZIP directory contents");
    return entries;
}

function success(result) {
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Exported \d+ viewer resources as viewer\.zip and manifest\.json\.\r?\n$/);
}

function rejected(result, pattern) {
    assert.notEqual(result.status, 0, "Invalid input unexpectedly succeeded");
    assert.equal(result.stdout, "");
    assert.match(result.stderr, pattern);
}

test("deterministic licensed ZIP without Python or PowerShell on PATH", t => {
    const input = fixture(t);
    const probe = bash(["-c", "for tool in python python3 py pwsh powershell; do if command -v \"$tool\"; then exit 1; fi; done"]);
    assert.equal(probe.status, 0, "Exporter regression must run without Python or PowerShell");
    success(run(input));
    const first = snapshot(input.destination);
    for (const name of Object.keys(input.content)) {
        const path = join(input.source, name);
        utimesSync(path, 1700000000, 1700000000);
        chmodSync(path, 0o600);
    }
    success(run(input));
    assert.deepEqual(snapshot(input.destination), first);
    assert.deepEqual(Object.keys(first).sort(), ["manifest.json", "viewer.zip"]);
    const manifest = JSON.parse(first["manifest.json"]);
    assert.equal(manifest.schemaVersion, 2);
    assert.equal(manifest.protocolVersion, 1);
    assert.equal(manifest.viewerVersion, "0.0.0");
    assert.equal(manifest.archive.bytes, first["viewer.zip"].length);
    assert.equal(manifest.archive.sha256, sha256(first["viewer.zip"]));
    const entries = inspectArchive(input.destination);
    assert.deepEqual(entries.map(entry => entry.path), entries.map(entry => entry.path).sort());
    assert.deepEqual(manifest.files, entries.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })));
    for (const entry of entries) {
        assert.equal(entry.date, "1980-01-01 00:00:00");
        assert.equal(entry.mode, 0o100644);
        const expected = entry.path === "LICENSE.txt" ? "MIT" :
            entry.path === "THIRD-PARTY-NOTICES.txt" ? "Notices" : input.content[entry.path];
        assert.deepEqual(Buffer.from(entry.content, "base64"), Buffer.from(expected));
    }
});

test("explicit SemVer override does not modify package version", t => {
    const input = fixture(t);
    success(run(input, "0.1.0-preview.1+build.2"));
    assert.equal(JSON.parse(readFileSync(join(input.destination, "manifest.json"))).viewerVersion, "0.1.0-preview.1+build.2");
    assert.equal(JSON.parse(readFileSync(join(input.licenses, "package.json"))).version, "0.0.0");
});

test("archive environment options cannot alter or encrypt the Release", t => {
    const input = fixture(t);
    success(run(input));
    const first = snapshot(input.destination);
    success(run(input, undefined, {
        ZIPOPT: "-e", UNZIPOPT: "-t", ZIPINFOOPT: "-h", TZ: "Pacific/Honolulu",
    }));
    assert.deepEqual(snapshot(input.destination), first);
});

test("resource names cannot shadow dictionary members", t => {
    const input = fixture(t);
    for (const name of ["Keys", "Count", "Values"]) writeFileSync(join(input.source, name), "ordinary file");
    success(run(input));
    success(run(input));
    const manifest = JSON.parse(readFileSync(join(input.destination, "manifest.json")));
    assert.equal(manifest.files.length, Object.keys(input.content).length + 5);
    for (const name of ["Keys", "Count", "Values"]) {
        assert.ok(manifest.files.some(entry => entry.path === name));
    }
});

for (const version of ["", "latest", "../1.0.0", "01.0.0", "1.0", "1.0.0-01", "v1.0.0", "1.0.0\n", "a".repeat(129)]) {
    test(`invalid release version ${JSON.stringify(version)} never creates output`, t => {
        const input = fixture(t);
        rejected(run(input, version), /semantic version/);
        assert.equal(existsSync(input.destination), false);
    });
}

for (const version of [undefined, null, 1, ["1.0.0"], "1.0.0\n", "1.0.0\u0000"]) {
    test(`invalid package version ${JSON.stringify(version)} never creates output`, t => {
        const input = fixture(t);
        writeFileSync(join(input.licenses, "package.json"), JSON.stringify({ version }));
        rejected(run(input), /semantic version/);
        assert.equal(existsSync(input.destination), false);
    });
}

for (const name of [
    "assets/markdown/markdown.worker.js",
    "assets/pdfjs/build/pdf.worker.mjs", "assets/heif/heic_decoder_bg.wasm",
    "assets/JsonPane-app.js", "assets/pdfjs/cmaps/font.bcmap",
]) {
    test(`incomplete build missing ${name} is rejected`, t => {
        const input = fixture(t);
        unlinkSync(join(input.source, name));
        rejected(run(input), /incomplete/);
        assert.equal(existsSync(input.destination), false);
    });
}

test("missing production entry fails before writing", t => {
    const input = fixture(t);
    unlinkSync(join(input.source, "index.html"));
    rejected(run(input), /Build the production Viewer page/);
    assert.equal(existsSync(input.destination), false);
});

test("resource count above the consumer limit fails before publishing", t => {
    const input = fixture(t);
    for (let index = 0; index <= 4096; index++) writeFileSync(join(input.source, `file-${index}`), "");
    rejected(run(input), /count limit/);
    assert.equal(existsSync(input.destination), false);
});

test("expanded resource bytes above the consumer limit fail before publishing", t => {
    const input = fixture(t);
    const file = join(input.source, "large.bin");
    writeFileSync(file, "");
    truncateSync(file, 128 * 1024 * 1024 + 1);
    rejected(run(input), /size\/count limit/);
    assert.equal(existsSync(input.destination), false);
});

for (const change of ["missing-archive", "missing-manifest", "unknown", "modified-archive", "modified-entry"]) {
    test(`unsafe existing output ${change} is never overwritten`, t => {
        const input = fixture(t);
        success(run(input));
        if (change === "missing-archive") unlinkSync(join(input.destination, "viewer.zip"));
        else if (change === "missing-manifest") unlinkSync(join(input.destination, "manifest.json"));
        else if (change === "unknown") writeFileSync(join(input.destination, "manual.txt"), "keep me");
        else if (change === "modified-archive") writeFileSync(join(input.destination, "viewer.zip"), "manual edit");
        else {
            const path = join(input.destination, "manifest.json");
            const manifest = JSON.parse(readFileSync(path));
            manifest.files[0].sha256 = "0".repeat(64);
            writeFileSync(path, JSON.stringify(manifest));
        }
        const before = snapshot(input.destination);
        rejected(run(input), /modified|unknown resources|missing/i);
        assert.deepEqual(snapshot(input.destination), before);
    });
}

test("updated build replaces only owned resources", t => {
    const input = fixture(t);
    success(run(input));
    writeFileSync(join(input.source, "assets", "index-app.js"), "updated");
    success(run(input));
    const entry = inspectArchive(input.destination).find(entry => entry.path === "assets/index-app.js");
    assert.equal(Buffer.from(entry.content, "base64").toString(), "updated");
    assert.deepEqual(readdirSync(input.destination).sort(), ["manifest.json", "viewer.zip"]);
});

for (const path of ["../outside.txt", "/absolute", "assets\\outside", "assets/../x", "assets/a\nb"]) {
    test(`invalid previous manifest path ${JSON.stringify(path)} preserves output`, t => {
        const input = fixture(t);
        mkdirSync(input.destination);
        writeFileSync(join(input.destination, "manifest.json"), JSON.stringify({
            schemaVersion: 1, files: [{ path }],
        }));
        const before = snapshot(input.destination);
        rejected(run(input), /resource path/);
        assert.deepEqual(snapshot(input.destination), before);
    });
}

for (const name of ["viewer.zip", "manifest.json"]) {
    test(`reserved build filename ${name} is rejected`, t => {
        const input = fixture(t);
        writeFileSync(join(input.source, name), "manual file");
        rejected(run(input), /reserved export filename/);
        assert.equal(existsSync(input.destination), false);
    });
}

for (const relation of ["same", "inside", "parent"]) {
    test(`overlapping ${relation} build/output is rejected`, t => {
        const input = fixture(t);
        const before = snapshot(input.source);
        input.destination = relation === "same" ? input.source :
            relation === "inside" ? join(input.source, "release") : input.root;
        rejected(run(input), /must not overlap/);
        assert.deepEqual(snapshot(input.source), before);
    });
}

test("directory links are rejected instead of followed", t => {
    const input = fixture(t);
    symlinkSync(input.licenses, join(input.source, "assets", "linked"), process.platform === "win32" ? "junction" : "dir");
    rejected(run(input), /symbolic links|reparse points/);
    assert.equal(existsSync(input.destination), false);
});

test("a linked output cannot modify files outside the Release directory", t => {
    const input = fixture(t);
    const before = snapshot(input.licenses);
    symlinkSync(input.licenses, input.destination, process.platform === "win32" ? "junction" : "dir");
    rejected(run(input), /symbolic links|reparse points/);
    assert.deepEqual(snapshot(input.licenses), before);
});

test("the repository does not ship a Python host or obsolete host entry points", () => {
    assert.equal(existsSync(join(repository, "python")), false);
    assert.equal(existsSync(join(repository, "scripts", "export-viewer.ps1")), false);
    assert.equal(existsSync(join(repository, "scripts", "export-viewer.sh")), false);
    assert.equal(existsSync(join(repository, "playwright.cli.config.ts")), false);
    assert.equal(existsSync(join(repository, "tests", "e2e", "cli-host.spec.ts")), false);
    const package_ = JSON.parse(readFileSync(join(repository, "package.json")));
    assert.equal(package_.scripts["test:cli"], undefined);
    assert.equal(package_.scripts["export:viewer"], undefined);
    assert.equal(package_.scripts["test:export"], undefined);
    assert.equal(package_.scripts["package:release"], "npm run build:viewer && bash scripts/package-release.sh");
    assert.equal(package_.scripts["test:release"], "node --test --test-reporter=spec tests/package-release.test.mjs");
});
test("actual Release resource pair has a complete verified archive", { skip: !process.env.CU_VIEWER_TEST_EXPORT }, () => {
    const root = resolve(process.env.CU_VIEWER_TEST_EXPORT);
    const manifest = JSON.parse(readFileSync(join(root, "manifest.json")));
    const bytes = readFileSync(join(root, "viewer.zip"));
    assert.equal(manifest.archive.bytes, bytes.length);
    assert.equal(manifest.archive.sha256, sha256(bytes));
    const entries = inspectArchive(root, false);
    assert.deepEqual(manifest.files, entries.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })));
    assert.ok(entries.some(entry => entry.path === "assets/pdfjs/build/pdf.worker.mjs"));
    assert.ok(entries.some(entry => entry.path === "assets/heif/heic_decoder_bg.wasm"));
    assert.ok(entries.some(entry => entry.path === "LICENSE.txt"));
});
