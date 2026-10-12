# Implementation Roadmap

## Status and Scope

The private repository and initial documentation are the starting point. G0 and the v2 static design are approved for initial development; tasks 2.1-2.3 and a runnable React PDF/PNG prototype are implemented. The prototype has been started and browser-tested, but all P0 formats, production embedding, cu-cli hosting and release gates are not complete.

Deliver a reusable renderer first, a small demo as its host, and a minimal cu-cli integration. Do not inherit the OCR-Form-Tools application architecture or embed CU service logic in the viewer.

Track implementation work in Issues and P0/P1/P2 milestones once investigation has refined the tasks. The initial MIT/LGPL-candidate direction is approved; no delivery dates, completed distribution compliance, or release approval are assumed here.

The [development plan](dev-plan.md) expands this roadmap into module boundaries, structured tasks, test scenarios, and explicit gates, and records actual progress. Host delivery and P0/P1 release gates remain open independently of the approved initial design.

The owner's UI checkpoint now has approved [v2 static design](prototype/README.md) and an [interactive baseline](prototype/README.md#当前可操作范围) approved for task 2.4 hardening. It was run immediately when mountable and has real PDF/PNG coverage. The static state gallery remains design-only; implementation approval does not close production acceptance.

Checked items record completed investigation or verified behavior, not production-release approval. Current 409 unit cases and 52 Chrome/Edge browser runs cover public inputs, native formats, synthetic EXIF directions at DPR 1/2 and local HEIF/CSP/cancellation. Full real paired formats/orientation, HEIF distribution, HTTPS/cross-origin, 100-switch stress, budgets, packed consumers and CLI remain open.

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
- [x] Implement the common native-image adapter and locally validate the owned pure-JS HEIF Worker/CSP/lifecycle path. The owner approved only local development use; distribution compliance remains open.
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

**Exit check:** a saved real result works without credentials, service access, or caller normalization. Focused parsing/geometry tests and a browser check verify the thin slice before expanding it.

## 4. Complete P0

- [ ] Complete PDF and all required image support. **Partial:** native PNG/JPEG/BMP and local-only HEIF are implemented; decoded aliases/derivatives are not independent CU pairs, and production HEIF distribution remains blocked.
- [ ] Complete production control/transform acceptance. **Partial:** named controls and PDF page bounds work; full format/orientation and repeated-switch coverage remain open.
- [ ] Complete production field/source acceptance. **Partial:** real PDF/PNG public-input representations now render the same raster/grounding without modifying caller data; full formats, intrinsic orientation and host URL policies remain incomplete.
- [x] Verify independent loading, empty, invalid-result and source-error states, unavailable-source-page diagnostics, empty/corrupt binary inputs and HTTP failure/recovery; full format/host acceptance stays open.
- [ ] Complete lifecycle acceptance. **Partial:** controlled delayed HTTP/PDF-worker/image-decode replacement and unmount tests verify cancellation, stale-result suppression, Worker/bitmap release and host-owned URL preservation; 100-switch stress accounting remains open.
- [x] Build local PDF worker/fonts/CMaps/WASM/ICC assets with their license; packed-consumer/CSP and resource-specific fixture validation remain open.
- [x] Provide the saved-source/JSON demo without analysis or authentication.
- [x] Run focused parser/geometry/source/interaction unit and browser regressions; production coverage gaps remain explicitly listed.
- [x] Record tested browsers and representative fixture sizes; full format coverage and approved performance budgets remain open.
- [x] Document existing public inputs, dependencies and verified setup/build/test commands; complete independent-host embedding guidance remains task 3.3.

**Exit check:** meet the proposed P0 acceptance checks in the requirements document and demonstrate embedding without service dependencies. Run agreed automated gates before describing P0 as production-ready.

## 5. Integrate with cu-cli

This work crosses into a host repository and must be coordinated with its owner. The CLI remains responsible for analysis, browser launch, and local hosting.

- [ ] Agree how the CLI supplies the original source and serialized Analyze JSON to the demo/viewer host.
- [ ] Define a saved-result viewing path that does not perform a new CU call.
- [ ] Implement the target `cu analyze sample.pdf --view` flow in the appropriate host, keeping host logic outside the component.
- [ ] Use safe local file delivery; a filesystem path is not automatically a browser-readable URL.
- [ ] For a local server, default to loopback-only exposure and constrain file access; do not expose credentials or arbitrary filesystem contents.
- [ ] Verify local worker/resource loading and browser startup using a real source/result pair.
- [ ] Document the minimal embedding code and ownership boundary.

**Exit check:** both a newly produced result and a previously saved result can be inspected through the same component. Keep service/CLI dependencies out of the viewer package.

## 6. Deliver P1

- [ ] Improve nested fields, arrays/tables, and multiple source-region selection/navigation.
- [ ] Add safe client-side Markdown with headings, lists, tables, code blocks, and formatting.
- [ ] Evaluate and integrate a mature expandable JSON-tree component suitable for reasonably large results.
- [ ] Complete accessibility, keyboard, touch, responsive layout, and refined automatic scrolling/centering.
- [ ] Add grounded extension points for selection callbacks, custom fields, viewer events, toolbar/layout customization, initial page, and initial zoom/fit mode.
- [ ] Specify MCP Apps / MCP UI and chat-host integration design, including host-to-viewer data delivery and asset packaging, without service logic in the core.
- [ ] Test rich-pane security and representative host interactions.

**Exit check:** P1 capabilities have focused tests and documented limitations. Clarify result-pane customization rather than guessing the missing source requirement.

## 7. Schedule P2 Separately

- [ ] Evaluate TIFF decoding, multi-page rendering, and page navigation.
- [ ] Investigate DI JSON, field structures, and coordinate conventions independently of CU parsing.
- [ ] Add DI/TIFF coverage only after separate scope and scheduling decisions.

**Exit check:** P2 changes do not weaken the source-plus-result public boundary or block P0/P1 delivery.

## Immediate Next Step

Obtain representative sanitized CU source/result pairs and confirm the API version and cu-cli output shape. Those facts determine the parser and the cheapest meaningful rendering/geometry prototype.
