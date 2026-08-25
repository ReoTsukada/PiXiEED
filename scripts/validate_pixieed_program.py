#!/usr/bin/env python3
"""Validate the machine-enforced PiXiEED Work Package Registry v2."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


DEFAULT_REGISTRY_CANDIDATES = (
    "00_START_HERE/WORK_PACKAGE_REGISTRY.json",
    "00_START_HERE/work-package-registry-v2.json",
    "00_START_HERE/WORK_PACKAGE_REGISTRY_V2.json",
    "00_START_HERE/work-package-registry.json",
)
REQUIRED_TOP_LEVEL_KEYS = {
    "schemaVersion",
    "programId",
    "updatedAt",
    "authority",
    "globalContext",
    "historicalCompleted",
    "phases",
    "packages",
}
REQUIRED_PACKAGE_KEYS = {
    "id",
    "title",
    "phase",
    "status",
    "kind",
    "dependsOn",
    "definition",
    "contextFiles",
    "allowedWriteGlobs",
    "forbiddenActions",
    "acceptanceIds",
    "verificationLevel",
    "implementationRoute",
    "reviewRoute",
    "nextPackage",
    "autoStartNext",
}
ALLOWED_ROUTE_MODELS = {
    "luna_high",
    "luna_max",
    "terra",
    "terra_high",
    "terra_max",
    "sol",
    "sol_high",
    "sol_max",
    "owner",
    "external_audit",
}
REQUIRED_FORBIDDEN_MARKERS = (
    ("deploy", "deploy"),
    ("publish", "publish"),
    ("commit", "commit"),
    ("push", "push"),
    ("migration", "migration"),
    ("cutover", "cutover"),
)
FUTURE_SEQUENCE = (
    "FP-004", "FP-005", "FP-007", "CORE-100", "CORE-110", "CORE-120", "FP-006",
    "DRAW-110", "DRAW-120", "DRAW-130", "DRAW-140", "DRAW-150", "DRAW-160", "DRAW-170",
    "AUDIO-200", "AUDIO-210", "AUDIO-220", "AUDIO-230", "AUDIO-240",
    "GAME-300", "GAME-310", "GAME-320", "GAME-330", "GAME-340", "GAME-350",
    "SITE-400", "MARKET-410", "WORK-420", "SOCIAL-430", "OPS-440", "PLATFORM-450",
    "NATIVE-500", "NATIVE-510", "NATIVE-520",
    "WP-900", "WP-910", "WP-920", "WP-930", "WP-940", "WP-950", "WP-960", "WP-970",
    "WP-980", "WP-990", "CUT-001",
)
READY_STATUSES = {"READY", "IN_PROGRESS", "COMPLETE_CANDIDATE"}
HISTORICAL_STATUSES = {"HISTORICAL", "COMPLETE", "COMPLETED"}
PATH_PATTERN = re.compile(r"^(?!/)(?![A-Za-z]:[\\/])")


class RegistryError(ValueError):
    """A machine-readable registry validation failure."""


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RegistryError(f"missing JSON file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise RegistryError(f"invalid JSON {path}: {exc}") from exc


def resolve_registry(root: Path, explicit: str | None = None) -> Path:
    candidates = [Path(explicit)] if explicit else [Path(item) for item in DEFAULT_REGISTRY_CANDIDATES]
    for candidate in candidates:
        path = candidate if candidate.is_absolute() else root / candidate
        if path.is_file():
            return path.resolve()
    listed = ", ".join(str(item) for item in candidates)
    raise RegistryError(f"live v2 registry not found; checked: {listed}")


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise RegistryError(message)


def _string(value: Any, label: str) -> str:
    _require(isinstance(value, str) and bool(value.strip()), f"{label} must be a non-empty string")
    return value


def _strings(value: Any, label: str, nonempty: bool = False) -> list[str]:
    _require(isinstance(value, list), f"{label} must be an array")
    result = [_string(item, f"{label}[{index}]") for index, item in enumerate(value)]
    if nonempty:
        _require(bool(result), f"{label} must not be empty")
    return result


def _safe_relative_path(root: Path, value: Any, label: str) -> tuple[str, Path]:
    relative = _string(value, label).replace("\\", "/")
    _require(PATH_PATTERN.match(relative) is not None, f"{label} must be a relative path: {relative}")
    candidate = (root / relative).resolve()
    _require(candidate == root or root in candidate.parents, f"{label} escapes repository root: {relative}")
    _require(candidate.is_file(), f"{label} does not exist: {relative}")
    return relative, candidate


def definition_path(definition: Any, label: str = "definition") -> str:
    if isinstance(definition, str):
        return definition
    _require(isinstance(definition, dict), f"{label} must be a path or object with path")
    return _string(definition.get("path"), f"{label}.path")


def package_ids(registry: dict[str, Any]) -> set[str]:
    return {package["id"] for package in registry["packages"]}


def historical_ids(registry: dict[str, Any]) -> set[str]:
    result: set[str] = set()
    for entry in registry["historicalCompleted"]:
        if isinstance(entry, str):
            result.add(entry)
        elif isinstance(entry, dict) and isinstance(entry.get("id"), str):
            result.add(entry["id"])
    return result


def parent_integration_ready(registry: dict[str, Any]) -> bool:
    authority = registry.get("authority")
    if not isinstance(authority, dict):
        return False
    for key in ("parentIntegrationReady", "parentIntegrationComplete", "parentIntegrated"):
        if authority.get(key) is True:
            return True
    return str(authority.get("parentIntegrationStatus", "")).upper() in {"READY", "COMPLETE", "COMPLETED"}


def assert_package_paths(root: Path, package: dict[str, Any]) -> list[str]:
    paths: list[str] = []
    definition = definition_path(package["definition"])
    paths.append(_safe_relative_path(root, definition, f"{package['id']}.definition")[0])
    for index, context_file in enumerate(package["contextFiles"]):
        paths.append(_safe_relative_path(root, context_file, f"{package['id']}.contextFiles[{index}]")[0])
    return paths


def validate_registry(registry: Any, root: Path, schema: Any | None = None) -> dict[str, Any]:
    _require(isinstance(registry, dict), "registry must be an object")
    _require(set(registry) == REQUIRED_TOP_LEVEL_KEYS, "registry top-level keys must match v2 contract exactly")
    _require(registry.get("schemaVersion") == 2, "registry schemaVersion must be 2")
    _string(registry.get("programId"), "programId")
    _string(registry.get("updatedAt"), "updatedAt")
    _require(isinstance(registry.get("authority"), (str, dict)), "authority must be a string or object")
    _strings(registry["globalContext"], "globalContext")
    _require(isinstance(registry["historicalCompleted"], list), "historicalCompleted must be an array")
    _require(isinstance(registry["phases"], list), "phases must be an array")
    _require(isinstance(registry["packages"], list), "packages must be an array")

    for index, path_value in enumerate(registry["globalContext"]):
        _safe_relative_path(root, path_value, f"globalContext[{index}]")
    historical = historical_ids(registry)
    for index, entry in enumerate(registry["historicalCompleted"]):
        if isinstance(entry, str):
            _string(entry, f"historicalCompleted[{index}]")
        else:
            _require(isinstance(entry, dict), f"historicalCompleted[{index}] must be an ID or object")
            _string(entry.get("id"), f"historicalCompleted[{index}].id")

    phase_ids: set[str] = set()
    for index, phase in enumerate(registry["phases"]):
        if isinstance(phase, str):
            phase_id = _string(phase, f"phases[{index}]")
        else:
            _require(isinstance(phase, dict), f"phases[{index}] must be an ID or object")
            phase_id = _string(phase.get("id"), f"phases[{index}].id")
            _string(phase.get("title"), f"phases[{index}].title")
        _require(phase_id not in phase_ids, f"duplicate phase ID: {phase_id}")
        phase_ids.add(phase_id)

    ids: list[str] = []
    for index, package in enumerate(registry["packages"]):
        _require(isinstance(package, dict), f"packages[{index}] must be an object")
        _require(set(package) == REQUIRED_PACKAGE_KEYS, f"{package.get('id', index)} package keys must match v2 contract exactly")
        package_id = _string(package.get("id"), f"packages[{index}].id")
        ids.append(package_id)
        _string(package.get("title"), f"{package_id}.title")
        phase = _string(package.get("phase"), f"{package_id}.phase")
        _require(not phase_ids or phase in phase_ids, f"{package_id}.phase does not exist: {phase}")
        status = _string(package.get("status"), f"{package_id}.status").upper()
        _string(package.get("kind"), f"{package_id}.kind")
        _strings(package.get("dependsOn"), f"{package_id}.dependsOn")
        _strings(package.get("contextFiles"), f"{package_id}.contextFiles")
        _strings(package.get("allowedWriteGlobs"), f"{package_id}.allowedWriteGlobs", nonempty=True)
        forbidden = _strings(package.get("forbiddenActions"), f"{package_id}.forbiddenActions", nonempty=True)
        forbidden_text = " ".join(forbidden).lower()
        for marker, label in REQUIRED_FORBIDDEN_MARKERS:
            _require(marker in forbidden_text, f"{package_id}.forbiddenActions must include {label}")
        _strings(package.get("acceptanceIds"), f"{package_id}.acceptanceIds", nonempty=True)
        _string(package.get("verificationLevel"), f"{package_id}.verificationLevel")
        implementation = package.get("implementationRoute")
        _require(isinstance(implementation, dict), f"{package_id}.implementationRoute must be an object")
        _require(set(implementation) == {"model", "reasoning", "parallelism"}, f"{package_id}.implementationRoute keys are invalid")
        _require(implementation.get("model") in ALLOWED_ROUTE_MODELS, f"{package_id}.implementationRoute.model is invalid")
        _string(implementation.get("reasoning"), f"{package_id}.implementationRoute.reasoning")
        _require(isinstance(implementation.get("parallelism"), int) and implementation["parallelism"] >= 1, f"{package_id}.implementationRoute.parallelism must be >= 1")
        review = package.get("reviewRoute")
        _require(isinstance(review, dict), f"{package_id}.reviewRoute must be an object")
        _require(set(review) == {"model", "reasoning", "independent"}, f"{package_id}.reviewRoute keys are invalid")
        _require(review.get("model") in ALLOWED_ROUTE_MODELS, f"{package_id}.reviewRoute.model is invalid")
        _string(review.get("reasoning"), f"{package_id}.reviewRoute.reasoning")
        _require(review.get("independent") is True, f"{package_id}.reviewRoute.independent must be true")
        _require(package.get("autoStartNext") is False, f"{package_id}.autoStartNext must be false")
        next_package = package.get("nextPackage")
        _require(next_package is None or isinstance(next_package, str) and bool(next_package.strip()), f"{package_id}.nextPackage must be null or a non-empty ID")
        assert_package_paths(root, package)
        _require(status not in {"READY_FOR_LIMITED_ROLLOUT"}, f"{package_id} cannot use a release decision as package status")

    _require(len(ids) == len(set(ids)), "package IDs must be unique")
    current_ids = set(ids)
    allowed_dependency_ids = current_ids | historical
    if set(FUTURE_SEQUENCE) <= current_ids:
        _require(ids == list(FUTURE_SEQUENCE), "registry package catalog order must match the canonical v2 catalog")
    package_map = {package["id"]: package for package in registry["packages"]}
    branch_ids = {"CORE-120", "FP-006", "AUDIO-200", "GAME-300", "GAME-340", "SITE-400"}
    if branch_ids & current_ids:
        _require(branch_ids <= current_ids, "live post-Core branch registry is incomplete")
        authority = registry.get("authority") if isinstance(registry.get("authority"), dict) else {}
        _require(authority.get("postCoreParallelRoots") == ["FP-006", "AUDIO-200", "GAME-300"], "post-Core parallel roots are invalid")
        _require(authority.get("postCoreJoin") == "SITE-400", "post-Core join must be SITE-400")
        _require(package_map["AUDIO-200"]["dependsOn"] == ["CORE-120"], "AUDIO-200 must start from completed Core")
        _require(package_map["GAME-300"]["dependsOn"] == ["CORE-120"], "GAME-300 must start from completed Core")
        _require(set(package_map["GAME-340"]["dependsOn"]) == {"GAME-330", "DRAW-160", "AUDIO-230"}, "GAME-340 must join Game, Draw, and Audio integration inputs")
        _require(set(package_map["SITE-400"]["dependsOn"]) == {"DRAW-170", "AUDIO-240", "GAME-350"}, "SITE-400 must join completed Draw, Audio, and Game branches")
    if "FP-006" in package_map:
        _require("draw" in package_map["FP-006"]["phase"].lower(), "FP-006 must be reclassified into the Draw2 phase")
    if "WP-900" in package_map:
        descriptor = f"{package_map['WP-900']['kind']} {package_map['WP-900']['title']}".lower()
        _require("qualification" in descriptor or "acceptance" in descriptor or "gap" in descriptor, "WP-900 must remain qualification/acceptance-gap authority")
    if "WP-990" in package_map:
        descriptor = f"{package_map['WP-990']['kind']} {package_map['WP-990']['title']}".lower()
        forbidden_text = " ".join(package_map["WP-990"]["forbiddenActions"]).lower()
        _require("decision" in descriptor or "approval" in descriptor, "WP-990 must prepare/record an Owner decision")
        _require("owner" in forbidden_text and ("authorization" in forbidden_text or "approval" in forbidden_text), "WP-990 must require explicit Owner authorization")
    if "CUT-001" in package_map:
        forbidden_text = " ".join(package_map["CUT-001"]["forbiddenActions"]).lower()
        _require(package_map["CUT-001"]["status"].upper() == "BLOCKED", "CUT-001 must remain BLOCKED")
        _require("owner" in forbidden_text and ("authorization" in forbidden_text or "approval" in forbidden_text), "CUT-001 requires explicit Owner authorization")
    for package in registry["packages"]:
        package_id = package["id"]
        for dependency in package["dependsOn"]:
            _require(dependency in allowed_dependency_ids, f"{package_id} depends on unknown package: {dependency}")
        next_package = package["nextPackage"]
        if next_package is not None:
            _require(next_package in current_ids or next_package in historical, f"{package_id}.nextPackage is unknown: {next_package}")

    graph = {package["id"]: [item for item in package["dependsOn"] if item in current_ids] for package in registry["packages"]}
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(node: str, trail: list[str]) -> None:
        if node in visiting:
            cycle = " -> ".join([*trail, node])
            raise RegistryError(f"dependency cycle detected: {cycle}")
        if node in visited:
            return
        visiting.add(node)
        for dependency in graph[node]:
            visit(dependency, [*trail, node])
        visiting.remove(node)
        visited.add(node)

    for package_id in graph:
        visit(package_id, [])

    for package in registry["packages"]:
        if package["id"] in historical:
            raise RegistryError(f"package cannot be both live and historicalCompleted: {package['id']}")

    return {
        "schemaVersion": 2,
        "programId": registry["programId"],
        "packageCount": len(ids),
        "historicalCount": len(historical),
        "packageIds": ids,
        "status": "VALID",
    }


def load_and_validate(root: Path, registry_arg: str | None = None, schema_arg: str | None = None) -> tuple[Path, dict[str, Any], dict[str, Any]]:
    registry_path = resolve_registry(root, registry_arg)
    registry = load_json(registry_path)
    schema_path = Path(schema_arg) if schema_arg else root / "00_START_HERE" / "work-package-registry-v2.schema.json"
    schema_path = schema_path if schema_path.is_absolute() else root / schema_path
    schema = load_json(schema_path)
    _require(schema.get("$id") == "https://pixieed.invalid/schema/work-package-registry-v2.json", "v2 schema identity is invalid")
    _require(schema.get("title") == "PiXiEED Work Package Registry v2", "v2 schema title is invalid")
    _require(schema.get("type") == "object" and schema.get("additionalProperties") is False, "v2 schema must be a closed object")
    _require(set(schema.get("required", [])) == REQUIRED_TOP_LEVEL_KEYS, "v2 schema required top-level keys are invalid")
    schema_properties = schema.get("properties", {})
    _require(schema_properties.get("schemaVersion", {}).get("const") == 2, "v2 schema schemaVersion contract is invalid")
    package_schema = schema.get("$defs", {}).get("package", {})
    _require(set(package_schema.get("required", [])) == REQUIRED_PACKAGE_KEYS, "v2 schema package keys are invalid")
    summary = validate_registry(registry, root, schema)
    return registry_path, registry, summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate the live PiXiEED Work Package Registry v2.")
    parser.add_argument("--root", default=".")
    parser.add_argument("--registry")
    parser.add_argument("--schema")
    args = parser.parse_args()
    try:
        root = Path(args.root).resolve()
        path, _registry, summary = load_and_validate(root, args.registry, args.schema)
    except RegistryError as exc:
        print(f"REGISTRY_INVALID: {exc}", file=sys.stderr)
        return 2
    summary = {"registry": str(path), **summary}
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
