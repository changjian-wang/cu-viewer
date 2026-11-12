import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
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
assert.equal(pack.name, "cu-viewer", "The packed artifact must use the current Viewer package name.");
assert.ok(!/[\\/]/.test(pack.filename), "The tarball name is not local to the artifact directory.");
assert.ok(Array.isArray(pack.files), "npm pack did not provide the file inventory.");
for (const entry of pack.files) {
    assert.ok(!/(^|\/)(?:\.env(?:\.|\/|$)|(?:tests|demo|node_modules)(?:\/|$)|libheif)/i.test(entry.path), `Unexpected distribution file: ${entry.path}`);
}
for (const path of [
    "dist/index.js", "dist/index.d.ts", "dist/vite.js", "dist/vite.d.ts", "dist/styles.css",
    "dist/pdfjs/build/pdf.worker.mjs", "dist/pdfjs/LICENSE",
    "dist/markdown/markdown.worker.js",
    "dist/heif/heif.worker.js", "dist/heif/heic_decoder.js", "dist/heif/heic_decoder_bg.wasm",
    "dist/heif/LICENSE-heic-rs-MIT", "dist/heif/LICENSE-heic-rs-APACHE",
    "dist/heif/LICENSE-wasm-bindgen-MIT", "dist/heif/LICENSE-wasm-bindgen-APACHE",
    "dist/heif/SBOM.json", "dist/heif/THIRD-PARTY-NOTICES.txt", "LICENSE", "THIRD-PARTY-NOTICES.txt", "README.md",
]) {
    assert.ok(pack.files.some(entry => entry.path === path), `The packed artifact is missing ${path}.`);
}
writeFileSync(join(artifacts, "pack-report.json"), JSON.stringify(packed, null, 2) + "\n");
const hosts = join(workspace, "hosts");
const profiles = [
    { name: "react18", react: "18.3.1", reactTypes: "18.3.31", domTypes: "18.3.7", port: 4391 },
    { name: "react19", react: "19.3.0", reactTypes: "19.3.0", domTypes: "19.3.0", port: 4392 },
].map(profile => ({ ...profile, directory: join(hosts, profile.name) }));
const demo = readFileSync(join(repository, "frontend", "demo", "App.tsx"), "utf8");
assert.ok(demo.includes('from "../src"'), "The demo public-entry import is not the expected source.");
const app = demo.replaceAll('"../src"', '"cu-viewer"')
    .replaceAll('"../../tests/fixtures/', '"./fixtures/');
const main = readFileSync(join(repository, "frontend", "demo", "main.tsx"), "utf8")
    .replace('import "./styles.css";', 'import "./styles.css";\nimport "cu-viewer/styles.css";');
for (const profile of profiles) {
    const directory = profile.directory;
    mkdirSync(join(directory, "fixtures"), { recursive: true });
    copyFileSync(join(artifacts, pack.filename), join(directory, "cu-viewer.tgz"));
    writeFileSync(join(directory, "package.json"), JSON.stringify({
        name: `cu-viewer-${profile.name}-isolated-consumer`,
        private: true,
        type: "module",
        scripts: { typecheck: "tsc --noEmit", build: "vite build", dev: "vite", preview: "vite preview" },
        dependencies: { "cu-viewer": "file:cu-viewer.tgz", react: profile.react, "react-dom": profile.react },
        devDependencies: {
            "@types/react": profile.reactTypes, "@types/react-dom": profile.domTypes,
            "@types/node": "22.20.5", typescript: "6.0.3", vite: "8.3.2",
        },
    }, null, 2) + "\n");
    writeFileSync(join(directory, "tsconfig.json"), JSON.stringify({
        compilerOptions: {
            target: "ES2022", lib: ["ES2022", "DOM", "DOM.Iterable"],
            module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx",
            strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true,
            verbatimModuleSyntax: true, isolatedModules: true, noEmit: true, types: ["vite/client"],
        },
        include: ["App.tsx", "main.tsx"],
    }, null, 2) + "\n");
    writeFileSync(join(directory, "vite.config.ts"), [
        'import { defineConfig } from "vite";',
        'import { viewerAssets } from "cu-viewer/vite";',
        "export default defineConfig({",
        "    root: import.meta.dirname,",
        "    plugins: [viewerAssets()],",
        `    server: { host: "127.0.0.1", port: ${profile.port}, strictPort: true, fs: { allow: [import.meta.dirname] } },`,
        `    preview: { host: "127.0.0.1", port: ${profile.port}, strictPort: true },`,
        "});", "",
    ].join("\n"));
    writeFileSync(join(directory, "App.tsx"), app);
    writeFileSync(join(directory, "main.tsx"), main);
    for (const name of ["styles.css", "index.html"]) {
        copyFileSync(join(repository, "frontend", "demo", name), join(directory, name));
    }
    for (const name of ["mixed-financial-docs.pdf", "mixed-financial-docs.cu.json", "receipt.png", "receipt.cu.json",
        "large-bank-statement.pdf", "large-bank-statement.cu.json", "manifest.json", "LICENSE.txt"]) {
        copyFileSync(join(repository, "tests", "fixtures", name), join(directory, "fixtures", name));
    }
    for (const name of ["example.heic", "example.synthetic.cu.json"]) {
        copyFileSync(join(repository, "tests", "fixtures", "images", name), join(directory, "fixtures", name));
    }
    npm(["install", "--ignore-scripts", "--no-audit", "--no-fund"], profile.directory);
    npm(["run", "typecheck"], profile.directory);
    npm(["run", "build"], profile.directory);
}
writeFileSync(join(hosts, "consumers.json"), JSON.stringify({ profiles }, null, 2) + "\n");
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
    profiles,
    modes: ["production", "development"],
    browsers: ["chrome", "edge"],
    packageBrowserRuns: 32,
    aliasOrSharedNodeModules: false,
    decoderDistributed: true,
    decoder: "heic-rs 0.1.4 WASM",
}, null, 2) + "\n");
console.log(`PASS: isolated packed React 18/19 verification completed in ${workspace}; temporary servers were owned and stopped by the test runner.`);
