from __future__ import annotations

import hashlib
from io import BytesIO
import json
import os
from pathlib import Path
import subprocess
from zipfile import ZipFile

import pytest

from scripts.export_cli_viewer import export_viewer


@pytest.fixture
def export_inputs(tmp_path):
    source = tmp_path / "dist-cli"
    source.mkdir()
    content = {
        "index.html": b"<!doctype html><title>Viewer</title>",
        "assets/index.js": b"export const viewer = true;",
        "assets/pdfjs/build/pdf.worker.mjs": b"worker",
        "assets/heif/decoder.wasm": b"\x00asm",
    }
    for name, data in content.items():
        path = source / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    licenses = tmp_path / "licenses"
    licenses.mkdir()
    (licenses / "LICENSE").write_bytes(b"MIT")
    (licenses / "THIRD-PARTY-NOTICES.txt").write_bytes(b"Notices")
    destination = tmp_path / "package" / "resources" / "viewer"
    return source, destination, licenses


def snapshot(directory: Path) -> dict[str, bytes]:
    return {
        path.relative_to(directory).as_posix(): path.read_bytes()
        for path in directory.rglob("*") if path.is_file()
    }


def loose_export(source: Path, destination: Path, licenses: Path) -> None:
    content = snapshot(source) | {
        "LICENSE.txt": (licenses / "LICENSE").read_bytes(),
        "THIRD-PARTY-NOTICES.txt": (licenses / "THIRD-PARTY-NOTICES.txt").read_bytes(),
        "assets/old-chunk.js": b"previous version",
    }
    for name, data in content.items():
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    (destination / "manifest.json").write_text(json.dumps({
        "schemaVersion": 1,
        "files": [
            {"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
            for name, data in content.items()
        ],
    }), encoding="utf-8")


def test_deterministic_archive_ignores_input_times_and_permissions(export_inputs):
    source, destination, licenses = export_inputs
    export_viewer(source, destination, licenses)
    first = snapshot(destination)
    for path in source.rglob("*"):
        if path.is_file():
            os.utime(path, (1_700_000_000, 1_700_000_000))
            path.chmod(0o600)
    export_viewer(source, destination, licenses)
    assert snapshot(destination) == first
    assert set(first) == {"viewer.zip", "manifest.json"}
    manifest = json.loads(first["manifest.json"])
    assert manifest["schemaVersion"] == 2
    assert manifest["archive"]["sha256"] == hashlib.sha256(first["viewer.zip"]).hexdigest()
    with ZipFile(BytesIO(first["viewer.zip"])) as archive:
        assert archive.namelist() == sorted(archive.namelist())
        assert "assets/pdfjs/build/pdf.worker.mjs" in archive.namelist()
        assert archive.read("LICENSE.txt") == b"MIT"
        for entry in archive.infolist():
            assert entry.date_time == (1980, 1, 1, 0, 0, 0)
            assert (entry.external_attr >> 16) & 0o777 == 0o644
        for entry in manifest["files"]:
            data = archive.read(entry["path"])
            assert len(data) == entry["bytes"]
            assert hashlib.sha256(data).hexdigest() == entry["sha256"]


def test_migration_removes_only_verified_loose_files(export_inputs):
    source, destination, licenses = export_inputs
    loose_export(source, destination, licenses)
    export_viewer(source, destination, licenses)
    assert set(snapshot(destination)) == {"viewer.zip", "manifest.json"}
    assert not (destination / "assets").exists()
    assert destination.is_dir()
    assert (source / "assets/pdfjs/build/pdf.worker.mjs").read_bytes() == b"worker"


@pytest.mark.parametrize("change", ["modified", "missing", "unknown"])
def test_unsafe_migration_stops_before_writing_or_deleting(export_inputs, change):
    source, destination, licenses = export_inputs
    loose_export(source, destination, licenses)
    if change == "modified":
        (destination / "index.html").write_bytes(b"manual edit")
    elif change == "missing":
        (destination / "index.html").unlink()
    else:
        (destination / "manual.txt").write_bytes(b"keep me")
    before = snapshot(destination)
    with pytest.raises((ValueError, OSError)):
        export_viewer(source, destination, licenses)
    assert snapshot(destination) == before


def test_modified_archive_is_not_overwritten(export_inputs):
    source, destination, licenses = export_inputs
    export_viewer(source, destination, licenses)
    archive = destination / "viewer.zip"
    archive.write_bytes(archive.read_bytes() + b"manual edit")
    before = snapshot(destination)
    with pytest.raises(ValueError, match="modified"):
        export_viewer(source, destination, licenses)
    assert snapshot(destination) == before


def test_updated_build_replaces_only_the_owned_archive(export_inputs):
    source, destination, licenses = export_inputs
    export_viewer(source, destination, licenses)
    (source / "assets/index.js").write_bytes(b"updated")
    export_viewer(source, destination, licenses)
    with ZipFile(destination / "viewer.zip") as archive:
        assert archive.read("assets/index.js") == b"updated"
    assert set(snapshot(destination)) == {"viewer.zip", "manifest.json"}


def test_git_deliverable_files_include_the_pdf_worker_inside_the_archive(export_inputs, tmp_path):
    source, destination, licenses = export_inputs
    subprocess.run(["git", "init", "--quiet", str(tmp_path)], check=True)
    (tmp_path / ".gitignore").write_text("build/\n", encoding="utf-8")
    export_viewer(source, destination, licenses)
    output = subprocess.check_output([
        "git", "-C", str(tmp_path), "ls-files", "--others", "--exclude-standard", "-z",
        "--", destination.relative_to(tmp_path).as_posix(),
    ]).decode("utf-8")
    deliverable = set(output.rstrip("\0").split("\0"))
    assert deliverable == {
        (destination / name).relative_to(tmp_path).as_posix()
        for name in ("viewer.zip", "manifest.json")
    }
    with ZipFile(destination / "viewer.zip") as archive:
        assert archive.read("assets/pdfjs/build/pdf.worker.mjs") == b"worker"


@pytest.mark.parametrize("name", ["../outside.txt", "/absolute", "assets\\outside", "assets/../x"])
def test_invalid_old_manifest_paths_preserve_all_files(export_inputs, name):
    source, destination, licenses = export_inputs
    destination.mkdir(parents=True)
    (destination / "manifest.json").write_text(json.dumps({
        "schemaVersion": 1, "files": [{"path": name}],
    }), encoding="utf-8")
    before = snapshot(destination)
    with pytest.raises(ValueError, match="path"):
        export_viewer(source, destination, licenses)
    assert snapshot(destination) == before
