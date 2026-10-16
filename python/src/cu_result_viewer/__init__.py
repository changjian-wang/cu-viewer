"""Independent browser Viewer for original source files and CU result JSON."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ._runtime import ViewerError, ViewerInputError, load_viewer_assets, prepare_source, serve_viewer
from ._runtime import read_saved_result as read_result

__all__ = ["PreparedViewer", "ViewerError", "ViewerInputError", "prepare_viewer", "read_result"]


class PreparedViewer:
    """A validated source and installed assets, ready before any host analysis."""

    def __init__(self, source: str | Path) -> None:
        self.source = prepare_source(Path(source))
        self._assets = load_viewer_assets()

    def show(self, result: Any) -> None:
        """Open unchanged JSON-compatible data; block until Ctrl+C stops the session."""
        try:
            serve_viewer(self.source, result, assets=self._assets)
        except (OSError, ValueError, TypeError) as exc:
            raise ViewerError(f"Viewer could not be started: {exc}") from exc


def prepare_viewer(source: str | Path) -> PreparedViewer:
    """Check local input and installed assets without opening a browser or networking."""
    return PreparedViewer(source)
