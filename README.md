# cu-result-viewer

A reusable React/TypeScript component for inspecting Azure Content Understanding (CU) field extraction results alongside the original PDF or image.

## Status

**Viewer implementation available; broader P1 UX is not yet complete.** The private MIT package exports the actual React component and a directly runnable demo with real PDF/PNG results. Source/Fields interaction, nested/table-like arrays, all available source-region navigation, safe Markdown, the original interactive JSON tree, controls and React 18/19 isolated Vite consumers are verified. Paragraphs/Tables/Code remain explicitly disabled rather than presenting fabricated views; this is not a complete P0 release or published package.

**Development order: Viewer first, cu-cli last.** Complete Viewer P0/P1 functionality and standalone acceptance before CLI contract or integration work. CLI is one external host option, not a prerequisite for starting or reviewing the Viewer. Fields/Markdown/JSON switching (task 4.2) is implemented; the next ordered task is accessible and responsive UX (task 4.3). D6 keeps the public API at `source` plus `result` and adds no result-pane/custom-renderer/toolbar/layout extension surface. Current technical/format/license gates remain tracked.

The repository is private. The task owner approved the initial design and open-source dependency direction. The evaluated LGPL decoder is not distributed: production HEIF/HEIC now uses pinned `heic-rs 0.1.4` WASM under MIT OR Apache-2.0 with checked-in licenses, SBOM and reproducible build inputs. The eventual goal is a Microsoft open-source project, not an already approved Microsoft publication. Copyright ownership, HEVC patent/product review and release approval remain gated.

## Objective

Provide a result-inspection workflow familiar to Content Understanding Studio users: display the source document next to extracted fields, and correlate field hover or selection with the corresponding source region.

The main deliverable is a reusable, rendering-only client-side component. It must accept the source and the original serialized CU Analyze result without asking callers to normalize the result or construct CU SDK model instances.

Implemented prototype input shape, not a stable published API:

```tsx
<ContentUnderstandingResultViewer
    source={sourceFile}
    result={analyzeResultJson}
/>
```

Source input is `File | Blob | ArrayBuffer | string`, and result input is `unknown` containing parsed, serialized CU Analyze JSON. Strings are HTTP, HTTPS, or host-owned blob URLs, not filesystem paths or data URLs. PDF/PNG/JPEG/BMP/HEIF/HEIC are identified from content. HEIF image sequences and AVIF remain explicitly unsupported.

## Component Boundary

The component renders existing data. It does not:

- Call CU Analyze or other CU service APIs.
- Depend on CU SDKs, CU service clients, or SDK model classes.
- Require Azure credentials or perform authentication.
- Create or manage analyzers.
- Poll long-running operations.
- Upload source files to CU.

A host can obtain results however it chooses, including reading a previously saved Analyze JSON file. Loading a host-provided source URL is separate from calling CU services.

## Priorities

| Priority | Intended scope |
| --- | --- |
| P0 | PDF and required image formats; direct CU JSON input; field/value/confidence presentation; field-to-source highlighting; zoom, pan, rotation, fit modes, and PDF page navigation; reusable architecture; cu-cli embedding; demo and automated tests. |
| P1 | Rich nested fields, arrays and tables, multiple source regions, safe Markdown, interactive JSON tree, accessibility, touch, responsive layout, and MCP Apps integration design/documentation. Host extensibility named in the original brief is deferred by D6. |
| P2 | TIFF, multi-page TIFF, and all Document Intelligence (DI) compatibility, field structures, and geometry handling. |

P0 image extensions from the supplied brief are `.jpg`, `.jpeg`, `.jpe`, `.png`, `.bmp`, `.heif`, and `.heic`. Browser decoding and fallback requirements must be validated; HEIF/HEIC must not be silently deferred to P2. TIFF and DI must not delay P0 or P1.

Priority labels preserve the brief, not execution order. Viewer P0/P1 and independent acceptance precede the final CLI stage. TIFF/DI stay in a separate P2 backlog, not a newly introduced integration prerequisite.

## cu-cli: Final Integration Option

The target host workflow is:

