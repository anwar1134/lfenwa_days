#!/usr/bin/env bash
# Runs the Lfenwa System test suites (Phase 1: Core System).
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

export LFENWA_REPO="$REPO"   # some suites read the source of the project under test
TSX=(npx tsx --tsconfig "$REPO/tsconfig.json")
failed=0
run() { echo; echo "── $*"; "${TSX[@]}" "$@" || failed=1; }

# Pure logic (no storage)
run levels.test.ts
run engine.test.ts
run integrations.test.ts
run architecture.test.ts
# Storage, the XP gate, triggers, backup, and the Trading read boundary (in-memory IndexedDB;
# one scenario per process because lib/storage.ts caches its DB handle at module level)
for s in upgrade legacyv2 tabs fresh gate live projection backup trading; do run storage.test.ts "$s"; done

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
