# Copyright (c) Microsoft Corporation.
# Licensed under the MIT license.

"""Own the local server, browser startup and foreground shutdown lifecycle."""

from __future__ import annotations

from pathlib import Path
import threading
from typing import Any
import webbrowser

from ._errors import ViewerError
from ._server import _ViewerServer, _status


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
