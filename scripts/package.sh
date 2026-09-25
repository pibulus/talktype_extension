#!/usr/bin/env bash
# Zip src/ into a Chrome Web Store upload. manifest.json ends up at the zip root.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(python3 -c "import json;print(json.load(open('src/manifest.json'))['version'])")
OUT="dist/talktype-extension-${VERSION}.zip"
mkdir -p dist
rm -f "$OUT"
( cd src && zip -qr "../$OUT" . -x '*.DS_Store' -x '__MACOSX/*' -x '*.map' )
echo "→ $OUT ($(du -h "$OUT" | cut -f1))"
unzip -l "$OUT" | tail -1
