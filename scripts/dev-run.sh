#!/usr/bin/env bash
# Runs the on-device pipeline on labelled research photos through the dev deep
# link and prints one line per subject. Development builds only.
#
#   scripts/dev-run.sh <tag> <age_months> <M|F> <weight_kg> [...]
#   e.g. scripts/dev-run.sh 1232 117 F 23.6 1769 115 M 28.9
#
# Photos come from ../dataset/anthrovision/<tag>/frontal.jpg and are copied
# into the app's private files directory with run-as (debug builds only).
set -u
export MSYS_NO_PATHCONV=1
ADB="${ANDROID_HOME:-$LOCALAPPDATA/Android/Sdk}/platform-tools/adb.exe"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
PKG=com.nutrivision.app

while [ $# -ge 4 ]; do
  tag=$1; age=$2; sex=$3; weight=$4; shift 4
  src="$(cygpath -w "$HERE/../dataset/anthrovision/$tag/frontal.jpg" 2>/dev/null || echo "$HERE/../dataset/anthrovision/$tag/frontal.jpg")"
  if [ ! -f "$src" ]; then echo "$tag: no photo at $src"; continue; fi
  "$ADB" push "$src" "/data/local/tmp/$tag.jpg" >/dev/null
  "$ADB" shell "run-as $PKG cp /data/local/tmp/$tag.jpg files/$tag.jpg"
  "$ADB" logcat -c
  "$ADB" shell "am start -a android.intent.action.VIEW -d 'nutrivisonapp://dev?path=/data/user/0/$PKG/files/$tag.jpg&age=$age&sex=$sex&weight=$weight&name=$tag'" >/dev/null
  for _ in $(seq 1 90); do
    if "$ADB" logcat -d 2>/dev/null | grep -q "\[dev\] \(outcome\|error\)\|FATAL EXCEPTION"; then break; fi
    sleep 2
  done
  "$ADB" logcat -d 2>/dev/null | grep -E "\[dev\]|FATAL EXCEPTION" | sed 's/.*\[dev\] //' | python "$(cygpath -w "$HERE/scripts/dev-run-parse.py" 2>/dev/null || echo "$HERE/scripts/dev-run-parse.py")" "$tag"
  sleep 1
done
