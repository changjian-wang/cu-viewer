# cu-result-viewer

A reusable React/TypeScript component for inspecting Azure Content Understanding (CU) field extraction results alongside the original PDF or image.

## Status

**Interactive prototype available.** The private MIT package now exports a React viewer prototype and has a runnable local demo using real saved PDF/PNG results. Source rendering, field correlation and basic viewing controls have browser coverage. This is not a P0 release, published package, or cu-cli integration.

The repository is private. The task owner approved the initial design, MIT for the main component, and LGPL decoder candidates subject to compliance before any distribution. The eventual goal is a Microsoft open-source project, not an already approved Microsoft publication. Copyright ownership, third-party distribution obligations, and release approval remain gated.

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

Source input is `File | Blob | ArrayBuffer | string`, and result input is `unknown` containing parsed, serialized CU Analyze JSON. Strings are HTTP, HTTPS, or host-owned blob URLs, not filesystem paths or data URLs. The current prototype detects PDF/PNG/JPEG/BMP from content; HEIF/HEIC remains required P0 work, not implemented support.

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
| P1 | Rich nested fields, arrays and tables, multiple source regions, safe Markdown, interactive JSON tree, accessibility, touch, responsive layout, host extensibility, and MCP Apps integration design and documentation. |
| P2 | TIFF, multi-page TIFF, and all Document Intelligence (DI) compatibility, field structures, and geometry handling. |

P0 image extensions from the supplied brief are `.jpg`, `.jpeg`, `.jpe`, `.png`, `.bmp`, `.heif`, and `.heic`. Browser decoding and fallback requirements must be validated; HEIF/HEIC must not be silently deferred to P2. TIFF and DI must not delay P0 or P1.

## First Host: cu-cli

The target host workflow is:

```text
cu analyze sample.pdf --view
    -> host performs CU analysis
    -> source file + serialized Analyze JSON
    -> local browser application embedding the reusable viewer
```

This is a target workflow, not a command implemented by this repository. The viewer must also work with saved results without a new CU service call.

Planned deliverables are:

1. The reusable viewer component/library.
2. A small client-side demo that supplies a source file and saved Analyze JSON.
3. Integration guidance and a minimal cu-cli host integration, coordinated with the cu-cli repository.

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

Known limits: HEIF/HEIC is enabled only for local development validation, not distribution builds. Rich P1 panes, React 18 consumer compatibility, complete intrinsic orientation/crop coverage, accessibility/touch behavior, isolated packed-package consumers, CLI integration and release/compliance gates remain incomplete. Markdown, Paragraphs, Tables, Code and the more-views control remain disabled prototype placeholders.

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

The library build generates an ESM component entry, public TypeScript declarations, scoped CSS, and local PDF resources in `dist`. It exports `ContentUnderstandingResultViewer`, `ViewerSource`, and `ContentUnderstandingResultViewerProps`. Import the package CSS through `cu-result-viewer/styles.css` when using the built entry. The demo build is separate in `dist-demo`; rendering that build is not an isolated packed-package consumer test.

The [internal parser](src/internal/parseCuResult.ts) accepts the verified `2025-11-01` operation envelope or its inner Analyze result without caller normalization. It preserves missing/zero/false/null values and nested field identity, parses CU page/region information, and does not modify the original JSON. Structural failures throw `CuResultParseError`; invalid confidence/grounding produces explicit issues while preserving extracted values. Unverified field/content types are retained with warnings, not advertised as fully supported.

[Parser tests](src/internal/parseCuResult.test.ts) and input tests account for 49 cases. Direct parsing of the PDF/PNG results yields 100/42 field nodes and 53/13 regions without warnings; these counts do not verify UI effects.

The [geometry module](src/internal/geometry.ts) maps CU coordinates through actual rendered-page dimensions, zoom, pan and quarter-turn rotation, with inverse, fit and raster-size helpers. Shared region validation prevents parser and overlay disagreements. Core input/parser/geometry tests account for 339 cases; source, PDF/image lifecycle, interaction and display tests bring the current unit total to **409**.

The initial geometry experiment passed 512 rendered-coordinate cases. The [prototype](tests/e2e/prototype.spec.ts), [public-source input](tests/e2e/source-inputs.spec.ts) and [image-format](tests/e2e/image-formats.spec.ts) suites now pass **52 runs** across Chrome `154.0.8037.98` and Edge `155.0.4283.45`: eight prototype, ten public-input and eight image-format scenarios per browser. These include native formats, all eight synthetic JPEG EXIF orientations at DPR 1/2, and local HEIF decoding/CSP/cancellation. Development and built pages were visually checked. Development StrictMode's successfully retried sample-request cancellations are recorded separately from resource errors.

### Public Source Input Verification

The [test-only React host](tests/e2e/source-inputs.tsx) mounts the public component directly with the existing real PDF/PNG pairs. It does not change the product demo or ship in the library/demo build.

| Input | Verified browser behavior |
| --- | --- |
| File | Correct page count/dimensions, real values, raster and primary polygon. |
| Untyped Blob | Content detection without a MIME type; identical raster and grounding. |
| ArrayBuffer | Identical rendering; caller byte length/hash remain intact after unmount, and the same buffer can be remounted. |
| Same-origin HTTP URL | Correct rendering, explicit 404/network/empty-response errors, recovery, and cancellation during replacement/unmount. |
| Host-owned blob URL | Correct rendering; the URL remains readable after viewer unmount and is revoked by the test host when it releases its input. |

