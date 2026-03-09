#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ANDROID_DIR="${PROJECT_ROOT}/android"
KEYSTORE_PATH="${PIXIEED_ANDROID_KEYSTORE_PATH:-${ANDROID_DIR}/pixieed-upload.jks}"
KEYSTORE_PROPERTIES_PATH="${ANDROID_DIR}/keystore.properties"
KEY_ALIAS="${PIXIEED_ANDROID_KEY_ALIAS:-pixieed-upload}"
STORE_PASSWORD="${PIXIEED_ANDROID_KEYSTORE_PASSWORD:-$(openssl rand -hex 16)}"
KEY_PASSWORD="${PIXIEED_ANDROID_KEY_PASSWORD:-${STORE_PASSWORD}}"
KEY_DNAME="${PIXIEED_ANDROID_KEY_DNAME:-CN=PiXiEED Upload Key, OU=PiXiEED, O=PiXiEED, L=Tokyo, ST=Tokyo, C=JP}"

if [[ -e "${KEYSTORE_PATH}" ]]; then
  echo "Keystore already exists: ${KEYSTORE_PATH}" >&2
  exit 1
fi

"${SCRIPT_DIR}/android-env.sh" bash -lc '
  keytool -genkeypair \
    -v \
    -keystore "'"${KEYSTORE_PATH}"'" \
    -storepass "'"${STORE_PASSWORD}"'" \
    -alias "'"${KEY_ALIAS}"'" \
    -keypass "'"${KEY_PASSWORD}"'" \
    -keyalg RSA \
    -keysize 4096 \
    -sigalg SHA256withRSA \
    -validity 10000 \
    -dname "'"${KEY_DNAME}"'"
'

cat > "${KEYSTORE_PROPERTIES_PATH}" <<EOF
storeFile=${KEYSTORE_PATH}
storePassword=${STORE_PASSWORD}
keyAlias=${KEY_ALIAS}
keyPassword=${KEY_PASSWORD}
EOF

chmod 600 "${KEYSTORE_PROPERTIES_PATH}"

echo "Keystore: ${KEYSTORE_PATH}"
echo "Properties: ${KEYSTORE_PROPERTIES_PATH}"
