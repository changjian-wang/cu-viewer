# Implementation Roadmap

## Status and Scope

The private repository and initial documentation are the starting point. G0 and the v2 static design are approved for initial development; tasks 2.1-2.3 and a runnable React PDF/PNG prototype are implemented. The prototype has been started and browser-tested, but all P0 formats, production embedding, cu-cli hosting and release gates are not complete.

**Owner-approved order, 2026-10-12: complete the standalone Viewer first, integrate cu-cli last.** Finish Viewer P0, rich result views and P1 UX, then independent acceptance; only afterward start the CLI contract and implementation. A demo or ordinary React host can run the Viewer without cu-cli. Preserve the rendering-only boundary.

Track implementation work in Issues and P0/P1/P2 milestones once investigation has refined the tasks. The initial LGPL candidate was evaluated but is not distributed; production now uses a pinned MIT/Apache decoder. No delivery dates, HEVC patent/publication approval, or complete release approval are assumed here.

The [development plan](dev-plan.md) expands this roadmap into module boundaries, structured tasks, test scenarios, and explicit gates, and records actual progress. Host delivery and P0/P1 release gates remain open independently of the approved initial design.

Task numbering now matches the revised phases: Viewer P1 is `4.1-4.4` / G3; CLI is `5.1-5.2` / G4 and runs last after Viewer G2 + G3. Requirement priorities are unchanged. Independently approved P2 remains outside this mainline.

The owner's UI checkpoint now has approved [v2 static design](prototype/README.md) and an [interactive baseline](prototype/README.md#当前可操作范围) approved for task 2.4 hardening. It was run immediately when mountable and has real PDF/PNG coverage. The static state gallery remains design-only; implementation approval does not close production acceptance.

Checked items record verified scope, not release approval. Current 429 unit cases, 104 repository browser runs and 24 isolated Vite consumer runs pass: 128 local browser runs. Remote core/browser/performance/consumer jobs and the full 600-round stress matrix also pass. Structured arrays, all current source regions, rich results, packaged permissive HEIF, controlled HTTP CORS and DPR 1/2 format/page-box checks are verified. There are 34 reviewed references; RC-3 refreshed 22 full-page images only for the truthful HEIF footer, while pane/layout/Fields references remained unchanged. Remaining rich UX, real format pairs, HTTPS/credentialed hosts, source/decoder budgets, other hosts, HEVC product/publication approval and final CLI remain open.

## 1. Validate the Input and UX Reference

- [x] Confirm the verified CU `2025-11-01` API and exact cu-cli saved JSON, including outer response wrappers; other API versions are not approved.
- [ ] Collect the full real source/result matrix. **Partial:** licensed multi-page PDF and PNG pairs are saved; required image formats and intrinsic orientation/crop fixtures remain incomplete.
- [x] Record approved public-pair provenance, licenses, hashes and remaining sharing/sample gaps without changing source geometry or raw results.
- [ ] Confirm the full source geometry/orientation matrix. **Partial:** CU values/units/dimensions, real PDF DPR 1/2 transforms, synthetic CropBox/MediaBox/intrinsic rotation and native EXIF 1-8 are verified; real CU crop/orientation pairs and broader HEIF orientation remain open.
- [ ] Complete Studio PDF/image walkthroughs. **Partial:** owner-reported single-page controls and screenshots are recorded; extended cross-page/image and exact reference semantics remain open.
- [ ] Clarify the truncated tail of the `Result-pane` extension requirement; implement the explicitly named callbacks/render/layout/toolbar/initial-view extension points without inventing the missing text.

**Exit check:** verified sample inventory, input assumptions, and Studio observations are recorded. Do not invent CU structures from historical DI examples or label synthetic output as a successful service response.

## 2. Evaluate OSS and Source Decoding

