from __future__ import annotations

import argparse
import json
from pathlib import Path

from .pipeline import process_file


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze a group chat export")
    parser.add_argument("file", type=Path)
    parser.add_argument("--timezone", default="UTC")
    args = parser.parse_args()
    result = process_file(args.file.name, args.file.read_bytes(), args.timezone)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
