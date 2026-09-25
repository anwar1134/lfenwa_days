/* Phase 1 — ARCHITECTURE guarantees, enforced by reading the source of the project under test
   (LFENWA_REPO, set by run.sh). These are the claims a behavioural test can only show indirectly:
   one XP gate, an append-only ledger, a pure engine, a read-only Trading adapter with no P&L path,
   a UI that goes through the store layer, and Trades files that are byte-identical to the approved baseline. */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRunner } from "./helpers";

const ROOT: string = process.env.LFENWA_REPO ?? "";
if (!ROOT) { console.error("LFENWA_REPO is not set (run via tests/system/run.sh)"); process.exit(2); }
const { t, done } = createRunner("architecture");

const sha = (b: string | Buffer) => crypto.createHash("sha256").update(b).digest("hex");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
function walk(rel: string, exts = [".ts", ".tsx"]): string[] {
  const abs = path.join(ROOT, rel); if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => { const r = path.posix.join(rel, e.name); return e.isDirectory() ? (e.name === "node_modules" ? [] : walk(r, exts)) : exts.some((x) => e.name.endsWith(x)) ? [r] : []; });
}
const SOURCE = ["lib", "components", "app", "types"].flatMap((d) => walk(d));
const importsOf = (src: string) => [...src.matchAll(/^\s*import\s+(?:type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/gm)].map((m) => ({ names: m[1], from: m[2] }));
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/* ---------- baseline fingerprints of the PROTECTED Trades files (from the approved commit cc2df0a) ---------- */
const BASELINE_BRIDGE_SHA256 = "2630e97f9cb261542fffde8c1fddd7f40be55ca2595b63de7e590157d86c0a37";
const BASELINE_TRADES_TREE_SHA256 = "23149649a02d16e83f7d1542dbe03771a02982e745cefbf17ab6eae9a0af8227";
const BASELINE_TRADES_FILES = 9;

t("TRADES PROTECTED: public/trades/* is byte-identical to the approved baseline (9 files)", () => {
  const files = walk("public/trades", [".js", ".html", ".json", ".png"]).sort();
  assert.equal(files.length, BASELINE_TRADES_FILES, files.join(","));
  const lines = files.map((f) => `${f}:${sha(fs.readFileSync(path.join(ROOT, f)))}`).sort();
  assert.equal(sha(lines.join("\n")), BASELINE_TRADES_TREE_SHA256, "a Trades file was modified");
});
t("TRADES PROTECTED: the read-only readTradesKV bridge section of lib/storage.ts is byte-identical to the baseline", () => {
  const s = read("lib/storage.ts"); const a = s.indexOf("READ-ONLY BRIDGE INTO THE EXISTING TRADES DATABASE"); const b = s.indexOf("BACKUP / RESTORE", a);
  assert.ok(a > 0 && b > a); assert.equal(sha(s.slice(a, b)), BASELINE_BRIDGE_SHA256, "the Trades bridge was modified");
});

/* ---------- database layer is ADDITIVE ---------- */
t("DB IS ADDITIVE: lib/storage.ts can never delete a store or a database, and stores are only ever created when missing", () => {
  const code = stripComments(read("lib/storage.ts"));
  assert.doesNotMatch(code, /deleteObjectStore|deleteDatabase/, "a store or database can be deleted");
  assert.match(code, /if \(!db\.objectStoreNames\.contains\(name\)\)\s*\{\s*const store = db\.createObjectStore\(name, \{ keyPath \}\)/, "stores must only be created when missing");
  assert.doesNotMatch(code, /\.createIndex\([^)]*\)[\s\S]{0,40}deleteIndex|deleteIndex/, "indexes must never be dropped");
});
t("NO LEGACY SYSTEM: the abandoned prototype's stores, quest model and API names do not exist anywhere in the source", () => {
  for (const f of SOURCE) assert.doesNotMatch(stripComments(read(f)), /\b(systemEvents|SystemQuest|ensureDailyQuests|loadOrCreateProfile|getRecentEvents|getXpForDate|useDailyQuests)\b/, f);
  for (const f of ["lib/system/config.ts", "lib/system/engine.ts", "lib/system/store.ts"]) assert.ok(!fs.existsSync(path.join(ROOT, f)), `${f} (prototype single-file module) must not exist`);
});

/* ---------- Trading adapter: read-only, no P&L path ---------- */
const TRADING = "lib/system/integrations/trading.ts";
t("TRADING READ-ONLY: the adapter imports exactly ONE thing from lib/storage — readTradesKV (no write/transaction helper)", () => {
  const fromStorage = importsOf(read(TRADING)).filter((i) => i.from === "@/lib/storage"); assert.equal(fromStorage.length, 1);
  assert.equal(fromStorage[0].names.replace(/[{}\s]/g, ""), "readTradesKV");
});
t("TRADING READ-ONLY: the adapter's code contains no write/open/transaction primitive", () => {
  const code = stripComments(read(TRADING));
  for (const bad of [/\bindexedDB\b/, /\.put\s*\(/, /\.add\s*\(/, /\.delete\s*\(/, /\.clear\s*\(/, /objectStore/, /\bdbPut\b/, /\bdbDelete\b/, /\bdbClearAll\b/, /\bdbTransaction\b/, /\bwithoutWriteNotifications\b/]) assert.doesNotMatch(code, bad, String(bad));
});
t("TRADES ISOLATION: no System file names the Trades database, and only the trading adapter uses the bridge", () => {
  const systemFiles = [...walk("lib/system"), ...walk("components/life/system"), "types/system.ts"];
  for (const f of systemFiles) { const code = stripComments(read(f)); assert.doesNotMatch(code, /esOrderFlowJournal|TRADES_DB/, f); }
  for (const f of walk("lib/system")) if (f !== TRADING) assert.doesNotMatch(stripComments(read(f)), /readTradesKV/, f);
});
t("NO P&L PATH: TradingDaySummary has exactly the six approved fields (booleans and counts) — no monetary field can exist", () => {
  const src = read("types/system.ts"); const m = /export interface TradingDaySummary \{([\s\S]*?)\n\}/.exec(src)!; assert.ok(m);
  const fields = [...stripComments(m[1]).matchAll(/^\s*(\w+)\s*:\s*([\w]+)/gm)].map((x) => `${x[1]}:${x[2]}`).sort();
  assert.deepEqual(fields, ["checkedIn:boolean", "date:string", "noTradeCount:number", "prepared:boolean", "reviewed:boolean", "tradeCount:number"]);
});
t("NO P&L PATH: the reward config and adapter reference no profit/loss/P&L identifiers in code", () => {
  for (const f of ["lib/system/config/rules.ts", TRADING, "lib/system/engine/rewards.ts"]) assert.doesNotMatch(stripComments(read(f)), /\b(pnl|profit|winRate|pl|dollars|money)\b/i, f);
});

/* ---------- ONE controlled XP gate; append-only ledger ---------- */
t("ONE XP GATE: only lib/storage.ts (generic store map / restore), lib/system/store/service.ts (the gate) and types/life.ts (typing) even mention the ledger store", () => {
  const files = SOURCE.filter((f) => /xpLedger/.test(read(f))).sort(); assert.deepEqual(files, ["lib/storage.ts", "lib/system/store/service.ts", "types/life.ts"]);
});
t("ONE XP GATE: a ledger row is created in exactly ONE place in the whole codebase", () => {
  const n = SOURCE.reduce((acc, f) => acc + (stripComments(read(f)).match(/\bledger\.add\s*\(/g) || []).length, 0); assert.equal(n, 1);
  assert.match(stripComments(read("lib/system/store/service.ts")), /await idbReq\(ledger\.add\(entry\)\)/);
});
t("APPEND-ONLY: nothing updates, overwrites or deletes ledger rows (gate uses add, never put/delete/clear on the ledger)", () => {
  const code = stripComments(read("lib/system/store/service.ts"));
  for (const bad of [/ledger\.put\s*\(/, /ledger\.delete\s*\(/, /ledger\.clear\s*\(/, /objectStore\("xpLedger"\)\.(put|delete|clear)/]) assert.doesNotMatch(code, bad, String(bad));
  for (const f of SOURCE) assert.doesNotMatch(stripComments(read(f)), /db(Put|Delete)\(\s*"xpLedger"/, f);
});
t("LEVEL IS DERIVED: no level field in SystemProfile or ProfileProjection", () => {
  const src = read("types/system.ts");
  for (const name of ["SystemProfile", "ProfileProjection"]) { const m = new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`).exec(src)!; assert.ok(m, name); assert.doesNotMatch(stripComments(m[1]), /\blevel\b/i, name); }
});

/* ---------- pure engine, layered UI ---------- */
t("PURE ENGINE: lib/system/config and lib/system/engine import no React/Next, no storage, no store/integrations/components, and touch no browser globals", () => {
  for (const f of [...walk("lib/system/engine"), ...walk("lib/system/config")]) {
    const src = read(f); for (const i of importsOf(src)) { assert.doesNotMatch(i.from, /^(react|next)(\/|$)|^@\/lib\/storage$|^@\/components|(^|\/)(store|integrations)(\/|$)/, `${f} imports ${i.from}`); }
    assert.doesNotMatch(stripComments(src), /\b(indexedDB|localStorage|sessionStorage|document|window|navigator)\b/, f);
  }
});
t("LAYERING: System UI components go through the store/integration layer — no direct storage access, no reward logic, no XP numbers", () => {
  for (const f of walk("components/life/system")) {
    const src = read(f); const code = stripComments(src);
    for (const i of importsOf(src)) { if (i.from === "@/lib/storage") assert.equal(i.names.replace(/[{}\s]/g, ""), "todayStr", `${f} reaches into storage`); assert.doesNotMatch(i.from, /lib\/system\/store\/service|lib\/system\/integrations\/(habits|tasks|trading)$/, `${f} bypasses the public layer`); }
    for (const bad of [/\bdbPut\b/, /\bdbDelete\b/, /\bdbTransaction\b/, /\bidbReq\b/, /\bevaluateRewards\b/, /\bapplyLedgerEntry\b/, /\bprocessEvents\b/, /\bXP_TIERS\b/, /\bxpForTier\b\s*\(\s*["']/]) assert.doesNotMatch(code, bad, `${f}: ${bad}`);
    assert.doesNotMatch(code, /\b[xX][pP]\w*\s*[:=]\s*\d/, `${f} contains a literal XP number`);
  }
});
t("LAYERING: Today, Settings and the shell reach the System only through components/life/system or lib/system public entry points", () => {
  for (const f of ["components/life/Today.tsx", "components/life/Settings.tsx", "components/life/AppShell.tsx"]) for (const i of importsOf(read(f))) if (/lib\/system/.test(i.from)) assert.match(i.from, /^@\/lib\/system\/(integrations|store)$/, `${f} imports ${i.from}`);
});
t("EXISTING SCREENS untouched: the domain screens that are not part of this work import nothing from the System", () => {
  for (const f of ["MyDay", "Goals", "HealthHabits", "Learning", "Money", "Mind", "Memories", "Insights", "Calendar", "Search", "QuickAdd"]) assert.doesNotMatch(read(`components/life/${f}.tsx`), /lib\/system|components\/life\/system/, f);
});
done();
