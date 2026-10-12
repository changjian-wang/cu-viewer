# Design Decisions and Phase 1 Evidence

> **Plan task**: [1.1: Verify input, samples and Studio behavior](dev-plan.md#phase-1-evidence-and-decisions)
> **Status**: v2 static design approved; runnable PDF/PNG prototype and first browser checks delivered; interactive user review and P0 coverage remain open
> **Last updated**: 2026-10-10
> **Gate**: G0 and static wireframe direction approved. Tasks 2.1-2.3 are delivered; the React prototype is runnable, not a complete P0 or approved release.

## Approved Initial Baseline

The task owner approved the following baseline on 2026-10-09. This approval does not claim browser compatibility or approve the entire design.

| Decision | Initial baseline | Remaining gate |
| --- | --- | --- |
| D1: API target | Start with CU `2025-11-01` GA. Current cu-cli output is now captured from actual service calls. | Review the fixtures and parser contract; do not advertise preview or older-version compatibility without evidence. |
| D2: Runtime | React 18/19; current stable Chrome and Edge on Windows. | Record exact tested versions during rendering evaluation and consumer tests. |
| D2: Source strings | Strings mean HTTP, HTTPS, or host-owned blob URLs, not local filesystem paths or inline data URLs. | Define URL loading, ownership, CORS, and explicit error behavior during implementation. |
| D2: Binary inputs | Preserve `File`, `Blob`, and `ArrayBuffer` inputs; identify formats from content rather than trusting an extension alone. | Evaluate all required image formats, including HEIF/HEIC. |
| D3: Rendering | Task owner approved the initial design and allowed the LGPL candidate direction. Implement PDF.js/SVG, native common-image rendering, and the investigated owned pure-JS HEIF worker; no decoder assets have yet been added to the package. | Actual component/codec/sample and asset-consumer coverage remain required; candidate approval does not complete compliance. |
| D4: Distribution | Main source is [MIT](../LICENSE); LGPL candidates are allowed subject to obligations before any distribution. Package remains private; no Microsoft publication/copyright-ownership approval is claimed. | Confirm ownership/publication approval and budgets; complete notices, corresponding sources, full dependency/update review and packaging before distributing any artifact. |
| D5: Host | The current official CLI implementation is [Azure/content-understanding-toolkit](https://github.com/Azure/content-understanding-toolkit/tree/main/cu-cli), not the earlier prototype link. | Coordinate host ownership and the future browser-viewing contract before task 4.2. |
| D6: Result-pane customization | The original item is still incomplete. | Clarify before finalizing the affected P1 extension. |

The owner explicitly authorized using cu-cli to call the real service for sample acquisition. Two small, public, MIT-licensed source documents were submitted to an already configured resource. No customer files, new resources, custom analyzers, or model/default configuration changes were involved.

The owner approved the current initial design on 2026-10-09, then clarified the Microsoft open-source goal and preference for open-source dependencies. That preference does not establish a permissive-only rule, blanket LGPL approval, or an organizational release sign-off. Resolve this policy explicitly rather than relabeling a third-party codec under the main project's license.

The subsequent explicit choice was **MIT for the main component plus allowed LGPL candidates with compliance before distribution**. This closes the initial candidate-direction decision and allows development under G0; it does not relicense any third-party component or approve release. The current copyright notice refers to project contributors rather than asserting unverified Microsoft ownership.

## Task 2.1 Foundation

- Added a private npm package and stable compatible tooling: TypeScript `6.0.3`, Vite `8.3.2`, Vitest `5.0.3`, ESLint `10.11.0`, and typescript-eslint `8.71.0`. TypeScript 7 and the latest alpha lint package were deliberately not selected because the verified lint peer range stops before TypeScript 6.1.
- [Public input types](../src/index.ts) retain `File | Blob | ArrayBuffer | string` and `result: unknown`. No public normalized CU schema, SDK model, source loader, or viewer component is introduced.
- Lockfile installation, type-check, lint, four [input tests](../src/index.test.ts), and ESM/declaration build pass. A standalone consumer of the built declarations accepts the supported sources and confirms three deliberately invalid type uses are rejected.
- Editor test discovery found no tests; the actual unit run used the configured Vitest CLI. Do not count empty editor discovery as a successful test run.
- No CU/Azure runtime dependencies or LGPL binary assets are installed into the main library. Investigation resources remain outside its package.

## Task 2.2 Parsing and Run-First Checkpoint

Task 2.2 now provides a private [parser](../src/internal/parseCuResult.ts) and [model](../src/internal/types.ts). It supports the verified GA envelope and inner result, retains original JSON identity, and derives nested fields, pages, confidence and all valid CU `D(...)` regions. Neither internal module is exported from the public entry.

Real-fixture runs yield 100 PDF and 42 PNG field nodes, including 12/11 absent values and 53/13 source regions, with zero parser issues. The [45 parser tests](../src/internal/parseCuResult.test.ts) also cover scalar boundaries, stable/escaped identities, multiple contents, rectangles, malformed input, immutable/deep relationships and cycles. Together with the four input-contract cases, 49 tests pass.

Structural errors use `CuResultParseError` with a code/path. Nonfatal confidence/grounding issues remain explicit in the internal model; a future result pane must surface them rather than hide values or draw invented regions. Only GA `2025-11-01` is currently accepted, and newer field/content variants produce unverified-behavior warnings when their values can be retained.

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

The owner approved v2 static review and subsequently agreed to use the current interactive baseline for task 2.4 hardening on 2026-10-10. The [React component](../src/ContentUnderstandingResultViewer.tsx) and [demo host](../demo/App.tsx) render real source/results and preserve the source-plus-original-JSON boundary. The [static gallery](prototype/index.html) remains design-only; the live prototype is at <http://127.0.0.1:5173/> while `npm run dev` is running.

The first live run exposed a real Vite directory-URL rewrite issue: the trailing slash was removed, yielding an invalid PDF worker path. The adapter now constructs runtime directory URLs with explicit relative assets, and development plus production-host checks load the local worker. No fictional `isEvalSupported` option is passed to the current PDF.js declarations; loading uses validated options and explicit errors. Original PDF.js font-interpreter warnings remain nonfatal for the sample, not an assertion that console output is empty.

The source adapter copies caller buffers, cancels obsolete loads/renders, draws offscreen before committing, and releases PDF tasks or image bitmaps. The private interaction reducer separates preview from persistent selection and gives manual page navigation precedence. Current type-check/lint, library/demo builds, 409 unit cases and 52 browser runs pass using Chrome `154.0.8037.98` and Edge `155.0.4283.45`; original input/UI regressions remain covered alongside new image tests. Development and built pages are visually checked, with normal cancelled/retried requests distinguished from errors.

The [test-only public-input host](../tests/e2e/source-inputs.tsx) mounts the exported component without shipping test instrumentation. The [input suite](../tests/e2e/source-inputs.spec.ts) verifies PDF/PNG File/Blob/ArrayBuffer/HTTP/blob URL raster/grounding, caller-data integrity and controlled replacement/unmount resource release. Empty/truncated/network failures are synthetic diagnostics. It contributes 20 runs to the current combined 52; at the earlier task 2.4 checkpoint the combined count was 36 and no runtime changes were needed. Task 2.5 subsequently extracted the native image adapter and added local-only HEIF. Neither checkpoint is 100-switch stress, HTTPS/CORS or isolated-package coverage.

The owner's Fields screenshot now guides the runnable [Fields presentation](prototype/interactive-fields.png): 12 px solid/outlined dots, name-adjacent 20 px page badges, right-hand SVG chevrons, 56 px collapsed groups and 80 px single-line scalar rows, separated by 1 px rules. Groups start collapsed; missing-value filtering starts enabled but preserves zero/false/null/empty values. Fields and source previews share two-decimal confidence formatting and omit absent confidence. The extra Clear control was removed following owner feedback. Primary grounding uses the field's own region or a real grounded descendant, without writing regions into the parent; colors remain tied to original root order and are shared by descendants and source overlays. Extra result-view controls are disabled placeholders, not new functionality. Reference styling does not replace saved extraction values or confidence.

Source page availability now uses actual loaded-source metadata consistently for badges and navigation. A result referencing an absent page produces an `unavailable-source-page` warning with its metadata path; affected badges are disabled with an explanation. Hovering/pinning an affected scalar or group preserves its value and the current source page, displays an explicit source-region error, and draws no invented overlay. Browser recovery is verified by supplying a matching result. This is a clearly synthetic mismatch case, not a failed real CU sample or proof of full source/result identity checking.

Field preview was placed in a small dock below the source rather than over document text and is part of the approved implementation baseline, not full UX/accessibility acceptance. Standard-font loading is proven with a clearly synthetic fixture, not a successful CU result. HEIF, React 18 consumers, full format/orientation/CSP and packed-package coverage remain incomplete.

For task 2.5 the owner explicitly chose **local HEIF validation only** until distribution compliance is complete. The common native-image adapter now normalizes browser EXIF orientation and identifies signatures independently of filename/MIME. Real receipt-derived JPEG/BMP keep the full pixel frame, with transparency flattened onto white; eight synthetic EXIF variants verify corner pixels, dimensions and quarter-turn grounding at DPR 1/2. They are not new CU Analyze results.

The actual component also decodes the MIT-licensed HEVC-in-HEIF example through an owned same-origin classic Worker using the unchanged evaluated libheif 1.23.5 pure-JS artifact. A server-only local configuration points to the isolated decoder directory and validates its pinned hash. No codec binary entered the repository or distribution builds; production rejects HEIF visibly. The small emitted project Worker glue does not enable decoder distribution. The image suite adds 16 browser runs covering input representations, primary regions, cancellation/recovery and real no-eval/no-WASM Worker CSP. Corresponding-source/notices/update and broader codec/orientation/bit-depth review remain mandatory before any private or public distribution.

1. **Current hardening checkpoint**: the owner approved the interactive baseline and the PDF/PNG public-input/cancellation batch is verified. Continue task 2.4/2.5 coverage without treating this approval as production sign-off.
2. **D3/D4 delivery**: local decoder integration is approved and verified, but source/notices/update review and production distribution remain blocked. Owner: viewer maintainer with project release/approval owners.
3. **Coverage gaps**: the prototype covers PDF/PNG public inputs, native JPEG/BMP derivatives, eight synthetic EXIF orientations, local HEIF/CSP, quarter-turn regions and controlled cancellation. Real per-format/CU-orientation pairs, HEIF variants, later-page grounding, intrinsic crop, bounding-box browser grounding, HTTPS/cross-origin policies, 100-switch stress, performance budgets and independent consumers remain open. Primary-region overlays are tested; refined multi-region navigation is not implemented.
4. **D5**: coordinate the future `--view`/saved-result host flow with the actual toolkit maintainers. Installation has not implemented it.
5. **G2/G3 approval**: prove the implemented library/demo and external host workflows; G0 development approval and passing foundation checks are not P0 production-readiness or Microsoft release approval.
