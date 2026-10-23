"""Export deterministic, self-contained browser resources for the Python CLI."""

from __future__ import annotations

import argparse
import hashlib
from io import BytesIO
import json
import os
from pathlib import Path
import re
import stat
from tempfile import NamedTemporaryFile
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED


def checked_path(root: Path, name: str) -> Path:
    if not isinstance(name, str) or any(
        re.fullmatch(r"[a-zA-Z0-9_.-]+", part) is None or part in {".", ".."}
        for part in name.split("/")
    ):
        raise ValueError("Invalid generated viewer resource path.")
    target = root
    for part in ("", *name.split("/")):
        target /= part
        if target.is_symlink():
            raise ValueError("Viewer export does not follow symbolic links.")
    return target


def collect(root: Path) -> dict[str, bytes]:
    content = {}
    for path in root.rglob("*"):
        name = path.relative_to(root).as_posix()
        checked_path(root, name)
        if path.is_file():
            content[name] = path.read_bytes()
        elif not path.is_dir():
            raise ValueError(f"Unexpected viewer resource: {name}")
    return content


def digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def verify(content: bytes, record: dict) -> None:
    if (
        type(record.get("bytes")) is not int
        or len(content) != record["bytes"]
        or digest(content) != record.get("sha256")
    ):
        raise ValueError(f"Generated resource was modified: {record.get('path')}")


def records(manifest: dict, root: Path) -> dict[str, dict]:
    entries = manifest.get("files")
    if not isinstance(entries, list):
        raise ValueError("The existing viewer resource manifest is invalid.")
    result = {}
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValueError("Invalid viewer resource entry.")
        name = entry.get("path")
        if not isinstance(name, str):
            raise ValueError("Invalid generated viewer resource path.")
        checked_path(root, name)
        if name in result or name in {"viewer.zip", "manifest.json"}:
            raise ValueError("Duplicate or reserved viewer resource path.")
        result[name] = entry
    return result


def previous_files(destination: Path) -> dict[str, dict]:
    manifest_path = checked_path(destination, "manifest.json")
    if not manifest_path.exists():
        return {}
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict):
        raise ValueError("The existing viewer resource manifest is invalid.")
    entries = records(manifest, destination)
    if manifest.get("schemaVersion") == 1:
        for name, record in entries.items():
            verify(checked_path(destination, name).read_bytes(), record)
        return entries
    archive_record = manifest.get("archive")
    if (
        manifest.get("schemaVersion") != 2
        or not isinstance(archive_record, dict)
        or archive_record.get("path") != "viewer.zip"
    ):
        raise ValueError("Unsupported viewer resource manifest.")
    data = checked_path(destination, "viewer.zip").read_bytes()
    verify(data, archive_record)
    with ZipFile(BytesIO(data)) as archive:
        if sorted(archive.namelist()) != sorted(entries):
            raise ValueError("Viewer archive contents do not match the manifest.")
        for name, record in entries.items():
            verify(archive.read(name), record)
    return {"viewer.zip": archive_record}


def replace_file(path: Path, content: bytes) -> None:
    with NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.", delete=False) as stream:
        temporary = Path(stream.name)
        try:
            stream.write(content)
            stream.close()
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)


def export_viewer(source: Path, destination: Path, license_root: Path) -> None:
    if destination.name != "viewer" or destination.parent.name != "resources":
        raise ValueError("The export destination must be a resources\\viewer directory.")
    for directory in (source, destination, license_root):
        if any(parent.is_symlink() for parent in (directory, *directory.parents)):
            raise ValueError("Viewer export does not follow symbolic links.")
    if not (source / "index.html").is_file():
        raise ValueError("Build the CLI page before exporting it.")
    content = collect(source)
    content["LICENSE.txt"] = (license_root / "LICENSE").read_bytes()
    content["THIRD-PARTY-NOTICES.txt"] = (license_root / "THIRD-PARTY-NOTICES.txt").read_bytes()
    if {"viewer.zip", "manifest.json"} & content.keys():
        raise ValueError("The viewer build contains a reserved export filename.")
    old_files = previous_files(destination)
    actual_files = collect(destination) if destination.exists() else {}
    unknown = actual_files.keys() - old_files.keys() - (
        {"manifest.json"} if "manifest.json" in actual_files else set()
    )
    if unknown:
        raise ValueError(f"Refusing to overwrite unknown resources: {', '.join(sorted(unknown))}")

    buffer = BytesIO()
    with ZipFile(buffer, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(content.items()):
            checked_path(destination, name)
            entry = ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = (stat.S_IFREG | 0o644) << 16
            archive.writestr(entry, data, compress_type=ZIP_DEFLATED, compresslevel=9)
    archive_bytes = buffer.getvalue()
    manifest = {
        "schemaVersion": 2,
        "archive": {"path": "viewer.zip", "bytes": len(archive_bytes), "sha256": digest(archive_bytes)},
        "files": [
            {"path": name, "bytes": len(data), "sha256": digest(data)}
            for name, data in sorted(content.items())
        ],
    }
    destination.mkdir(parents=True, exist_ok=True)
    replace_file(checked_path(destination, "viewer.zip"), archive_bytes)
    replace_file(
        checked_path(destination, "manifest.json"),
        (json.dumps(manifest, indent=2) + "\n").encode("utf-8"),
    )
    loose_files = {name: record for name, record in old_files.items() if name != "viewer.zip"}
    for name, record in loose_files.items():
        verify(checked_path(destination, name).read_bytes(), record)
    directories: set[Path] = set()
    for name in loose_files:
        target = checked_path(destination, name)
        target.unlink()
        directories.update(parent for parent in target.parents if parent.is_relative_to(destination))
    for directory in sorted(directories - {destination}, key=lambda item: len(item.parts), reverse=True):
        if not any(directory.iterdir()):
            directory.rmdir()
    print(f"Exported {len(content)} viewer resources as viewer.zip and manifest.json.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    root = Path(__file__).resolve().parents[1]
    parser.add_argument(
        "destination", type=Path, nargs="?",
        default=root / "python" / "src" / "cu_viewer" / "resources" / "viewer",
    )
    arguments = parser.parse_args()
    export_viewer(root / "dist-cli", arguments.destination.absolute(), root)


if __name__ == "__main__":
    main()
