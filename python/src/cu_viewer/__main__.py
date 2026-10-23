"""Open an existing source/result pair without a CU CLI or service dependency."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

from . import ViewerError, prepare_viewer, read_result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--result", required=True, type=Path)
    args = parser.parse_args()
    try:
        result = read_result(args.result)
        prepare_viewer(args.source).show(result)
    except ViewerError as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
