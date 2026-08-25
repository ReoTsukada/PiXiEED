#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

BINARY_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico",
    ".mp3", ".wav", ".ogg", ".woff", ".woff2", ".ttf",
}
IGNORED_PARTS = {
    ".git", "node_modules", "dist", "build", ".next", ".cache", "coverage",
}


def git_tracked_files(root: Path) -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=root,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.decode("utf-8", "replace"))
    return [
        root / value.decode("utf-8", "surrogateescape")
        for value in result.stdout.split(b"\0")
        if value
    ]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Inventory tracked repository assets and exact duplicates. Never deletes files."
    )
    parser.add_argument("--root", default=".")
    parser.add_argument(
        "--output",
        default="docs/cleanup/repository-asset-inventory.json",
    )
    args = parser.parse_args()

    root = Path(args.root).resolve()
    tracked = git_tracked_files(root)
    assets = []

    for path in tracked:
        relative = path.relative_to(root)
        if any(part in IGNORED_PARTS for part in relative.parts):
            continue
        if path.suffix.lower() not in BINARY_EXTENSIONS or not path.is_file():
            continue
        assets.append({
            "path": relative.as_posix(),
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
            "extension": path.suffix.lower(),
        })

    groups: dict[str, list[str]] = {}
    for item in assets:
        groups.setdefault(item["sha256"], []).append(item["path"])

    duplicates = [
        {"sha256": digest, "paths": paths}
        for digest, paths in groups.items()
        if len(paths) > 1
    ]

    payload = {
        "warning": (
            "This is an inventory only. No-reference status is not proof of safe deletion. "
            "Follow 11_CLEANUP/REPOSITORY_CLEANUP_POLICY.md."
        ),
        "asset_count": len(assets),
        "asset_bytes": sum(item["bytes"] for item in assets),
        "exact_duplicate_groups": duplicates,
        "assets": assets,
    }

    output = root / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({
        "output": str(output),
        "asset_count": len(assets),
        "exact_duplicate_groups": len(duplicates),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1)
