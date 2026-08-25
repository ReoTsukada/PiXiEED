#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
import shutil


def main() -> int:
    parser = argparse.ArgumentParser(description="Initialize resumable Codex state files.")
    parser.add_argument("--root", default=".")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    codex = root / ".codex"
    codex.mkdir(parents=True, exist_ok=True)
    for directory in (codex / "prompts", codex / "context", codex / "evidence"):
        directory.mkdir(parents=True, exist_ok=True)

    template = root / "00_START_HERE" / "IMPLEMENTATION_STATE_TEMPLATE.yaml"
    targets = {
        codex / "PIXIEED_IMPLEMENTATION_STATE.yaml": template.read_text(encoding="utf-8"),
        codex / "PIXIEED_DECISIONS.md": (
            "# PiXiEED execution-time decisions\n\n"
            "Record evidence-backed decisions made during active Work Packages.\n"
        ),
        codex / "PIXIEED_BLOCKERS.md": (
            "# PiXiEED blockers\n\n"
            "Record only blockers that meet AGENTS.md stop conditions.\n"
        ),
        codex / "PIXIEED_TEST_RESULTS.md": (
            "# PiXiEED test results\n\n"
            "Record commands, environment, pass/fail counts, and unresolved failures.\n"
        ),
    }

    created = []
    preserved = []
    for path, content in targets.items():
        if path.exists():
            preserved.append(str(path.relative_to(root)))
            continue
        path.write_text(content, encoding="utf-8")
        created.append(str(path.relative_to(root)))

    print("Created:")
    for item in created:
        print(f"- {item}")
    print("Preserved:")
    for item in preserved:
        print(f"- {item}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
