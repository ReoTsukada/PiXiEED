#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TASK="${1:-bundleRelease}"

case "${TASK}" in
  assembleRelease)
    OUTPUT_PATH="${PROJECT_ROOT}/android/app/build/outputs/apk/release/app-release.apk"
    ;;
  bundleRelease)
    OUTPUT_PATH="${PROJECT_ROOT}/android/app/build/outputs/bundle/release/app-release.aab"
    ;;
  *)
    echo "Unsupported Gradle task: ${TASK}" >&2
    echo "Use assembleRelease or bundleRelease." >&2
    exit 1
    ;;
esac

if [[ -f "${PROJECT_ROOT}/android/keystore.properties" ]] || [[ -n "${PIXIEED_ANDROID_KEYSTORE_PATH:-}" ]]; then
  echo "Release signing config detected."
else
  echo "Release signing config not found. The artifact is only for validation until you set your upload key."
fi

"${SCRIPT_DIR}/android-env.sh" bash -lc '
  cd "'"${PROJECT_ROOT}"'/android"
  ./gradlew '"${TASK}"'
'

echo "Artifact: ${OUTPUT_PATH}"
