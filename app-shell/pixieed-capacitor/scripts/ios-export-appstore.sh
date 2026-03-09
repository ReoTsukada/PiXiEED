#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ARCHIVE_PATH="${PIXIEED_IOS_ARCHIVE_PATH:-${PROJECT_ROOT}/ios/build/PiXiEED.xcarchive}"
DEFAULT_EXPORT_PATH="${PROJECT_ROOT}/ios/build/export/app-store-connect"
EXPORT_PATH="${PIXIEED_IOS_EXPORT_PATH:-${DEFAULT_EXPORT_PATH}}"
EXPORT_OPTIONS_PLIST="${PIXIEED_IOS_EXPORT_OPTIONS_PLIST:-${PROJECT_ROOT}/ios/export-options/app-store-connect.plist}"

if [[ ! -d "${ARCHIVE_PATH}" ]]; then
  echo "Archive not found: ${ARCHIVE_PATH}" >&2
  echo "Run npm run ios:archive first." >&2
  exit 1
fi

if [[ -e "${EXPORT_PATH}" && -z "${PIXIEED_IOS_EXPORT_PATH:-}" ]]; then
  EXPORT_PATH="${PROJECT_ROOT}/ios/build/export/app-store-connect-$(date +%Y%m%d-%H%M%S)"
fi

mkdir -p "${EXPORT_PATH}"

COMMAND=(
  xcodebuild
  -exportArchive
  -archivePath "${ARCHIVE_PATH}"
  -exportPath "${EXPORT_PATH}"
  -exportOptionsPlist "${EXPORT_OPTIONS_PLIST}"
)

if [[ "${PIXIEED_IOS_ALLOW_PROVISIONING_UPDATES:-0}" == "1" ]]; then
  COMMAND+=(-allowProvisioningUpdates)
fi

"${COMMAND[@]}"

echo "Export: ${EXPORT_PATH}"
