#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"${SCRIPT_DIR}/android-env.sh" bash -lc '
  sdkmanager --sdk_root="${ANDROID_SDK_ROOT}" --licenses <<EOF
y
y
y
y
y
y
y
y
y
y
EOF
  sdkmanager --sdk_root="${ANDROID_SDK_ROOT}" \
    "platform-tools" \
    "platforms;android-36" \
    "build-tools;36.0.0"
'
