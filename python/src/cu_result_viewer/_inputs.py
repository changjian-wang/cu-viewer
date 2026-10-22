# Copyright (c) Microsoft Corporation.
# Licensed under the MIT license.

"""Validate local source files and read unchanged saved result JSON."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ._errors import ViewerInputError

_SOURCE_SUFFIXES = {".pdf", ".jpg", ".jpeg", ".jpe", ".png", ".bmp", ".heif", ".heic"}


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
