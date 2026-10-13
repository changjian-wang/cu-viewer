# Requirements

## Document Status

This document organizes the supplied task brief, "Reusable React Component for Content Understanding Field Extraction Result Viewer", while preserving its goals, component boundary, and priorities. Headings and repeated diagrams have been condensed. This is a requirements baseline, not a statement of implemented functionality.

The owner-provided requirement is the authoritative baseline. It explicitly includes P1 accessibility, keyboard interaction, touch interaction, responsive layout, automatic scrolling/centering, host customization/extensibility, and MCP Apps/MCP UI integration design/documentation. It does not state a separate mobile-app requirement. The supplied brief ends with the incomplete extensibility item `Result-pane`; its missing content is not inferred here.

On 2026-10-13 the owner additionally confirmed conditional Paragraphs, Tables and Code result views, Windows Narrator acceptance, and Vite 8 as the current supported bundler profile. These supplements are labeled separately rather than presented as text from the original brief.

The acceptance checks below are proposed ways to verify the brief. API details, library choices, browser targets, and implementation plans remain subject to validation.

**Scheduling update approved on 2026-10-12:** complete the independently runnable Viewer P0/P1 and its acceptance before the external cu-cli contract/integration. This changes execution order, not the original requirement priorities; CLI remains tracked but does not block Viewer development, startup or standalone acceptance. TIFF/DI remain separate P2. See the revised [development plan](dev-plan.md#milestones-and-sequencing).

## Objective and Reuse Scenarios

Create a reusable React/TypeScript component that displays CU field extraction results together with the original document or image. Users should be able to inspect extracted values and visually associate them with their locations in the source, using Content Understanding Studio as the primary UX and behavioral reference.

Intended reuse scenarios:

- **P0:** cu-cli as a local/client-side viewer for CU Analyze results.
- Regular React web applications.
- CU samples and tools.
- **P1:** chat applications.
- **P1:** MCP Apps / MCP UI surfaces.
- **P2:** Document Intelligence (DI) scenarios.

P0 must be production-quality enough to embed in cu-cli and other React applications. P2 must not delay P0 or P1.

## P0: Rendering-Only Boundary

The component's inputs are the original source PDF/image and serialized CU Analyze result JSON. It must not need to know how or when analysis was performed.

It must not:

- Call the CU Analyze API or contain CU service networking logic.
- Depend on a CU SDK, CU service client, or SDK model classes.
- Require Azure credentials or perform authentication.
- Create or manage analyzers.
- Poll long-running operations (LROs).
- Upload source files to CU.

The host owns analysis and any service access. The component owns rendering and result inspection.

## P0: Input Contract

The proposed contract from the brief is conceptual, not a finalized public API:

```ts
interface ViewerInput {
    source: File | Blob | ArrayBuffer | string;
    result: unknown;
}
```

`result` represents the original serialized CU Analyze JSON supplied as a JavaScript value. The exact API will be determined during implementation.

The component must support:

- JSON returned by cu-cli.
- Previously saved Analyze JSON.
- Source files selected in a browser.
- Source content supplied by a host application.

Callers must not be required to convert or normalize the result into a viewer-specific schema before invoking the component. Do not introduce a new public CU result schema. Do not expose internal viewer structures as public integration contracts unless necessary.

Internally, the viewer may derive field names, values, confidence, page information, bounding polygons/source regions, and nested relationships to simplify rendering. Those transformations are implementation details, not caller responsibilities.

## P0: cu-cli Integration

The first concrete host is cu-cli. The target workflow is `cu analyze sample.pdf --view`: the CLI performs analysis, then supplies the source and Analyze JSON to a local browser viewer.

The viewer runs as a client-side web application, for example on a local page served or launched by cu-cli. The exact hosting mechanism is outside the reusable component, but integration should require minimal host code.

Previously saved Analyze JSON must be viewable without another CU service call. The component must remain usable without cu-cli.

## P0: Supported Sources

Use the [Content Understanding Service Limits documentation](https://aka.ms/cu-doc/limits) as the source of truth. The supplied P0 file list is:

- `.pdf`
- `.jpg`, `.jpeg`, `.jpe`
- `.png`
- `.bmp`
- `.heif`, `.heic`

Prefer a common image-rendering abstraction instead of separate application logic for every image format. Verify format decoding against the chosen browser targets, particularly HEIF/HEIC.

TIFF, multi-page TIFF, and TIFF page navigation are P2.

## P0: Main UI and Fields

Provide two primary areas:

- Left: the source document/image.
- Right: CU extraction results.

At minimum, field presentation includes:

- Field name.
- Extracted value.
- Confidence when available.
- Source page/location where useful.

The panel must work from supplied CU JSON rather than a hard-coded analyzer schema. Follow Studio's field table/tree presentation where practical; richer structured/nested interaction is P1.

## P0: Field-to-Source Interaction

Hovering over or selecting a field highlights its corresponding source region using page and geometry information in the supplied Analyze JSON.

If the field is on another page, interaction navigates to that page/location. Highlight geometry must stay aligned during:

- Zoom.
- Pan.
- Rotation.
- Resize.
- Page navigation.

Use Studio as the reference for hover, selection, polygon presentation, and behavior when the source or grounding information is unavailable. Refined multiple-region, keyboard, touch, responsive-layout and automatic scrolling/centering behavior belongs to P1. The requirement does not separately specify a mobile application.

## P0: Viewer Controls

Provide:

- Zoom in and out.
- Pan.
- Fit-to-width and/or fit-to-page.
- Rotate.
- Previous and next page.
- Jump to a page.
- Current page and total pages.

Support multi-page PDF navigation. Follow Studio behavior where practical. Extend the same navigation to multi-page TIFF only in P2.

## P0: Architecture

Separate responsibilities for:

- Source rendering.
- CU Analyze JSON parsing.
- Field presentation.
- Geometry overlays.
- Viewer transformations.
- Page navigation.
- Interaction state.

Markdown and JSON tree rendering are additional P1 responsibilities.

The public API remains focused on source plus Analyze JSON. Do not expose unnecessary PDF.js-specific concepts or introduce CU SDK dependencies.

## P0: Required Investigation

### Studio

Review representative PDF and image field-extraction results in the current Content Understanding Studio. Use it as the primary reference for layout, field name/value/confidence presentation, hover, selection, field/source correlation, polygons, page navigation, field-location navigation, zoom, pan, rotation, fit modes, page counts, and missing source/grounding behavior.

Pixel-perfect reproduction is not required. Where behavior is ambiguous, current Studio behavior is the default reference.

### OSS and Data Model

Investigate these options before implementing document rendering, coordinate transforms, or overlays from scratch. Reuse suitable components or patterns where practical.

| Reference | Required evaluation |
| --- | --- |
| [Microsoft OCR-Form-Tools](https://github.com/microsoft/OCR-Form-Tools) | PDF and image rendering, bounding-region overlays, field/document interaction, page navigation, coordinate transformation. TIFF and historical Form Recognizer/DI implementation may inform P2. Use it as an implementation reference, not the main UX specification or an application architecture to inherit. |
| [react-pdf-highlighter](https://github.com/agentcooper/react-pdf-highlighter) | PDF rendering, highlight overlays, area highlights, navigation to highlights, React architecture. |
| [react-pdf-highlighter-extended](https://github.com/DanielArnould/react-pdf-highlighter-extended) | Zoom support, viewport-independent highlight coordinates, custom highlight rendering, React component architecture. |
| [PDF.js](https://github.com/mozilla/pdf.js) | Direct or indirect PDF rendering. Do not implement a custom PDF renderer without a compelling reason. |
| [CU Python samples](https://github.com/Azure-Samples/azure-ai-content-understanding-python) | Current CU API output as the data-model reference. |

Document evaluated options and reuse decisions in a PR or repository documentation. This baseline does not claim these evaluations have been completed.

## P1: Rich Result Pane

Provide three result representations: **Fields**, **Markdown**, and **JSON**.

### Markdown

Render Markdown available in the CU Analyze result, including headings, lists, tables, code blocks, and standard text formatting. Rendering must be client-side and safe, without CU SDK or service access.

### JSON Tree

Provide an interactive tree for the supplied Analyze JSON, supporting expand/collapse, objects, arrays, nested structures, and reasonably large results. Prefer a mature OSS JSON-tree component rather than building one from scratch. This view should be particularly useful in cu-cli.

### Owner-Confirmed Additional Result Views

The Viewer reads `apiVersion` from the original JSON and derives Studio-aligned tabs from actual non-empty values for the selected content. It supports guarded display mappings for `2025-11-01` GA and `2026-06-01-preview`; it does not expose a version selector or perform Analyze. The ordered known tabs are Fields, Markdown, Paragraphs, Tables, Figures, Signatures, Metadata, Result and Code. Unknown properties remain visible in Result rather than creating invented tabs.

These views supplement the original Fields/Markdown/JSON requirement:

- **Paragraphs**: when the selected content has non-empty `paragraphs`, render them in CU return order with optional role and page information. Mouse and keyboard selection navigate to and highlight every supplied source region.
- **Tables**: when the selected content has non-empty `tables`, render read-only native grids preserving header kinds, row/column positions and spans. Mouse and keyboard cell selection navigate to and highlight the cell source region.
- **Figures**: when the selected content has non-empty `figures`, crop thumbnails from the loaded source regions; show available kind, role, caption, description, footnotes and page information. Mouse and keyboard selection navigate to and highlight the source region.
- **Signatures**: when the selected content has non-empty `signatures`, crop source-region thumbnails and show available ID, role and page information. Mouse and keyboard selection navigate to and highlight the source region without inventing a signed/unsigned state.
- **Metadata**: when the selected content has a non-empty metadata object, render its returned string entries as a read-only key/value table in property order and allow copying individual values.
- **Result**: render the unchanged original Analyze JSON/envelope, including wrapper and usage keys. The root starts expanded and nested objects/arrays start collapsed.
- **Code**: when the original result contains analyzer ID and API version values, provide read-only Python, C# and JavaScript Analyze SDK samples with copy. Populate analyzer ID/API version from the result and use safe placeholders for endpoint, key and file URL. Never execute the sample or call Analyze from the Viewer.

Do not render disabled result-view placeholders. Recompute applicable tabs when content changes and preserve source page, zoom, rotation, pan and selected field/region across view switches.

## P1: Advanced UX and Extensibility

Add or improve:

- Structured/nested field UX.
- Arrays and tables.
- Multiple source regions.
- Accessibility and keyboard interaction.
- Touch interaction.
- Responsive layout.
- Automatic scrolling/centering.
- Host customization and extensibility.
- MCP App / MCP UI integration design and documentation, including use in chat hosts.

Extension points explicitly named in the brief:

- Field selection callbacks.
- Custom field rendering.
- Viewer events.
- Toolbar customization.
- Layout customization.
- Initial page.
- Initial zoom/fit mode.
- `Result-pane`: incomplete in the provided source; clarification is still required and no missing API will be invented.

The current supported build-host profile is Vite 8 with `viewerAssets()`. Other bundlers are unverified and are not part of current acceptance.

## P2: TIFF and DI

All functionality specifically related to these areas is P2:

- TIFF and multi-page TIFF.
- TIFF page navigation.
- DI scenarios, JSON parsing/compatibility, and DI-specific field structures.
- DI-specific geometry and coordinate handling.

Keep P2 separate so it does not delay P0 or P1.

## Proposed P0 Acceptance Checks

- Load a real paired source and saved Analyze JSON without Azure credentials, a CU SDK, or a new service call.
- Accept the original cu-cli JSON without host-side normalization; cover actual response wrappers and supported CU API versions using verified samples.
- Render PDF and every required image format across the agreed browser matrix; record missing format/sample coverage explicitly.
- Display analyzer-independent field names, values, and available confidence; handle absent optional data without fabricating it.
- Hover/select a field, navigate to its source page, and verify its polygon against the real document.
- Verify alignment after zoom, pan, 90-degree rotations, viewport resize, and repeated page changes.
- Verify previous/next/jump navigation, page counters, and fit controls on multi-page PDF.
- Verify useful behavior for fields without grounding, missing source data, empty results, malformed JSON, and unsupported/corrupt files.
- Embed the component in a demo and a cu-cli host path without putting host/service responsibilities into the component.
- Provide focused automated parsing/geometry tests and browser interaction tests, with accurate documentation of what has and has not been tested.

## Clarifications Before Implementation

- CU API version(s), exact cu-cli serialized output, and representative paired samples.
- Actual field grounding format, page numbering, units, dimensions, and orientation handling.
- Supported browsers and React versions; decoding strategy for HEIF/HEIC.
- Exact source input semantics, particularly string inputs and untyped binary inputs.
- Package distribution, licensing, and public-release policy.
- cu-cli repository ownership and local hosting/browser-launch mechanism.
- The missing end of the original `Result-pane` extensibility item.
