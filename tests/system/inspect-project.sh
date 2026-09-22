#!/usr/bin/env bash
# READ-ONLY inspection of a Lfnawa Days checkout for Lfenwa System Phase 1.
# It WRITES NOTHING (no git changes, no file changes, no database access). It reports facts about
# the working tree you point it at, so Phase 1 can be verified against the ACTUAL project.
#
#   bash tests/system/inspect-project.sh                       # inspect the current directory
#   bash tests/system/inspect-project.sh ~/Downloads/Lfnawa-Days1
#   bash tests/system/inspect-project.sh ~/Downloads/Lfnawa-Days1 --run
#         --run additionally executes: npm run typecheck, npm run build, npm run lint, and the test runner
#         (build writes .next/ and out/, which are normal build outputs; still no source file is changed)
#
# Exit code: 0 when there are no FAIL lines, 1 otherwise.
set -u
REPO="${1:-.}"; RUN=0; [ "${2:-}" = "--run" ] && RUN=1
cd "$REPO" 2>/dev/null || { echo "cannot enter $REPO"; exit 2; }
REPO="$(pwd)"

PASS=0; FAIL=0
ok()   { echo "  PASS  $*"; PASS=$((PASS + 1)); }
bad()  { echo "  FAIL  $*"; FAIL=$((FAIL + 1)); }
info() { echo "  info  $*"; }
head_() { echo; echo "== $* =="; }
has()  { grep -qE "$1" "$2" 2>/dev/null; }

# Fingerprints of the PROTECTED Trades files and bridge, taken from the approved commit cc2df0a.
BASELINE_BRIDGE_SHA256="2630e97f9cb261542fffde8c1fddd7f40be55ca2595b63de7e590157d86c0a37"
BASELINE_TRADES_TREE_SHA256="23149649a02d16e83f7d1542dbe03771a02982e745cefbf17ab6eae9a0af8227"
BASELINE_TRADES_FILES=9

echo "Inspecting: $REPO"

head_ "1. Git"
if git rev-parse --git-dir >/dev/null 2>&1; then
  info "branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null)   HEAD: $(git log -1 --format='%h %s' 2>/dev/null)"
  n=$(git status --short 2>/dev/null | wc -l | tr -d ' ')
  info "git status: $n changed/untracked path(s)"
  git status --short 2>/dev/null | head -60 | sed 's/^/        /'
  [ "$n" -gt 60 ] && info "(first 60 shown)"
  if git cat-file -e cc2df0a 2>/dev/null; then
    if git merge-base --is-ancestor cc2df0a HEAD 2>/dev/null; then ok "approved baseline commit cc2df0a is in this branch's history"; else info "cc2df0a exists but is not an ancestor of HEAD"; fi
    tc=$(git diff --stat cc2df0a -- public/trades 2>/dev/null | wc -l | tr -d ' ')
    [ "$tc" = "0" ] && ok "git: public/trades has no difference from baseline commit cc2df0a" || bad "git: public/trades DIFFERS from baseline cc2df0a ($tc line(s) of diff --stat)"
  else
    info "baseline commit cc2df0a not found in this repo (skipping the git-based Trades comparison)"
  fi
else
  info "not a git repository — skipping git checks"
fi

head_ "2. Which Phase 1 / prototype code exists?"
present=0; missing=0
for f in types/system.ts lib/system/config/rules.ts lib/system/engine/rewards.ts lib/system/engine/projection.ts lib/system/store/service.ts \
         lib/system/integrations/index.ts lib/system/integrations/habits.ts lib/system/integrations/tasks.ts lib/system/integrations/trading.ts \
         components/life/system/SystemScreen.tsx components/life/system/TodayProgressCard.tsx app/system/page.tsx; do
  if [ -f "$f" ]; then present=$((present + 1)); else missing=$((missing + 1)); info "missing: $f"; fi
