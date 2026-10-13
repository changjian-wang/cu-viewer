import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tarballArgument = process.argv[2];
const outputArgument = process.argv[3];
if (!tarballArgument || !outputArgument) {
    throw new Error("Provide the packed tarball and a new isolated output directory.");
}
const tarball = resolve(tarballArgument);
const output = resolve(outputArgument);
assert.ok(existsSync(tarball), "The packed viewer tarball is missing.");
assert.ok(!existsSync(output), "Refusing to overwrite an existing consumer directory.");
assert.ok(!output.toLowerCase().startsWith(repository.toLowerCase() + "\\"), "Consumers must be outside the repository.");
const profiles = [
    { name: "react18", react: "18.3.1", reactTypes: "18.3.31", domTypes: "18.3.7", port: 4391 },
    { name: "react19", react: "19.3.0", reactTypes: "19.3.0", domTypes: "19.3.0", port: 4392 },
];
const demo = readFileSync(join(repository, "demo", "App.tsx"), "utf8");
assert.ok(demo.includes('from "../src"'), "The demo public-entry import is not the expected source.");
const app = demo.replaceAll('"../src"', '"cu-result-viewer"')
    .replaceAll('"../tests/fixtures/', '"./fixtures/');
const main = readFileSync(join(repository, "demo", "main.tsx"), "utf8")
    .replace('import "./styles.css";', 'import "./styles.css";\nimport "cu-result-viewer/styles.css";');
mkdirSync(output, { recursive: true });
for (const profile of profiles) {
    const directory = join(output, profile.name);
    mkdirSync(join(directory, "fixtures"), { recursive: true });
    const archive = "cu-result-viewer.tgz";
    copyFileSync(tarball, join(directory, archive));
    writeFileSync(join(directory, "package.json"), JSON.stringify({
        name: `cu-viewer-${profile.name}-isolated-consumer`,
        private: true,
        type: "module",
        scripts: {
            typecheck: "tsc --noEmit",
            build: "vite build",
            dev: "vite",
            preview: "vite preview",
        },
        dependencies: {
            "cu-result-viewer": `file:${archive}`,
            react: profile.react,
            "react-dom": profile.react,
        },
        devDependencies: {
            "@types/react": profile.reactTypes,
            "@types/react-dom": profile.domTypes,
            "@types/node": "22.20.5",
            typescript: "6.0.3",
            vite: "8.3.2",
        },
    }, null, 2) + "\n");
    writeFileSync(join(directory, "tsconfig.json"), JSON.stringify({
        compilerOptions: {
            target: "ES2022", lib: ["ES2022", "DOM", "DOM.Iterable"],
            module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx",
            strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true,
            verbatimModuleSyntax: true, isolatedModules: true, noEmit: true,
            types: ["vite/client"],
        },
        include: ["App.tsx", "main.tsx"],
    }, null, 2) + "\n");
    writeFileSync(join(directory, "vite.config.ts"), [
        'import { defineConfig } from "vite";',
        'import { viewerAssets } from "cu-result-viewer/vite";',
        "export default defineConfig({",
        "    root: import.meta.dirname,",
        "    plugins: [viewerAssets()],",
        `    server: { host: "127.0.0.1", port: ${profile.port}, strictPort: true, fs: { allow: [import.meta.dirname] } },`,
        `    preview: { host: "127.0.0.1", port: ${profile.port}, strictPort: true },`,
        "});",
        "",
    ].join("\n"));
    writeFileSync(join(directory, "App.tsx"), app);
    writeFileSync(join(directory, "main.tsx"), main);
    copyFileSync(join(repository, "demo", "styles.css"), join(directory, "styles.css"));
    copyFileSync(join(repository, "demo", "index.html"), join(directory, "index.html"));
    for (const name of ["mixed-financial-docs.pdf", "mixed-financial-docs.cu.json", "receipt.png", "receipt.cu.json", "LICENSE.txt"]) {
        copyFileSync(join(repository, "tests", "fixtures", name), join(directory, "fixtures", name));
    }
    for (const name of ["example.heic", "example.synthetic.cu.json"]) {
        copyFileSync(join(repository, "tests", "fixtures", "images", name), join(directory, "fixtures", name));
    }
}
writeFileSync(join(output, "consumers.json"), JSON.stringify({
    generatedFrom: "Actual demo host with only public package/CSS imports and relocated licensed fixtures.",
    repositoryAliases: false,
    sharedNodeModules: false,
    decoderAssetsIncluded: true,
    decoder: "heic-rs 0.1.4 WASM",
    profiles: profiles.map(profile => ({ ...profile, directory: join(output, profile.name) })),
}, null, 2) + "\n");
console.log(`Prepared isolated React 18/19 manifests and actual demo hosts in ${output}. Install their own dependencies before validation.`);
