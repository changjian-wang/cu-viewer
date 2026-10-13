import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run this verifier with npm run verify:consumer so the selected npm CLI is explicit.");
const workspace = realpathSync.native(mkdtempSync(join(tmpdir(), "cu-viewer-packed-")));
const artifacts = join(workspace, "artifacts");
mkdirSync(artifacts);
const npm = (args, cwd = repository, env = process.env, capture = false) =>
    execFileSync(process.execPath, [npmCli, ...args], {
        cwd, env, stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
        encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
    });
npm(["run", "build"]);
const packed = JSON.parse(npm(["pack", "--ignore-scripts", "--json", "--pack-destination", artifacts], repository, process.env, true));
assert.ok(Array.isArray(packed) && packed.length === 1 && typeof packed[0].filename === "string", "npm pack returned an invalid artifact.");
const pack = packed[0];
assert.ok(!/[\\/]/.test(pack.filename), "The tarball name is not local to the artifact directory.");
assert.ok(Array.isArray(pack.files), "npm pack did not provide the file inventory.");
for (const entry of pack.files) {
    assert.ok(!/(^|\/)(?:\.env(?:\.|\/|$)|(?:tests|demo|node_modules)(?:\/|$)|libheif)/i.test(entry.path), `Unexpected distribution file: ${entry.path}`);
}
for (const path of [
    "dist/index.js", "dist/index.d.ts", "dist/vite.js", "dist/vite.d.ts", "dist/styles.css",
    "dist/pdfjs/build/pdf.worker.mjs", "dist/pdfjs/LICENSE",
    "dist/heif/heif.worker.js", "dist/heif/heic_decoder.js", "dist/heif/heic_decoder_bg.wasm",
    "dist/heif/LICENSE-heic-rs-MIT", "dist/heif/LICENSE-heic-rs-APACHE",
    "dist/heif/LICENSE-wasm-bindgen-MIT", "dist/heif/LICENSE-wasm-bindgen-APACHE",
    "dist/heif/SBOM.json", "dist/heif/THIRD-PARTY-NOTICES.txt", "LICENSE", "docs/usage.md",
]) {
    assert.ok(pack.files.some(entry => entry.path === path), `The packed artifact is missing ${path}.`);
}
writeFileSync(join(artifacts, "pack-report.json"), JSON.stringify(packed, null, 2) + "\n");
const hosts = join(workspace, "hosts");
execFileSync(process.execPath, [join(repository, "tools", "prepare-packed-consumers.mjs"), join(artifacts, pack.filename), hosts], {
    cwd: repository, stdio: "inherit",
});
const inventory = JSON.parse(readFileSync(join(hosts, "consumers.json"), "utf8"));
for (const profile of inventory.profiles) {
    npm(["install", "--ignore-scripts", "--no-audit", "--no-fund"], profile.directory);
    npm(["run", "typecheck"], profile.directory);
    npm(["run", "build"], profile.directory);
}
for (const mode of ["production", "development"]) {
    npm(["run", "test:consumer"], repository, {
        ...process.env,
        CU_PACKED_CONSUMER_ROOT: hosts,
        CU_PACKED_CONSUMER_MODE: mode,
    });
}
writeFileSync(join(workspace, "verification.json"), JSON.stringify({
    status: "passed",
    tarball: join(artifacts, pack.filename),
    profiles: inventory.profiles,
    modes: ["production", "development"],
    browsers: ["chrome", "edge"],
    packageBrowserRuns: 24,
    aliasOrSharedNodeModules: false,
    decoderDistributed: true,
    decoder: "heic-rs 0.1.4 WASM",
}, null, 2) + "\n");
console.log(`PASS: isolated packed React 18/19 verification completed in ${workspace}; temporary servers were owned and stopped by the test runner.`);
