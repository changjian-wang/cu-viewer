# HEIC decoder build

This wrapper pins `heic-rs 0.1.4` and `wasm-bindgen 0.2.129`. The checked-in browser assets let normal npm consumers build without Rust.

Rebuild from the repository root on an approved toolchain:

```powershell
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.129 --locked
.\tools\build-heic-codec.ps1
```

The verified build used Rust `1.94.1`. The script uses `Cargo.lock`, regenerates the classic-worker bindings in `assets\heif`, and prints the resulting SHA-256 hashes. Review generated diffs, licenses and the browser matrix before accepting an update.
