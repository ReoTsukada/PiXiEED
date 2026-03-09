#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"${SCRIPT_DIR}/android-env.sh" bash -lc '
  echo "JAVA_HOME=${JAVA_HOME:-}"
  echo "ANDROID_SDK_ROOT=${ANDROID_SDK_ROOT:-}"
  command -v java >/dev/null
  command -v sdkmanager >/dev/null
  command -v adb >/dev/null
  java -version
  sdkmanager --version
'
