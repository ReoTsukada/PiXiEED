#!/usr/bin/env python3
"""Build read-only, machine-readable evidence for WP-000.

This scanner deliberately reads source files and migration text only.  It does
not connect to Supabase, execute SQL, modify production data, or inspect user
creative content.
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "inventory"
EXCLUDED_PARTS = {".git", "node_modules", "_backup", "PiXiEEDDrawDEV", ".codex"}


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def write_json(name: str, value: object) -> None:
    target = OUT / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return ""


def source_files(suffixes: Iterable[str]) -> list[Path]:
    found: list[Path] = []
    for suffix in suffixes:
        found.extend(ROOT.rglob(f"*{suffix}"))
    return sorted({p for p in found if p.is_file() and not any(part in EXCLUDED_PARTS for part in p.parts)})


def line_records(path: Path, pattern: re.Pattern[str]) -> list[dict[str, object]]:
    records: list[dict[str, object]] = []
    for number, line in enumerate(read_text(path).splitlines(), start=1):
        match = pattern.search(line)
        if match:
            record: dict[str, object] = {"source": rel(path), "line": number}
            record.update({key: value for key, value in match.groupdict().items() if value is not None})
            records.append(record)
    return records


def git_value(*args: str) -> str:
    result = subprocess.run(["git", *args], cwd=ROOT, text=True, capture_output=True, check=False)
    return result.stdout.strip()


def build_repository_inventory() -> None:
    commit = git_value("rev-parse", "HEAD")
    status = git_value("status", "--porcelain=v1").splitlines()
    packages: list[dict[str, object]] = []
    for package_path in sorted(ROOT.rglob("package.json")):
        if any(part in EXCLUDED_PARTS for part in package_path.parts):
            continue
        try:
            package = json.loads(read_text(package_path))
        except json.JSONDecodeError:
            continue
        packages.append({
            "path": rel(package_path),
            "name": package.get("name"),
            "private": package.get("private"),
            "scripts": sorted((package.get("scripts") or {}).keys()),
            "dependencies": sorted((package.get("dependencies") or {}).keys()),
            "devDependencies": sorted((package.get("devDependencies") or {}).keys()),
        })

    applications = [
        {"name": "PiXiEED web", "path": "index.html", "boundary": "public web"},
        {"name": "PiXiEEDraw", "path": "pixiedraw/", "boundary": "public web app"},
        {"name": "PiXFiND", "path": "pixfind/", "boundary": "public web app"},
        {"name": "PiXiEELENS", "path": "pixiee-lens/", "boundary": "public web app"},
        {"name": "Market", "path": "market/", "boundary": "public web app with Supabase/Stripe boundaries"},
        {"name": "Maoitu", "path": "maoitu/", "boundary": "public web app"},
        {"name": "QR Maker", "path": "qr-maker/", "boundary": "public web app"},
        {"name": "Capacitor shell", "path": "app-shell/pixieed-capacitor/", "boundary": "native build boundary"},
        {"name": "Supabase", "path": "supabase/", "boundary": "database/functions boundary"},
    ]

    write_json("repository-inventory.json", {
        "schema_version": 1,
        "work_package": "WP-000",
        "captured_on": "2026-08-06",
        "repository": {
            "commit": commit,
            "branch": git_value("branch", "--show-current"),
            "remote_tracking": git_value("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"),
            "workspace_status_capture": "after WP-000 context bootstrap; the worktree was already dirty",
            "status_entries": len(status),
            "modified_entries": sum(1 for line in status if line[:2].strip() and not line.startswith("??")),
            "untracked_entries": sum(1 for line in status if line.startswith("??")),
            "preservation_note": "Pre-existing user changes are intentionally preserved and are not classified as WP-000 edits.",
        },
        "packages": packages,
        "applications": applications,
        "build_boundaries": [
            {"command": "npm run build:web", "cwd": "app-shell/pixieed-capacitor", "effect": "stage web assets for native shell"},
            {"command": "npm run cap:sync", "cwd": "app-shell/pixieed-capacitor", "effect": "stage and sync native projects"},
            {"command": "node scripts/static-server.mjs", "cwd": ".", "effect": "local static server"},
            {"command": "supabase migration list", "cwd": ".", "effect": "read-only local/remote migration metadata"},
        ],
        "production_actions_not_run": [
            "supabase db push",
            "supabase functions deploy",
            "npm run cap:sync",
            "native release/archive commands",
            "git commit",
            "git push",
        ],
    })


def build_routes() -> None:
    html_paths: list[Path] = []
    for path in ROOT.rglob("*.html"):
        if not path.is_file() or any(part in EXCLUDED_PARTS for part in path.parts):
            continue
        if "app-shell" in path.parts:
            continue
        html_paths.append(path)

    routes: list[dict[str, object]] = []
    for path in sorted(html_paths):
        relative = Path(rel(path))
        if relative.name == "index.html":
            route = "/" if relative.parent == Path(".") else f"/{relative.parent.as_posix().strip('/')}/"
        else:
            route = f"/{relative.as_posix()}"
        title_match = re.search(r"<title[^>]*>(.*?)</title>", read_text(path), re.I | re.S)
        title = re.sub(r"\s+", " ", title_match.group(1)).strip() if title_match else None
        kind = "public-verification-file" if relative.name.startswith("google") else "source-html"
        routes.append({"route": route, "source": rel(path), "kind": kind, "title": title})

    sitemap_path = ROOT / "sitemap.xml"
    sitemap_urls = re.findall(r"<loc>\s*([^<]+?)\s*</loc>", read_text(sitemap_path), re.I)
    write_json("route-inventory.json", {
        "schema_version": 1,
        "work_package": "WP-000",
        "captured_on": "2026-08-06",
        "source_scope": "HTML source files excluding app-shell generated output, node_modules, backup, and development-only split work area",
        "routes": routes,
        "sitemap": {"source": "sitemap.xml", "urls": sitemap_urls},
        "route_policy_notes": [
            "An index.html file maps to the directory route; non-index HTML keeps its .html path.",
            "Google verification HTML files are public files but are not product routes.",
            "Generated Capacitor output is excluded from the public source route inventory.",
        ],
    })


def build_supabase_inventory() -> None:
    migration_paths = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
    table_re = re.compile(r"\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?P<name>(?:(?:public|collab_v1|storage)\.)?[A-Za-z_][A-Za-z0-9_]*)", re.I)
    function_re = re.compile(r"\bcreate\s+(?:or\s+replace\s+)?function\s+(?P<name>(?:(?:public|collab_v1|auth|storage)\.)?[A-Za-z_][A-Za-z0-9_]*)\s*\(", re.I)
    policy_re = re.compile(r"\bcreate\s+policy\s+(?P<policy>[\"A-Za-z0-9_ -]+?)\s+on\s+(?P<table>(?:(?:public|collab_v1|storage)\.)?[A-Za-z_][A-Za-z0-9_]*)", re.I)
    rls_re = re.compile(r"\balter\s+table\s+(?P<table>(?:(?:public|collab_v1|storage)\.)?[A-Za-z_][A-Za-z0-9_]*)\s+enable\s+row\s+level\s+security", re.I)
    bucket_insert_re = re.compile(r"\binsert\s+into\s+storage\.buckets\b", re.I)
    bucket_literal_re = re.compile(r"\bbucket_id\s*=\s*'(?P<bucket>[^']+)'", re.I)
    bucket_values_re = re.compile(r"\bvalues\s*\(\s*'(?P<bucket>[^']+)'", re.I)
    realtime_re = re.compile(r"\balter\s+publication\s+supabase_realtime\s+add\s+table\s+(?P<table>(?:(?:public|collab_v1)\.)?[A-Za-z_][A-Za-z0-9_]*)", re.I)
    grant_re = re.compile(r"\b(?P<verb>grant|revoke)\b", re.I)

    tables: list[dict[str, object]] = []
    functions: list[dict[str, object]] = []
    policies: list[dict[str, object]] = []
    rls: list[dict[str, object]] = []
    bucket_declarations: list[dict[str, object]] = []
    bucket_references: list[dict[str, object]] = []
    realtime: list[dict[str, object]] = []
    grants: list[dict[str, object]] = []
    security_definer: list[dict[str, object]] = []
    migration_inventory: list[dict[str, object]] = []

    for path in migration_paths:
        text = read_text(path)
        lines = text.splitlines()
        category = "other"
        lower_name = path.name.lower()
        if "market" in lower_name or "inheritance" in lower_name:
            category = "market"
        elif "pixisync" in lower_name or "collab" in lower_name or "shared_project" in lower_name:
            category = "pixisync-or-legacy-shared-project"
        elif "social" in lower_name:
            category = "social"
        for number, line in enumerate(lines, start=1):
            for match in table_re.finditer(line):
                tables.append({"name": match.group("name"), "source": rel(path), "line": number})
            for match in function_re.finditer(line):
                functions.append({"name": match.group("name"), "source": rel(path), "line": number})
            policy_match = policy_re.search(line)
            if policy_match:
                policies.append({"policy": policy_match.group("policy").strip('" '), "table": policy_match.group("table"), "source": rel(path), "line": number})
            rls_match = rls_re.search(line)
            if rls_match:
                rls.append({"table": rls_match.group("table"), "source": rel(path), "line": number})
            if bucket_insert_re.search(line):
                bucket_declarations.append({"source": rel(path), "line": number})
            for match in bucket_literal_re.finditer(line):
                bucket_references.append({"bucket": match.group("bucket"), "source": rel(path), "line": number, "kind": "bucket_id predicate"})
            values_match = bucket_values_re.search(line)
            if values_match and "storage.buckets" in text[max(0, text.find(line) - 500): text.find(line) + 500]:
                bucket_references.append({"bucket": values_match.group("bucket"), "source": rel(path), "line": number, "kind": "bucket insert first value"})
            realtime_match = realtime_re.search(line)
            if realtime_match:
                realtime.append({"table": realtime_match.group("table"), "source": rel(path), "line": number})
            grant_match = grant_re.search(line)
            if grant_match:
                grants.append({"verb": grant_match.group("verb").lower(), "source": rel(path), "line": number})
            if re.search(r"\bsecurity\s+definer\b", line, re.I):
                security_definer.append({"source": rel(path), "line": number})
        migration_inventory.append({"file": rel(path), "category": category})

    source_paths = source_files((".js", ".mjs", ".ts", ".html"))
    rpc_re = re.compile(r"\.rpc\(\s*['\"](?P<rpc>[A-Za-z0-9_]+)['\"]", re.I)
    invoke_re = re.compile(r"functions\.invoke\(\s*['\"](?P<function>[A-Za-z0-9_-]+)['\"]", re.I)
    rpc_calls: list[dict[str, object]] = []
    edge_invocations: list[dict[str, object]] = []
    for path in source_paths:
        rpc_calls.extend(line_records(path, rpc_re))
        edge_invocations.extend(line_records(path, invoke_re))

    def unique(values: list[str]) -> list[str]:
        return sorted(set(values))

    bucket_names = unique([entry["bucket"] for entry in bucket_references])
    table_names = unique([entry["name"] for entry in tables])
    function_names = unique([entry["name"] for entry in functions])
    policy_names = unique([entry["policy"] for entry in policies])
    write_json("supabase-schema-inventory.json", {
        "schema_version": 1,
        "work_package": "WP-000",
        "captured_on": "2026-08-06",
        "source_scope": "supabase/migrations/*.sql plus repository client/function references",
        "local_migrations": {
            "count": len(migration_paths),
            "files": migration_inventory,
        },
        "remote_migration_metadata": {
            "command": "supabase migration list",
            "mode": "read-only",
            "observed": "CLI output showed Local and Remote columns matching for displayed migrations through 20260805020000",
            "json_export": "not captured because a second -o json invocation required an access token",
            "database_write": False,
            "collation_warning": "database postgres has a collation version mismatch",
        },
        "tables": {"declarations": tables, "unique_names": table_names},
        "functions": {"declarations": functions, "unique_names": function_names},
        "policies": {"declarations": policies, "unique_names": policy_names},
        "row_level_security": {"enable_statements": rls, "unique_tables": unique([entry["table"] for entry in rls])},
        "storage": {
            "bucket_insert_sites": bucket_declarations,
            "bucket_references": bucket_references,
            "unique_bucket_names": bucket_names,
        },
        "realtime": {"publication_add_table_statements": realtime, "unique_tables": unique([entry["table"] for entry in realtime])},
        "grants_and_revokes": grants,
        "security_definer_sites": security_definer,
        "client_rpc_calls": rpc_calls,
        "edge_function_invocations": edge_invocations,
        "known_stripe_boundary": {
            "shared_client": "supabase/functions/_shared/market-stripe.ts",
            "api_version_reference": "2025-06-30.basil",
            "secrets_or_values": "not recorded in inventory",
        },
        "limitations": [
            "This is a source/migration inventory, not a live row-count or storage-object inventory.",
            "Remote migration output was observed read-only but was not exported as JSON due to CLI authentication requirements.",
            "Function declarations include historical create-or-replace occurrences; unique_names is the deduplicated source name set.",
        ],
    })


def build_storage_and_features() -> None:
    source_text = "\n".join(read_text(path) for path in source_files((".js", ".mjs", ".html")))
    direct_opfs = bool(re.search(r"navigator\.storage\.getDirectory|FileSystemDirectoryHandle", source_text))
    picker_hits = []
    picker_re = re.compile(r"\b(?P<api>showOpenFilePicker|showSaveFilePicker|showDirectoryPicker)\b")
    for path in source_files((".js", ".mjs", ".html")):
        picker_hits.extend(line_records(path, picker_re))
    local_storage_re = re.compile(r"\b(?P<storage>localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(\s*['\"](?P<key>[^'\"]+)")
    local_storage = []
    for path in source_files((".js", ".mjs", ".html")):
        local_storage.extend(line_records(path, local_storage_re))

    indexeddb_names = {
        "pixiedraw-autosave": {"source": "pixiedraw/assets/js/modules/project-storage-utils.js", "version": 3, "stores": ["handles", "recentProjects", "sharedLocalOpJournal", "localProjectManifests", "localProjectSheetCheckpoints", "localProjectJournals", "localProjectThumbnails", "localProjectCurrentManifests"]},
        "pixiedraw-autosave-v2-experimental": {"source": "pixiedraw/assets/js/modules/project-storage-utils.js", "version": 1, "stores": ["v2 project stores; exact store set is defined by autosave-schema-v2-indexeddb-utils.js"]},
        "pixiedraw-cold-history-v1": {"source": "pixiedraw/assets/js/modules/cold-history-store-utils.js", "stores": ["projectMeta", "historyChunks"]},
        "pixiedraw-timelapse-operations-v1": {"source": "pixiedraw/assets/js/modules/timelapse-operation-store-utils.js", "version": 3, "stores": ["timelapseEvents", "timelapseOperationStates", "timelapseProjectMeta", "timelapseCheckpoints"]},
        "pixiedraw-ios-snapshots": {"source": "pixiedraw/assets/js/modules/ui-static-config.js", "version": 1, "stores": ["snapshots"], "runtime_supported": False},
        "pixieed-pixisync-v1": {"source": "pixiedraw/assets/js/modules/pixisync-journal-utils.js", "version": 1, "stores": ["pendingOperations"]},
        "pixieed-pixfind-transfer": {"source": "pixiedraw/assets/js/modules/pixfind-mode-utils.js", "stores": ["payloads"]},
        "pixieed-market-import-v1": {"source": "scripts/market-purchase-delivery.js", "stores": ["imports"]},
        "pixieed-market-project-transfers": {"source": "market/sell.js", "stores": ["transfers"]},
        "pixieed-market-listing-drafts": {"source": "market/sell.js", "version": 1, "stores": ["listing drafts; exact name is defined in market/sell.js"]},
        "pixieed-workspace-v1": {"source": "scripts/pixieed-workspace.js", "version": 1, "stores": ["handles"], "keys": ["workspaceDirectory"]},
        "pixiedraw-pre-update-checkpoints-dev": {"source": "pixiedraw/assets/js/modules/pre-update-checkpoint-utils.js", "version": 1, "development_only": True},
    }

    write_json("storage-and-formats.json", {
        "schema_version": 1,
        "work_package": "WP-000",
        "captured_on": "2026-08-06",
        "indexeddb": indexeddb_names,
        "file_system_access_api": {
            "present": bool(picker_hits),
            "apis": sorted(set(entry["api"] for entry in picker_hits)),
            "references": picker_hits,
            "workspace_contract": {"name": "PiXiEED", "directories": ["Projects", "Exports"], "source": "scripts/pixieed-workspace.js"},
        },
        "opfs": {"direct_api_reference_found": direct_opfs, "status": "not found in scanned source" if not direct_opfs else "reference found; inspect before migration"},
        "formats": [
            {"format": ".pxd", "status": "current project/archive path", "sources": ["pixiedraw/index.html", "pixiedraw/assets/js/modules/document-model.js", "pixiedraw/assets/js/modules/project-storage-v2-archive-codec.js"]},
            {"format": ".pixieedraw / .pxdraw", "status": "legacy import/compatibility path", "sources": ["market/listing-package-utils.js", "pixiedraw/assets/js/modules/document-model.js"]},
            {"format": "PNG/JPEG/GIF/SVG/APNG", "status": "image import/export references", "sources": ["pixiedraw/assets/js/modules/image-utils.js", "pixiedraw/assets/js/modules/export-utils.js"]},
            {"format": "Timelapse GIF", "status": "export/replay path", "sources": ["pixiedraw/assets/js/modules/timelapse-dialog-utils.js", "pixiedraw/assets/js/modules/timelapse-replay-utils.js"]},
        ],
        "local_storage_references": local_storage,
        "synthetic_fixtures": [
            "docs/inventory/fixtures/legacy-pixiedraw-v1.synthetic.json",
            "docs/inventory/fixtures/market-purchase.synthetic.json",
            "docs/inventory/fixtures/pixisync-convergence.synthetic.json",
        ],
        "privacy_boundary": "No user creative content, real account identifiers, access tokens, or production object names are stored in fixtures.",
    })

    write_json("pixiedraw-feature-inventory.json", {
        "schema_version": 1,
        "work_package": "WP-000",
        "captured_on": "2026-08-06",
        "source_entry": "pixiedraw/index.html -> assets/js/app.js and split module scripts",
        "documentation_mismatch": {
            "path": "docs/project-file-map.md",
            "claim": "production uses true pre-split single app.js and index does not load modules",
            "observed": "pixiedraw/index.html currently loads assets/js/modules/*.js and app.js",
            "classification": "documentation drift; no production change made in WP-000",
        },
        "features": [
            {"id": "raster-drawing", "classification": "keep", "evidence": ["pixiedraw/assets/js/app.js", "pixiedraw/assets/js/modules/document-model.js", "pixiedraw/assets/js/modules/pixel-patch-history-utils.js"]},
            {"id": "palette-and-color-codecs", "classification": "keep", "evidence": ["pixiedraw/assets/js/modules/palette-utils.js", "pixiedraw/assets/js/modules/color-codec-utils.js"]},
            {"id": "layers-frames-and-animation", "classification": "keep", "evidence": ["pixiedraw/assets/js/modules/document-model.js", "pixiedraw/assets/js/modules/timelapse-operation-store-utils.js"]},
            {"id": "local-project-autosave", "classification": "keep", "evidence": ["pixiedraw/assets/js/modules/project-storage-utils.js", "pixiedraw/assets/js/modules/local-project-journal-utils.js"]},
            {"id": "v2-project-archive", "classification": "migrate", "evidence": ["pixiedraw/assets/js/modules/project-storage-v2-archive-codec.js", "scripts/test-pixiedraw-pxd-index8-roundtrip.mjs"]},
            {"id": "pixisync-v1", "classification": "keep", "evidence": ["pixiedraw/assets/js/modules/pixisync-operation-codec.js", "pixiedraw/assets/js/modules/pixisync-realtime-client.js", "supabase/migrations/20260730001657_pixisync_collab_v1_access_rpc.sql"]},
            {"id": "legacy-shared-project-flow", "classification": "retire", "evidence": ["pixiedraw/assets/js/app.js:14", "SHARED_PROJECTS_ENABLED=false"]},
            {"id": "multi-canvas", "classification": "replace-or-defer", "evidence": ["pixiedraw/assets/js/modules/state-normalizers.js:49", "MULTI_CANVAS_FEATURE_ENABLED=false"]},
            {"id": "reload-snapshot", "classification": "keep", "evidence": ["pixiedraw/assets/js/modules/ui-static-config.js:330", "RELOAD_SNAPSHOT_ENABLED=true"]},
        ],
        "feature_flags": [
            {"name": "SHARED_PROJECTS_ENABLED", "value": False, "source": "pixiedraw/assets/js/app.js:14"},
            {"name": "PIXISYNC_V1_ENABLED", "value": True, "source": "pixiedraw/assets/js/app.js:15"},
            {"name": "MULTI_CANVAS_FEATURE_ENABLED", "value": False, "source": "pixiedraw/assets/js/modules/state-normalizers.js:49"},
            {"name": "RELOAD_SNAPSHOT_ENABLED", "value": True, "source": "pixiedraw/assets/js/modules/ui-static-config.js:330"},
            {"name": "IOS_SNAPSHOT_SUPPORTED", "value": False, "source": "pixiedraw/assets/js/modules/ui-static-config.js:414"},
        ],
    })


def build_baseline_inventory() -> None:
    write_json("baseline-results.json", {
        "schema_version": 1,
        "work_package": "WP-000",
        "captured_on": "2026-08-06",
        "repository_commit": git_value("rev-parse", "HEAD"),
        "commands": [
            {"command": "node --check pixiedraw/assets/js/app.js", "result": "pass"},
            {"command": "node --check market/market.js && node --check market/item.js && node --check market/sell.js", "result": "pass"},
            {"command": "node --check pixfind/app.js", "result": "pass"},
            {"command": "node --check scripts/shared-bottom-nav.js && node --check scripts/shared-auth-panel.js", "result": "pass"},
            {"command": "(cd app-shell/pixieed-capacitor && npm run doctor)", "result": "pass", "detail": "OK: 34 entries are available for staging."},
            {"command": "node scripts/test-pixiedraw-pxd-index8-roundtrip.mjs", "result": "pass", "detail": "PXD index8 roundtrip checks passed; sandbox socket restriction required one approved rerun."},
            {"command": "pure baseline scripts (77 candidates)", "result": "partial", "detail": "63 passed; 14 pre-existing failures recorded in .codex/PIXIEED_TEST_RESULTS.md."},
            {"command": "npm test", "result": "fail", "detail": "Root package.json has no test script."},
            {"command": "git diff --check", "result": "pass"},
            {"command": "supabase migration list", "result": "read-only observation", "detail": "Displayed Local/Remote migration columns matched through 20260805020000; no migration applied."},
        ],
        "known_unresolved_failures": [
            "scripts/test-account-auth-state-stability.mjs: missing scripts/account-dev-tools.js",
            "scripts/test-account-reward-dashboard.mjs: assertion drift in account UI text",
            "scripts/test-ad-lifecycle.mjs: assertion drift around retry symbols",
            "scripts/test-ad-permission-management.mjs: missing adFreeGrantForm",
            "scripts/test-market-fee-schedule.mjs: 5-second UI differs from test's 10-second expectation",
            "scripts/test-market-lineage-pageview-rewards.mjs: missing pageviewRewardSettlementMonth",
            "scripts/test-market-listing-package.mjs: detectFormat export shape mismatch",
            "scripts/test-market-pageview-reward-budget.mjs: documentation phrase drift",
            "scripts/test-market-verification.mjs: expected legacy market_public_asset_v1 RPC shape",
            "scripts/test-pixiedraw-existing-project-native-scale.mjs: expected legacy normalizer line shape",
            "scripts/test-pixiedraw-export-runtime-wiring.mjs: cache-buster drift",
            "scripts/test-pixiedraw-new-project-session-handoff.mjs: new-project id assertion",
            "scripts/test-pixiedraw-release-cache.mjs: cache-buster drift",
            "scripts/test-pixisync-paid-slots.mjs: cache-buster drift",
        ],
        "production_data_changes": False,
        "production_deployments": False,
    })


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    build_repository_inventory()
    build_routes()
    build_supabase_inventory()
    build_storage_and_features()
    build_baseline_inventory()
    print(f"WP-000 inventory written to {OUT}")


if __name__ == "__main__":
    main()
