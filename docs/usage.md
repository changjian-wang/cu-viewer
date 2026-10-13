# Using the Packed Viewer

> Verified locally on Windows with React/React DOM 18.3.1 and 19.3.0, Vite 8.3.2, TypeScript 6.0.3, Chrome 154.0.8037.98 and Edge 155.0.4283.45.
> This is a private implementation candidate, not a published package or complete P0/release approval. Packaged HEIF decoding is technically verified; HEVC product/patent and publication approval remain separate.

## Install a Private Artifact

Build and pack from the repository root:

```powershell name="Create the private package artifact"
npm run build
npm pack --ignore-scripts
```

Install the resulting tarball into the host project along with one supported React version. The host owns its React/React DOM pair, source delivery and any CU service calls. Do not use a source alias or share this repository's dependency directory to validate embedding.

## React Entry and Styles

```tsx name="Host viewer component"
import { ContentUnderstandingResultViewer } from "cu-result-viewer";
import type { ContentUnderstandingResultViewerProps } from "cu-result-viewer";
import "cu-result-viewer/styles.css";

export function AnalyzeResultView(props: ContentUnderstandingResultViewerProps) {
    return <div style={{ height: 720 }}>
        <ContentUnderstandingResultViewer source={props.source} result={props.result} />
    </div>;
}
```

The React API is unchanged:

- `source`: browser File, Blob, caller-owned ArrayBuffer, or an approved HTTP/HTTPS/host-owned blob URL. A filesystem string is not a browser URL.
- `result`: the original saved CU Analyze JSON parsed as a JavaScript value, not a string or a new normalized viewer schema. Only the verified `2025-11-01` API shapes are advertised.
- The component performs rendering, not Analyze, authentication, uploads, analyzer management or LRO polling.

Keep the package CSS and provide a bounded host height. Fonts, browser/viewport and host CSS affect visual matching; do not override Fields spacing, palette or icons without reviewing the approved prototype.

## Result Views and Content Limits

- **Fields** renders the verified parsed field model and source interactions.
- **Markdown** renders the selected content item's original `markdown`. GFM and CU HTML tables are supported. Raw HTML is parsed only so `rehype-sanitize` can apply its allowlist; scripts, frames, event attributes and dangerous protocols are removed. Remote images are represented as omitted text and never requested.
- The Studio-style **…** control selects **JSON** and displays that label while active. It renders the original `result` input rather than an internal normalized object. The root starts expanded; nested objects and arrays start collapsed and support keyboard expansion.

Switching views does not replace or reinitialize the source pane, so page, zoom, rotation, pan, pinned field and selected source-region index remain intact. Selecting another result content is a separate operation and retains its existing page/selection behavior.

To bound synchronous client rendering, Markdown is limited to 100,000 characters. JSON is limited to 500,000 serialized characters and 20,000 values. These limits retain substantial headroom over the verified 5,125-character Markdown and 393.5 kB Analyze result while avoiding the measured long tasks above those boundaries. Inputs beyond a limit receive an explicit state and remain caller-owned; the component does not truncate or mutate them. Circular, non-finite and other non-JSON values are also reported explicitly. Hosts that need to inspect larger results should provide a separate download or specialized large-document workflow rather than raising these internal limits without measuring the target devices.

Markdown and JSON are lazy chunks. Fields does not request either chunk until the corresponding tab is activated. Run the production Chrome/Edge budget after changing rich-result dependencies, limits or rendering:

```powershell name="Verify production rich-result performance"
npm run verify:performance
```

The current gate allows at most 1,000 ms for first activation, 350 ms for a warm near-limit activation, 100 ms for any observed main-thread long task and 64 MiB heap growth. The warm budget includes the 272-276 ms JSON evidence from GitHub's hosted Windows runner; the stricter long-task budget remains unchanged. These are recorded Windows Chrome/Edge engineering limits for the current private Viewer, not a general guarantee for every host device.

## Vite Resource Delivery

The optional Node-only entry explicitly wires local PDF resources into the host:

```ts name="Host vite.config.ts"
import { defineConfig } from "vite";
import { viewerAssets } from "cu-result-viewer/vite";

export default defineConfig({
    plugins: [viewerAssets()],
});
```

`viewerAssets()` serves allowlisted PDF Worker/font/CMap/WASM/ICC files plus the packaged HEIF Worker/JS/WASM/notices during development, then copies the same resources and licenses into the host build. PDF assets default to `build.assetsDir/pdfjs`; HEIF assets use the sibling `build.assetsDir/heif`. The same resources remain in the package distribution.

For an explicit output layout, `viewerAssets("assets/pdfjs")` is supported. The target must be a non-root subdirectory of the host build output and must match the directory resolved beside the bundled viewer entry. Root/parent/outside paths are rejected. Custom bundler/chunk layouts need separate verification.

