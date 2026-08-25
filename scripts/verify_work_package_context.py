#!/usr/bin/env python3
"""Verify a generated Work Package Context has not drifted from its manifest."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--context", required=True)
    parser.add_argument("--manifest")
    parser.add_argument("--root", default=".")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    context = Path(args.context)
    context = context if context.is_absolute() else root / context
    manifest = Path(args.manifest) if args.manifest else context.with_name(f"{context.stem}.manifest.json")
    manifest = manifest if manifest.is_absolute() else root / manifest
    if not context.is_file() or not manifest.is_file():
        print(json.dumps({"status": "BLOCKED", "reason": "context_or_manifest_missing"}))
        return 2
    data = json.loads(manifest.read_text(encoding="utf-8"))
    issues: list[dict[str, str]] = []
    actual_context_sha = sha256_bytes(context.read_bytes())
    if actual_context_sha != data.get("contextSha256"):
        issues.append({"code": "CONTEXT_HASH_MISMATCH", "path": str(context)})
    registry = root / data.get("registry", "")
    expected_registry_sha = data.get("registrySha256")
    if not registry.is_file() or sha256_bytes(registry.read_bytes()) != expected_registry_sha:
        issues.append({"code": "REGISTRY_HASH_MISMATCH", "path": str(registry)})
    for record in data.get("sourceFiles", []):
        relative = record.get("path")
        path = root / relative
        if not path.is_file():
            issues.append({"code": "CONTEXT_SOURCE_MISSING", "path": relative})
            continue
        if sha256_bytes(path.read_bytes()) != record.get("sha256") or path.stat().st_size != record.get("bytes"):
            issues.append({"code": "CONTEXT_SOURCE_DRIFT", "path": relative})
    result = {"status": "PASS" if not issues else "BLOCKED", "context": str(context), "manifest": str(manifest), "issues": issues}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if not issues else 2


if __name__ == "__main__":
    raise SystemExit(main())
