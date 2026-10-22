# Copyright (c) Microsoft Corporation.
# Licensed under the MIT license.

"""Validate packaged assets without importing the server or browser launcher."""

from __future__ import annotations

import hashlib
from importlib.resources import files
from io import BytesIO
import json
from pathlib import Path
from zipfile import BadZipFile, ZipFile


def load_viewer_assets(root: Path | None = None) -> dict[str, bytes]:
    """Read a validated archive in memory; report invalid resources as ValueError."""
    resources = root if root is not None else files("cu_result_viewer").joinpath("resources").joinpath("viewer")
    try:
        manifest = json.loads(resources.joinpath("manifest.json").read_text(encoding="utf-8"))
        if (
            not isinstance(manifest, dict)
            or manifest.get("schemaVersion") != 2
            or not isinstance(manifest.get("files"), list)
        ):
            raise ValueError("Invalid viewer asset manifest.")
        archive_record = manifest.get("archive")
        if not isinstance(archive_record, dict) or archive_record.get("path") != "viewer.zip":
            raise ValueError("Invalid viewer archive record.")
        data = resources.joinpath("viewer.zip").read_bytes()
        if (
            type(archive_record.get("bytes")) is not int
            or len(data) != archive_record["bytes"]
            or hashlib.sha256(data).hexdigest() != archive_record.get("sha256")
        ):
            raise ValueError("Viewer archive integrity check failed.")
        entries = {}
        for entry in manifest["files"]:
            if not isinstance(entry, dict):
                raise ValueError("Invalid viewer asset entry.")
            name = entry.get("path")
            if not isinstance(name, str) or "\\" in name or any(
                not part or part in {".", ".."} or ":" in part for part in name.split("/")
            ):
                raise ValueError("Invalid viewer asset path.")
            if name in entries:
                raise ValueError("Duplicate viewer asset.")
            entries[name] = entry
        assets: dict[str, bytes] = {}
        with ZipFile(BytesIO(data)) as archive:
            if sorted(archive.namelist()) != sorted(entries):
                raise ValueError("Viewer archive contents do not match the manifest.")
            for info in archive.infolist():
                entry = entries[info.filename]
                if info.is_dir() or info.orig_filename != info.filename:
                    raise ValueError("Invalid viewer archive entry.")
                if type(entry.get("bytes")) is not int or info.file_size != entry["bytes"]:
                    raise ValueError(f"Viewer asset size check failed: {info.filename}")
                content = archive.read(info)
                if hashlib.sha256(content).hexdigest() != entry.get("sha256"):
                    raise ValueError(f"Viewer asset integrity check failed: {info.filename}")
                assets[info.filename] = content
        if "index.html" not in assets:
            raise ValueError("The viewer entry page is missing.")
        return assets
    except (OSError, ValueError, KeyError, TypeError, BadZipFile, RuntimeError, NotImplementedError) as exc:
        raise ValueError(f"Packaged viewer resources are unavailable: {exc}") from exc