```text
cu analyze sample.pdf --view
    -> host performs CU analysis
    -> source file + serialized Analyze JSON
    -> local browser application embedding the reusable viewer
```

This is a target external-host workflow, not a command implemented by this repository. Its contract and implementation are deferred until the standalone Viewer is complete. The Viewer already runs directly and must work with saved results without a new CU service call or CLI service.

Planned deliverables are:

1. Complete the reusable Viewer P0/P1, including working rich result views and approved UX.
2. Validate the direct demo and independent React consumers using original source/saved JSON, retaining prototype parity.
3. Finally agree and implement a minimal cu-cli handoff with its maintainers, reusing the completed Viewer.

The CLI owns browser launch, local file delivery, and any local hosting mechanism. Those responsibilities do not belong in the component.

## References, Not an Application Base

Content Understanding Studio is the behavioral reference named in the task brief; its behavior must be verified rather than inferred. Fields styling follows the owner's supplied Studio screenshot; the project does not reproduce the entire Studio application.

[OCR-Form-Tools](https://github.com/microsoft/OCR-Form-Tools) is an implementation reference for rendering, overlays, page navigation, and coordinate transformation. This project is not a fork of that application and should not automatically inherit its Redux, Electron, service integrations, or older application architecture.

PDF.js and the two react-pdf-highlighter projects are candidates to evaluate, not selected dependencies. Use the current CU API output and [CU samples](https://github.com/Azure-Samples/azure-ai-content-understanding-python) as the data-model reference.

## Project Documents

- [Requirements](docs/requirements.md): the supplied brief organized by priority, with proposed acceptance checks and clarification items.
- [Roadmap](docs/roadmap.md): implementation order, investigation checkpoints, and release gates.
- [Development plan](docs/dev-plan.md): proposed architecture, phased implementation tasks, dependencies, acceptance-to-test mapping, and host integration gates.
- [Development plan (Simplified Chinese)](docs/dev-plan.zh-CN.md): a Chinese translation with the same task identifiers, dependencies, and technical contracts.
- [Design decisions and Phase 1 evidence](docs/design-decisions.md): approved initial assumptions, actual cu-cli input/geometry evidence, Studio limitations, and remaining gates.
- [Rendering evaluation](docs/rendering-evaluation.md): actual browser geometry/decoding probes, candidate comparison, and unresolved HEIF license/CSP/lifecycle gates.
- [UI prototype v2](docs/prototype/README.md): approved [static design gallery](docs/prototype/index.html), the runnable prototype workflow, and actual [Fields](docs/prototype/interactive-fields.png), [PDF](docs/prototype/interactive-pdf.png) and [PNG](docs/prototype/interactive-png.png) screenshots. The owner approved the interactive baseline for task 2.4 hardening; full P0 acceptance remains open.

## Run the Prototype

From the repository root, after installing the locked dependencies:

```powershell
npm ci --ignore-scripts
npm run dev
```

Open <http://127.0.0.1:5173/>. Select **PDF** or **Receipt PNG** to load a real paired sample. Hover a field to preview its primary source region, click to pin it, and use the source controls to zoom, fit, rotate, pan, or navigate PDF pages. A single-page image does not show page-navigation inputs.

Fields follows the Studio reference without a separate Clear button. Selecting another field replaces the pin; changing inputs/content or filtering out a selected missing field resets the selection automatically.

Objects and arrays start collapsed; use the right-hand chevrons to expand them. **Hide missing fields** starts enabled and hides only fields without a returned value, not `0`, `false`, `null`, or empty strings. Fields and source previews share two-decimal confidence formatting; absent confidence is omitted, not replaced with zero. An ungrounded field has an outlined dot and no page badge. Groups use their own primary region or the first genuinely grounded descendant, and descendants inherit their root field's color without changing the original JSON.

If a result references a page absent from the loaded source, its page badge is disabled and explains the mismatch. Result warnings list unavailable pages; hovering or selecting an affected field keeps its value inspectable and shows a source-region error without a fake page jump or highlight. Supplying a matching result removes the warning and restores navigation.

The file pickers belong to the demo host. They read local files and parsed JSON; the component receives original data and never calls CU. Source failure does not hide valid fields, invalid result data does not hide a valid source, and parser issues remain visible. Prototype field previews use a small dock below the document so that they cannot obscure source text.

Use **Markdown** to render the selected content item's `content.markdown`. Real CU HTML tables are parsed and then sanitized; scripts, frames, event handlers, dangerous links and remote images are not rendered. HTTP/HTTPS/mail links open with `noopener noreferrer`. Markdown over 50,000 characters stops at an explicit limit state rather than freezing the pane.

The Studio-style **…** control is the **JSON** tab and displays its label after selection. It renders the original caller-provided operation envelope or inner result, not the internal parsed field model. The root starts expanded and nested objects/arrays are keyboard-expandable. Results over 500,000 serialized characters or 20,000 values, circular values and other non-JSON input receive explicit states. Switching Fields/Markdown/JSON preserves source page, zoom, rotation and pinned field/region state.

Known limits: packaged HEIF covers reviewed still-image fixtures but not all HEVC tools, alpha, nonzero transforms, image sequences or AVIF. React 18/19 isolated Vite consumers pass PDF/PNG/HEIF and rich results. Paragraphs/Tables/Code, full real format/orientation/crop coverage, accessibility/touch/responsive behavior, wider host environments, CLI and product/publication gates remain incomplete. Non-Vite bundlers are unverified and outside current acceptance rather than an implied release gate.

## Development Foundation

Use Node.js 22.x starting at 22.13.0, Node.js 24.x, or Node.js 26+. The current checks ran on Windows with Node.js 22.16.0 and npm 10.9.2.

From the repository root:

```powershell
npm ci --ignore-scripts
npm run typecheck
npm run lint
npm run test:unit
npm run test:e2e
npm run build
npm run build:demo
```

Browser tests use the installed Chrome and Edge, through Playwright's `chrome` and `msedge` channels. `npm run test:e2e` starts the loopback demo if it is not already running. Production-host preview is available with `npm run preview:demo` after `npm run build:demo`, at <http://127.0.0.1:4173/>.

The library build generates the ESM component, declarations, scoped CSS, local PDF assets and an optional Node-only Vite resource entry. React exports remain `ContentUnderstandingResultViewer`, `ViewerSource` and `ContentUnderstandingResultViewerProps`; import `cu-result-viewer/styles.css`. A Vite host explicitly adds `viewerAssets()` from `cu-result-viewer/vite` to serve/copy resources. See [packed usage and CSP](docs/usage.md). The separate `dist-demo` build is not itself an isolated package test.

The [internal parser](src/internal/parseCuResult.ts) accepts the verified `2025-11-01` operation envelope or its inner Analyze result without caller normalization. It preserves missing/zero/false/null values and nested field identity, parses CU page/region information, and does not modify the original JSON. Structural failures throw `CuResultParseError`; invalid confidence/grounding produces explicit issues while preserving extracted values. Unverified field/content types are retained with warnings, not advertised as fully supported.

[Parser tests](src/internal/parseCuResult.test.ts) and input tests account for 49 cases. Direct parsing of the PDF/PNG results yields 100/42 field nodes and 53/13 regions without warnings; these counts do not verify UI effects.

The [geometry module](src/internal/geometry.ts) maps CU coordinates through actual rendered-page dimensions, zoom, pan and quarter-turn rotation, with inverse, fit and raster-size helpers. Shared validation prevents parser/overlay disagreements. Core input/parser/geometry accounts for 339 cases; lifecycle, structured Fields, rich results, interaction, directory-URL and resource-plugin tests bring the current total to **429**.

The initial geometry experiment passed 512 rendered-coordinate cases. The [prototype](tests/e2e/prototype.spec.ts), [public-source input](tests/e2e/source-inputs.spec.ts), [image-format](tests/e2e/image-formats.spec.ts), [product visual](tests/e2e/visual.spec.ts), [rich-result](tests/e2e/rich-results.spec.ts), [production performance](tests/e2e/performance.spec.ts) and [stress](tests/e2e/stress.spec.ts) suites now pass **104 runs** across Chrome `154.0.8037.98` and Edge `155.0.4283.45`: thirteen prototype, eleven public-input, eleven image-format, nine visual, three rich-result, two performance and three stress scenarios per browser. Six stress runs execute 600 measured rounds, not 600 distinct tests. Normal cancelled/retried requests remain distinct from errors.

The separate [packed-consumer matrix](tests/e2e/package-host.spec.ts) adds **24 runs**: React 18.3.1/19.3.0, production/development, Chrome/Edge and three scenarios each. These are actual tgz installations outside the repository, not shared dependencies or source aliases. Combined local browser evidence is **128 runs**. PDF/PNG/HEIF, Markdown/JSON lazy chunks, types/CSS, local Worker/fonts, CSP, PDF resources, packaged HEIF resources and reviewed product screenshot references pass.

```powershell name="Independent packed package verification"
npm run verify:consumer
```

The [usage guide](docs/usage.md) explains explicit asset integration and rerunning generated hosts. Vite is an optional build-host peer, not a required browser API or new service dependency. GitHub Actions has successful [post-RC-4 push validation](https://github.com/changjian-wang/cu-result-viewer/actions/runs/38370248168) and a successful [manually dispatched full matrix](https://github.com/changjian-wang/cu-result-viewer/actions/runs/38365385502) covering core checks, Chrome/Edge functionality, production performance, isolated React 18/19 consumers, the 600-round stress suite and reproducible HEIF codec build. Pixel-exact references remain a fixed-version local gate rather than being rewritten for hosted-runner browser/font versions.

### Structured Fields and Source Regions

Task 4.1 is implemented for the current verified scope:

- Objects and arrays retain stable JSON-pointer-derived identities; real Invoice LineItems render as **Item 1–3**, while duplicate child labels remain independently selectable.
- Collapsing a structured parent keeps the hidden descendant pinned and the parent visibly selected; expanding restores the same selected child.
- Selecting a field with multiple source regions exposes Previous/Next controls in the existing preview dock. Every region can be reached without changing the root color or replacing the field selection.
- Groups without their own source collect grounded descendants in deterministic depth-first order. A synthetic, clearly labeled cross-page array verifies group region navigation across PDF pages and manual-page precedence.
- Real BillingAddress supplies two same-page service regions; the current [running screenshot](docs/prototype/interactive-multi-region.png) shows its second region together with the expanded real LineItems array.

Default/hover/pinned prototype screenshots did not change. This does not implement the dedicated **Tables** result tab, a generalized editable data grid, or prove real CU cross-page structured extraction; those remain separately scoped.

### Rich Result Views

Task 4.2 is implemented with exact MIT-licensed dependencies: React Markdown 10.1.0, remark-gfm 4.0.1, rehype-raw 7.0.0, rehype-sanitize 6.0.0 and react-json-view-lite 2.5.0. The Markdown pipeline supports headings, lists, GFM, fenced/inline code and sanitized raw CU tables. The JSON tree retains the original input reference and starts with only its root expanded.

Markdown and JSON are separate lazy chunks. The default library entry is 47.29 kB minified / 14.19 kB gzip, compared with 479.97 kB / 127.76 kB before splitting; the demo main chunk is 261.31 kB / 82.28 kB and no longer triggers Vite's 500 kB advisory. The production budget verifies no rich chunk is requested on Fields, cold view activation within 1,000 ms, near-limit warm activation within 350 ms, no task over 100 ms and no more than 64 MiB heap growth on the recorded Chrome/Edge environment.

Real PDF/PNG Markdown, all nine invoice tables, absent Markdown, unsafe HTML/URLs/images, original envelope keys, nested object/array expansion, parser-rejected but still inspectable raw JSON, measured size/value limits and tab/source-state retention pass in Chrome/Edge. Four new rich-pane references were added; the prior 30 approved product references still compare at zero differing pixels. Dedicated Paragraphs/Tables/Code tabs remain out of scope until their semantics are agreed. The next ordered functional task is **4.3**.

D6 is resolved for 4.3: no result-pane customization, view registry, custom renderer, callback, toolbar/layout slot or initial-view public option will be added. The public component remains `source` plus `result`; accessibility, touch and responsive behavior proceed without widening that contract. Vite 8 is the only formally supported bundler profile for the current package/resource workflow; other bundlers remain unverified.

```powershell name="Production rich-result budget"
npm run verify:performance
```

### Approved Product Appearance

The owner confirmed that the final UI must preserve the latest approved interactive prototype, including Studio-aligned Fields, no Clear button, collapsed groups, missing filtering and the preview dock below the source. The input-test host is not the product UI. Historical static v2 pictures retain earlier designs and do not override subsequent approvals.

The visual suites freeze **34 screenshot baselines**: the existing 30 approved product images plus four reviewed task 4.2 Markdown/JSON pane references across Windows Chrome/Edge. The original set covers default PDF, Fields reference, hover/pin, expanded/collapsed/missing states, page 4/ungrounded/relocation, PNG, loading, empty and independent source/result errors. Browse them in the [latest baseline gallery](docs/prototype/index.html#visual-baselines).

- Full-product captures use `1600 x 1040`, DPR 1, light mode and Windows Segoe UI. The Fields reference uses a `1458 x 861` viewport and captures its approximately `489 x 697` CSS-pixel pane.
- Chrome Fields pixels must also match the existing [approved reference](docs/prototype/interactive-fields.png) exactly. Edge has a separate baseline for its native scrollbar differences; no UI regions are masked.
- Screenshot comparison uses color threshold `0` and `maxDiffPixels: 0`. Actual polygon vertices separately retain the `1 CSS px` geometry limit.
- Normal tests never update or create missing baselines. A drift probe changes the dot size from 12 to 14 px in test-only DOM styling, verifies a screenshot mismatch, removes the probe, and verifies recovery.
- The original visual suite passed 36 repeated comparison runs without changing any of its 30 baseline hashes. Task 4.2 added four pane references. RC-3 intentionally refreshed 22 full-page product images solely for the truthful HEIF footer status; eight pane-only product references, all four rich-pane references, component layout and the approved Chrome Fields crop were unchanged. A normal no-update run matches all 34, including the drift probe. Separate 100-round PDF/PNG stress scenarios verify state/resource behavior against these references.

```powershell name="Immutable product visual regression"
npm run test:e2e -- visual.spec.ts
```

Only after an intentional design change has been reviewed and approved, update the approved Fields reference if affected, then explicitly record and review the resulting image diffs:

```powershell name="Explicitly record approved visual changes"
node .\node_modules\@playwright\test\cli.js test visual.spec.ts --update-snapshots=all
```

Do not update screenshots merely to make a failing test pass. Current baselines target Windows and recorded Chrome/Edge versions; other platforms need reviewed references. Browser/font upgrades require review, not looser thresholds. Verified Vite React 18/19 consumers now match default/PDF-pin/PNG-pin images; wider host parity and full P0 acceptance remain open.

### 100-Round State and Resource Verification

The [stress suite](tests/e2e/stress.spec.ts) exercises the actual component at `1600 x 1040`, DPR 1, in Chrome and Edge. Each browser executes:

| Scenario | Exact work and assertions |
| --- | --- |
| PDF pages and transformations | 100 rounds: page 1/4 navigation, ungrounded hover, pin restoration, quarter-turns, fit, zoom and 37/21 px dragging. Primary-region vertices stay within 1 CSS pixel and the loaded PDF worker count does not grow. |
| Public-source replacement | 100 PDF/PNG replacements; each of File/Blob/ArrayBuffer/HTTP/blob URL occurs 20 times. Every completed source has only its expected live resources; 40 buffer/JSON/host-URL integrity checks pass per browser. Host release balances Worker, bitmap and URL creation/disposal. |
| Pending HTTP cancellation | 100 controlled pending loads: 50 source replacements and 50 unmounts. Every held request is checked for actual `net::ERR_ABORTED`, not only a StrictMode side-effect cancellation; no late successful response or retained source resource is accepted. |

The product-context PDF stress run finishes by comparing its pinned PDF and replacement PNG directly with the existing approved images. Resource accounting distinguishes a currently owned bitmap from a leak; it does not navigate to a fresh page and infer cleanup from reset counters.

Stress exposed a genuine pan-layout bug: a 37 px horizontal drag could move the paper only 29.5 px because vertical overflow created a 15 px scrollbar and re-centered the paper. Clipping translated content inside the existing document stage fixes that root cause while the stage's explicit dimensions still support zoom scrolling. The drag remains 37/21 px, no compensating offsets or screenshot updates are used, and all approved images still match.

```powershell name="PDF and image stress regression"
npm run test:e2e -- stress.spec.ts
```

Stress cases have an explicit five-minute test-runner deadline, not an approved performance budget. Run a single Playwright runner, or give separate runners different output directories; their default trace/artifact folders are shared. This batch passed 314 related geometry/interaction unit cases, type/lint, both builds and the 76-run combined browser suite. The overall unit inventory remains 409.

Stress coverage is limited to saved PDF/PNG, public representations and controlled HTTP cancellation at DPR 1. Broader HEIF/format/orientation/DPR stress, peak memory and latency budgets remain separate gates. Independent Vite package consumers are covered by their additional matrix, not inferred from these loops.

### Public Source Input Verification

The [test-only React host](tests/e2e/source-inputs.tsx) mounts the public component directly with the existing real PDF/PNG pairs. It does not change the product demo or ship in the library/demo build.

| Input | Verified browser behavior |
| --- | --- |
| File | Correct page count/dimensions, real values, raster and primary polygon. |
| Untyped Blob | Content detection without a MIME type; identical raster and grounding. |
| ArrayBuffer | Identical rendering; caller byte length/hash remain intact after unmount, and the same buffer can be remounted. |
| Same-origin HTTP URL | Correct rendering, explicit 404/network/empty-response errors, recovery, and cancellation during replacement/unmount. |
| Cross-origin HTTP URL | A second loopback origin verifies explicit CORS success for PDF/PNG/HEIF, missing-CORS failure, no cookie or Authorization forwarding, and viewer-origin PDF/HEIF assets. |
| Host-owned blob URL | Correct rendering; the URL remains readable after viewer unmount and is revoked by the test host when it releases its input. |

The input suite compares actual canvas pixel hashes across representations and independently checks polygon vertices within 1 CSS pixel. Empty/truncated binary inputs are explicit synthetic failure cases: valid fields stay visible, dependent controls are disabled, and valid replacement files recover. Delayed HTTP loads, PDF worker initialization and native-image decoding are cancelled on both replacement and unmount; browser instrumentation checks Worker termination, ImageBitmap closing and object-URL ownership without substituting the rendered output.

```powershell name="Public source input regression"
npm run test:e2e -- source-inputs.spec.ts
```

On this Windows checkout, with `npm run dev` running, the test host is at <http://127.0.0.1:5173/@fs/C:/github/cu-result-viewer/tests/e2e/source-inputs.html>. It also has **Load HEIF**, using a licensed photograph and explicitly synthetic geometry. PDF/PNG 100-round stress and controlled HTTP cross-origin behavior pass; HTTPS/TLS, broader real format pairs and production embedding remain separate gates.

### Image Formats and Packaged HEIF

The [common image adapter](src/internal/imageSource.ts) recognizes content signatures rather than filenames/MIME hints. Native PNG/JPEG/BMP decoding explicitly uses EXIF-normalized image orientation, then shares rendering, view rotation and bitmap disposal. JPEG `.jpg`/`.jpeg`/`.jpe` are extension aliases, not different codecs.

- The original receipt PNG and full-size JPEG/BMP derivatives retain their canvas dimensions at DPR 1/2 and all four viewer rotations. Replacement keeps one live native bitmap and switching back to PDF releases it. The derivatives flatten transparency onto white and reuse saved grounding as an explicitly derived test, not another Analyze call.
- Eight small synthetic EXIF JPEGs verify mirrored/rotated pixels, normalized dimensions and quarter-turn overlays at DPR 1/2. Their synthetic grounding is in the normalized image frame; this is not evidence of real CU extraction on every EXIF variant.
- The licensed HEVC-in-HEIF example verifies primary-image selection, five public input representations, caller-buffer preservation, quarter-turn overlays, failure/recovery, and Worker termination on replacement/unmount.
- HEIF tests apply actual CSP to both page and worker responses: same-origin scripts/workers, `wasm-unsafe-eval` without general JavaScript `unsafe-eval`, and no Blob Worker.

```powershell name="Image format and orientation regression"
npm run test:e2e -- image-formats.spec.ts
```

HEIF/HEIC uses a packaged pure-Rust `heic-rs 0.1.4` decoder compiled to WASM. Chrome 154 and Edge 155 do not decode the fixture through `<img>` or `createImageBitmap`, so the fallback remains required. The previous `libheif/libde265` candidate is retained only as historical evaluation evidence and is absent from the repository, build and tgz.

The decoder is lazy and owned by a same-origin classic Worker. A 40-million-pixel ceiling rejects oversized allocations before returning RGBA. Nine generated MIT/Apache HEIC fixtures cover single images, tiled grids, 8-bit colour, large images, rotated dimensions and EXIF; Chrome/Edge RGBA hashes match, including three exact Apple-reference cases and remaining RGB PSNR of 47.76-49.80 dB. Empty/truncated input, denied WASM CSP, missing assets, replacement, unmount and recovery are explicit tests.

The [owned Worker](src/internal/heif.worker.ts) decodes lazily off the UI thread with a 30-second deadline. Library/demo builds and the optional `viewerAssets()` plugin ship the same hash-pinned Worker, JS binding, WASM, notices, licenses and [SBOM](assets/heif/SBOM.json). [Rust wrapper source and lock](codecs/heic-rs-wasm) plus [the build script](tools/build-heic-codec.ps1) reproduce the reviewed artifacts. Normal npm builds do not require Rust.

```powershell name="Reproduce the packaged HEIF decoder"
npm run verify:heif-codec
```

See [the HEIF running screenshot](docs/prototype/interactive-heif.png). It uses [the sample's original MIT notice](tests/fixtures/images/LICENSE.heif-example.txt). Actual tgz consumers pass React 18/19, development/production, Chrome/Edge, WASM-only Worker CSP and local asset delivery. Broader real CU HEIF pairs, nonzero `irot`/`imir`, alpha, 10-bit production fixtures, HEVC patent review and publication approval remain separate gates.

React and React DOM are peers for the intended React 18/19 library; the current runtime uses React 19.3. PDF.js 6.3.289 remains the only npm rendering dependency. Its worker/fonts/CMaps/WASM/ICC resources are packaged locally with its license; the HEIF decoder is a checked-in generated asset with separate permissive notices. CU SDKs, Azure credentials, service clients, and the investigated LGPL decoder are not package dependencies. Main source is covered by [MIT](LICENSE); the sample documents retain their [original notice](tests/fixtures/LICENSE.txt).

The npm lockfile uses the environment's existing Microsoft public package feed without embedded credentials. A cold installation outside this environment and the final public distribution/asset layout must still be verified before release.

## Samples and Verification

Use real, paired source documents and matching sanitized CU results for normal demonstrations and integration tests. Synthetic data may supplement negative and boundary tests, but must not be presented as a real service result.

Do not commit credentials, SAS tokens, customer-sensitive documents, or unsanitized Analyze results. Document specific sample gaps before claiming coverage.

The [fixture inventory](tests/fixtures/manifest.json) records two actual GA service calls on licensed public source documents, original CLI responses, hashes, expected fields/geometry, and coverage gaps. Acquiring fixtures with cu-cli does not implement browser viewing or add CU dependencies to the future library.

The prototype commands and the limited browser scenarios above are verified. They do not establish every required P0 format, performance/embedding guarantee, or distribution obligation. No new Analyze calls are needed to run this demo.
