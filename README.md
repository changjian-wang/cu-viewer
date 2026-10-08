# cu-result-viewer

A reusable React/TypeScript component for inspecting Azure Content Understanding (CU) field extraction results alongside the original PDF or image.

## Status

**Planning only.** This repository currently contains project documentation. No viewer implementation, published package, runnable demo, or cu-cli integration has been delivered yet. Features below describe the intended scope, not existing capabilities.

The repository is private. Public release, licensing, supported React versions, and implementation dependencies remain to be decided.

## Objective

Provide a result-inspection workflow familiar to Content Understanding Studio users: display the source document next to extracted fields, and correlate field hover or selection with the corresponding source region.

The main deliverable is a reusable, rendering-only client-side component. It must accept the source and the original serialized CU Analyze result without asking callers to normalize the result or construct CU SDK model instances.

Conceptual usage, not an implemented or finalized API:

```tsx
<ContentUnderstandingResultViewer
    source={sourceFile}
    result={analyzeResultJson}
/>
```

The proposed source input is `File | Blob | ArrayBuffer | string`, and the result input is `unknown` containing parsed, serialized CU Analyze JSON. The precise TypeScript API and the meaning of string source inputs will be finalized during implementation.

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

Content Understanding Studio is the behavioral reference named in the task brief; the exact current Studio entry point and behavior must be verified during investigation. The goal is a familiar inspection workflow, not pixel-perfect reproduction.

[OCR-Form-Tools](https://github.com/microsoft/OCR-Form-Tools) is an implementation reference for rendering, overlays, page navigation, and coordinate transformation. This project is not a fork of that application and should not automatically inherit its Redux, Electron, service integrations, or older application architecture.

PDF.js and the two react-pdf-highlighter projects are candidates to evaluate, not selected dependencies. Use the current CU API output and [CU samples](https://github.com/Azure-Samples/azure-ai-content-understanding-python) as the data-model reference.

## Project Documents

- [Requirements](docs/requirements.md): the supplied brief organized by priority, with proposed acceptance checks and clarification items.
- [Roadmap](docs/roadmap.md): implementation order, investigation checkpoints, and release gates.
- [Development plan](docs/dev-plan.md): proposed architecture, phased implementation tasks, dependencies, acceptance-to-test mapping, and host integration gates.
- [Development plan (Simplified Chinese)](docs/dev-plan.zh-CN.md): a Chinese translation with the same task identifiers, dependencies, and technical contracts.

## Samples and Verification

Use real, paired source documents and matching sanitized CU results for normal demonstrations and integration tests. Synthetic data may supplement negative and boundary tests, but must not be presented as a real service result.

Do not commit credentials, SAS tokens, customer-sensitive documents, or unsanitized Analyze results. Document specific sample gaps before claiming coverage.

Build, installation, and test commands will be added when implementation and tooling exist. No runtime or test results are claimed at this stage.
