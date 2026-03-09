#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEFAULT_JAVA_HOME_21="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
DEFAULT_JAVA_HOME="/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home"
DEFAULT_ANDROID_SDK_ROOT="/opt/homebrew/share/android-commandlinetools"

if [[ -z "${JAVA_HOME:-}" && -d "${DEFAULT_JAVA_HOME_21}" ]]; then
  export JAVA_HOME="${DEFAULT_JAVA_HOME_21}"
fi

if [[ -z "${JAVA_HOME:-}" && -d "${DEFAULT_JAVA_HOME}" ]]; then
  export JAVA_HOME="${DEFAULT_JAVA_HOME}"
fi

if [[ -n "${JAVA_HOME:-}" ]]; then
  export PATH="${JAVA_HOME}/bin:${PATH}"
fi

if [[ -z "${ANDROID_SDK_ROOT:-}" && -d "${DEFAULT_ANDROID_SDK_ROOT}" ]]; then
  export ANDROID_SDK_ROOT="${DEFAULT_ANDROID_SDK_ROOT}"
fi

if [[ -n "${ANDROID_SDK_ROOT:-}" ]]; then
  export ANDROID_HOME="${ANDROID_SDK_ROOT}"
  export PATH="${ANDROID_SDK_ROOT}/platform-tools:${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin:${PATH}"
fi

cd "${PROJECT_ROOT}"
exec "$@"
