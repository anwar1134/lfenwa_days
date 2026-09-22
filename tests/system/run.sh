#!/usr/bin/env bash
# Runs the Lfenwa System test suites (Phase 1 + Phase 2).
#
#   bash tests/system/run.sh            unit + storage suites (needs only Node 22 + npm + internet once)
#   bash tests/system/run.sh --e2e      also the real-browser suite (needs a built `out/`, see e2e.mjs)
#
# tsx and fake-indexeddb are installed into a TEMP directory, NOT into this
# project: package.json / package-lock.json are never touched.
# Set LFENWA_TEST_WORKDIR to reuse an already-installed directory.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
WORK="${LFENWA_TEST_WORKDIR:-$(mktemp -d)}"
mkdir -p "$WORK"
cd "$WORK"

if [ ! -d node_modules/tsx ] || [ ! -d node_modules/fake-indexeddb ]; then
  [ -f package.json ] || npm init -y >/dev/null
  npm install --no-audit --no-fund tsx fake-indexeddb >/dev/null
fi
cp "$HERE"/*.ts "$WORK"/

TSX=(npx tsx --tsconfig "$REPO/tsconfig.json")
failed=0
run() { echo; echo "── $*"; "${TSX[@]}" "$@" || failed=1; }

# Phase 1
run engine.test.ts
for s in upgrade fresh award backup; do run storage.test.ts "$s"; done
# Phase 2
run quests.engine.test.ts
for s in generation completion persistence existing backup; do run quests.storage.test.ts "$s"; done

if [ "${1:-}" = "--e2e" ]; then
  if [ ! -d node_modules/playwright-core ] || [ ! -d node_modules/@sparticuz ]; then
    npm install --no-audit --no-fund playwright-core @sparticuz/chromium >/dev/null
  fi
  cp "$HERE"/e2e.mjs "$WORK"/
  echo; echo "── e2e.mjs"
  LFENWA_REPO="$REPO" node e2e.mjs || failed=1
fi

echo
if [ "$failed" -eq 0 ]; then echo "ALL SUITES PASSED"; else echo "SOME SUITES FAILED"; fi
exit "$failed"
