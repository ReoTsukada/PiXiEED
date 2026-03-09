#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
UNSIGNED_MODE="${1:-}"
DEFAULT_ARCHIVE_PATH="${PROJECT_ROOT}/ios/build/PiXiEED.xcarchive"
DEFAULT_RESULT_BUNDLE_PATH="${PROJECT_ROOT}/ios/build/PiXiEEDArchive.xcresult"
if [[ "${UNSIGNED_MODE}" == "--unsigned" ]]; then
  DEFAULT_ARCHIVE_PATH="${PROJECT_ROOT}/ios/build/PiXiEED-unsigned.xcarchive"
  DEFAULT_RESULT_BUNDLE_PATH="${PROJECT_ROOT}/ios/build/PiXiEEDArchive-unsigned.xcresult"
fi
ARCHIVE_PATH="${PIXIEED_IOS_ARCHIVE_PATH:-${DEFAULT_ARCHIVE_PATH}}"
RESULT_BUNDLE_PATH="${PIXIEED_IOS_RESULT_BUNDLE_PATH:-${DEFAULT_RESULT_BUNDLE_PATH}}"

mkdir -p "$(dirname "${ARCHIVE_PATH}")"
mkdir -p "$(dirname "${RESULT_BUNDLE_PATH}")"

if [[ -e "${RESULT_BUNDLE_PATH}" && -z "${PIXIEED_IOS_RESULT_BUNDLE_PATH:-}" ]]; then
  RESULT_BUNDLE_PATH="${PROJECT_ROOT}/ios/build/PiXiEEDArchive-$(date +%Y%m%d-%H%M%S).xcresult"
fi

cd "${PROJECT_ROOT}/ios/App"

COMMAND=(
  xcodebuild
  -project App.xcodeproj
  -scheme App
  -destination "generic/platform=iOS"
  -archivePath "${ARCHIVE_PATH}"
  -resultBundlePath "${RESULT_BUNDLE_PATH}"
)

if [[ "${UNSIGNED_MODE}" == "--unsigned" ]]; then
  COMMAND+=(
    CODE_SIGNING_ALLOWED=NO
    CODE_SIGNING_REQUIRED=NO
  )
else
  COMMAND+=(
    CODE_SIGN_STYLE=Automatic
  )
  if [[ -n "${PIXIEED_IOS_BUNDLE_ID:-}" ]]; then
    COMMAND+=(PRODUCT_BUNDLE_IDENTIFIER="${PIXIEED_IOS_BUNDLE_ID}")
  fi
  if [[ -n "${PIXIEED_IOS_DEVELOPMENT_TEAM:-}" ]]; then
    COMMAND+=(DEVELOPMENT_TEAM="${PIXIEED_IOS_DEVELOPMENT_TEAM}")
  fi
  if [[ "${PIXIEED_IOS_ALLOW_PROVISIONING_UPDATES:-0}" == "1" ]]; then
    COMMAND+=(-allowProvisioningUpdates)
  fi
fi

COMMAND+=(archive)
"${COMMAND[@]}"

echo "Archive: ${ARCHIVE_PATH}"
echo "Result bundle: ${RESULT_BUNDLE_PATH}"
