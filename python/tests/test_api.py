from __future__ import annotations

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from unittest.mock import patch

import pytest

import cu_result_viewer
from cu_result_viewer import ViewerError, ViewerInputError


def test_prepare_does_not_start_browser_or_mutate_result(tmp_path, monkeypatch):
    source = tmp_path / "document.pdf"
    source.write_bytes(b"%PDF-1.7")
    calls = []
    monkeypatch.setattr(cu_result_viewer, "load_viewer_assets", lambda: {"index.html": b"page"})
    monkeypatch.setattr(
        cu_result_viewer, "serve_viewer",
        lambda source, result, **kwargs: calls.append((source, result)),
    )
    viewer = cu_result_viewer.prepare_viewer(source)
    assert calls == []
    assert viewer.source == source.resolve()
    original = {"result": {"unknown": [0, False, None]}}
    viewer.show(original)
    assert calls == [(source.resolve(), original)]
    assert calls[0][1] is original


@pytest.mark.parametrize("kind", ["missing", "empty", "unsupported"])
def test_invalid_source_is_distinct_from_an_installation_error(tmp_path, kind):
    source = tmp_path / ("document.mp3" if kind == "unsupported" else "document.pdf")
    if kind != "missing":
        source.write_bytes(b"" if kind == "empty" else b"audio")
    with pytest.raises(ViewerInputError):
        cu_result_viewer.prepare_viewer(source)


def test_installation_error_is_not_a_source_error(tmp_path, monkeypatch):
    source = tmp_path / "document.pdf"
    source.write_bytes(b"%PDF-1.7")
    monkeypatch.setattr(
        cu_result_viewer, "load_viewer_assets",
        lambda: (_ for _ in ()).throw(ViewerError("missing archive")),
    )
    with pytest.raises(ViewerError, match="missing archive"):
        cu_result_viewer.prepare_viewer(source)


def test_invalid_assets_keep_the_public_installation_error_category(tmp_path, monkeypatch):
    source = tmp_path / "document.pdf"
    source.write_bytes(b"%PDF-1.7")
    monkeypatch.setattr(
        cu_result_viewer, "load_viewer_assets",
        lambda: (_ for _ in ()).throw(ValueError("Packaged viewer resources are unavailable")),
    )
    with pytest.raises(ViewerError, match="Packaged viewer resources") as failure:
        cu_result_viewer.prepare_viewer(source)
    assert not isinstance(failure.value, ViewerInputError)


def test_read_result_preserves_original_values_and_accepts_a_bom(tmp_path):
    result = tmp_path / "saved.json"
    result.write_text('{"unknown": [0, false, null, ""]}', encoding="utf-8-sig")
    assert cu_result_viewer.read_result(result) == {"unknown": [0, False, None, ""]}


@pytest.mark.parametrize("value", ["not JSON", '{"number": NaN}', '{"number": Infinity}'])
def test_invalid_saved_result_keeps_the_public_input_error_category(tmp_path, value):
    result = tmp_path / "saved.json"
    result.write_text(value, encoding="utf-8")
    with pytest.raises(ViewerInputError, match="Saved result could not be read"):
        cu_result_viewer.read_result(result)


def build_validator():
    path = Path(__file__).resolve().parents[1] / "setup.py"
    spec = spec_from_file_location("_viewer_setup_test", path)
    assert spec and spec.loader
    module = module_from_spec(spec)
    with patch("setuptools.setup"):
        spec.loader.exec_module(module)
    return module


def test_build_validator_accepts_the_real_complete_export(monkeypatch):
    build_validator().check_resources()


@pytest.mark.parametrize("failure", ["missing-zip", "missing-manifest", "corrupt-zip"])
def test_build_validator_rejects_incomplete_packages(tmp_path, monkeypatch, failure):
    module = build_validator()
    real = Path(__file__).resolve().parents[1] / "src" / "cu_result_viewer"
    package = tmp_path / "src" / "cu_result_viewer"
    root = package / "resources" / "viewer"
    root.mkdir(parents=True)
    (package / "_assets.py").write_bytes((real / "_assets.py").read_bytes())
    for name in ("viewer.zip", "manifest.json"):
        if failure != f"missing-{name.split('.')[0]}":
            (root / name).write_bytes((real / "resources" / "viewer" / name).read_bytes())
    if failure == "missing-zip":
        (root / "viewer.zip").unlink(missing_ok=True)
    if failure == "corrupt-zip":
        (root / "viewer.zip").write_bytes(b"corrupt")
    monkeypatch.setattr(module, "__file__", str(tmp_path / "setup.py"))
    with pytest.raises(RuntimeError, match="Packaged viewer resources"):
        module.check_resources()