- [x] Evaluate PDF.js and both highlighter candidates; execute PDF.js geometry/rendering probes and record the wrappers' documentation/peer-dependency limitations without claiming they were browser-tested.
- [x] Inspect OCR-Form-Tools rendering/geometry patterns without importing its application, service or DI architecture.
- [x] Prototype native PNG/JPEG/BMP and owned libheif JS/WASM decoding in Chrome/Edge; record extension aliases, derived images and the single HEVC fixture as limited evidence, not full paired-format coverage.
- [x] Implement the common native-image adapter and replace the local LGPL candidate with a packaged, reproducible MIT/Apache `heic-rs` WASM Worker. Development/production, CSP, lifecycle and isolated consumers pass.
- [x] Record versions, licenses, reuse decisions, limitations and local PDF worker/font/resource requirements.

**Exit check:** the chosen rendering approach handles representative geometry and required formats. A custom PDF renderer requires a documented compelling reason. TIFF and DI do not gate this decision.

## 3. Build the Smallest End-to-End Slice

- [x] Define the public source-plus-result API without CU SDK or PDF.js-specific types.
- [x] Implement verified CU parsing, field derivation, page lookup and shared source geometry.
- [x] Render the real four-page PDF and its fields side by side.
- [x] Navigate from another PDF page to a grounded page-1 field on hover/selection and draw its real polygon; all current real field regions are on page 1.
- [x] Check fit/zoom/pan/quarter-turn polygon alignment and resize behavior in the prototype; full integrated DPR/viewport/zoom and intrinsic-orientation acceptance remains open.
- [x] Verify the real PNG field/source interaction and quarter-turn overlays in Chrome/Edge.
- [x] Preserve absent confidence/grounding and scalar values; use consistent two-decimal confidence, disable unavailable source-page badges and test synthetic mismatch/recovery without inventing navigation or regions.
- [x] Freeze the latest approved product appearance and test default/hover/pin/group/filter/page/image/loading/empty/error snapshots, with browser-specific native scrollbars, exact approved Chrome Fields pixels and an intentional-drift detection probe.

**Exit check:** a saved real result works without credentials, service access, or caller normalization. Focused parsing/geometry tests and a browser check verify the thin slice before expanding it.

## 4. Complete P0

- [x] Complete PDF and all required image decoding within the approved evidence policy: native PNG, pixel-equivalent JPEG/BMP derivatives and packaged HEIF/HEIC pass; no per-encoding Analyze pair is required.
- [ ] Complete production control/transform acceptance. **Partial:** PDF page/transform/pan 100-round checks now pass with stable geometry and approved final appearance; full format/orientation/DPR matrices remain open.
- [ ] Complete production field/source acceptance. **Partial:** public input representations and required formats preserve raster/grounding/caller data; add focused HTTPS coverage within the approved same-origin/anonymous-CORS policy. Credentialed cross-origin is out of scope.
- [x] Verify independent loading, empty, invalid-result and source-error states, unavailable-source-page diagnostics, empty/corrupt binary inputs and HTTP failure/recovery; full format/host acceptance stays open.
- [x] Complete lifecycle acceptance under the approved policy: repeated replacement/cancellation, HEIF success/error/CSP/replacement/unmount and isolated consumers verify safety limits and balanced resource disposal; timing/memory remain observations.
- [x] Deliver local Worker/fonts/CMaps/WASM/ICC assets with their license; representative multi-page/font/rotation/CropBox cases and explicit unsupported-PDF errors are required instead of an exhaustive codec matrix.
- [x] Provide the saved-source/JSON demo without analysis or authentication.
- [x] Run focused parser/geometry/source/interaction unit and browser regressions; production coverage gaps remain explicitly listed.
- [x] Record tested browsers, representative fixture sizes and production rich-result budgets; source/decoder timing and memory are observations while safety limits/lifecycle remain enforced.
- [x] Document public inputs, optional Vite assets, CSS and isolated pack verification in the usage guide; wider host/CI and full P0 gates remain open.

**Exit check:** complete Viewer P0 scenarios and independent embedding without a CLI dependency. Retain format/license/CI/performance gates; overall CLI delivery is assessed separately at the final stage.

## 5. Complete Viewer P1 and Standalone Acceptance

