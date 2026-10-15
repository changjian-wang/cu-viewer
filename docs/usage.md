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
- `result`: the original saved CU Analyze JSON parsed as a JavaScript value, not a string or a new normalized viewer schema. The parser recognizes `2025-11-01` and `2026-06-01-preview`; Preview detail-container mapping is covered by synthetic schema-shaped fixtures, not a claim of complete real-service Preview coverage.
- The component performs rendering, not Analyze, authentication, uploads, analyzer management or LRO polling.

For URL sources, the viewer accepts only HTTP, HTTPS and host-owned blob URLs. Fetch uses `credentials: "same-origin"`: cross-origin requests do not opt into cookies or HTTP authentication and the component does not add an Authorization header. A cross-origin server must return an appropriate CORS response. The checked HTTP loopback matrix covers CORS success for PDF/PNG/HEIF, a missing-CORS failure and recovery; HTTPS/TLS and credentialed cross-origin delivery remain unverified. PDF Worker/font resources and HEIF decoder assets continue to load from the viewer host rather than from the source-file origin.

Keep the package CSS and provide a bounded host height. Fonts, browser/viewport and host CSS affect visual matching; do not override Fields spacing, palette or icons without reviewing the approved prototype.

## Result Views and Content Limits

- **Fields** renders the verified parsed field model and source interactions when the selected content has fields.
- **Markdown** renders the selected content item's original `markdown`. GFM and CU HTML tables are supported. Raw HTML is parsed only so `rehype-sanitize` can apply its allowlist; scripts, frames, event attributes and dangerous protocols are removed. Remote images are represented as omitted text and never requested.
- **Result** replaces the earlier **…/JSON** control and renders the original `result` input rather than an internal normalized object. The root starts expanded; nested objects and arrays start collapsed and support keyboard expansion.

The known tab order is Fields, Markdown, Paragraphs, Tables, Figures, Signatures, Metadata, Result, Code. Tabs without applicable data are omitted, not disabled. Metadata/Signatures require mapped Preview properties; Code requires API version and analyzer ID context, preferring the selected content's analyzer ID. The content selector is available in every view. When switching content, an available active view is retained; otherwise the first available view is selected.

The dedicated result views are implemented:

- **Paragraphs** preserves CU order, optional role and page metadata; mouse/keyboard selection locates its supplied source regions.
- **Tables** uses **Current table** previous/next navigation to display one original native grid, with headers and row/column spans, not Fields arrays or Markdown HTML. Switching tables selects the returned whole-table source; cells remain individually source-linked. Invalid or overlapping cells produce explicit errors; layouts above the existing 20,000-value ceiling are reported as a 20,000-position limit rather than truncated.
- **Figures/Signatures** show available returned metadata and source-region canvas crops. Rendering uses the loaded source, never an invented image or remote figure URL. Crops do not change the main page/zoom/rotation/pan, and pending work is aborted on tab/source change or unmount. No signed/unsigned state is inferred.
- **Metadata** preserves returned string key/value order and supports individual value copy.
- **Code** offers Python/C#/JavaScript samples, syntax highlighting and copy. Analyzer ID/API version come from the result; endpoint/key/file URL remain placeholders. SDK calls are never executed or installed as Viewer dependencies.