This plugin:

- Is imported by the Vite configuration, not the browser React entry.
- Uses the pinned `pdfjs-dist` dependency, without a CDN or CU SDK.
- Ships the hash-pinned permissive `heic-rs 0.1.4` decoder only under the allowlisted `heif` resource path.
- Does not provide arbitrary filesystem access, authentication or a source-file server.
- Has Vite as an optional peer (`>=8 <9`); the tested version is 8.3.2.

The independent consumer first reproduced a Worker 404 without this integration. Development also exposed a host directory-URL rewrite dropping its trailing slash; the adapter now normalizes the directory pathname before creating child asset URLs. A Vite build can still warn that this resource directory does not exist until the plugin's copy hook runs. Real consumer requests, not warning suppression, verify the final delivery.

## Host CSP

The actual package tests apply the following policy to page and Worker responses:

```text name="Verified production fixture CSP"
default-src 'self';
script-src 'self';
worker-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' blob: data:;
font-src 'self';
connect-src 'self';
object-src 'none'
```

Inline styles are used for geometry and React layout, not inline script execution. The tested PDF/font/PNG paths require neither script eval nor Blob Worker permission. The development fixture adds only its explicit loopback WebSocket origin for Vite HMR.

HEIF performs WebAssembly compilation inside its owned Worker. Hosts that enable HEIF must add `'wasm-unsafe-eval'` to the Worker's `script-src` policy (or to the shared page/Worker policy when headers are common). General JavaScript `'unsafe-eval'` and Blob Worker permission remain unnecessary:

```text name="Verified HEIF Worker CSP addition"
script-src 'self' 'wasm-unsafe-eval'
```

This is a verified fixture policy, not a guarantee for every PDF or embedding environment. Real CMap/ICC/codec-specific PDFs, cross-origin sources and other host restrictions remain additional acceptance work.

## Independent Package Verification

```powershell name="Build pack install and verify independent consumers"
npm run verify:consumer
```

[The verifier](../tools/verify-packed-consumers.mjs) builds a real tgz, checks its file inventory, creates new projects outside the repository, and installs each project's own dependencies:

| Consumer | Runtime | Type declarations |
| --- | --- | --- |
| React 18 | React/React DOM 18.3.1 | `@types/react` 18.3.31 / `@types/react-dom` 18.3.7 |
| React 19 | React/React DOM 19.3.0 | Both declaration packages 19.3.0 |

It compiles the public API and builds both hosts, then runs [package tests](../tests/e2e/package-host.spec.ts) in production and development with Chrome/Edge: **24 browser runs**. Actual PDF/PNG/HEIF, real page navigation/pinning, rich results, local standard fonts, PDF resources and the packaged HEIF Worker/JS/WASM are checked under CSP. Product default/PDF-pin/PNG-pin screenshots compare directly to the existing approved baselines at zero difference.

The verifier uses canonical Windows long paths rather than DOS 8.3 aliases, retaining Vite's strict file-serving boundary. Local projects, locks, artifact inventory and verification result remain in its generated temporary workspace for inspection; its servers are started/stopped by the test runner. Nothing is published or pushed.

To rerun an already prepared workspace:

```powershell name="Rerun an isolated package matrix"
$env:CU_PACKED_CONSUMER_ROOT = 'C:\path\to\generated\hosts'
$env:CU_PACKED_CONSUMER_MODE = 'production'
npm run test:consumer
$env:CU_PACKED_CONSUMER_MODE = 'development'
npm run test:consumer
```

Default repository E2E runs deliberately exclude package tests; the consumer configuration uses its own output directory and servers. Do not point it at a repository alias or unprepared host.

## Remaining Gates

- HEIF production decoding is enabled with a pinned MIT/Apache WASM decoder; no LGPL decoder or private local configuration is present. HEVC patent/product and public-release approval remain separate.
- Broader real PDF/CMap/ICC cases, real CU image pairs, HEIF alpha/nonzero transforms/10-bit production fixtures, source/decoder peak-memory budgets and wider host policies are not all established by this package matrix. Rich-result activation has its separate production budget above.
- The [CI workflow](../.github/workflows/ci.yml) has successful [push](https://github.com/changjian-wang/cu-result-viewer/actions/runs/38347604633) and [full manual](https://github.com/changjian-wang/cu-result-viewer/actions/runs/38348199406) runs. Core, Chrome/Edge functionality, production performance, isolated React 18/19 consumers and 600 stress rounds pass remotely. Hosted-runner browser/font versions do not replace the fixed-version pixel references; remote jobs skip only those screenshot comparisons while retaining behavior, geometry, CSP, Worker and resource assertions.
- CLI integration, public distribution, final third-party notices/source review and release approval remain separate.
