#!/usr/bin/env bash

set -euo pipefail

command -v xcodebuild >/dev/null
command -v xcrun >/dev/null

echo "Xcode:"
xcodebuild -version
echo

echo "SDKs:"
xcodebuild -showsdks
echo

echo "Simulator runtimes:"
xcrun simctl list runtimes
echo

echo "Available iOS simulators:"
if ! xcrun simctl list devices available 2>/tmp/pixieed-simctl.err | sed -n '/-- iOS /,/--/p'; then
  echo "simctl is not available in this environment."
  cat /tmp/pixieed-simctl.err
fi
