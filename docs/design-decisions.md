# Design Decisions and Phase 1 Evidence

> **Plan task**: [1.1: Verify input, samples and Studio behavior](dev-plan.md#phase-1-evidence-and-decisions)
> **Status**: v2 static design approved; runnable PDF/PNG prototype and first browser checks delivered; interactive user review and P0 coverage remain open
> **Last updated**: 2026-10-13
> **Gate**: G0 and static wireframe direction approved. Tasks 2.1-2.3 are delivered; the React prototype is runnable, not a complete P0 or approved release.

## Approved Initial Baseline

The task owner approved the following baseline on 2026-10-09. This approval does not claim browser compatibility or approve the entire design.

| Decision | Initial baseline | Remaining gate |
| --- | --- | --- |
| D1: API target | Start with CU `2025-11-01` GA. Current cu-cli output is now captured from actual service calls. | Review the fixtures and parser contract; do not advertise preview or older-version compatibility without evidence. |
| D2: Runtime | React 18/19; current stable Chrome and Edge on Windows. | Record exact tested versions during rendering evaluation and consumer tests. |
| D2: Source strings | Strings mean HTTP, HTTPS, or host-owned blob URLs, not local filesystem paths or inline data URLs. | Define URL loading, ownership, CORS, and explicit error behavior during implementation. |
| D2: Binary inputs | Preserve `File`, `Blob`, and `ArrayBuffer` inputs; identify formats from content rather than trusting an extension alone. | Evaluate all required image formats, including HEIF/HEIC. |
| D3: Rendering | Use PDF.js/SVG, native common-image rendering and a pinned pure-Rust `heic-rs 0.1.4` WASM Worker. The earlier LGPL candidate is evaluation-only and absent from distribution. | Complete broader real image/transform/bit-depth coverage and source/decoder budgets. |
| D4: Distribution | Main source is [MIT](../LICENSE); the packaged HEIF path is MIT OR Apache-2.0 with hashes, licenses, SBOM and reproducible wrapper inputs. Package remains private; no Microsoft publication/copyright-ownership approval is claimed. | Confirm ownership, HEVC patent/product and publication approval before public distribution. |
| D5: Host | The current official CLI implementation is [Azure/content-understanding-toolkit](https://github.com/Azure/content-understanding-toolkit/tree/main/cu-cli), not the earlier prototype link. | Coordinate host ownership and the future browser-viewing contract before task 5.2. |
| D6: Result-pane customization | Field callbacks, custom field rendering, viewer events, toolbar/layout customization and initial page/zoom/fit are explicitly P1. The original `Result-pane` item is truncated. | Implement the named extension points; clarify only the missing `Result-pane` tail instead of inventing it. |
| D7: Interaction target | Source P1 includes accessibility, keyboard, touch, responsive layout and automatic scrolling/centering. Current delivery defers touch and uses Chrome/Edge keyboard/focus/ARIA, Windows Narrator, desktop two-pane minimum-width/scroll behavior, and source centering only when needed. | Retain touch as deferred P1; do not infer mobile, pinch, pane stacking or other touch behavior. |
| D9: Acceptance evidence | Equivalent derived encodings satisfy per-format rendering evidence; source performance uses safety limits/lifecycle rather than hard latency/memory gates; representative PDF coverage with explicit errors is sufficient; remote CI success is required but unavailable branch protection is nonblocking. | HEVC product/patent/publication approval remains required only for public distribution. |
| D8: Dynamic Studio result views | Use the ordered known tabs Fields, Markdown, Paragraphs, Tables, Figures, Signatures, Metadata, Result and Code. Read API version from original JSON and show only applicable non-empty views. | Paragraphs/Tables/Figures/Signatures are source-linked; Metadata is key/value; Result is original JSON; Code is read-only Python/C#/JavaScript SDK samples. Unknown properties stay in Result. |

The owner explicitly authorized using cu-cli to call the real service for sample acquisition. Two small, public, MIT-licensed source documents were submitted to an already configured resource. No customer files, new resources, custom analyzers, or model/default configuration changes were involved.

The owner approved the current initial design on 2026-10-09, then clarified the Microsoft open-source goal and preference for open-source dependencies. That preference does not establish a permissive-only rule, blanket LGPL approval, or an organizational release sign-off. Resolve this policy explicitly rather than relabeling a third-party codec under the main project's license.

The subsequent explicit choice was **MIT for the main component plus allowed LGPL candidates with compliance before distribution**. That historical approval enabled investigation but did not require shipping the candidate. RC-3 selected permissive `heic-rs` instead; no LGPL decoder is distributed. The current copyright notice refers to project contributors rather than asserting unverified Microsoft ownership, and permissive software licensing does not replace HEVC patent/product or publication review.

On 2026-10-13 the owner supplied the authoritative requirement text, correcting earlier scope reductions. Touch, responsive layout, automatic scrolling/centering, the named host extension points, and MCP Apps/MCP UI integration design are explicit P1 requirements. The owner then approved a desktop-only current delivery, deferring touch while retaining desktop two-pane resizing and conditional source centering. The owner also confirmed the complete dynamic Studio result-view mapping, Windows Narrator acceptance, Vite 8 and the acceptance policies in D9. The core remains rendering-only; MCP runtime and Analyze calls stay outside it.

## Task 2.1 Foundation

- Added a private npm package and stable compatible tooling: TypeScript `6.0.3`, Vite `8.3.2`, Vitest `5.0.3`, ESLint `10.11.0`, and typescript-eslint `8.71.0`. TypeScript 7 and the latest alpha lint package were deliberately not selected because the verified lint peer range stops before TypeScript 6.1.
- [Public input types](../src/index.ts) retain `File | Blob | ArrayBuffer | string` and `result: unknown`. No public normalized CU schema, SDK model, source loader, or viewer component is introduced.
- Lockfile installation, type-check, lint, four [input tests](../src/index.test.ts), and ESM/declaration build pass. A standalone consumer of the built declarations accepts the supported sources and confirms three deliberately invalid type uses are rejected.
- Editor test discovery found no tests; the actual unit run used the configured Vitest CLI. Do not count empty editor discovery as a successful test run.
- No CU/Azure runtime dependencies or LGPL binary assets are installed into the main library. Investigation resources remain outside its package.

## Task 2.2 Parsing and Run-First Checkpoint

Task 2.2 now provides a private [parser](../src/internal/parseCuResult.ts) and [model](../src/internal/types.ts). It supports the verified GA envelope and inner result, retains original JSON identity, and derives nested fields, pages, confidence and all valid CU `D(...)` regions. Neither internal module is exported from the public entry.

Real-fixture runs yield 100 PDF and 42 PNG field nodes, including 12/11 absent values and 53/13 source regions, with zero parser issues. The [45 parser tests](../src/internal/parseCuResult.test.ts) also cover scalar boundaries, stable/escaped identities, multiple contents, rectangles, malformed input, immutable/deep relationships and cycles. Together with the four input-contract cases, 49 tests pass.

Structural errors use `CuResultParseError` with a code/path. Task4.2a now derives typed detail objects with stable original-index identities and shared source-region validation; unknown properties remain in original Result. Native grid spans are validated instead of guessed, and source cropping uses the existing loaded adapter without reinitializing the viewport. Dedicated detail panes and SDK sample copy/highlighting are implemented; synthetic Preview fixtures still do not establish full real-service compatibility.

The owner requested a **run-first visual checkpoint**: when a source pane or viewer harness first becomes runnable, start it, load real saved pairs, and inspect browser effects before adding more features. Parser output is not accepted as a substitute for this UI check.

## Task 2.3 Geometry and Browser Effects

Task 2.3 now provides private [geometry helpers](../src/internal/geometry.ts) and [tests](../src/internal/geometry.test.ts). They normalize CU extents against actual CU-aligned renderer CSS dimensions rather than assuming a fixed inch-to-point conversion. They support clockwise quarter turns, zoom/pan, inverse mapping, fit sizing and raster pixel ratios; the service's text angle is not automatically treated as viewer rotation.

Region validation was shared with the parser without changing its warning contract. The full suite passes 339 cases: 290 geometry and 49 existing cases. Geometry includes 256 real-fixture transform/DPR/resize combinations, hand-computed point expectations, the real page-4 discrepancy, inverses, invalid input and immutable source polygons.

The compiled repository module was then served to the existing experiment host under `/core/geometry.js`, replacing the old experimental coordinate calculation. Chrome/Edge each pass 256 DOM-coordinate scenarios, with maximum 0.017544 CSS pixel error. A full-page screenshot shows the real AmountDue polygon aligned over `$610.00`. The helper browsers/server are closed after this check; this does not create a reusable source pane, field interaction UI or packaged demo.

## Verified CLI and Service Boundary

- Installed official `cu-cli` and `cu-cli-core` version `0.1.0b3`, a preview CLI release, in an isolated tool environment outside this repository.
- Used the environment's existing Microsoft package feed. Both installed wheel hashes matched the official PyPI release digests; `cu --version`, `cu --help`, and `pip check` passed.
- With approval, registered a dedicated user-level `cu` launcher without exposing the tool environment's Python/pip executables on PATH.
- `cu doctor` passed against the existing Microsoft Entra-authenticated resource and confirmed API version `2025-11-01`. No credentials or resource endpoint are stored in the fixtures or this document.
- Used `cu analyze` with an explicit prebuilt analyzer, `--api-version 2025-11-01`, `--json`, and `--output-file`. The saved payload is retained unchanged.
- The installed `cu analyze --help` does not offer `--view`. The target browser integration is still planned; CLI installation and successful analysis are not viewer-host integration.

The CLI and its Azure dependencies are external fixture-acquisition tools. They are not dependencies of the future rendering-only viewer package. Reusing saved fixtures requires neither credentials nor another service call.

## Verified CU Input Shape

Both captured files have the operation-envelope keys `id`, `status`, `result`, and `usage`, with `status` equal to `Succeeded`.

| Path / property | Observed meaning | Implementation consequence |
| --- | --- | --- |
| `result.apiVersion`, `result.analyzerId` | GA version and selected prebuilt analyzer. | Do not confuse the envelope with the inner analyzer result or silently guess an API version. |
| `result.contents` | One `document` content item in each current fixture. | Multiple-content handling still needs additional coverage; retain content identity and page ranges. |
| `contents[i].unit` | `inch` for the PDF; `pixel` for the PNG. | Units belong to the content item, not an assumed page-level or DI property. |
| `contents[i].pages` | One-based `pageNumber`, dimensions, and text `angle`. | Convert page indexing explicitly; match geometry to the correct page/dimensions. |
| `contents[i].fields` | Analyzer-independent typed values with optional source/confidence. | Do not require a schema-specific host adapter. |
| `type` and typed value keys | Observed `string`, `number`, `date`, `time`, `object`, and `array`; nesting uses `valueObject` and `valueArray`. | Preserve typed values and nested identity; boolean/integer/null and other edge coverage remains to be added. |
| Field `source` | Single `D(pageNumber,x1,y1,x2,y2,x3,y3,x4,y4)` regions or semicolon-separated `D(...);D(...)` strings. | Parse CU encoding, not DI `boundingRegions`; preserve absent grounding and every encoded region. |
| Field `confidence` | Real scores, including low values such as `0.341` and `0.378`. | Display the supplied score; do not replace it, hide values below an invented threshold, or equate it with correctness. |
| `usage` and other original data | Present in the unchanged envelope. | Preserve the original result for P1 JSON inspection; do not require callers to strip unrelated keys. |

The [official document-element reference](https://learn.microsoft.com/azure/ai-services/content-understanding/document/elements) also documents the axis-aligned form `D(pageNumber,left,top,width,height)`. It is a documented requirement, not a verified field case in these fixtures. The same reference specifies one-based pages, PDF/image units, and that `angle` describes text orientation. Do not automatically apply that text angle as PDF intrinsic rotation or image EXIF orientation.

The [confidence and grounding reference](https://learn.microsoft.com/azure/ai-services/content-understanding/document/analyzer-improvement) describes optional field confidence/source estimation. A field without either value must remain inspectable. No SDK model instances or host-side normalization are needed to read the saved JSON.

The earlier official saved-result candidates were not accepted as GA fixtures: the training-image result uses `2024-12-01-preview` and lacks extracted fields; the policy PDF uses `2025-05-01-preview` and has only an ungrounded summary. The local planning repository's `*.expected.json` files are synthetic ground truth, not CU responses.

## Paired Fixture Inventory

The authoritative inventory is [manifest.json](../tests/fixtures/manifest.json). Source documents are pinned to official sample-repository commit `fbc18880179397729abfa9506bda865d009dc711`; the original [MIT notice](../tests/fixtures/LICENSE.txt) is retained.

| Pair | Source / result | Verified output |
| --- | --- | --- |
| GA PDF invoice analysis | [PDF](../tests/fixtures/mixed-financial-docs.pdf) / [raw CU JSON](../tests/fixtures/mixed-financial-docs.cu.json) | 4 reported pages; 31 top-level fields; 100 recursive field nodes, 47 with source; inch coordinates. |
| GA image receipt analysis | [PNG](../tests/fixtures/receipt.png) / [raw CU JSON](../tests/fixtures/receipt.cu.json) | 1743 x 878 source pixels independently decoded with Windows image APIs, matching the result; 12 top-level fields; 42 recursive nodes, 12 with source. |

The PDF has 53 source regions across its 47 grounded fields, including six multi-region fields; the image has 13 regions across 12 grounded fields, including one multi-region field. BillingAddress and MerchantAddress provide actual semicolon-separated source cases. Confidence is absent on 43 PDF and 23 image field nodes. These counts include nested/container fields, not just top-level rows.

The results are actual service output from public example documents, not fabricated successful Analyze responses. The files preserve the CLI payload, including its original envelope and usage. Credential/SAS/endpoint screening and fixture-integrity checks are local validation, not viewer unit/browser tests.

Recorded reference fields include:

- PDF `/result/contents/0/fields/AmountDue/valueObject/Amount`: `valueNumber` is `610`, confidence `0.341`, and its polygon is on page 1 in inches.
- PNG `/result/contents/0/fields/MerchantName`: `valueString` is `Contoso`, confidence `0.378`, and its pixel polygon surrounds the printed merchant heading in a source-image spot check.

All currently grounded PDF fields refer to page 1. A later browser test can start on page 4 and select a page-1 field to verify cross-page navigation, but these fixtures do not prove field grounding on pages 2-4. The later [PDF.js investigation](rendering-evaluation.md) independently loaded the four pages, rendered a real field polygon, and found a native/CU dimension discrepancy on page 4. Its page-aware mapping passes the coordinate probe; full viewer and later-page grounding validation still remain.

Mixed financial documents analyzed with one invoice schema are a rendering/JSON fixture, not an accuracy benchmark. The viewer must show the service values and confidence without correcting or reinterpreting the extraction.

## Studio Evidence and Limits

| Evidence | Confirmed observation | Not verified |
| --- | --- | --- |
| Live [Studio landing page](https://contentunderstanding.ai.azure.com/) and CU home | Landing separates Document Intelligence and Content Understanding; entering CU requires sign-in for the actual tools. | Authenticated results, field behavior, and resource-bound settings. |
| Shared sign-in attempt on 2026-10-09 | Microsoft Entra denied access with `AADSTS53000` (`DeviceNotCompliant`); the request had no device identifier and reported an unregistered device state. The browser identifies itself as Code-Insiders/Electron. | Access to authenticated results; the exact tenant policy and underlying device-authentication integration require administrator review. |
| Task-owner Chrome screenshot on 2026-10-09 | The signed-in Studio home is accessible in desktop Chrome and shows prebuilt entries including Invoice and Document fields. Owner-operated Chrome walkthrough is the chosen verification path. | Results-page interactions; the screenshot does not make the Chrome tab directly controllable by the agent. |
| Task-owner Invoice screenshots on 2026-10-09 | Resource selection/review dialogs and an unobstructed result page are visible. The result page has a sample/upload rail, colored source regions, Fields/Markdown/Paragraphs/Tables/Code tabs, field confidence and page badges, a 1-of-1 page counter, and enabled Auto run/Hide missing fields switches. The version selector displays `2026-06-01 (Preview)`. | Hover/selection persistence, transformations, cross-page navigation, missing-field behavior, the sample's actual API version, and whether a new Analyze call occurred. |
| Task-owner control check on 2026-10-09 | Owner reports the visible single-page button functions were tested without issues. A new screenshot shows Auto run off and a BillingAddress source tooltip with field name, value and confidence alongside the matching field row. | Exact hover versus click-persistence rules, quantified alignment, cross-page/image behavior, and automated component coverage. |
| [Official prebuilt-analyzer screenshot](https://learn.microsoft.com/en-us/azure/ai-services/content-understanding/media/quickstarts/cu-studio-tryout.png) | Modality/category/subcategory selection, upload/sample rail, analysis/options/version controls, Auto run, colored document regions, and bottom page/view controls are visible. | What triggers each highlight, persistent selection, cross-page behavior, transformations, or exact control semantics. |
| [Official Studio quickstart](https://learn.microsoft.com/azure/ai-services/content-understanding/quickstart/content-understanding-studio) | Describes choosing a prebuilt analyzer, trying supplied samples, and reviewing result output; own-data use requires configured resources/model deployments. | A current interactive UX walkthrough; documentation is not a browser test. |

The sign-in problem is now a confirmed Conditional Access/device-compliance block, not just unavailable Chrome cookies. The [official error reference](https://learn.microsoft.com/entra/identity/conditional-access/troubleshoot-conditional-access#microsoft-entra-sign-in-events) maps error 53000 to `DeviceNotCompliant`; [supported-browser guidance](https://learn.microsoft.com/entra/identity/conditional-access/concept-conditional-access-conditions#client-apps) explains browser device authentication.

The failed request does not establish that the physical computer is unmanaged: the integrated browser did not present a recognizable device identity for this sign-in. Use an organization-supported desktop Chrome/Edge workflow or administrator-approved client support for Studio verification. Do not spoof browser/device identity, copy authentication cookies/tokens, or weaken organization policy. Private account names, IP addresses, and request/correlation identifiers are not copied into this repository.

The owner has now supplied signed-in home and Invoice result-page screenshots from desktop Chrome and reports that the single-page controls pass manual checking. This mitigates the access barrier and supplies a basic manual UX reference, but does not fix the integrated browser or prove unreported interaction semantics. The field tooltip screenshot confirms the visible name/value/confidence link, not exact selection persistence or transformation accuracy. Cross-page and image walkthroughs, missing-grounding details, and automated viewer tests remain separate gaps.

The current Studio version selector is set to preview, while the checked-in fixtures use GA `2025-11-01`. Do not infer the sample payload's version from the selector alone or treat its displayed extraction values as the same result as the saved fixtures. For the initial walkthrough, disable Auto run and inspect the existing sample without changing versions or rerunning analysis. Verify field hover, click, pointer exit, and view transformations separately; the single-page sample cannot establish cross-page behavior.

## Open Gates and Next Work

Earlier checkpoints below predate the current Studio interaction follow-up. Current local acceptance is494 unit,164 ordinary repository browser cases including600 stress rounds,4 performance and32 strict-CSP screenshot-enabled React18/19 consumers. The owner approved58 final references on2026-10-14;12 Fields/Markdown/Result crops remain unchanged, all58 hashes survive ordinary regression and both browser drift probes detect14px dots. Dynamic views and desktop automation are implemented; actual Narrator acceptance still keeps task4.3a open.

The owner approved v2 static review and subsequently agreed to use the current interactive baseline for task 2.4 hardening on 2026-10-10. The [React component](../src/ContentUnderstandingResultViewer.tsx) and [demo host](../demo/App.tsx) render real source/results and preserve the source-plus-original-JSON boundary. The [static gallery](prototype/index.html) remains design-only; the live prototype is at <http://127.0.0.1:5173/> while `npm run dev` is running.

The first live run exposed a real Vite directory-URL rewrite issue: the trailing slash was removed, yielding an invalid PDF worker path. The adapter now constructs runtime directory URLs with explicit relative assets, and development plus production-host checks load the local worker. No fictional `isEvalSupported` option is passed to the current PDF.js declarations; loading uses validated options and explicit errors. Original PDF.js font-interpreter warnings remain nonfatal for the sample, not an assertion that console output is empty.

The source adapter copies caller buffers, cancels obsolete loads/renders, draws offscreen before committing, and releases PDF tasks or image bitmaps. URL fetches explicitly retain same-origin credentials only. The private interaction reducer separates preview from persistent selection and gives manual navigation precedence. Current 429 unit cases, 104 repository browser runs and 24 isolated consumer runs pass: 128 local browser runs. Normal cancelled/retried requests remain distinct from errors.

The [test-only public-input host](../tests/e2e/source-inputs.tsx) mounts the exported component without shipping test instrumentation. The [input suite](../tests/e2e/source-inputs.spec.ts) contributes 22 of the current 128 local runs. Earlier checkpoints were 36/52/70 after input/image/visual work, 76 after stress and 92 after package consumers; scoped task 4.1 added four repository runs, task 4.2 six, RC-1 performance four, RC-3 four repository plus eight consumer runs, and RC-4 ten repository runs. A controlled second HTTP loopback origin proves positive/negative CORS, anonymous cross-origin fetches and viewer-origin PDF/HEIF resources. Approved policy supports HTTP/HTTPS same-origin and anonymous CORS; credentialed cross-origin is out of scope.

The owner's Fields screenshot now guides the runnable [Fields presentation](prototype/interactive-fields.png): 12 px solid/outlined dots, name-adjacent 20 px page badges, right-hand SVG chevrons, 56 px collapsed groups and 80 px single-line scalar rows, separated by 1 px rules. Groups start collapsed; missing-value filtering starts enabled but preserves zero/false/null/empty values. Fields and source previews share two-decimal confidence formatting and omit absent confidence. The extra Clear control was removed following owner feedback. Primary grounding uses the field's own region or a real grounded descendant, without writing regions into the parent; colors remain tied to original root order and are shared by descendants and source overlays. Paragraphs/Tables/Code are currently disabled implementation placeholders but are now confirmed follow-up functionality; completed views will hide when inapplicable instead of remaining disabled. Reference styling does not replace saved extraction values or confidence.

Source page availability now uses actual loaded-source metadata consistently for badges and navigation. A result referencing an absent page produces an `unavailable-source-page` warning with its metadata path; affected badges are disabled with an explanation. Hovering/pinning an affected scalar or group preserves its value and the current source page, displays an explicit source-region error, and draws no invented overlay. Browser recovery is verified by supplying a matching result. This is a clearly synthetic mismatch case, not a failed real CU sample or proof of full source/result identity checking.

Field preview was initially placed below the source in the earlier baseline. Owner Studio screenshots now confirm tab-scoped source layers, right-side field/paragraph source previews and left-table icon Rows/Columns hover/read-only Table modal clicks. Native modal focus, X/Esc, original shared grids and input-change cleanup pass. No generic left-polygon hit action is inferred. The final sharp-frame/table-inspection58-image version is owner-approved;38 affected originals update,8 images are added and12 crops stay unchanged. The first antialiased version failed an exact stress edge comparison; the corrected actual-CSS-frame/sharp-stroke version passes all164 ordinary cases with no threshold relaxation or masks. Loaded-source badges stay clickable during hover redraw so a click cannot be lost. Actual Narrator acceptance remains pending.

On2026-10-15, public Studio code verifies a separate default OCR Word layer below the tab layers: `main-DRBDOXIp.js` enables word text at zIndex1 while result-tab visibility controls zIndex2; `visual-sdk-AyAWovJX.js` adapts `contents[].pages[].words[].source` and applies `#FAFF7F40` fill/1px same-color stroke. Executing the actual public adapter/WordVectorLayer style with synthetic words and no fields confirms the color is unchanged at confidence0.3/0.99. This is not an extraction-field or confidence background, and no access to the internal Studio repository/login or Analyze was used. The owner approves implementing this word base across all tabs without changing source pixels or public inputs.

The initial translucent SVG word version passed short transform checks but still changed a stroke edge after100 rounds. Source pixels, word coordinates and paper bounds were identical, so changing data or screenshot thresholds would mask a rendering issue. The final word layer follows Studio's actual Canvas 2D approach: a separate transparent DPR-aware backing store, deterministic drawing of validated projected polygons,1px same-color stroke and cleanup on replacement/unmount; source pixels are untouched and result frames stay vector-based. Fresh initial images and100 real transform rounds match exactly in both browsers. Duplicate polygons draw once and malformed geometry becomes visible warnings, never invented shapes. The owner approves this stable Canvas version and separately approves waiting for the original JSON tree before empty-result snapshots: both old references captured a loading interim state. Actual Narrator remains pending.

Task 2.5 initially used **local HEIF validation only** while evaluating distribution options. The common native-image adapter normalizes browser EXIF orientation and identifies signatures independently of filename/MIME. Real receipt-derived JPEG/BMP keep the full pixel frame, with transparency flattened onto white; eight synthetic EXIF variants verify corner pixels, dimensions and quarter-turn grounding at DPR 1/2. They are not new CU Analyze results.

RC-3 replaces the evaluated `libheif/libde265` path with `heic-rs 0.1.4`, a pure-Rust MIT OR Apache-2.0 decoder compiled to hash-pinned WASM. Chrome/Edge lack native HEIC decoding through `<img>` and `createImageBitmap`, so a fallback remains necessary. The owned Worker uses same-origin JS/WASM, a 40-million-pixel ceiling and `wasm-unsafe-eval` without general JavaScript eval or Blob Worker permission.

Nine generated upstream fixtures are MIT OR Apache-2.0 and cover single images, tiled grids, large frames, rotated dimensions and EXIF. Three outputs match Apple reference pixels exactly; the others measure 47.76-49.80 dB RGB PSNR and 57.62-60.01 dB luma PSNR. Chrome/Edge produce identical RGBA hashes. The real licensed sample decodes to 1280x854 in about 189-227 ms in the isolated WASM probe. Corrupt/truncated input, pixel limits, denied CSP, missing resources, replacement and unmount are explicit failures/recovery tests.

On 2026-10-12 the owner required final appearance to match the approved prototype and accepted visual regression as the next batch. The [visual suite](../tests/e2e/visual.spec.ts) exercises only the actual product demo, not the public-input test controls. Fifteen images per Windows browser freeze full-page `1600 x 1040` and the separately sized Fields reference, DPR 1/light/Segoe UI. Chrome Fields directly match the existing approved PNG with zero RGBA pixel changes; Edge's native scrollbar differences use separate baselines. No application region is masked.

Snapshot threshold and allowed differing pixels are both zero, and ordinary runs never create/update references. Nine scenarios per browser add 18 runs; repeated immutable comparison passed 36 times without changing any of the 30 baseline hashes. A temporary 12-to-14 px dot-size probe is detected and then removed. This change adds tests/configuration/documentation only, not a new product layout. See the [current baseline gallery](prototype/index.html#visual-baselines). Approved future design changes require reviewed reference updates; browser/font/platform changes do not authorize looser thresholds. Remaining task dependencies and P0/distribution gates are unchanged.

The [stress suite](../tests/e2e/stress.spec.ts) now verifies 100 PDF page/transform rounds, 100 public-input replacements and 100 pending HTTP cancellations in each browser at DPR 1: 600 rounds across six runs. Every completed replacement has only its legitimate current Worker/bitmap/host URL; real host release balances creation/disposal. All held requests must report actual aborts and no late successful response, so a StrictMode-only cancellation cannot satisfy the test. Caller integrity is inspected 40 times per browser and geometry remains within 1 CSS pixel.

The stress batch exposed pan-dependent scrollbar re-centering: moving 37/21 px caused a 15 px vertical scrollbar to appear and the paper to move only 29.5/21 px. [Document-stage clipping](../src/styles.css) fixes this without offsets, reserved gutters or layout redesign; zoom still controls the explicit stage dimensions. The stressed product context compares pinned PDF and replacement PNG directly to the earlier shared baselines, and all 30 hashes remain unchanged. Headed Chrome verified actual drag displacement and stable source width. This is not peak-memory measurement, an approved latency budget or full HEIF/format/DPR stress coverage.

1. **Viewer-first checkpoint**: complete remaining Viewer functionality and independent acceptance; task 4.2 rich result views are verified and the next ordered target is 4.3 accessibility/extensions. Continue outstanding P0 coverage without treating verified rendering/package tests as complete Viewer sign-off.
2. **D3/D4 delivery**: packaged permissive decoder assets, source lock, notices, SBOM, reproducible hashes and production consumers pass. HEVC patent/product and public publication approval remain external release gates. Owner: viewer maintainer with project release/approval owners.
3. **Coverage gaps**: PDF/PNG pressure, scoped structured/multi-region navigation, isolated React18/19 Vite consumers, HTTP cross-origin behavior and remote core/browser/performance/consumer/stress jobs pass. Real CU cross-page structured fields, dedicated Tables view, broader real format/HEIF pairs, real crop/bounding-box cases, HTTPS/credentialed hosts and source/decoder memory budgets remain open. Non-Vite bundlers are explicitly unverified and non-gating under D6.
4. **D5, final stage only**: after standalone Viewer P0/P1 completion (G2 + G3), coordinate and implement `5.1/5.2` with the toolkit maintainers. The handoff is one external host option, not a blocker for direct Viewer running or development.
5. **Separate acceptance**: G2 + G3 accept the standalone Viewer; subsequent G4 accepts CLI integration. Existing verified scope does not imply either gate, complete distribution compliance or Microsoft release approval.

## Task 3.3: Packed Vite Consumers

Actual tgz installations outside this repository first exposed Worker 404 in React18/19 production builds. The owner approved an optional **Node-only Vite resource entry**, not a change to the React source/result API. [The shared plugin](../src/vite.ts) copies the pinned PDF dependency's resources plus packaged HEIF Worker/JS/WASM/licenses/SBOM into allowlisted host asset directories. Vite is an optional peer; the browser component does not import the plugin or Node built-ins.

The same packed library also reproduced a development directory rewrite dropping `/pdfjs/`'s trailing slash; pathname normalization in the adapter prevents child Worker/font URLs from escaping that directory. The regression has a direct unit case. The verifier uses native canonical Windows long paths, because Vite deliberately rejects DOS 8.3 aliases; strict filesystem restrictions were not disabled or broadened.

[The repeatable verifier](../tools/verify-packed-consumers.mjs) builds/packs, creates new manifests and relocated licensed fixtures, installs separate dependencies and compiles React18.3.1/19.3.0 hosts with TS6.0.3/Vite8.3.2. Three scenarios in each React/mode/browser combination produce 24 successful production/development Chrome/Edge runs. PDF/PNG use self-only scripts/workers without eval; HEIF adds only `wasm-unsafe-eval` to the Worker policy. Blob Worker and general JavaScript eval remain denied. Worker/font/HEIF paths and MIME types are exercised; CMap/WASM/ICC file delivery is checked separately from full PDF decoder-fixture coverage.

Default PDF, pinned PDF and pinned PNG compare directly to the original product screenshots at zero difference; all 30 original references remain unchanged. Neither source aliases nor shared dependency directories satisfy the package test. [Push CI](https://github.com/changjian-wang/cu-result-viewer/actions/runs/38347604633) and the [full manual matrix](https://github.com/changjian-wang/cu-result-viewer/actions/runs/38348199406) pass. Hosted runners skip only pixel comparisons because their browser/font revisions are not the approved references; local fixed-version checks remain mandatory. The HEIF codec is packaged with permissive notices and no private configuration; no publication approval is inferred.

## Viewer-First Scheduling: 2026-10-12

The owner explicitly directed that the Viewer be completed before cu-cli integration. The revised bilingual plan renumbers Viewer P1 as 4.1-4.4/G3 and CLI as 5.1/5.2/G4 so numbering matches execution phases; requirement priorities and actual implementation evidence remain unchanged. CLI contract review no longer overlaps incomplete Viewer delivery, and both external tasks require G2 + G3. Neither is a prerequisite for independent rendering, result inspection, package consumption or rich-pane development.

Fields/Markdown/JSON switching, safe Markdown and an original-JSON tree are now implemented under task 4.2. Dedicated Paragraphs/Tables/Code behavior still needs explicit scope and remains disabled. Approved Fields/product appearance and technical prerequisites remain intact; broader real format/transform/source-budget and release gates are not waived. TIFF/DI remain independent P2, not a requirement to finish before the final CLI integration.

## Task 4.1: Structured Fields and Multiple Regions

Real invoice/receipt data confirms table-like arrays (three/two LineItems rows) and semicolon-encoded multi-region addresses. Array children now display one-based `Item N` labels while retaining stable numeric IDs and readable full paths. React Testing Library checks repeated child labels, expansion and collapsed selected-parent state; the public input remains unchanged.

`fieldRegions` preserves all regions on a field. If a container has none, it collects every grounded descendant in deterministic depth-first order. Selection stores a region index separately from field identity; changing regions does not change color or selection, previews temporarily use the primary region, and pointer exit restores the pinned region unless manual page precedence applies. The Source preview dock adds region Previous/Next controls only for a pinned field with multiple regions, so existing default and hover appearance remain unchanged.

Real BillingAddress verifies both service regions; real LineItems verifies Item1-3 and selection through collapse/reopen. A clearly synthetic two-page array verifies all descendant regions, cross-page navigation, manual page behavior and duplicate labels. This completes scoped task 4.1, not a dedicated Tables tab or proof of real cross-page structured service output. See [the running screenshot](prototype/interactive-multi-region.png).

## Task 4.2: Safe Markdown and Original JSON

The selected content's Markdown is rendered with exact MIT versions of React Markdown, remark-gfm, rehype-raw and rehype-sanitize. `react-json-view-lite` is also MIT. The resulting production graph contains 128 MIT packages, one ISC package and one BSD-2-Clause package; the only Apache-2.0 package is the existing PDF.js dependency. Task 4.2 adds no copyleft runtime dependency.

Raw HTML parsing is necessary because the real invoice contains nine HTML tables; sanitization runs after parsing. Scripts, frames, event attributes and dangerous protocols are removed. Images are replaced with omitted-text markers, preventing remote requests. Safe HTTP/HTTPS/mail links use a new browsing context with `noopener noreferrer`.

The JSON tree uses MIT `react-json-view-lite` 2.5.0, whose peer range covers React 18/19. It receives the original public `result` reference, not `CuResultModel`, so the operation-envelope `id`, `status`, `result` and `usage` remain visible. The root starts expanded while nested objects/arrays remain collapsed to avoid rendering the full hierarchy immediately.

The original 1,000,000-character Markdown and 2,000,000-character JSON limits were not retained after risk measurement. They produced 907-1,248 ms Markdown and 238-313 ms JSON main-thread tasks. A 100,000-character Markdown probe passed locally but produced a 154 ms Edge task when the full hosted matrix ran concurrently, so the final limit is 50,000 characters. JSON remains 500,000 serialized characters/20,000 values. These retain substantial headroom over the real 5,125-character Markdown and 393.5 kB result while preserving the 100 ms engineering long-task gate. Exceeding a limit produces an explicit state without truncating or mutating caller data; circular, non-finite and non-JSON values are reported.

Markdown and JSON now use separate dynamic chunks. The library entry fell from 479.97 kB / 127.76 kB gzip to 47.29 kB / 14.19 kB; the demo main chunk fell from 603.46 kB / 185.63 kB to 261.31 kB / 82.28 kB and no longer triggers Vite's 500 kB advisory. The warning threshold was not raised. Fields requests neither rich chunk.

The production Chrome/Edge gate allows 1,000 ms cold activation, 350 ms warm near-limit activation, a 100 ms maximum long task and 64 MiB heap growth. Recorded local cold/warm results were 433/85 ms and 392/133 ms in Chrome, and 447/169 ms and 417/184 ms in Edge for Markdown/JSON respectively; maximum observed warm long task was 88 ms. GitHub's hosted Windows runner measured near-limit JSON at 272-276 ms, which established the 350 ms cross-environment total-time budget without relaxing the 100 ms main-thread-task gate. These budgets cover result panes only. Source decoding/page rendering retain safety limits, cancellation and disposal assertions; timing/memory are recorded observations rather than additional hard G2 gates.

The result-view state lives inside the result pane and does not recreate SourcePane. Chrome/Edge tests pin a real field, change zoom/rotation/page, switch through Markdown and JSON with keyboard tab behavior, then return to the same pinned field and source state. Real PDF/PNG Markdown, sanitized adversarial input, missing content, original objects/arrays and oversized results are covered. React 18/19 development/production package consumers also load the real Markdown tables and JSON tree under the existing strict CSP.

Task 4.2 itself changed none of the prior 30 product baselines and added four pane-only Markdown/JSON references. RC-3 later refreshed 22 full-page references solely for the truthful HEIF footer status; eight pane-only product references, all four rich-pane references, component layout and approved Fields pixels remained unchanged. Paragraphs/Tables/Code semantics are now confirmed but not implemented; they are tracked as task 4.2a before the remaining P1 UX/extensions.
