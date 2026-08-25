#!/usr/bin/env python3
"""Render a machine-enforced Work Package prompt from Registry v2."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from validate_pixieed_program import (
    HISTORICAL_STATUSES,
    RegistryError,
    historical_ids,
    load_and_validate,
    parent_integration_ready,
)


def package_by_id(registry: dict[str, Any], package_id: str) -> dict[str, Any]:
    wanted = package_id.upper()
    for package in registry["packages"]:
        if package["id"].upper() == wanted:
            return package
    raise RegistryError(f"unknown Work Package: {wanted}")


def dependency_statuses(registry: dict[str, Any], package: dict[str, Any]) -> list[str]:
    live = {item["id"]: item for item in registry["packages"]}
    historical = historical_ids(registry)
    result = []
    for dependency in package["dependsOn"]:
        if dependency in historical:
            result.append(f"- `{dependency}`: HISTORICAL_COMPLETED (dependency evidence is inherited; do not rerun)")
        elif dependency in live:
            result.append(f"- `{dependency}`: {live[dependency]['status']}")
        else:
            result.append(f"- `{dependency}`: UNKNOWN (registry validation must reject this)")
    return result or ["- none"]


def render_prompt(registry: dict[str, Any], package: dict[str, Any]) -> str:
    package_id = package["id"]
    definition = package["definition"] if isinstance(package["definition"], str) else package["definition"]["path"]
    next_package = package["nextPackage"] or "none"
    dependencies = "\n".join(dependency_statuses(registry, package))
    acceptance = "\n".join(f"- `{item}`" for item in package["acceptanceIds"])
    context = "\n".join(f"- `{item}`" for item in package["contextFiles"]) or "- none"
    writes = "\n".join(f"- `{item}`" for item in package["allowedWriteGlobs"])
    forbidden = "\n".join(f"- `{item}`" for item in package["forbiddenActions"])
    implementation = package["implementationRoute"]
    review = package["reviewRoute"]
    authority = registry["authority"] if isinstance(registry["authority"], str) else json.dumps(registry["authority"], ensure_ascii=False, sort_keys=True)
    authority_object = registry["authority"] if isinstance(registry["authority"], dict) else {}
    if package_id == authority_object.get("completionCore"):
        parallel_roots = ", ".join(authority_object.get("postCoreParallelRoots", [])) or "none"
        parallel_handoff = f"- Post-Core parallel roots after a new explicit instruction: `{parallel_roots}`"
    else:
        parallel_handoff = "- Post-Core parallel roots: not applicable to this package"
    return f"""# {package_id} — {package['title']}

This prompt is generated from the PiXiEED Work Package Registry v2.
The registry and referenced source files are authoritative; do not infer missing scope.

## Package metadata

- Program: `{registry['programId']}`
- Registry authority: `{authority}`
- Phase: `{package['phase']}`
- Status: `{package['status']}`
- Kind: `{package['kind']}`
- Verification level: `{package['verificationLevel']}`
- Definition: `{definition}`
- Next package: `{next_package}`
- `autoStartNext`: `false`
{parallel_handoff}

## Execution route

- Implementation model: `{implementation['model']}`
- Reasoning: `{implementation['reasoning']}`
- Maximum parallel workers: `{implementation['parallelism']}`
- Independent review model: `{review['model']}`
- Review reasoning: `{review['reasoning']}`
- Independent reviewer required: `{str(review['independent']).lower()}`

Before editing, decompose independent tracks and dispatch all safe disjoint Luna workers in one wave up to
the registered maximum. Give every worker its full read scope, exclusive write glob, acceptance IDs, fixtures,
and stop rules at dispatch time. Do not drip-feed independent agents one by one. Registry/Queue/State/Worklog
integration and final cross-track verification remain coordinator-owned and serial.

## Dependencies

Review dependency status before editing. Historical dependencies are evidence inputs, not work to rerun.

{dependencies}

## Read scope

Global context is supplied by the registry. Package context files:

{context}

## Write scope

Only these globs are allowed for this package:

{writes}

Any path outside this scope requires a new explicit package decision. Preserve unrelated dirty changes.

## Acceptance IDs

{acceptance}

## Forbidden actions

{forbidden}

Do not migrate, deploy, publish, commit, push, switch routes, or alter production data in this package.
Production, payment, payout, Storage, RLS, and current-system changes require their separate authorized gate.

## Preservation and evidence ladder

Preserve current Market, PiXiSYNC, public URLs, PXD/projects, purchases, entitlements, production data,
and the existing dirty worktree. Report evidence in this order:

1. Static/schema/contract checks.
2. Unit and failure-fixture checks.
3. Integration and sanitized-fixture checks.
4. Browser and visual checks with browser/version/build/viewport identity.
5. Physical device, accessibility, and cross-browser checks.
6. Production-equivalent staging, migration, RLS, provider, reconciliation, and rollback rehearsal.
7. Cutover only under a separately recorded Owner authorization.

`PASS_STATIC`, synthetic, local, headless, and emulated-viewport results must not be reported as device,
staging, production, or cutover PASS. Keep `UNTESTED`, `UNKNOWN`, `PARTIAL`, `BLOCKED`, and
`DECISION_PENDING` explicit. Record command exit codes, raw output references, source/build identity,
fixtures, environment, timestamps, and new baseline-failure identities.

## Stop-after rule

Stop after `{package_id}`. Do not begin `{next_package}` automatically, even when this package passes.
`autoStartNext` is permanently false; a new explicit instruction and a fresh registry/context check are required.
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a Work Package prompt from Registry v2.")
    parser.add_argument("--work-package", required=True)
    parser.add_argument("--root", default=".")
    parser.add_argument("--registry")
    parser.add_argument("--schema")
    parser.add_argument("--output")
    args = parser.parse_args()
    try:
        root = Path(args.root).resolve()
        registry_path, registry, _summary = load_and_validate(root, args.registry, args.schema)
        requested_id = args.work_package.upper()
        if requested_id in historical_ids(registry):
            raise RegistryError(f"refusing prompt for historical package: {requested_id}")
        package = package_by_id(registry, args.work_package)
        package_id = package["id"]
        if package_id in historical_ids(registry) or package["status"].upper() in HISTORICAL_STATUSES:
            raise RegistryError(f"refusing prompt for historical package: {package_id}")
        if package_id == "FP-004" and not parent_integration_ready(registry):
            raise RegistryError("refusing live FP-004 prompt until parent integration is complete")
        content = render_prompt(registry, package)
        output = Path(args.output) if args.output else root / ".codex" / "prompts" / f"{package_id}.md"
        output = output if output.is_absolute() else root / output
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(content, encoding="utf-8")
        print(json.dumps({
            "package": package_id,
            "registry": str(registry_path),
            "output": str(output),
            "bytes": len(content.encode("utf-8")),
            "status": "PROMPT_GENERATED",
        }, ensure_ascii=False, indent=2))
        return 0
    except RegistryError as exc:
        print(f"PROMPT_REFUSED: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
