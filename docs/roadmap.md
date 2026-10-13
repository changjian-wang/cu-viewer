# Implementation Roadmap

## Status and Scope

The private repository and initial documentation are the starting point. G0 and the v2 static design are approved for initial development; tasks 2.1-2.3 and a runnable React PDF/PNG prototype are implemented. The prototype has been started and browser-tested, but all P0 formats, production embedding, cu-cli hosting and release gates are not complete.

**Owner-approved order, 2026-10-12: complete the standalone Viewer first, integrate cu-cli last.** Finish Viewer P0, rich result views and P1 UX, then independent acceptance; only afterward start the CLI contract and implementation. A demo or ordinary React host can run the Viewer without cu-cli. Preserve the rendering-only boundary.

Track implementation work in Issues and P0/P1/P2 milestones once investigation has refined the tasks. The initial LGPL candidate was evaluated but is not distributed; production now uses a pinned MIT/Apache decoder. No delivery dates, HEVC patent/publication approval, or complete release approval are assumed here.

The [development plan](dev-plan.md) expands this roadmap into module boundaries, structured tasks, test scenarios, and explicit gates, and records actual progress. Host delivery and P0/P1 release gates remain open independently of the approved initial design.

Task numbering now matches the revised phases: Viewer P1 is `4.1-4.4` / G3; CLI is `5.1-5.2` / G4 and runs last after Viewer G2 + G3. Requirement priorities are unchanged. Independently approved P2 remains outside this mainline.

The owner's UI checkpoint now has approved [v2 static design](prototype/README.md) and an [interactive baseline](prototype/README.md#当前可操作范围) approved for task 2.4 hardening. It was run immediately when mountable and has real PDF/PNG coverage. The static state gallery remains design-only; implementation approval does not close production acceptance.

Checked items record verified scope, not release approval. Current 429 unit cases, 94 repository browser runs and 24 isolated Vite consumer runs pass: 118 local browser runs. Remote core/browser/performance/consumer jobs and the full 600-round stress matrix also pass. Structured arrays, all current source regions, rich results and packaged permissive HEIF are verified. There are 34 reviewed references; RC-3 refreshed 22 full-page images only for the truthful HEIF footer, while pane/layout/Fields references remained unchanged. Remaining rich UX, real format pairs, cross-origin, source/decoder budgets, other hosts, HEVC product/publication approval and final CLI remain open.

## 1. Validate the Input and UX Reference

- [x] Confirm the verified CU `2025-11-01` API and exact cu-cli saved JSON, including outer response wrappers; other API versions are not approved.
- [ ] Collect the full real source/result matrix. **Partial:** licensed multi-page PDF and PNG pairs are saved; required image formats and intrinsic orientation/crop fixtures remain incomplete.
- [x] Record approved public-pair provenance, licenses, hashes and remaining sharing/sample gaps without changing source geometry or raw results.
- [ ] Confirm the full source geometry/orientation matrix. **Partial:** CU values/units/dimensions and synthetic native EXIF 1-8 are verified; real CU orientation pairs, intrinsic PDF crops and broader HEIF orientation remain open.
- [ ] Complete Studio PDF/image walkthroughs. **Partial:** owner-reported single-page controls and screenshots are recorded; extended cross-page/image and exact reference semantics remain open.
- [ ] Resolve the truncated `Result-pane` requirement with the task owner.

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

- [ ] Complete PDF and all required image support. **Partial:** native PNG/JPEG/BMP and packaged HEIF/HEIC are implemented; decoded aliases/derivatives are not independent CU pairs, and broader real CU/HEIF alpha/transform/10-bit coverage remains open.
- [ ] Complete production control/transform acceptance. **Partial:** PDF page/transform/pan 100-round checks now pass with stable geometry and approved final appearance; full format/orientation/DPR matrices remain open.
- [ ] Complete production field/source acceptance. **Partial:** real PDF/PNG public-input representations now render the same raster/grounding without modifying caller data; full formats, intrinsic orientation and host URL policies remain incomplete.
- [x] Verify independent loading, empty, invalid-result and source-error states, unavailable-source-page diagnostics, empty/corrupt binary inputs and HTTP failure/recovery; full format/host acceptance stays open.
- [ ] Complete lifecycle acceptance. **Partial:** 100 public-input replacements and 100 pending HTTP cancellations per browser verify PDF/PNG resource ownership; HEIF success/error/CSP/replacement/unmount and 24 isolated consumer runs pass. Broader format/DPR stress and source/decoder memory budgets remain open.
- [x] Deliver local Worker/fonts/CMaps/WASM/ICC assets with their license; approved optional Node-only Vite integration now passes isolated package/CSP/font cases. Real CMap/ICC/WASM-specific decode fixtures remain open.
- [x] Provide the saved-source/JSON demo without analysis or authentication.
- [x] Run focused parser/geometry/source/interaction unit and browser regressions; production coverage gaps remain explicitly listed.
- [x] Record tested browsers, representative fixture sizes and a production rich-result interaction budget; full format coverage plus source/decoder peak-memory budgets remain open.
- [x] Document public inputs, optional Vite assets, CSS and isolated pack verification in the usage guide; wider host/CI and full P0 gates remain open.

**Exit check:** complete Viewer P0 scenarios and independent embedding without a CLI dependency. Retain format/license/CI/performance gates; overall CLI delivery is assessed separately at the final stage.

## 5. Complete Viewer P1 and Standalone Acceptance

- [x] Implement scoped structured fields and multiple-region navigation: stable nested/array identities, table-like real LineItems, collapsed-selection retention, all own/descendant source regions and synthetic cross-page group coverage. A dedicated Tables result pane is not implied.
- [x] Implement actual Fields/Markdown/JSON switching; preserve document page/zoom/rotation/pan/pin/region state and approved Fields appearance rather than merely enabling empty tabs.
- [x] Add safe client-side Markdown with headings, lists, GFM, sanitized CU HTML tables, code blocks and formatting; omit active content, dangerous URLs and remote images.
- [x] Evaluate and integrate a mature MIT expandable JSON-tree component for the original input, with measured 500,000-character/20,000-value limits and lazy result-view chunks.
- [ ] Complete accessibility, keyboard, touch, responsive layout, and refined automatic scrolling/centering.
- [ ] Add grounded extension points for selection callbacks, custom fields, viewer events, toolbar/layout customization, initial page, and initial zoom/fit mode.
- [ ] Specify MCP Apps / MCP UI and chat-host integration design, including host-to-viewer data delivery and asset packaging, without service logic in the core.
- [x] Test real PDF/PNG rich panes, security, missing/invalid/oversized states, keyboard tab switching and React 18/19 package-host behavior in Chrome/Edge.

**Exit check:** Viewer G2 + G3 pass with independent startup, usable rich views, reviewed UX/extensions, package and product parity. Current Paragraphs/Tables/Code/more placeholders need explicit semantics/scope before they can count as features. Clarify result-pane customization without inventing the missing requirement. No CLI contract is required for this acceptance.

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

The next ordered Viewer task is **4.3: accessible UX and reviewed extensions**. Start from the verified Fields/Markdown/JSON state while retaining existing technical prerequisites and closing remaining Viewer P0 validation. Do not start CLI contract/implementation before Viewer completion, count Paragraphs/Tables/Code placeholders as delivered, or waive HEIF compliance. Result-pane customization remains gated by the unresolved extension-scope decision.