done
info "Phase 1 (core) files present: $present / 12"
[ "$missing" = "0" ] && ok "all Phase 1 core files are present" || info "Phase 1 core is NOT (fully) present in this tree"
# the abandoned prototype had different shapes: single-file engine/config/store and quests
proto=0
[ -f lib/system/engine.ts ] && { bad "prototype leftover: lib/system/engine.ts (single-file engine)"; proto=1; }
[ -f lib/system/config.ts ] && { bad "prototype leftover: lib/system/config.ts"; proto=1; }
[ -f lib/system/store.ts ]  && { bad "prototype leftover: lib/system/store.ts"; proto=1; }
[ -f components/life/system/DailyQuestsPanel.tsx ] && { bad "prototype leftover: DailyQuestsPanel.tsx (quests are Phase 3)"; proto=1; }
has 'systemEvents|"quests"|SYSTEM_STORES: StoreName\[\] = \["system"' lib/storage.ts && { bad "prototype leftover in lib/storage.ts (systemEvents / quests / system store)"; proto=1; }
[ "$proto" = "0" ] && ok "no prototype leftovers (no quests, no systemEvents/system stores)"
[ -d tests/system ] && info "tests present: $(ls tests/system 2>/dev/null | tr '\n' ' ')" || info "no tests/system directory"

head_ "3. lfnawaDaysDB implementation (lib/storage.ts)"
if [ -f lib/storage.ts ]; then
  v=$(grep -E '^const DB_VERSION' lib/storage.ts | grep -oE '[0-9]+' | head -1)
  info "DB_VERSION in code: ${v:-?}"
  has 'const DB_NAME = "lfnawaDaysDB"' lib/storage.ts && ok "database name is still lfnawaDaysDB" || bad "database name changed"
  if [ "${v:-0}" = "2" ]; then
    ok "DB_VERSION is 2"
    has 'systemProfile: "id"' lib/storage.ts && ok "store systemProfile (key id)" || bad "store systemProfile missing"
    has 'lifeEvents: "eventId"' lib/storage.ts && ok "store lifeEvents (key eventId)" || bad "store lifeEvents missing"
    has 'xpLedger: "id"' lib/storage.ts && ok "store xpLedger (key id)" || bad "store xpLedger missing"
    has '"lifeEvents", "xpLedger"\]' lib/storage.ts && ok "by_date index on lifeEvents and xpLedger" || bad "by_date index missing on lifeEvents/xpLedger"
    has 'lifeEvents: \[\["by_type", "type"\]\]' lib/storage.ts && ok "lifeEvents.by_type" || bad "lifeEvents.by_type missing"
    has 'xpLedger: \[\["by_event", "eventId"\]\]' lib/storage.ts && ok "xpLedger.by_event" || bad "xpLedger.by_event missing"
  else
    info "DB_VERSION is not 2 — Phase 1's database upgrade is not present in this tree"
  fi
  has 'createMissingStores' lib/storage.ts && has 'VersionError' lib/storage.ts && ok "additive-upgrade guard present (a database already at v2 without the Phase 1 stores is upgraded, not broken)" || info "additive-upgrade guard not present — a database another build left at v2 would NOT get the Phase 1 stores"
  has 'deleteObjectStore|deleteDatabase' lib/storage.ts && bad "lib/storage.ts can delete stores/databases" || ok "lib/storage.ts never deletes stores or databases"
  info "stores declared: $(sed -n '/^const STORES/,/^};/p' lib/storage.ts | grep -oE '^  [a-zA-Z]+:' | tr -d ' :' | tr '\n' ' ')"
else
  bad "lib/storage.ts not found"
fi

head_ "4. Trading boundary"
if command -v node >/dev/null 2>&1; then
  RES=$(node -e '
    const fs=require("fs"),path=require("path"),crypto=require("crypto");
    const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
    const walk=d=>fs.existsSync(d)?fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.posix.join(d,e.name);return e.isDirectory()?walk(p):[p]}):[];
    const files=walk("public/trades").sort();
    const lines=files.map(f=>f+":"+sha(fs.readFileSync(f))).sort();
    const s=fs.readFileSync("lib/storage.ts","utf8");
    const a=s.indexOf("READ-ONLY BRIDGE INTO THE EXISTING TRADES DATABASE"), b=s.indexOf("BACKUP / RESTORE",a);
    console.log(files.length+" "+sha(lines.join("\n"))+" "+(a>0&&b>a?sha(s.slice(a,b)):"none"));' 2>/dev/null)
  set -- $RES
  [ "${1:-}" = "$BASELINE_TRADES_FILES" ] && [ "${2:-}" = "$BASELINE_TRADES_TREE_SHA256" ] && ok "public/trades/* ($1 files) is byte-identical to the approved baseline" || bad "public/trades/* differs from the approved baseline (files: ${1:-?})"
  [ "${3:-}" = "$BASELINE_BRIDGE_SHA256" ] && ok "the read-only readTradesKV bridge in lib/storage.ts is byte-identical to the baseline" || bad "the Trades bridge section of lib/storage.ts differs from the baseline"
