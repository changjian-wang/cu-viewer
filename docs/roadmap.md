# Implementation Roadmap

## Status and Scope

The private repository and initial documentation are the starting point. Implementation has not begun. This roadmap is a proposal derived from the [requirements](requirements.md), not a record of completed functionality.

Deliver a reusable renderer first, a small demo as its host, and a minimal cu-cli integration. Do not inherit the OCR-Form-Tools application architecture or embed CU service logic in the viewer.

Track implementation work in Issues and P0/P1/P2 milestones once investigation has refined the tasks. No delivery dates or final dependency choices are assumed here.

## 1. Validate the Input and UX Reference

- [ ] Confirm CU API version(s) and the exact JSON written by cu-cli, including outer response wrappers.
- [ ] Collect real, matching source/result pairs: single- and multi-page PDF, required image formats, fields with and without confidence/grounding, and representative nested/array output for P1 planning.
- [ ] Sanitize samples consistently without invalidating source geometry; list sample gaps and sharing restrictions.
- [ ] Confirm field value structures, grounding encoding, page numbers, coordinate units, page dimensions, and source orientation using the actual samples.
- [ ] Review current CU Studio with PDF and image results; record hover, selection, navigation, transformation, and unavailable-grounding behavior.
- [ ] Resolve the truncated `Result-pane` requirement with the task owner.

**Exit check:** verified sample inventory, input assumptions, and Studio observations are recorded. Do not invent CU structures from historical DI examples or label synthetic output as a successful service response.

## 2. Evaluate OSS and Source Decoding

- [ ] Evaluate PDF.js, react-pdf-highlighter, and react-pdf-highlighter-extended against CU polygons, multi-page navigation, zoom, rotation, resize, custom overlays, and reusable React integration.
- [ ] Inspect OCR-Form-Tools for useful rendering and geometry patterns, without importing its full app, services, or DI parser.
- [ ] Prototype decoding for JPG/JPEG/JPE, PNG, BMP, HEIF, and HEIC in the agreed browsers.
- [ ] Decide whether a common image renderer needs a client-side decoder fallback, and review its bundle, memory, maintenance, and license costs.
- [ ] Record candidate versions, licensing, reuse decisions, and limitations. Identify local PDF worker/font/resource packaging requirements.

**Exit check:** the chosen rendering approach handles representative geometry and required formats. A custom PDF renderer requires a documented compelling reason. TIFF and DI do not gate this decision.

## 3. Build the Smallest End-to-End Slice

- [ ] Define a small public source-plus-result API without CU SDK or PDF.js-specific types.
- [ ] Implement internal CU JSON parsing, field derivation, page lookup, and source geometry handling from verified samples.
- [ ] Render a real multi-page PDF and its fields side by side.
- [ ] Hover/select a field on another page, navigate to it, and draw its source polygon.
- [ ] Demonstrate that zoom, pan, rotation, and resize preserve alignment.
- [ ] Validate the same field/source interaction with a real image sample.
- [ ] Handle absent confidence or grounding without hiding the extracted value or inventing a location.

**Exit check:** a saved real result works without credentials, service access, or caller normalization. Focused parsing/geometry tests and a browser check verify the thin slice before expanding it.

## 4. Complete P0

- [ ] Complete PDF and all required image format support through the common source-rendering boundary.
- [ ] Complete zoom, pan, fit mode(s), rotation, previous/next/jump navigation, and page counters.
- [ ] Finish analyzer-independent field/value/confidence presentation and cross-page source highlighting.
- [ ] Define loading, empty, invalid-result, missing-source, and source-rendering error states.
- [ ] Address renderer cancellation, source changes, object-URL cleanup, and resource disposal.
- [ ] Package runtime rendering assets for local use rather than relying on a required external CDN.
- [ ] Provide a client-side demo that loads a source and saved Analyze JSON; do not add analysis or authentication to it.
- [ ] Add focused parser/geometry unit tests and browser tests covering transformations, page changes, and field interactions.
- [ ] Record the tested browser matrix and representative result/file sizes; avoid claiming unverified coverage or performance.
- [ ] Document the implemented public API, dependencies, setup, build, and test commands only once they exist and are verified.

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
