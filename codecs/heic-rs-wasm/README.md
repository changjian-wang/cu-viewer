# HEIC decoder source and prebuilt resources

This retained wrapper records the source used for the reviewed `heic-rs 0.1.4`
decoder and pins `wasm-bindgen 0.2.129`. Production uses the checked-in
[JavaScript/WASM resources, licenses and SBOM](../../assets/heif); normal Viewer,
npm and Release builds do not need Rust or PowerShell.

The optional rebuild script, npm entry and scheduled/manual CI reproduction
job have been retired. Source and `Cargo.lock` remain for provenance; there is
no automatic decoder rebuild during development, testing or packaging.

The historical reviewed build used Rust `1.94.1`. Future decoder changes require
a separately reviewed source/resource update, license/SBOM review and browser
regressions. Existing bundle checks still enforce the reviewed resource hashes,
and image-format tests exercise real decoding, CSP, failures and cleanup.
Do not silently regenerate assets or relax those checks to accept a new binary.