Copy uses the host Clipboard API; unavailable/denied access is a visible error, not silent success. Syntax highlighting renders text/spans without HTML injection, JavaScript eval or extra CSP permissions. The new lazy Code dependencies and their [bundled notices](../THIRD-PARTY-NOTICES.txt) ship with the package. Official sample API references are the [Python](https://github.com/Azure/azure-sdk-for-python/tree/main/sdk/contentunderstanding/azure-ai-contentunderstanding), [C#](https://github.com/Azure/azure-sdk-for-net/tree/main/sdk/contentunderstanding/Azure.AI.ContentUnderstanding) and [JavaScript](https://github.com/Azure/azure-sdk-for-js/tree/main/sdk/contentunderstanding/ai-content-understanding) SDKs.

Invalid detail containers produce visible path-specific warnings while valid fields and the unchanged Result remain inspectable. All detail regions on the selected source page are highlighted; the existing previous/next-region controls navigate the remaining regions/pages. Explicit selection or region navigation reveals an off-screen source region without changing zoom or rotation; an already visible target does not move.

Switching views does not replace or reinitialize the source pane, so page, zoom, rotation, pan, pinned field and selected source-region index remain intact. Selecting another result content is a separate operation and retains its existing page/selection behavior.

### Studio Source Layers and Hover Previews

The permanent OCR base layer reads `contents[].pages[].words[].source` for the current source page. It uses Studio's verified `#FAFF7F40` fill and 1px same-color stroke (about25.1% opacity), independent of field values, confidence, missing-field filtering or the active tab. The first valid word region is used and identical polygons draw once, avoiding cumulative opacity. Invalid word containers/text/source produce path-specific warnings; missing or invalid geometry is not invented. The original JSON and source raster pixels are unchanged.

This behavior is grounded in the publicly deployed [Studio viewer defaults](https://contentunderstanding.ai.azure.com/assets/main-DRBDOXIp.js) and [WordVectorLayer/style](https://contentunderstanding.ai.azure.com/assets/visual-sdk-AyAWovJX.js), inspected on2026-10-15, and the official [Words/source schema](https://learn.microsoft.com/azure/ai-services/content-understanding/document/elements#words). It is an OCR word overlay, not a confidence or extraction-quality indicator. No Studio code or additional dependency is bundled into the Viewer.

The active result tab determines the annotation layer above those yellow words:

- **Fields** shows all returned field polygons on the current page, including grounded descendants in collapsed groups. Colors inherit original root-field order. Hide missing fields also filters these outlines; grouping does not invent a parent rectangle.
- **Paragraphs** shows returned paragraph polygons in blue; **Tables** shows each returned whole-table polygon in blue rather than synthesizing a table rectangle from cell coordinates.
- **Figures/Signatures** show their own returned regions. **Markdown** hides the field/paragraph/table polygon layers but keeps the yellow OCR base. Returned table markers remain visible in Fields, Markdown, Paragraphs and Tables.
- **Result/Metadata/Code** hide a different tab's annotations, not the permanent yellow OCR base. The pinned selection remains stored and reappears when its view is restored.

Hover a right-side field to emphasize its source and show a source-anchored preview containing the field name, value and optional returned confidence. Hover a paragraph to show only its returned **Content**, not a fabricated field/confidence template. Other current-page outlines remain visible. The corresponding result value/card is emphasized without replacing the pinned selection.

Keyboard focus provides the same preview without navigating to another page merely on focus. **Esc** dismisses it. Pointer previews close after leaving the trigger and popup; focus previews persist while the trigger stays focused. The popup can be hovered and long values scroll inside a viewport-bounded panel. Placement flips/clamps around the target and limits height to available space; off-screen targets do not get an unrelated floating preview. Pan, tab/content/source/result changes cancel stale previews. Pinned multi-region controls remain available during temporary previews.

Layers initialize after the paper's CSS frame commits. As in Studio's OpenLayers renderer, words are drawn on a separate transparent Canvas 2D layer, scaled to the actual CSS frame and device pixel ratio; result frames remain vector overlays. The word canvas does not paint into the source canvas. Its own backing store is cleared on replacement/unmount, with no additional ImageBitmap, Worker, object URL or source request. Shared geometry keeps raw CU coordinates unchanged; page/content/result/source changes replace the word collection, and unavailable/loading sources hide it. Exact long transform comparisons are preserved without snapshot masks or threshold changes.

Returned source-table icons are interactive in Fields, Markdown, Paragraphs and Tables:

- Hover/focus displays the original **Rows: N, Columns: M** counts and emphasizes that table's source region with a dotted outline.
- Click, Enter or Space opens a native modal titled **Table**, with a dimmed backdrop and the readonly original grid. Headers, row/column spans, empty values and explicit invalid-grid errors use the same renderer as the Tables pane; this inspector has no cell selection actions or added source-page labels.
- The modal does not switch the right-side result tab, replace the pinned field, move the source or change zoom/rotation. X or Esc closes it and returns focus to the invoking icon. Keyboard focus stays within its close/scroll controls while open.
- Source/result/content/page/view replacement closes a stale inspector. Opening/closing does not fetch or decode the source again, allocate new bitmaps/workers/URLs, call Analyze, or add a public extension API. Only actual returned table regions get icons; no rectangle is inferred from cells.

To bound synchronous client rendering, Markdown is limited to 50,000 characters. JSON is limited to 500,000 serialized characters and 20,000 values. These limits retain substantial headroom over the verified 5,125-character Markdown and 393.5 kB Analyze result while avoiding the measured long tasks above those boundaries, including parallel GitHub-hosted load. Inputs beyond a limit receive an explicit state and remain caller-owned; the component does not truncate or mutate them. Circular, non-finite and other non-JSON values are also reported explicitly. Hosts that need to inspect larger results should provide a separate download or specialized large-document workflow rather than raising these internal limits without measuring the target devices.

Markdown and JSON are lazy chunks. Fields does not request either chunk until the corresponding tab is activated. Run the production Chrome/Edge budget after changing rich-result dependencies, limits or rendering:

```powershell name="Verify production rich-result performance"
npm run verify:performance
```

The current gate allows at most 1,000 ms for first activation, 350 ms for a warm near-limit activation, 100 ms for any observed main-thread long task and 64 MiB heap growth. The warm budget includes the 272-276 ms JSON evidence from GitHub's hosted Windows runner; the stricter long-task budget remains unchanged. These are recorded Windows Chrome/Edge engineering limits for the current private Viewer, not a general guarantee for every host device.

## Desktop Keyboard and Source Navigation

The current interaction scope is desktop Chrome/Edge. Touch, mobile-app behavior, pinch gestures and vertically stacked panes remain deferred.

- Result tabs have one Tab stop; Left/Right, Home and End change the active tab. Tab enters the active panel and its controls.
- Field names, scalar values, disclosure buttons and available page badges support Enter/Space. Accessible descriptions include returned values/confidence; detail buttons include returned text, role, source pages and applicable figure descriptions.
- Tab to **Source viewport** and use arrow keys to pan by 40 CSS pixels. Source zoom, fit, rotation and page controls remain keyboard-operable.
- Rendering preserves control focus. At the last/first page or source region, focus moves to an enabled adjacent navigation control rather than disappearing onto the document body.
- Enter commits the page number. Leaving an edited input also commits a valid page; render-induced blur or an unchanged value does not re-submit an old page and override hover/selection navigation. Invalid input has an associated visible error.
- Copy remains focusable while a Clipboard API write is pending, reports its busy/disabled state and ignores duplicate activation. Completion does not steal focus from another control; denial remains an explicit error.
- Explicit selection first navigates to its available source page, keeps zoom/rotation and pans only the axes on which the target is outside the viewport. Cross-page navigation changes an active fit mode to manual zoom when needed to preserve the prior scale. Mouse hover is not a new centering request; manual page navigation or pan takes precedence over stale requests.
- Source and Result scroll independently. A narrow desktop host keeps side-by-side panes, with minimum Source/Result widths of 400/330 CSS pixels and horizontal scrolling inside the viewer. Keep the bounded host height; no mobile stacking is added.

### Manual Windows Narrator Acceptance

Actual Narrator output is **pending owner walkthrough**. Automated keyboard/focus/ARIA checks are not a substitute for screen-reader acceptance, and task4.3a remains open until this check passes.

1. Enable Narrator with **Win+Ctrl+Enter**. In Chrome and then Edge, open the saved-data demo at <http://127.0.0.1:5173/>.
2. Check Tab focus, result-tab selection, field expansion/selection and the spoken returned value/confidence. Check field/paragraph source previews, Esc dismissal, source-table Rows/Columns tooltips and modal close/focus behavior, current-table navigation and paragraph/table/figure descriptions against the displayed data. Use **Narrator+Space** to change scan mode when testing viewport arrow-key pan.
3. Check page number/total, invalid-page error, page/region boundaries and stable focus after rendering. Verify source-linked selection keeps zoom/rotation and does not move an already visible target.
4. Check Code language controls, copying success and an explicitly denied/unavailable clipboard error. Record the browser, action, spoken output and any unexpected focus change.

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

Vite 8 is the sole formally supported bundler profile for the current private Viewer. Other bundlers and custom chunk/resource layouts are unverified; the package does not claim compatibility with them.

For an explicit output layout, `viewerAssets("assets/pdfjs")` is supported. The target must be a non-root subdirectory of the host build output and must match the directory resolved beside the bundled viewer entry. Root/parent/outside paths are rejected.

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

This is a verified fixture policy, not a guarantee for every PDF or embedding environment. Real CMap/ICC/codec-specific PDFs, HTTPS/credentialed cross-origin sources and other host restrictions remain additional acceptance work.

## Independent Package Verification

```powershell name="Build pack install and verify independent consumers"
npm run verify:consumer
```

[The verifier](../tools/verify-packed-consumers.mjs) builds a real tgz, checks its file inventory, creates new projects outside the repository, and installs each project's own dependencies:

| Consumer | Runtime | Type declarations |
| --- | --- | --- |
| React 18 | React/React DOM 18.3.1 | `@types/react` 18.3.31 / `@types/react-dom` 18.3.7 |
| React 19 | React/React DOM 19.3.0 | Both declaration packages 19.3.0 |

It compiles the public API and builds both hosts, then runs [package tests](../tests/e2e/package-host.spec.ts) in production and development with Chrome/Edge: **32 browser runs**. Actual PDF/PNG/HEIF, real page navigation/pinning, rich results, desktop keyboard/focus/conditional reveal, pending-copy focus, local standard fonts, PDF resources and the packaged HEIF Worker/JS/WASM are checked under CSP. Product default/PDF-pin/PNG-pin screenshots compare directly to the existing approved baselines at zero difference.

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

- HEIF production decoding is enabled with a pinned MIT/Apache WASM decoder; no LGPL decoder or private local configuration is present. HEVC patent/product and public-release approval blocks public distribution only, not Viewer development/private acceptance.
- Approved evidence uses pixel-equivalent JPEG/BMP derivatives and licensed HEIF samples without per-format Analyze calls. Required PDF.js assets are packaged; representative PDF coverage and explicit unsupported-PDF errors are required rather than an exhaustive codec matrix.
- URL sources support HTTP/HTTPS same-origin and anonymous CORS; credentialed cross-origin is out of scope. Source/decoder acceptance uses documented safety limits, cancellation and balanced disposal; timing/memory remain observations rather than additional hard gates.
- The [CI workflow](../.github/workflows/ci.yml) has successful [post-RC-4 push](https://github.com/changjian-wang/cu-result-viewer/actions/runs/38370248168) and [full manual](https://github.com/changjian-wang/cu-result-viewer/actions/runs/38365385502) runs. Core, Chrome/Edge functionality, production performance, isolated React 18/19 consumers, 600 stress rounds and reproducible HEIF codec generation pass remotely. Hosted-runner browser/font versions do not replace the fixed-version pixel references; remote jobs skip only those screenshot comparisons while retaining behavior, geometry, CSP, Worker and resource assertions.
- CLI integration, public distribution, final third-party notices/source review and release approval remain separate.
