# Copyright (c) Microsoft Corporation.
# Licensed under the MIT license.

from __future__ import annotations

import hashlib
import http.client
from contextlib import closing, nullcontext
from io import BytesIO
import json
import socket
import threading
from urllib.parse import quote, urlsplit
import webbrowser
from zipfile import ZipFile

import pytest

from cu_result_viewer import _assets as assets
from cu_result_viewer import _runtime as viewer
from cu_result_viewer import _server as server_module


@pytest.fixture
def local_resources(tmp_path):
    source = tmp_path / "source with space.pdf"
    source.write_bytes(b"%PDF-1.7\noriginal bytes")
    return source, {
        "index.html": b"<!doctype html><title>Viewer</title>",
        "assets/decoder.wasm": b"\x00asm",
    }


@pytest.fixture
def server(local_resources):
    source, assets = local_resources
    payload = {"result": {"extra": [0, False, None], "contents": []}}
    with server_module._ViewerServer(source, payload, assets) as running:
        thread = threading.Thread(target=running.serve_forever, daemon=True)
        thread.start()
        try:
            yield running, payload
        finally:
            running.shutdown()
            thread.join()


def request(server, path="", method="GET", headers=None):
    with closing(http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=5)) as connection:
        connection.request(method, f"/{server.token}/{quote(path, safe='/%:')}", headers=headers or {})
        response = connection.getresponse()
        return response.status, dict(response.getheaders()), response.read()


def test_session_preserves_original_data_and_source(server):
    running, payload = server
    status, headers, body = request(running, "session.json")
    assert status == 200
    session = json.loads(body)
    assert session["result"] == payload
    assert session["name"] == running.source.name
    assert session["source"] == f"./source/{quote(running.source.name, safe='')}"
    assert request(running, session["source"][2:])[2] == running.source.read_bytes()
    assert headers["Cache-Control"] == "no-store"
    assert headers["Cross-Origin-Resource-Policy"] == "same-origin"
    assert "Access-Control-Allow-Origin" not in headers
    assert "'wasm-unsafe-eval'" in headers["Content-Security-Policy"]
    assert "'unsafe-eval'" not in headers["Content-Security-Policy"]


@pytest.mark.parametrize("headers", [
    {"Host": "attacker.test"},
    {"Origin": "https://attacker.test"},
    {"Origin": "null"},
    {"Sec-Fetch-Site": "cross-site"},
])
def test_foreign_origin_cannot_read_any_session_resource(server, headers):
    running, _ = server
    for resource in ["", "session.json", running.source_route, "assets/decoder.wasm"]:
        assert request(running, resource, headers=headers)[0] == 403


@pytest.mark.parametrize("resource", [
    "../index.html", "%2e%2e/index.html", "assets/../../index.html", "source/other.pdf",
    "%2e%2e%2fsecret.txt", "C:/Windows/win.ini", "assets/", "manifest.json",
])
def test_no_directory_or_arbitrary_file_access(server, resource):
    assert request(server[0], resource)[0] == 404


def test_missing_token_is_not_a_public_entry_page(server):
    running, _ = server
    with closing(http.client.HTTPConnection("127.0.0.1", running.server_port, timeout=5)) as connection:
        connection.request("GET", "/")
        assert connection.getresponse().status == 404


def test_head_and_resource_mime(server):
    running, _ = server
    assert request(running)[1]["Content-Type"].startswith("text/html")
    assert request(running, "assets/decoder.wasm")[1]["Content-Type"] == "application/wasm"
    status, headers, body = request(running, "session.json", method="HEAD")
    assert status == 200 and int(headers["Content-Length"]) > 0 and body == b""
    assert request(running, "session.json", method="POST")[0] == 405
    assert request(running, "session.json", method="OPTIONS")[0] == 405


def test_ready_before_browser_open_and_ctrl_c_releases_port(local_resources, monkeypatch):
    source, assets = local_resources
    port = []

    def open_browser(url):
        address = urlsplit(url)
        port.append(address.port)
        with closing(http.client.HTTPConnection(address.hostname, address.port, timeout=5)) as connection:
            connection.request("GET", address.path)
            assert connection.getresponse().status == 200
        raise KeyboardInterrupt

    monkeypatch.setattr(viewer.webbrowser, "open", open_browser)
    viewer.serve_viewer(source, {"contents": []}, assets=assets)
    with pytest.raises(OSError):
        socket.create_connection(("127.0.0.1", port[0]), timeout=1)
    assert not any(thread.name == "cu-viewer" for thread in threading.enumerate())


