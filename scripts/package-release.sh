#!/usr/bin/env bash
set -Eeuo pipefail
export LC_ALL=C TZ=UTC
unset ZIPOPT UNZIP UNZIPOPT ZIPINFO ZIPINFOOPT

fail() { printf 'error: %s\n' "$*" >&2; exit 1; }
trap 'printf "error: Viewer Release export failed at line %s.\n" "$LINENO" >&2' ERR

(( BASH_VERSINFO[0] >= 4 )) || fail "Viewer export requires Bash 4 or newer."
for tool in zip unzip jq sha256sum find sort touch mktemp cp mv chmod realpath mkdir rm cmp wc dirname head; do
    command -v "$tool" >/dev/null || fail "Missing required tool: $tool"
done

jq() {
    if [[ $OSTYPE == msys* || $OSTYPE == cygwin* ]]; then
        command jq -b "$@" # Native Windows jq must not insert CRLF into hashes or manifests.
    else
        command jq "$@"
    fi
}

repository=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
source=$repository/dist-app
destination=$repository/dist-viewer
license_root=$repository
version=
explicit_version=false
while (( $# )); do
    case $1 in
        --source|--destination|--license-root|--viewer-version)
            (( $# >= 2 )) || fail "Missing value for $1."
            case $1 in
                --source) source=$2 ;;
                --destination) destination=$2 ;;
                --license-root) license_root=$2 ;;
                --viewer-version) version=$2; explicit_version=true ;;
            esac
            shift 2 ;;
        --help|-h)
            printf 'Usage: bash scripts/package-release.sh [--viewer-version VERSION] [--source DIR] [--destination DIR] [--license-root DIR]\n'
            exit 0 ;;
        *) fail "Unknown argument: $1" ;;
    esac
done

