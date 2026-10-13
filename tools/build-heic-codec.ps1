$ErrorActionPreference = "Stop"

$repository = Split-Path -Parent $PSScriptRoot
$crate = Join-Path $repository "codecs\heic-rs-wasm"
$wasm = Join-Path $crate "target\wasm32-unknown-unknown\release\cu_viewer_heic_decoder.wasm"
$output = Join-Path $repository "assets\heif"

$version = (& wasm-bindgen --version) -join ""
if ($version -ne "wasm-bindgen 0.2.129") {
    throw "Expected wasm-bindgen 0.2.129, found: $version"
}

Push-Location $crate
try {
    cargo build --locked --release --target wasm32-unknown-unknown
    if ($LASTEXITCODE -ne 0) {
        throw "HEIC decoder Cargo build failed."
    }
} finally {
    Pop-Location
}

New-Item -ItemType Directory -Path $output -Force | Out-Null
& wasm-bindgen --target no-modules --remove-name-section --remove-producers-section `
    --out-name heic_decoder --out-dir $output $wasm
if ($LASTEXITCODE -ne 0) {
    throw "HEIC decoder binding generation failed."
}

Remove-Item -LiteralPath (Join-Path $output "heic_decoder.d.ts") -Force
Remove-Item -LiteralPath (Join-Path $output "heic_decoder_bg.wasm.d.ts") -Force
$expected = @{
    "heic_decoder.js" = "37E9954F836E53CF877418A4AD419FA82F6187ADE49E047543B10FE80340FBEC"
    "heic_decoder_bg.wasm" = "354AB3F20C1D11FF26F83F8C427BA32C2233F183151B579EA416B8B2FEF39C52"
}
foreach ($name in $expected.Keys) {
    $actual = (Get-FileHash -Algorithm SHA256 (Join-Path $output $name)).Hash
    if ($actual -ne $expected[$name]) {
        throw "$name hash $actual does not match the reviewed build $($expected[$name])."
    }
    Write-Output "$name $actual"
}