@pytest.mark.parametrize("browser_error", [False, True])
def test_browser_failure_is_reported_and_service_remains_available(
    local_resources, monkeypatch, capsys, browser_error,
):
    source, assets = local_resources
    url_seen = []
    original_join = threading.Thread.join

    def open_browser(url):
        url_seen.append(url)
        if browser_error:
            raise webbrowser.Error("no browser")
        return False

    def join(thread, timeout=None):
        if thread.name == "cu-viewer" and timeout == 0.2:
            address = urlsplit(url_seen[0])
            with closing(http.client.HTTPConnection(address.hostname, address.port, timeout=5)) as connection:
                connection.request("GET", address.path)
                assert connection.getresponse().status == 200
            raise KeyboardInterrupt
        return original_join(thread, timeout)

    monkeypatch.setattr(viewer.webbrowser, "open", open_browser)
    monkeypatch.setattr(threading.Thread, "join", join)
    viewer.serve_viewer(source, {}, assets=assets)
    assert "Open the Viewer URL above" in capsys.readouterr().err


def packaged_archive(tmp_path, content):
    root = tmp_path / "resources" / "viewer"
    root.mkdir(parents=True)
    buffer = BytesIO()
    with ZipFile(buffer, "w") as archive:
        for name, data in content:
            archive.writestr(name, data)
    archive_bytes = buffer.getvalue()
    (root / "viewer.zip").write_bytes(archive_bytes)
    manifest = {
        "schemaVersion": 2,
        "archive": {
            "path": "viewer.zip", "bytes": len(archive_bytes),
            "sha256": hashlib.sha256(archive_bytes).hexdigest(),
        },
        "files": [
            {"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
            for name, data in content
        ],
    }
    (root / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    return root, manifest


def test_manifest_integrity_and_packaged_assets(monkeypatch, tmp_path):
    root, _ = packaged_archive(tmp_path, [("index.html", b"page")])
    monkeypatch.setattr(assets, "files", lambda package: tmp_path)
    assert assets.load_viewer_assets() == {"index.html": b"page"}
    assert set(path.name for path in root.iterdir()) == {"viewer.zip", "manifest.json"}
    (root / "viewer.zip").write_bytes(b"modified")
    with pytest.raises(ValueError, match="integrity check failed"):
        assets.load_viewer_assets()


@pytest.mark.parametrize("change", ["hash", "size", "extra-file", "duplicate", "missing-entry"])
def test_archive_entry_mismatch_is_reported(monkeypatch, tmp_path, change):
    content = [("index.html", b"page"), ("assets/test.js", b"script")]
    if change == "duplicate":
        content.append(("assets/test.js", b"script"))
    with pytest.warns(UserWarning, match="Duplicate name") if change == "duplicate" else nullcontext():
        root, manifest = packaged_archive(tmp_path, content)
    if change == "hash":
        manifest["files"][0]["sha256"] = "0" * 64
    elif change == "size":
        manifest["files"][0]["bytes"] += 1
    elif change == "extra-file":
        manifest["files"].pop()
    elif change == "missing-entry":
        manifest["files"].append({
            "path": "missing", "bytes": 0, "sha256": hashlib.sha256(b"").hexdigest(),
        })
    (root / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    monkeypatch.setattr(assets, "files", lambda package: tmp_path)
    with pytest.raises(ValueError):
        assets.load_viewer_assets()


def test_non_zip_archive_reports_a_friendly_error(monkeypatch, tmp_path):
    root, manifest = packaged_archive(tmp_path, [("index.html", b"page")])
    data = b"not a ZIP"
    (root / "viewer.zip").write_bytes(data)
    manifest["archive"].update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
    (root / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    monkeypatch.setattr(assets, "files", lambda package: tmp_path)
    with pytest.raises(ValueError, match="Packaged viewer resources"):
        assets.load_viewer_assets()


def test_real_export_has_required_runtime_assets_and_licenses():
    content = assets.load_viewer_assets()
    assert {
        "index.html", "LICENSE.txt", "THIRD-PARTY-NOTICES.txt",
        "assets/pdfjs/LICENSE", "assets/pdfjs/build/pdf.worker.mjs",
        "assets/heif/heif.worker.js", "assets/heif/heic_decoder.js",
        "assets/heif/heic_decoder_bg.wasm", "assets/heif/SBOM.json",
    } <= set(content)
    assert any(name.startswith("assets/MarkdownPane-") for name in content)
    assert any(name.startswith("assets/JsonPane-") for name in content)


@pytest.mark.parametrize("path", ["../secret", "/absolute", "C:/secret", "assets\\secret", ""])
def test_invalid_manifest_paths_are_rejected(monkeypatch, tmp_path, path):
    root, manifest = packaged_archive(tmp_path, [("index.html", b"page")])
    manifest["files"][0]["path"] = path
    (root / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    monkeypatch.setattr(assets, "files", lambda package: tmp_path)
    with pytest.raises(ValueError, match="Invalid viewer asset path"):
        assets.load_viewer_assets()
