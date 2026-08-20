#!/bin/bash
# Build a clean Chrome Web Store zip from src/.
#
# src/ contains test harnesses and dev leftovers that must NOT ship. This script
# copies src to a staging dir, drops those, and zips. Version comes from manifest.json
# so the filename and the manifest can never disagree.
set -euo pipefail

cd "$(dirname "$0")"
VERSION=$(python3 -c "import json;print(json.load(open('src/manifest.json'))['version'])")
OUT="dist/talktype-${VERSION}.zip"
STAGE=$(mktemp -d)

# Never ship: test pages, editor leftovers, the Svelte source of a compiled component,
# and robots.txt (meaningless inside an extension).
EXCLUDE=(
  "test-context-menu.html" "test-context-menu.js" "test-notification.html"
  "popup.js.orig" "AudioVisualizer.svelte" "robots.txt"
)

cp -R src/. "${STAGE}/"
for f in "${EXCLUDE[@]}"; do rm -f "${STAGE}/${f}"; done
find "${STAGE}" -name ".DS_Store" -delete

mkdir -p dist
rm -f "${OUT}"
(cd "${STAGE}" && zip -qr - .) > "${OUT}"
rm -rf "${STAGE}"

echo "📦 ${OUT}  ($(du -h "${OUT}" | cut -f1))"
echo "   dropped: ${EXCLUDE[*]}"
echo "   upload at https://chrome.google.com/webstore/devconsole"
