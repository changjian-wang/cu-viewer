# Using the Packed Viewer

> Verified locally on Windows with React/React DOM 18.3.1 and 19.3.0, Vite 8.3.2, TypeScript 6.0.3, Chrome 154.0.8037.98 and Edge 155.0.4283.45.
> This is a private implementation candidate, not a published package or complete P0/release approval. HEIF decoder distribution remains disabled.

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

## Vite Resource Delivery

The optional Node-only entry explicitly wires local PDF resources into the host:

```ts name="Host vite.config.ts"
import { defineConfig } from "vite";
import { viewerAssets } from "cu-result-viewer/vite";

export default defineConfig({
    plugins: [viewerAssets()],
});
```

`viewerAssets()` serves an allowlisted set of PDF Worker/font/CMap/WASM/ICC files during development, then copies the corresponding local dependency resources and licenses to the host's asset directory for builds. It defaults to `build.assetsDir` plus `pdfjs`; the same resources remain in the package's own distribution directory.

For an explicit output layout, `viewerAssets("assets/pdfjs")` is supported. The target must be a non-root subdirectory of the host build output and must match the directory resolved beside the bundled viewer entry. Root/parent/outside paths are rejected. Custom bundler/chunk layouts need separate verification.

This plugin:

- Is imported by the Vite configuration, not the browser React entry.
- Uses the pinned `pdfjs-dist` dependency, without a CDN or CU SDK.
- Does not provide arbitrary filesystem access, authentication, a source-file server or HEIF codec assets.
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

This is a verified fixture policy, not a guarantee for every PDF or embedding environment. Delivering a WASM file with the correct MIME type is not proof that a decoder needing WASM compilation works under this policy. Real CMap/ICC/codec-specific PDFs, cross-origin sources and other host restrictions remain additional acceptance work.

## Independent Package Verification

```powershell name="Build pack install and verify independent consumers"
npm run verify:consumer
```

[The verifier](../tools/verify-packed-consumers.mjs) builds a real tgz, checks its file inventory, creates new projects outside the repository, and installs each project's own dependencies:

| Consumer | Runtime | Type declarations |
| --- | --- | --- |
| React 18 | React/React DOM 18.3.1 | `@types/react` 18.3.31 / `@types/react-dom` 18.3.7 |
| React 19 | React/React DOM 19.3.0 | Both declaration packages 19.3.0 |

It compiles the public API and builds both hosts, then runs [package tests](../tests/e2e/package-host.spec.ts) in production and development with Chrome/Edge: **16 browser runs**. Actual PDF/PNG, real page navigation/pinning, local standard fonts and CMap/WASM/ICC resource delivery are checked under CSP. Product default/PDF-pin/PNG-pin screenshots compare directly to the existing approved baselines, at the original zero-difference settings.

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

- HEIF production decoding stays explicitly disabled; no LGPL decoder binary/private local configuration is in the artifact.
- Native required formats, broader real PDF/CMap/ICC/WASM cases, orientation/crop/bit-depth, performance budgets and wider host policies are not all established by this package matrix.
- The [core CI workflow](../.github/workflows/ci.yml) is configured for install/type/lint/unit/build/pack checks but has not been run on GitHub in this session. Its unreviewed browser/font environment is not automatically substituted for the approved visual references.
- CLI integration, public distribution, final third-party notices/source review and release approval remain separate.
