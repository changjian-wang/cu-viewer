"""Reject incomplete Viewer distributions before creating a wheel or sdist."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

from setuptools import setup
from setuptools.command.build_py import build_py
from setuptools.command.sdist import sdist


def check_resources() -> None:
    package = Path(__file__).resolve().parent / "src" / "cu_result_viewer"
    spec = spec_from_file_location("_viewer_build_runtime", package / "_runtime.py")
    if spec is None or spec.loader is None:
        raise RuntimeError("Viewer resource validator could not be loaded.")
    runtime = module_from_spec(spec)
    spec.loader.exec_module(runtime)
    try:
        assets = runtime.load_viewer_assets(package / "resources" / "viewer")
    except runtime.ViewerError as exc:
        raise RuntimeError(f"Cannot build the Viewer distribution: {exc}") from exc
    required = {
        "index.html", "LICENSE.txt", "THIRD-PARTY-NOTICES.txt",
        "assets/pdfjs/LICENSE", "assets/pdfjs/build/pdf.worker.mjs",
        "assets/heif/heif.worker.js", "assets/heif/heic_decoder.js",
        "assets/heif/heic_decoder_bg.wasm", "assets/heif/SBOM.json",
    }
    missing = required - assets.keys()
    for prefix in (
        "assets/MarkdownPane-", "assets/JsonPane-", "assets/index-",
        "assets/pdfjs/standard_fonts/", "assets/pdfjs/cmaps/",
        "assets/pdfjs/wasm/", "assets/pdfjs/iccs/",
    ):
        if not any(name.startswith(prefix) for name in assets):
            missing.add(prefix)
    if missing:
        raise RuntimeError(f"Viewer distribution is incomplete: {', '.join(sorted(missing))}")


class CheckedBuild(build_py):
    def run(self) -> None:
        check_resources()
        super().run()


class CheckedSource(sdist):
    def run(self) -> None:
        check_resources()
        super().run()


setup(cmdclass={"build_py": CheckedBuild, "sdist": CheckedSource})
