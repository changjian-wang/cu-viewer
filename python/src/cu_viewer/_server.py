# Copyright (c) Microsoft Corporation.
# Licensed under the MIT license.

"""Serve one read-only source/result pair on a session-scoped loopback origin."""

from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import shutil
import sys
from typing import Any
from urllib.parse import quote, unquote, urlsplit


def _status(message: str) -> None:
    print(message, file=sys.stderr, flush=True)

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
