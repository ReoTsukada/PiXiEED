#!/usr/bin/env python3
"""Build an exact, registry-driven Work Package context bundle."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

from build_work_package_prompt import package_by_id, render_prompt
from validate_pixieed_program import (
    HISTORICAL_STATUSES,
    READY_STATUSES,
    RegistryError,
    historical_ids,
    load_and_validate,
    parent_integration_ready,
)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def package_source_paths(root: Path, registry: dict[str, Any], package: dict[str, Any]) -> list[str]:
    paths: list[str] = []
    for value in [*registry["globalContext"], package["definition"] if isinstance(package["definition"], str) else package["definition"]["path"], *package["contextFiles"]]:
        value = value.replace("\\", "/")
        if value not in paths:
            paths.append(value)
    return paths


def read_sources(root: Path, relative_paths: list[str]) -> tuple[list[dict[str, Any]], list[str]]:
    records: list[dict[str, Any]] = []
    sections: list[str] = []
    for relative in relative_paths:
        path = root / relative
        if not path.is_file():
            raise RegistryError(f"context source is missing: {relative}")
        data = path.read_bytes()
        digest = sha256_bytes(data)
        records.append({"path": relative, "sha256": digest, "bytes": len(data)})
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise RegistryError(f"context source is not UTF-8 text: {relative}") from exc
        sections.extend([
            "---",
            "",
            f"## FILE: `{relative}`",
            "",
            f"`sha256:{digest}`",
            "",
            text.rstrip(),
            "",
        ])
    return records, sections


def manifest_path_for(output: Path) -> Path:
    return output.with_name(f"{output.stem}.manifest.json")


def reject_stale_existing(output: Path, manifest_path: Path, expected_context_sha: str | None = None) -> None:
    if output.exists() and not manifest_path.is_file():
        raise RegistryError(f"existing context has no sidecar manifest: {output}")
    if manifest_path.is_file() and expected_context_sha is not None:
        try:
            old = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise RegistryError(f"existing sidecar manifest is invalid: {manifest_path}") from exc
        if old.get("contextSha256") != expected_context_sha:
            raise RegistryError(f"existing context is stale; use --force explicitly: {output}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build an exact Work Package context from Registry v2.")
    parser.add_argument("--work-package", required=True)
    parser.add_argument("--root", default=".")
    parser.add_argument("--registry")
    parser.add_argument("--schema")
    parser.add_argument("--output")
    parser.add_argument("--max-bytes", type=int, default=350_000)
    parser.add_argument("--force", action="store_true", help="Replace an existing context only after an explicit stale check.")
    parser.add_argument("--print-files", action="store_true")
    args = parser.parse_args()
    try:
        root = Path(args.root).resolve()
        registry_path, registry, _summary = load_and_validate(root, args.registry, args.schema)
        requested_id = args.work_package.upper()
        if requested_id in historical_ids(registry):
            raise RegistryError(f"refusing context for historical package: {requested_id}")
        package = package_by_id(registry, args.work_package)
        package_id = package["id"]
        if package_id in historical_ids(registry) or package["status"].upper() in HISTORICAL_STATUSES:
            raise RegistryError(f"refusing context for historical package: {package_id}")
        if package["status"].upper() not in READY_STATUSES:
            raise RegistryError(f"refusing context for non-ready package {package_id}: {package['status']}")
        if package_id == "FP-004" and not parent_integration_ready(registry):
            raise RegistryError("refusing live FP-004 context until parent integration is complete")

        relative_paths = package_source_paths(root, registry, package)
        if args.print_files:
            print("\n".join(relative_paths))
            return 0
        source_records, source_sections = read_sources(root, relative_paths)
        prompt = render_prompt(registry, package)
        sections = [
            f"# PiXiEED targeted context — {package_id}",
            "",
            "This file is generated from Registry v2. Original repository files remain authoritative.",
            "",
            "## Generated package prompt",
            "",
            prompt.rstrip(),
            "",
            "## Source context",
            "",
            *source_sections,
        ]
        output_text = "\n".join(sections)
        output_bytes = output_text.encode("utf-8")
        if len(output_bytes) > args.max_bytes:
            raise RegistryError(f"context is {len(output_bytes)} bytes, above --max-bytes {args.max_bytes}; no truncation performed")
        context_sha = sha256_bytes(output_bytes)
        output = Path(args.output) if args.output else root / ".codex" / "context" / f"{package_id}.md"
        output = output if output.is_absolute() else root / output
        manifest_path = manifest_path_for(output)
        if not args.force and (output.exists() or manifest_path.exists()):
            reject_stale_existing(output, manifest_path, expected_context_sha=context_sha)
            raise RegistryError(f"context already exists; use --force only after reviewing provenance: {output}")
        output.parent.mkdir(parents=True, exist_ok=True)
        try:
            registry_reference = str(registry_path.relative_to(root))
        except ValueError:
            registry_reference = str(registry_path)
        manifest = {
            "schemaVersion": 1,
            "package": package_id,
            "registry": registry_reference,
            "registrySha256": sha256_bytes(registry_path.read_bytes()),
            "sourceFiles": source_records,
            "exactFiles": [record["path"] for record in source_records],
            "promptBytes": len(prompt.encode("utf-8")),
            "contextBytes": len(output_bytes),
            "contextSha256": context_sha,
            "status": "GENERATED_EXACT_NO_TRUNCATION",
        }
        output.write_bytes(output_bytes)
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({
            "workPackage": package_id,
            "output": str(output),
            "manifest": str(manifest_path),
            "files": len(source_records),
            "bytes": len(output_bytes),
            "sha256": context_sha,
            "status": manifest["status"],
        }, ensure_ascii=False, indent=2))
        return 0
    except RegistryError as exc:
        print(f"CONTEXT_REFUSED: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
