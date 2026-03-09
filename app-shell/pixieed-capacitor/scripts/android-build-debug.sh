#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

"${SCRIPT_DIR}/android-env.sh" bash -lc '
  cd "'"${PROJECT_ROOT}"'/android"
  ./gradlew assembleDebug
'
