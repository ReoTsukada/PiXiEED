#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
xcrun swift "${SCRIPT_DIR}/generate-app-icons.swift"
