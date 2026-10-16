# Copyright (c) Microsoft Corporation.
# Licensed under the MIT license.

"""Serve one read-only source/result pair using the packaged browser viewer."""

from __future__ import annotations

import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.resources import files
from io import BytesIO
import json
import os
from pathlib import Path
import secrets
import shutil
import sys
import threading
from typing import Any
from urllib.parse import quote, unquote, urlsplit
import webbrowser
from zipfile import BadZipFile, ZipFile


class ViewerError(Exception):
    """The installed Viewer cannot prepare or serve a session."""


class ViewerInputError(ViewerError):
    """The supplied local source or saved result is invalid."""


def _status(message: str) -> None:
    print(message, file=sys.stderr, flush=True)

_SOURCE_SUFFIXES = {".pdf", ".jpg", ".jpeg", ".jpe", ".png", ".bmp", ".heif", ".heic"}
_CSP = (
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; "
    "style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; "
    "connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
)
_MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".wasm": "application/wasm",
    ".txt": "text/plain; charset=utf-8",
}


def prepare_source(source: Path) -> Path:
    """Validate local input before any billable analysis or browser startup."""
    try:
        resolved = source.resolve(strict=True)
        if not resolved.is_file() or resolved.suffix.lower() not in _SOURCE_SUFFIXES:
            raise ValueError("--view requires one local PDF or supported image file.")
        with resolved.open("rb") as stream:
            if not stream.read(1):
                raise ValueError("The source file is empty.")
        return resolved
    except (OSError, ValueError) as exc:
        raise ViewerInputError(str(exc)) from exc


def _reject_constant(value: str) -> None:
    raise ValueError(f"Non-JSON constant {value} is not supported.")


def read_saved_result(result_path: Path) -> Any:
    try:
        return json.loads(
            result_path.read_text(encoding="utf-8-sig"),
            parse_constant=_reject_constant,
        )
    except (OSError, UnicodeError, ValueError) as exc:
        raise ViewerInputError(f"Saved result could not be read: {exc}") from exc


def load_viewer_assets(root: Path | None = None) -> dict[str, bytes]:
    """Validate and read packaged assets in memory without extracting files."""
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
        raise ViewerError(
            f"Packaged viewer resources are unavailable: {exc}",
        ) from exc


class _ViewerServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(
        self, source: Path, result: Any, assets: dict[str, bytes],
    ) -> None:
        self.source = source
        self.assets = assets
        self.token = secrets.token_urlsafe(32)
        self.source_route = f"source/{source.name}"
        self.session = json.dumps(
            {
                "source": f"./source/{quote(source.name, safe='')}",
                "name": source.name,
                "result": result,
            },
            allow_nan=False,
        ).encode("utf-8")
        super().__init__(("127.0.0.1", 0), _ViewerHandler)
        self.origin = f"http://127.0.0.1:{self.server_port}"
        self.url = f"{self.origin}/{self.token}/"


class _ViewerHandler(BaseHTTPRequestHandler):
    server: _ViewerServer

    def log_message(self, format: str, *args: Any) -> None:
        # Do not put the session capability or document names in HTTP logs.
        return

    def _headers(self, status: int, mime: str, length: int) -> None:
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(length))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", _CSP)
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()

    def _send(self, status: int, data: bytes, mime: str = "text/plain; charset=utf-8") -> None:
        self._headers(status, mime, len(data))
        if self.command != "HEAD":
            self.wfile.write(data)

    def _read(self) -> None:
        hosts = self.headers.get_all("Host", [])
        origins = self.headers.get_all("Origin", [])
        if (
            hosts != [urlsplit(self.server.origin).netloc]
            or (origins and origins != [self.server.origin])
            or self.headers.get("Sec-Fetch-Site") == "cross-site"
        ):
            self._send(403, b"Only this local viewer origin may access the session.")
            return
        parts = urlsplit(self.path).path.split("/", 2)
        if len(parts) != 3 or not secrets.compare_digest(
            parts[1].encode("utf-8"), self.server.token.encode("ascii"),
        ):
            self._send(404, b"Unknown viewer session.")
            return
        name = unquote(parts[2])
        if name == "session.json":
            self._send(200, self.server.session, "application/json")
            return
        if name == self.server.source_route:
            try:
                stream = self.server.source.open("rb")
            except OSError as exc:
                _status(f"Viewer source could not be read: {exc}")
                self._send(500, b"The selected source could not be read.")
                return
            with stream:
                self._headers(200, "application/octet-stream", os.fstat(stream.fileno()).st_size)
                if self.command != "HEAD":
                    shutil.copyfileobj(stream, self.wfile)
            return
        resource = self.server.assets.get(name or "index.html")
        if resource is None:
            self._send(404, b"Unknown viewer resource.")
            return
        self._send(200, resource, _MIME.get(Path(name or "index.html").suffix, "application/octet-stream"))

    def do_GET(self) -> None:
        try:
            self._read()
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True
        except OSError as exc:
            _status(f"Viewer response failed: {exc}")
            self.close_connection = True

    def do_HEAD(self) -> None:
        self.do_GET()

    def do_POST(self) -> None:
        self._send(405, b"The viewer is read-only.")

    def do_OPTIONS(self) -> None:
        self._send(405, b"The viewer does not allow cross-origin access.")


def serve_viewer(
    source: Path, result: Any, *, assets: dict[str, bytes],
) -> None:
    """Keep the local server in the foreground until the user presses Ctrl+C."""
    with _ViewerServer(source, result, assets) as server:
        thread = threading.Thread(target=server.serve_forever, name="cu-viewer", daemon=True)
        thread.start()
        try:
            _status(f"Viewer: {server.url}")
            _status("Press Ctrl+C to stop the viewer.")
            try:
                opened = webbrowser.open(server.url)
            except (webbrowser.Error, OSError) as exc:
                _status(f"Browser could not be opened: {exc}")
                opened = False
            if not opened:
                _status("Open the Viewer URL above in your browser.")
            while thread.is_alive():
                thread.join(0.2)
            raise ViewerError("The viewer server stopped unexpectedly.")
        except KeyboardInterrupt:
            _status("Viewer stopped.")
        finally:
            server.shutdown()
            thread.join()