plain_path() {
    local current=$1
    while :; do
        [[ ! -L $current ]] || fail "Viewer export does not follow symbolic links or reparse points."
        [[ $current != / && $current != . ]] || break
        current=${current%/*}
        [[ -n $current ]] || current=/
    done
}

absolute_path() {
    local path=$1
    if [[ $OSTYPE == msys* || $OSTYPE == cygwin* ]]; then
        path=$(cygpath -au -- "$path")
    fi
    realpath -ms -- "$path"
}

resource_path() {
    local root=$1 name=$2 part
    [[ $name =~ ^[a-zA-Z0-9_.-]+(/[a-zA-Z0-9_.-]+)*$ ]] ||
        fail "Invalid generated viewer resource path."
    local -a parts
    IFS=/ read -r -a parts <<< "$name"
    for part in "${parts[@]}"; do
        [[ $part != . && $part != .. ]] || fail "Invalid generated viewer resource path."
    done
    plain_path "$root/$name"
}

list_resources() {
    local root=$1 listing=$2 name
    find "$root" -mindepth 1 -printf '%P\0' | sort -z > "$listing.all"
    : > "$listing"
    while IFS= read -r -d '' name; do
        resource_path "$root" "$name"
        if [[ -f $root/$name ]]; then
            printf '%s\n' "$name" >> "$listing"
        elif [[ ! -d $root/$name ]]; then
            fail "Unexpected viewer resource: $name"
        fi
    done < "$listing.all"
}

hash_file() {
    local digest
    digest=$(sha256sum < "$1")
    printf '%s' "${digest%% *}"
}

check_record() {
    local path=$1 bytes=$2 digest=$3
    [[ -f $path ]] || fail "Generated resource is missing: $path"
    [[ $(wc -c < "$path") == "$bytes" && $(hash_file "$path") == "$digest" ]] ||
        fail "Generated resource was modified: $path"
}

source=$(absolute_path "$source")
destination=$(absolute_path "$destination")
license_root=$(absolute_path "$license_root")
source_key=$source
destination_key=$destination
if [[ $OSTYPE == msys* || $OSTYPE == cygwin* ]]; then
    source_key=${source_key,,}
    destination_key=${destination_key,,}
fi
[[ $source_key != "$destination_key" && $source_key != "$destination_key/"* &&
    $destination_key != "$source_key/"* ]] ||
    fail "The Viewer build and Release directories must not overlap."
for directory in "$source" "$destination" "$license_root"; do plain_path "$directory"; done
[[ -f $source/index.html ]] || fail "Build the production Viewer page before exporting it."
if ! $explicit_version; then
    resource_path "$license_root" package.json
    version=$(jq -er '.version | select(type == "string") |
        select(explode | all(. > 32 and . < 127))' "$license_root/package.json") ||
        fail "The Viewer version must be a valid semantic version without a v prefix."
fi
number='(0|[1-9][0-9]*)'
identifier="($number|[0-9]*[A-Za-z-][0-9A-Za-z-]*)"
version_pattern="^$number\\.$number\\.$number(-$identifier(\\.$identifier)*)?(\\+[0-9A-Za-z-]+(\\.[0-9A-Za-z-]+)*)?$"
[[ ${#version} -le 128 && $version =~ $version_pattern ]] ||
    fail "The Viewer version must be a valid semantic version without a v prefix."

workspace=$(mktemp -d "${TMPDIR:-/tmp}/cu-viewer-export.XXXXXXXX")
archive_temporary=
manifest_temporary=
cleanup() {
    [[ -z $archive_temporary ]] || rm -f -- "$archive_temporary"
    [[ -z $manifest_temporary ]] || rm -f -- "$manifest_temporary"
    rm -rf -- "$workspace"
}
trap cleanup EXIT
list_resources "$source" "$workspace/source.paths"
mapfile -t names < "$workspace/source.paths"
declare -A present=()
for name in "${names[@]}"; do present["$name"]=1; done
(( ${#names[@]} <= 4096 )) || fail "The Viewer build exceeds its resource count limit."
for name in index.html assets/pdfjs/LICENSE assets/pdfjs/build/pdf.worker.mjs \
    assets/markdown/markdown.worker.js \
    assets/heif/heif.worker.js assets/heif/heic_decoder.js \
    assets/heif/heic_decoder_bg.wasm assets/heif/SBOM.json; do
    [[ ${present[$name]:-} ]] || fail "The Viewer build is incomplete: $name"
done
for prefix in assets/MarkdownPane- assets/JsonPane- assets/index- \
    assets/pdfjs/standard_fonts/ assets/pdfjs/cmaps/ assets/pdfjs/wasm/ assets/pdfjs/iccs/; do
    found=false
    for name in "${names[@]}"; do
        if [[ $name == "$prefix"* ]]; then found=true; break; fi
    done
    $found || fail "The Viewer build is incomplete: $prefix"
done
[[ ! ${present[viewer.zip]:-} && ! ${present[manifest.json]:-} ]] ||
    fail "The viewer build contains a reserved export filename."
for name in LICENSE THIRD-PARTY-NOTICES.txt; do
    resource_path "$license_root" "$name"
    [[ -f $license_root/$name ]] || fail "Missing Viewer license: $name"
done

if [[ -f $destination/manifest.json ]]; then
    manifest=$destination/manifest.json
    [[ $(wc -c < "$manifest") -le 1048576 ]] || fail "The existing Viewer manifest exceeds its size limit."
    jq -e 'type == "object" and (.files | type == "array") and
        all(.files[]; type == "object" and (.path | type == "string"))' "$manifest" >/dev/null ||
        fail "The existing viewer resource manifest is invalid."
    jq -j '.files[] | .path, "\u0000"' "$manifest" > "$workspace/previous.names"
    while IFS= read -r -d '' name; do
        resource_path "$destination" "$name"
        [[ $name != viewer.zip && $name != manifest.json ]] || fail "Reserved viewer resource path."
    done < "$workspace/previous.names"
    jq -e '.schemaVersion == 2 and
        (.archive | type == "object") and .archive.path == "viewer.zip" and
        (.archive.bytes | type == "number" and . > 0 and . <= 33554432 and floor == .) and
        (.archive.sha256 | type == "string" and test("^[0-9a-f]{64}$")) and
        (.files | length > 0 and length <= 4096) and
        (.files | group_by(.path) | all(.[]; length == 1)) and
        ([.files[].bytes] | add <= 134217728) and
        all(.files[]; (.bytes | type == "number" and . >= 0 and . <= 134217728 and floor == .) and
            (.sha256 | type == "string" and test("^[0-9a-f]{64}$")))' "$manifest" >/dev/null ||
        fail "The existing viewer resource manifest is invalid or unsupported."
    IFS=$'\t' read -r bytes digest < <(jq -r '.archive | [.bytes, .sha256] | @tsv' "$manifest")
    check_record "$destination/viewer.zip" "$bytes" "$digest"
    unzip -Z -1 "$destination/viewer.zip" > "$workspace/previous.actual"
    while IFS= read -r name; do resource_path "$destination" "$name"; done < "$workspace/previous.actual"
    sort "$workspace/previous.actual" > "$workspace/previous.sorted"
    jq -r '.files[].path' "$manifest" | sort > "$workspace/previous.expected"
    cmp -s "$workspace/previous.sorted" "$workspace/previous.expected" ||
        fail "Viewer archive contents do not match the manifest."
    jq -r '.files[] | [.path, .bytes, .sha256] | @tsv' "$manifest" > "$workspace/previous.records"
    while IFS=$'\t' read -r name bytes digest; do
        pattern=$name
        [[ $pattern != -* ]] || pattern="[-]${pattern:1}"
        unzip -p "$destination/viewer.zip" "$pattern" | head -c "$((bytes + 1))" > "$workspace/previous.entry"
        check_record "$workspace/previous.entry" "$bytes" "$digest"
    done < "$workspace/previous.records"
elif [[ -e $destination/manifest.json ]]; then
    fail "The Viewer manifest is not a regular file."
fi
if [[ -d $destination ]]; then
    list_resources "$destination" "$workspace/existing.paths"
    while IFS= read -r name; do
        [[ $name == manifest.json || ( $name == viewer.zip && -f $destination/manifest.json ) ]] ||
            fail "Refusing to overwrite unknown resources: $name"
    done < "$workspace/existing.paths"
elif [[ -e $destination ]]; then
    fail "The Viewer Release destination is not a directory."
fi

mkdir -- "$workspace/payload"
(cd -- "$source" && cp --parents -- "${names[@]}" "$workspace/payload")
cp -- "$license_root/LICENSE" "$workspace/payload/LICENSE.txt"
cp -- "$license_root/THIRD-PARTY-NOTICES.txt" "$workspace/payload/THIRD-PARTY-NOTICES.txt"
list_resources "$workspace/payload" "$workspace/payload.paths"
find "$workspace/payload" -type f -exec chmod 0644 {} +
find "$workspace/payload" -type f -exec touch -t 198001010000.00 {} +
count=0
expanded=0
: > "$workspace/records.jsonl"
while IFS= read -r name; do
    bytes=$(wc -c < "$workspace/payload/$name")
    expanded=$((expanded + bytes))
    count=$((count + 1))
    (( expanded <= 134217728 && count <= 4096 )) || fail "The Viewer build exceeds its resource size/count limit."
    printf '{"path":"%s","bytes":%s,"sha256":"%s"}\n' \
        "$name" "$bytes" "$(hash_file "$workspace/payload/$name")" >> "$workspace/records.jsonl"
done < "$workspace/payload.paths"
(cd -- "$workspace/payload" && zip -X -9 -q "$workspace/viewer.zip" -@ < "$workspace/payload.paths")
bytes=$(wc -c < "$workspace/viewer.zip")
(( bytes <= 33554432 )) || fail "The Viewer archive exceeds its size limit."
jq -n --arg version "$version" --arg digest "$(hash_file "$workspace/viewer.zip")" \
    --argjson bytes "$bytes" --slurpfile files "$workspace/records.jsonl" \
    '{schemaVersion: 2, viewerVersion: $version, protocolVersion: 1,
      archive: {path: "viewer.zip", bytes: $bytes, sha256: $digest}, files: $files}' > "$workspace/manifest.json"
[[ $(wc -c < "$workspace/manifest.json") -le 1048576 ]] || fail "The Viewer manifest exceeds its size limit."
plain_path "$destination"
mkdir -p -- "$destination"
archive_temporary=$(mktemp "$destination/.viewer.zip.XXXXXXXX")
manifest_temporary=$(mktemp "$destination/.manifest.json.XXXXXXXX")
cp -- "$workspace/viewer.zip" "$archive_temporary"
cp -- "$workspace/manifest.json" "$manifest_temporary"
plain_path "$destination/viewer.zip"
plain_path "$destination/manifest.json"
mv -f -- "$archive_temporary" "$destination/viewer.zip"
archive_temporary=
mv -f -- "$manifest_temporary" "$destination/manifest.json"
manifest_temporary=
printf 'Exported %s viewer resources as viewer.zip and manifest.json.\n' "$count"
