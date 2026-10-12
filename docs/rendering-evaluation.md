# Rendering Evaluation and Risk Evidence

> **Plan task**: [1.2: Evaluate rendering and decoding](dev-plan.md#phase-1-evidence-and-decisions)
> **Date**: 2026-10-09
> **Status**: initial design and MIT/LGPL-candidate direction approved; implementation and distribution obligations remain gated
> **Boundary**: isolated probes, not the reusable viewer, package-consumer tests, or Studio automation

## Recommendation

- Use **PDF.js behind a private source adapter plus SVG polygons**, with page-dimension-aware coordinate mapping. The current probe used `pdfjs-dist 6.3.289`; keep its types, loading task, and worker configuration out of the public viewer API.
- Use a **common native-image adapter** for PNG/JPEG/BMP. The follow-up recommends a **lazy, locally packaged pure-JavaScript libheif decoder in an explicitly owned same-origin worker**, subject to LGPL candidate approval. This tested option does not require Blob Workers, JavaScript unsafe-eval, or WASM compilation permission.
- Do **not** choose a highlighter wrapper solely for its name, or treat an MIT wrapper as proof that its embedded codecs are permissively licensed. Do not defer HEIF/HEIC to P2.

The task owner has approved this initial direction for development under G0. It is not permission to distribute the investigated codec before compliance or to publish an unverified viewer package.

## Candidate Comparison

| Candidate | Evidence | Fit / decision |
| --- | --- | --- |
| [PDF.js](https://github.com/mozilla/pdf.js), `pdfjs-dist 6.3.289`, Apache-2.0 | Executed locally with the real four-page PDF in Chrome and Edge; worker, raster rendering, coordinate transforms, errors, and destruction verified. Package requires Node `>=22.13.0 || >=24`; the probe used Node `22.16.0`. | Recommended private adapter; independent SVG overlay supports CU polygons without imposing a public annotation schema. |
| [react-pdf-highlighter](https://github.com/agentcooper/react-pdf-highlighter), `8.0.0-rc.0`, MIT | Reviewed published metadata and project documentation. React peers allow `>=18`, but this is a release candidate pinning PDF.js `4.4.168`. Advertises text/image highlights and scrolling. | Not selected. Its annotation contract and older pinned renderer add integration work; CU polygon/rotation behavior was not executed. |
| [react-pdf-highlighter-extended](https://github.com/DanielArnould/react-pdf-highlighter-extended), `8.1.0`, MIT | Reviewed metadata and documentation for viewport-independent annotations, zoom, and text/rectangular highlights. Peers are React/React DOM `^18.3.1`, not the approved React 19 baseline; PDF.js dependency is `^4.4.168`. | Not selected. Do not force peer dependencies or claim React 19 compatibility without tests. |
| [OCR-Form-Tools](https://github.com/microsoft/OCR-Form-Tools), source package `2.1.0`, MIT | Reviewed its PDF asset adapter and OpenLayers image map. The map uses image extents, vector polygons, coordinate-to-pixel conversion, and view resolution. The application uses React 16, Redux, Electron, and service dependencies. | Reference patterns only: isolate source rendering, map image extents, and keep overlay/view transforms shared. Do not inherit the application or DI parser. |
| [heic-to](https://github.com/hoppergee/heic-to), `1.6.5`, LGPL-3.0 | Executed its CSP build on a pinned public HEVC-in-HEIF sample. Its documented embedded libheif version is `1.23.5`. Both target browsers decode through this build when Blob Workers are permitted. | Feasibility proven, **not selected for shipping**: licensing, Blob Worker CSP, and missing public worker-disposal API need resolution. |
| [heic2any](https://github.com/alexcorvi/heic2any), `0.0.4`, MIT wrapper | Published metadata only; not executed. It is another libheif-based wrapper. | No license shortcut: embedded-codec terms and maintenance must be reviewed independently. |
| [Upstream libheif Emscripten release](https://github.com/catdad-experiments/libheif-emscripten/releases/tag/v1.23.5), `1.23.5`, LGPL-3.0 | Both pure JS and WASM builds executed in explicitly owned local workers; runtime identifies libheif `1.23.5` and libde265 `1.0.15`. The earlier npm `libheif-js 1.23.2` experiment is retained separately. | Pure JS is the recommended initial candidate for strict CSP compatibility. Licensing, distribution material and broader input coverage still require approval. |

## Executed Probe

Dependencies and the harness live in the persistent session investigation directory, not in the repository's runtime dependency tree. Versions are pinned in its manifest and npm lockfile: PDF.js `6.3.289`, heic-to `1.6.5`, and Playwright Core `1.63.0`.

The Node harness serves an allowlisted set of files on a temporary loopback port, launches the installed desktop browsers with fresh headless profiles, blocks external asset requests, writes a results report/screenshots, and closes its browser processes and server. It does not attach to authenticated Chrome, transfer cookies, access Azure, or call Analyze.

| Item | Actual evidence |
| --- | --- |
| Chrome | `154.0.8037.59`, installed Windows browser binary |
| Edge | `154.0.4258.53`, installed Windows browser binary |
| Input | Checked-in [PDF](../tests/fixtures/mixed-financial-docs.pdf) and [original CU result](../tests/fixtures/mixed-financial-docs.cu.json); [PNG](../tests/fixtures/receipt.png); explicitly derived JPEG/BMP decoder inputs |
| PDF geometry matrix | 2 browsers x 2 DPRs x 2 pages x 2 viewport sizes x 4 rotations x 4 zoom values x 2 pan offsets = **512 cases** |
| DPR / viewport | DPR 1/2; viewports 1280 x 900 and 960 x 720 |
| Rotation / zoom / pan | 0/90/180/270 degrees; 0.5/1/2/4; offsets (0,0) and (37,-21) |
| Maximum measured vertex error | **0.017544 CSS pixels**, below the unchanged 1 CSS pixel threshold |
| Local resources | Actual requests include the local PDF module and `pdf.worker.mjs`; zero external requests in every browser context |
| Corrupt input | Invalid PDF and invalid HEIF reject explicitly |
| Disposal | PDF loading task destroyed in every context; all nine harness-owned image URLs revoked in each image-test context |

Expected vertices use a separate analytic mapping in the Node harness; actual vertices come from the SVG's screen transform in the browser. Page 1 uses the real AmountDue source polygon, whose rendered highlight was visually checked against `$610.00`. Page 4 uses **explicitly synthetic page-boundary vertices**, not fabricated extracted fields. All four PDF page counts/dimensions are independently read from PDF.js.

Raster pages are rendered at a base scale per rotation/DPR, then resized with CSS for the geometry probe. This establishes coordinate/layout feasibility, not full-resolution zoom rerender quality, memory performance, selection UX, source-change races, or the future component's correctness.

Reproduction in this machine's retained investigation environment:

```powershell name="Local rendering investigation"
$probe = Join-Path $env:USERPROFILE '.copilot\session-state\1882dfca-1274-4d85-9ba8-3337f1bbf1e3\files\rendering-probe'
Set-Location -LiteralPath $probe
npm ci --ignore-scripts --no-audit --no-fund
npm run probe
```

This environment includes its source, lockfile, decoder-only assets, their license notice, and `results.json`. It is not a portable repository test command; task 2.1 will establish permanent test infrastructure after G0 approval. The server and helper browser processes are not left running.

## Actual PDF Dimension Risk

The real fourth page has different native and CU-reported dimensions:

| Axis | Native PDF points | CU inches x 72 |
| --- | --- | --- |
| Width | 595.275591 | 595.0008 |
| Height | 841.889764 | 841.0032 |

The naive fixed-unit conversion creates a **4.728341 CSS pixel page-height discrepancy at 4x zoom**. The initial dimension-agreement assertion failed; the probe was corrected to map the declared CU page extent into the actual PDF page extent, not to relax the test threshold.

Required implementation approach:

1. Resolve the matching content/page and verify finite positive CU dimensions.
2. Map CU coordinates relative to that page's dimensions into the renderer's native page extent; account for crop origin and intrinsic rotation explicitly.
3. Apply the renderer's viewport transform consistently to the document and overlay.
4. Keep actual later-page grounding, nonzero crop boxes, intrinsic orientation, and visual reference coverage as separate tests. Normalizing page bounds is not proof of every OCR polygon's optical accuracy.

PDF.js `6.3.289` also requires using the verified loading-task destruction API: `PDFDocumentLoadingTask.destroy()`. Do not assume the older document-proxy disposal method exists; pin versions and type-check the eventual adapter.

## Image and HEIF Evidence

| Input | Chrome / Edge native decode | Tested fallback |
| --- | --- | --- |
| PNG | Both pass, 1743 x 878 | Not needed |
| JPG/JPEG/JPE | Both pass, 1743 x 878 | Not needed |
| BMP | Both pass, 1743 x 878 | Not needed |
| HEIC/HEIF | Both reject with an image decode error | heic-to CSP build produces 1280 x 854 PNG output in both browsers when Blob Workers are allowed |

JPEG extension variants share the same JPEG bytes derived from the licensed PNG. BMP is another explicitly derived format. HEIC/HEIF extension variants share **one HEVC-in-HEIF file**, not independent codec-family coverage. These are decoder probes, not new paired CU results or evidence that all variants are supported.

The HEIF asset is [libheif's MIT-licensed example](https://github.com/strukturag/libheif/blob/178b11afc84a43da8b57e17b40ce77dedb5bb414/examples/example.heic), at commit `178b11afc84a43da8b57e17b40ce77dedb5bb414`; the [example license](https://github.com/strukturag/libheif/blob/178b11afc84a43da8b57e17b40ce77dedb5bb414/examples/COPYING) is retained. Input size is 718114 bytes; SHA-256 is `7f8b363e4936c0666a25f64f3a92fda10bd8e5453be4592530b65a55dd98f3f2`. Decoded dimensions match an independently read `ispe` dimension entry. Thumbnails/multiple primary images and orientation rules remain untested.

Actual uncompressed asset sizes from the installed probe:

| Asset | Bytes |
| --- | --- |
| PDF module | 860384 |
| PDF worker | 2228489 |
| heic-to CSP module | 3189200 |
| Example converted PNG | 2302195 |

The observed conversion took approximately 1.3-2.1 seconds, including different cold/warm conditions; this is not an approved latency budget. Codec loading should remain lazy. Peak memory, limits, cancellation, and additional real HEIF variants still need measurements.

### CSP, Ownership, and License Blockers

- The heic-to CSP build avoids the ordinary unsafe-eval issue, but **still creates a hidden Blob Worker**.
- A strict `worker-src 'self'` test blocks that worker in both browsers. Allowing `worker-src 'self' blob:` in the isolated test permits conversion; no production host CSP was changed or approved.
- Its public exports expose conversion/signature checking, not worker termination or worker-object-URL disposal. Harness-owned URL balance does **not** prove the decoder's hidden worker cleanup. Do not select it directly for a replaceable/unmountable viewer lifecycle.
- LGPL-3.0 is verified in the installed package's license, not inferred from the example image license. Obtain an appropriate distribution/license decision, notices/source obligations review, and a compatible decoder-ownership design before shipping.
- A next investigation may evaluate a lower-level decoder in an explicitly owned, locally packaged worker. Do not weaken host policy, silently leak resources, or assume a permissively licensed wrapper resolves codec licensing.

### Owned-Worker Follow-up

That follow-up has now been executed. It replaces the opaque high-level converter with an unchanged upstream decoder build loaded by a worker whose creation, abort, deadline, source replacement, and termination are controlled by the private adapter prototype.

The prototype uses one **same-origin classic worker per request**, loads codec assets lazily, transfers a copy rather than detaching caller-owned `ArrayBuffer` input, selects the declared primary image, and rejects missing/multiple-primary or corrupt input explicitly. Its harness-only root-relative routes and timeout are not final public API or packaging decisions.

| Matrix | Result |
| --- | --- |
| Chrome `154.0.8037.59`, WASM / pure JS | Both pass all 12 scenario definitions |
| Edge `154.0.4258.53`, WASM / pure JS | Both pass all 12 scenario definitions |
| Worker ownership | 109 created / 109 terminated / 0 active in each variant/browser; **436 total** |
| Repeated cancellation | 100 create/cancel/dispose cycles in each variant/browser; **400 total cycles** |
| Caller source ownership | Input bytes remain attached and unchanged across decode/cancellation/replacement |
| Output | 1280 x 854 primary image; 2 decoded images, primary index 0; all four variant/browser outputs have identical PNG SHA-256 |
| Image URLs | 2 created / 2 revoked per variant/browser |
| External requests | Zero; codec script/WASM and worker are served locally |
| Observed decoder heap capacity | 17039360 bytes at decode; not peak process/browser memory |

The 12 scenarios are successful primary-image decoding, empty input, invalid probe deadline, corrupt HEIF, pre-aborted input without worker creation, abort after decoder initialization, timeout, missing worker, denied WASM policy, latest-request-wins replacement, dispose during a load, and 100 cancellation cycles. Replacement uses distinct request generations of the same public sample; it does not claim broad cross-file or React-lifecycle coverage.

**CSP is tested in ordinary page/worker scripts, not inferred from debugger-injected eval.**

- Both builds work with `worker-src 'self'`, without `worker-src blob:`.
- The pure JS build decodes with `script-src 'self'`, without either `unsafe-eval` or `wasm-unsafe-eval`.
- The WASM build additionally needs `wasm-unsafe-eval`. The negative test removes that permission and verifies an actual WebAssembly/CSP compilation error.
- JavaScript string evaluation remains blocked in every variant. The image preview still uses owned Blob URLs under `img-src 'self' blob:`; image permission is not Blob Worker permission.

Recorded sizes and one-sample timing from the retained `heif-worker-results-timing-snapshot.json` run (`2026-10-09T04:18:43Z`), not performance commitments:

| Build | Local codec bytes | Chrome observed decode/display | Edge observed decode/display |
| --- | --- | --- | --- |
| Pure JS | 3369222 | about 707 ms | about 692 ms |
| WASM | 162713 JS + 1463506 WASM | about 530 ms | about 355 ms |

Recommend the pure JS candidate initially for simpler host CSP requirements, keeping decoding off the UI thread. Do not load both builds by default or expose unnecessary codec configuration. Review real workloads and approve budgets before G2.

Re-run the retained experiment with `npm run probe:heif` from the investigation directory above. `heif-worker-results.json` contains the four final runs; the earlier `libheif-js 1.23.2` result is retained as `heif-worker-results-1.23.2.json`. Current package-registry lookup did not provide npm version `1.23.5`, so the final runs use pinned, unchanged [official release assets](https://github.com/catdad-experiments/libheif-emscripten/releases/tag/v1.23.5), not an invented npm package.

| Asset | SHA-256 |
| --- | --- |
| Pure JS | `804551ee35288509d5bde23c480e956f9d7b2a0dfc0b36a6a9a8a5b01234d276` |
| WASM loader JS | `55983f07e1799a95c4945a3d2bfb5d22d3fff7d40cbd218ee91104593e329df0` |
| WASM binary | `184d3d20f8323877f13e9f5254f9c6a0ce272c9a3a2f823b0b2bcd2ee9f73f80` |
| Release license | `fa81ce652315b013359d6e8e4744335f31a50c7c192907176d3632f78a3b4596` |

### License and Distribution Gate

Worker separation improves resource ownership; it is **not** a legal exemption or evidence that the decoder is MIT-licensed. The inspected artifacts and their libde265 dependency are LGPL-3.0. Private publication can still be distribution; do not assume the obligations apply only to public npm releases.

Before distributing any selected build:

- [x] Obtain task-owner approval for the LGPL candidate direction; final distribution approval remains separate.
- [ ] Preserve prominent third-party notices and unmodified applicable LGPL/GPL license texts.
- [ ] Identify the complete compiled dependency inventory, versions, notices and corresponding sources; decoding usage alone is not proof that an encoder or other codec is absent.
- [ ] Provide the required corresponding library/build sources and an applicable way to recombine/relink with a modified compatible library, without prohibiting the permitted modifications/reverse engineering.
- [ ] Review asset bundling, source availability and installation-information requirements for the actual combined deliverable; merely linking an upstream homepage or serving a separate worker does not automatically satisfy them.
- [ ] Pin artifact hashes, review update/security support for libheif and the embedded libde265 version, and reproduce/test the approved build before G2 release.

Traceable source references for the tested upstream artifact are the [release/build revision](https://github.com/catdad-experiments/libheif-emscripten/tree/5c8968a44e9c68ae677e24790d77d001ed7fe7cc), its [libheif source revision](https://github.com/strukturag/libheif/tree/413e2a87e6a70b3eccc3a3adc5801179dd2d9e00), and [libde265 `1.0.15`](https://github.com/strukturag/libde265/tree/v1.0.15). The inspected build workflow uses Emscripten `3.1.61` and `USE_UNSAFE_EVAL=0`; no local reproducible-build or complete SBOM audit is claimed.

This is an engineering release checklist grounded in [LGPLv3 sections 3-5](https://www.gnu.org/licenses/lgpl-3.0.html), not a legal opinion. Candidate approval permits development direction; it does not certify that all distribution obligations have already been met. If project policy forbids LGPL, select a separately acceptable licensed decoder while retaining HEIF/HEIC in P0.

The task owner has now confirmed an eventual **Microsoft open-source project** and approved the initial design. LGPL is an open-source license, but the owner's preference does not decide whether copyleft dependencies may be bundled. Recommend MIT for the main component, with separately identified third-party licenses if approved; do not rewrite the codec's LGPL license or add an unverified Microsoft copyright/release claim.

The owner then explicitly selected **MIT main component plus permitted LGPL candidates, with compliance before any distribution**. The main package now carries MIT terms and remains private. Decoder source/licensing and release obligations above are still required; no LGPL artifact has been incorporated into the main package at task 2.1.

[Microsoft's public open-source statement](https://www.microsoft.com/en-us/legal/intellectualproperty/open-source) and [Microsoft Learn's licensing guidance](https://learn.microsoft.com/en-us/training/modules/implement-open-source-software-azure/) are background, not this project's internal third-party approval. Obtain an explicit candidate policy and retain the corresponding-source/notices/release review gate for any distribution, including private packages.

## Risk Closure Status

The task 2.3 implementation has now replaced the experimental coordinate mapping in the retained browser host. Its compiled [geometry module](../src/internal/geometry.ts) is served as `/core/geometry.js`; `core-geometry-results.json` records 512 actual DOM-coordinate checks with the same 0.017544 CSS pixel maximum error. The real AmountDue source region has been visually checked on the rendered PDF. This is an execution check of the implemented math, not a claim that task 2.4's source adapter or the React viewer is delivered.

| Risk | Current status | Remaining gate |
| --- | --- | --- |
| Studio login blocks the agent | Mitigated by task-owner Chrome operation; owner reports single-page controls passed, with a field tooltip screenshot. | Single-page manual evidence is not cross-page/image/keyboard or automated evidence. |
| Saved input/geometry is speculative | Real GA fixtures and independent PDF dimensions now recorded. | Parser/negative/type/multiple-content tests in the implementation. |
| Fixed inch-to-point mapping drifts | Regression found; page-aware mapping passes the unchanged coordinate threshold in the probe. | Wire the same contract into the real adapter and test real later-page grounding/crops/orientation. |
| Required image formats might not decode | Native PNG/JPEG/BMP and conditional HEIF feasibility verified. | Additional real paired variants, orientation, and chosen fallback coverage before G2. |
| Required CDN/remote PDF worker | Probe loads a local real worker with no external asset calls. | Packed-consumer tests and fonts/CMaps/ICC/WASM-specific fixtures; routing a directory is not proof of each asset. |
| HEIF host CSP / worker lifecycle | Pure JS owned-worker probe passes under strict same-origin/no-eval/no-WASM-compilation CSP, including cancel/timeout/replace/dispose. | Wire it into the actual library with relative packaged assets and test real formats/orientation/lifecycles. |
| HEIF license / distribution / updates | **Candidate approval and release obligations remain open**; technical worker tests do not grant a license exception. | D3 candidate policy decision; notices, corresponding sources, dependency/update review and packaging before G2. |
| React compatibility and host integration | Wrapper peer incompatibility identified; direct adapter recommended. | Real React 18/19 consumer tests, G0 approval, and external CLI handoff. |

G0 is approved for initial development; task 2.1's tooling/types are verified. This investigation and approval do not certify viewer rendering, complete third-party distribution compliance, or authorize a Microsoft release.

## Task 2.5 Local Integration: 2026-10-10

The owner explicitly approved actual-component **local HEIF validation**, not decoder distribution. The [common image adapter](../src/internal/imageSource.ts) now uses signature-based native PNG/JPEG/BMP decoding with EXIF-normalized orientation. The [image browser suite](../tests/e2e/image-formats.spec.ts) covers full-size receipt derivatives, eight clearly synthetic EXIF JPEG orientations at DPR 1/2, and their corner pixels/dimensions/quarter-turn overlays. Derived and synthetic results are not presented as additional service responses.

The [HEIF client](../src/internal/heifSource.ts) creates one owned same-origin classic Worker, transfers only copied bytes, selects the declared primary image, validates its RGBA response and terminates on success/error/abort/deadline. The 30-second deadline is an explicit local-development guard, not a measured performance budget. Actual-component tests cover the licensed example's input representations, regions, caller data, corrupt/missing-resource recovery, replacement and unmount.

Both page and Worker response CSPs are exercised without JavaScript eval, WASM compilation permission or Blob Workers. Local pixels are transferred as RGBA, then turned into an owned ImageBitmap; this implementation does not require an intermediate image URL. [The server-only plugin](../tools/heifDevelopmentAssets.ts) reads a locally configured isolated directory and checks the unchanged 1.23.5 pure-JS SHA-256 above. It serves no arbitrary paths and copies no codec into either build.

Production/library builds explicitly reject HEIF pending review. Vite emits only the project's small Worker glue; no libheif decoder binary is included. [The local running screenshot](prototype/interactive-heif.png) retains the example's [original MIT notice](../tests/fixtures/images/LICENSE.heif-example.txt) and visibly labels its test grounding as synthetic.

Current total validation is **409 unit cases and 52 Chrome/Edge runs**, of which 16 runs belong to image formats/orientation/local HEIF. Native JPEG/BMP also render in the production demo, and production HEIF's explicit refusal was checked without hiding valid fields. This advances the actual integration beyond the earlier isolated probe, but does not complete broader HEIF codecs/bit-depth/intrinsic orientation, real CU per-format pairs, packed consumers, corresponding sources/notices/update review or any release approval.
