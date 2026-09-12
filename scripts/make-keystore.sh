#!/usr/bin/env bash
# Creates the release keystore the app is signed with, plus the properties
# file plugins/with-release-signing.js reads. Run once; back up the result.
#
#   bash scripts/make-keystore.sh
#
# Output (git-ignored): credentials/release.keystore, credentials/keystore.properties
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$HERE/credentials"
KEYTOOL="${JAVA_HOME:-C:/Program Files/Android/Android Studio/jbr}/bin/keytool.exe"
[ -x "$KEYTOOL" ] || KEYTOOL=keytool

mkdir -p "$DIR"
if [ -f "$DIR/release.keystore" ]; then
  echo "credentials/release.keystore already exists - not overwriting (that would orphan installed builds)."
  exit 0
fi

# One random password for store and key; it lives next to the keystore, so
# guard the folder, not the string.
PASS="$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 24)"
"$KEYTOOL" -genkeypair -v \
  -keystore "$DIR/release.keystore" -storetype PKCS12 \
  -alias nutrivision -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$PASS" -keypass "$PASS" \
  -dname "CN=NutriVision, OU=Capstone, O=PES University, L=Bengaluru, ST=Karnataka, C=IN"

cat > "$DIR/keystore.properties" <<PROPS
storeFile=release.keystore
storePassword=$PASS
keyAlias=nutrivision
keyPassword=$PASS
PROPS
echo "wrote credentials/release.keystore and credentials/keystore.properties"
echo "BACK THESE UP. Losing them means the next version cannot update installed copies."