- [x] Implement scoped structured Fields and multiple-region navigation: stable nested/array identities, table-like real LineItems, collapsed-selection retention, all own/descendant source regions and synthetic cross-page group coverage. The separately confirmed native Tables result pane remains task 4.2a.
- [x] Implement actual Fields/Markdown/JSON switching; preserve document page/zoom/rotation/pan/pin/region state and approved Fields appearance rather than merely enabling empty tabs.
- [x] Add safe client-side Markdown with headings, lists, GFM, sanitized CU HTML tables, code blocks and formatting; omit active content, dangerous URLs and remote images.
- [x] Evaluate and integrate a mature MIT expandable JSON-tree component for the original input, with measured 500,000-character/20,000-value limits and lazy result-view chunks.
- [x] Implement approved dynamic Studio result tabs: source-linked Paragraphs/Tables, source-thumbnail Figures/Signatures, key/value Metadata, original-JSON Result and Python/C#/JavaScript SDK Code; no service execution.
- [ ] Review intentional tab-header/footer/new-pane visual changes and update references only after owner acceptance; old34 files remain unchanged.
- [x] Complete task4.2a batches one/two: version/detail guards, dynamic tabs, all dedicated renderers, source crop/selection and explicit errors. Unit461, focused browser42, performance4 and functional consumer24 pass; visual-reference review remains pending.
- [ ] Complete approved task 4.3a: Chrome/Edge keyboard/focus/ARIA, Windows Narrator, desktop two-pane minimum-width/scroll behavior, and source centering only when a selected region is outside the visible viewport.
- [ ] **Deferred:** touch interaction remains in the source P1 requirement but is outside the current desktop-only delivery.
- [ ] Add the explicitly named field callbacks, custom field rendering, viewer events, toolbar/layout customization, initial page and initial zoom/fit extension points.
- [ ] Specify MCP Apps / MCP UI and chat-host integration design, including host-to-viewer data delivery and asset packaging, without service logic in the core.
- [x] Test real PDF/PNG rich panes, security, missing/invalid/oversized states, keyboard tab switching and React 18/19 package-host behavior in Chrome/Edge.

**Exit check:** Viewer G2 + G3 pass with independent startup, all confirmed result views, approved desktop interaction/accessibility and extension points, package and product parity. Touch and the truncated `Result-pane` tail remain deferred. MCP integration remains design/documentation only; no MCP runtime belongs in the core.

## 6. Integrate with cu-cli Last

**Deferred until the completed standalone Viewer passes G2 + G3.** This includes contract task 5.1, not only implementation 5.2. The CLI is one external host option; missing CLI approval cannot block Viewer development, running or review.

- [ ] Agree how the completed packaged Viewer receives original source and JSON from the external host.
- [ ] Define saved-result viewing without a new CU call.
- [ ] Implement the agreed `cu analyze sample.pdf --view` flow in the confirmed CLI repository, not the component.
- [ ] Constrain local file delivery and loopback hosting; do not expose arbitrary files or credentials.
- [ ] Verify resources, browser/server lifecycle and fresh/saved flows without regressing standalone Viewer behavior.

**Exit check:** external CLI workflows pass G4 after Viewer completion. Retain service/server responsibility outside the component and track the original CLI delivery requirement separately.

## Separate P2 Backlog

- [ ] Evaluate TIFF decoding, multi-page rendering, and page navigation.
- [ ] Investigate DI JSON, field structures, and coordinate conventions independently of CU parsing.
- [ ] Add DI/TIFF coverage only after separate scope and scheduling decisions.

**Exit check:** P2 changes are separately approved and do not block Viewer P0/P1 or the final CLI stage.

## Immediate Next Step

The next ordered Viewer work is approved task 4.2a dynamic Studio views, followed by task 4.3a desktop interaction/accessibility and task 4.3b named extension points. Touch and the missing tail of `Result-pane` remain deferred. Do not start CLI contract/implementation before Viewer completion or waive public-release HEVC approval.