The input suite compares actual canvas pixel hashes across representations and independently checks polygon vertices within 1 CSS pixel. Empty/truncated binary inputs are explicit synthetic failure cases: valid fields stay visible, dependent controls are disabled, and valid replacement files recover. Delayed HTTP loads, PDF worker initialization and native-image decoding are cancelled on both replacement and unmount; browser instrumentation checks Worker termination, ImageBitmap closing and object-URL ownership without substituting the rendered output.

```powershell name="Public source input regression"
npm run test:e2e -- source-inputs.spec.ts
```

On this Windows checkout, with `npm run dev` running, the test host is at <http://127.0.0.1:5173/@fs/C:/github/cu-result-viewer/tests/e2e/source-inputs.html>. It now also has **Load HEIF**, using a licensed photograph and explicitly synthetic geometry, not a new CU result. This is not an isolated package consumer; HTTPS/cross-origin policies, full format/orientation coverage, 100-switch stress and production embedding remain separate gates.

### Image Formats and Local HEIF Validation

The [common image adapter](src/internal/imageSource.ts) recognizes content signatures rather than filenames/MIME hints. Native PNG/JPEG/BMP decoding explicitly uses EXIF-normalized image orientation, then shares rendering, view rotation and bitmap disposal. JPEG `.jpg`/`.jpeg`/`.jpe` are extension aliases, not different codecs.

- The original receipt PNG and full-size JPEG/BMP derivatives retain their canvas dimensions; the derivatives flatten transparency onto white and reuse saved grounding as an explicitly derived test, not another Analyze call.
- Eight small synthetic EXIF JPEGs verify mirrored/rotated pixels, normalized dimensions and quarter-turn overlays at DPR 1/2. Their synthetic grounding is in the normalized image frame; this is not evidence of real CU extraction on every EXIF variant.
- The licensed HEVC-in-HEIF example verifies primary-image selection, five public input representations, caller-buffer preservation, quarter-turn overlays, failure/recovery, and Worker termination on replacement/unmount.
- HEIF tests apply actual CSP to both page and worker responses: same-origin scripts/workers, no JavaScript eval, no WASM compilation permission and no Blob Worker.

```powershell name="Image format and orientation regression"
npm run test:e2e -- image-formats.spec.ts
```

**HEIF/HEIC is development-only, as approved by the owner.** [The local-resource plugin](tools/heifDevelopmentAssets.ts) reads `CU_HEIF_DEV_ASSET_DIR` from the demo's ignored local environment configuration. The directory must contain the unchanged evaluated `libheif-asm.js` 1.23.5 artifact with SHA-256 `804551ee35288509d5bde23c480e956f9d7b2a0dfc0b36a6a9a8a5b01234d276`; see [the evaluation and license gate](docs/rendering-evaluation.md#license-and-distribution-gate). This machine's existing isolated assets are configured; no codec dependency was installed or copied into the repository.

Without local configuration, the HEIF browser scenarios are explicitly skipped with that reason; native format tests still run. The recorded 52 runs used configured local assets, with no HEIF skips.

The [owned Worker](src/internal/heif.worker.ts) decodes lazily off the UI thread with a 30-second development deadline. Production/library builds reject HEIF explicitly and include no LGPL decoder binary. Vite may emit the project's small Worker glue, but it is not an enabled decoder. Missing local resources and unsupported/corrupt files report visible errors; AVIF and image sequences are not advertised as supported.

See [the HEIF running screenshot](docs/prototype/interactive-heif.png). It uses [the sample's original MIT notice](tests/fixtures/images/LICENSE.heif-example.txt). Complete corresponding-source/notices/dependency/update review, broader HEIF codec/orientation/bit-depth fixtures and packed-consumer checks before enabling any decoder distribution, including private packages.

React and React DOM are peers for the intended React 18/19 library; the current runtime uses React 19.3. PDF.js 6.3.289 is the only direct rendering dependency. Its worker/fonts/CMaps/WASM/ICC resources are packaged locally with its license. CU SDKs, Azure credentials, service clients, and the investigated LGPL decoder are not package dependencies. Main source is covered by [MIT](LICENSE); the sample documents retain their [original notice](tests/fixtures/LICENSE.txt).

The npm lockfile uses the environment's existing Microsoft public package feed without embedded credentials. A cold installation outside this environment and the final public distribution/asset layout must still be verified before release.

## Samples and Verification

Use real, paired source documents and matching sanitized CU results for normal demonstrations and integration tests. Synthetic data may supplement negative and boundary tests, but must not be presented as a real service result.

Do not commit credentials, SAS tokens, customer-sensitive documents, or unsanitized Analyze results. Document specific sample gaps before claiming coverage.

The [fixture inventory](tests/fixtures/manifest.json) records two actual GA service calls on licensed public source documents, original CLI responses, hashes, expected fields/geometry, and coverage gaps. Acquiring fixtures with cu-cli does not implement browser viewing or add CU dependencies to the future library.

The prototype commands and the limited browser scenarios above are verified. They do not establish every required P0 format, performance/embedding guarantee, or distribution obligation. No new Analyze calls are needed to run this demo.