else
  info "node not found — skipping fingerprint checks"
fi
if [ -d lib/system ]; then
  # CODE (comments stripped, like the architecture test) must not reference the Trades database
  n=$(node -e '
    const fs=require("fs"),path=require("path");
    const walk=d=>fs.existsSync(d)?fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.posix.join(d,e.name);return e.isDirectory()?walk(p):[p]}):[];
    const files=[...walk("lib/system"),...walk("components/life/system"),"types/system.ts"].filter(f=>fs.existsSync(f)&&/[.]tsx?$/.test(f));
    const strip=s=>s.replace(/\/\*[\s\S]*?\*\//g,"").replace(/(^|[^:])\/\/.*$/gm,"$1");
    console.log(files.filter(f=>/esOrderFlowJournal|TRADES_DB/.test(strip(fs.readFileSync(f,"utf8")))).length);' 2>/dev/null)
  [ "${n:-x}" = "0" ] && ok "no System code references the Trades database (comments excluded)" || bad "${n:-?} System file(s) reference the Trades database in code"
  if [ -f lib/system/integrations/trading.ts ]; then
    w=$(grep -vE '^\s*(//|\*|/\*)' lib/system/integrations/trading.ts | grep -cE '\.put\(|\.add\(|\.delete\(|objectStore|indexedDB|dbPut|dbDelete|dbTransaction|dbClearAll')
    [ "$w" = "0" ] && ok "trading adapter contains no write/open/transaction primitive" || bad "trading adapter contains $w write-like token(s)"
  fi
  if [ -f types/system.ts ]; then
    f=$(sed -n '/export interface TradingDaySummary/,/^}/p' types/system.ts | grep -cE '^\s+[a-zA-Z]+:')
    [ "$f" = "6" ] && ok "TradingDaySummary has exactly 6 fields (no monetary field)" || bad "TradingDaySummary has $f fields (expected 6)"
  fi
else
  info "no lib/system — Trading adapter not present"
fi
info "NOTE: this script reads SOURCE only. It cannot see the contents of the Trades database in your browser."

head_ "5. System surface"
[ -f app/system/page.tsx ] && ok "route app/system/page.tsx" || info "no /system route"
has '"system"' components/life/AppShell.tsx && has 'key: "trades"' components/life/AppShell.tsx && ok "AppShell nav has System and Trades" || info "AppShell nav does not (yet) contain both System and Trades"
has 'TodayProgressCard' components/life/Today.tsx && ok "Today renders the progress card" || info "Today has no progress card"
has 'displayName' types/life.ts && has 'displayName' components/life/Settings.tsx && ok "displayName setting exists (types + Settings)" || info "displayName setting not present"
has '#F4F7FB|#f4f7fb' app/globals.css && ok "light theme background in globals.css" || info "light theme not present in globals.css"

if [ "$RUN" = "1" ]; then
  head_ "6. Commands (--run)"
  for c in "npm run typecheck" "npm run build" "npm run lint"; do
    if $c >/tmp/inspect-cmd.log 2>&1; then ok "$c"; else bad "$c (last lines below)"; tail -8 /tmp/inspect-cmd.log | sed 's/^/        /'; fi
  done
  if [ -f tests/system/run.sh ]; then
    if bash tests/system/run.sh >/tmp/inspect-tests.log 2>&1; then ok "bash tests/system/run.sh"; else bad "bash tests/system/run.sh"; grep -E "FAIL|failed" /tmp/inspect-tests.log | head -8 | sed 's/^/        /'; fi
  else info "no tests/system/run.sh"; fi
fi

echo; echo "== Summary: $PASS pass, $FAIL fail =="
[ "$FAIL" = "0" ] && exit 0 || exit 1
