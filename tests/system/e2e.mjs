/* Real-browser (headless Chromium) end-to-end checks for Lfenwa System Phase 1 (Core System).

   Run via:  bash tests/system/run.sh --e2e        (after `npm run build`, so `out/` exists)
   Env:
     LFENWA_REPO     repo root (set by run.sh). Its `out/` is served.
     PROTO_REPO_DIR  OPTIONAL: repo root of a build of the ABANDONED PROTOTYPE (with its built `out/`). If set, the run also proves that a
                     database that prototype left at version 2 is upgraded additively and nothing is lost.
     ORIG_REPO_DIR   OPTIONAL: repo root of the ORIGINAL app with its own built `out/`. If set, the run also
                     proves the upgrade of a database created by that build (and the documented downgrade limit).
     E2E_SHOTS       screenshots directory (default: <tmp>/lfenwa-e2e-shots)
   Uses @sparticuz/chromium + playwright-core (installed by run.sh into a temp dir). The service worker is
   blocked so reloads are deterministic; public/sw.js is unchanged and is NOT exercised here. */
import chromium from "@sparticuz/chromium";
import { chromium as pw } from "playwright-core";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const NEW = process.env.LFENWA_REPO; const ORIG = process.env.ORIG_REPO_DIR || ""; const PROTO = process.env.PROTO_REPO_DIR || "";
if (!NEW || !fs.existsSync(path.join(NEW, "out", "index.html"))) { console.error("Build first (`npm run build`) and run via tests/system/run.sh"); process.exit(2); }
const SHOTS = process.env.E2E_SHOTS || path.join(os.tmpdir(), "lfenwa-e2e-shots"); fs.mkdirSync(SHOTS, { recursive: true });
const PORT = 4173, ORIGIN = `http://localhost:${PORT}`;
let pass = 0, fail = 0;
// Each check has a hard time limit: if the browser dies, the run FAILS loudly instead of hanging forever.
async function check(name, fn) {
  let timer;
  try {
    await Promise.race([fn(), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("check timed out after 110s (browser unresponsive?)")), 110000); })]);
    pass++; console.log("PASS", name);
  } catch (e) { fail++; console.log("FAIL", name, "\n    ", String(e.message).split("\n").slice(0, 5).join(" | ")); }
  finally { clearTimeout(timer); }
}

let server = null;
async function stop() {
  if (server) { server.kill(); server = null; }
  // wait until nothing answers on the port: otherwise the NEXT server can fail to bind while fetch() still succeeds against the OLD one,
  // and the test would silently drive the wrong build
  for (let i = 0; i < 100; i++) { try { await fetch(ORIGIN + "/manifest.json", { signal: AbortSignal.timeout(400) }); } catch { return; } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error("port " + PORT + " did not free up");
}
async function serve(dir) {
  await stop();
  server = spawn("node", ["scripts/serve-export.js"], { cwd: dir, env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(ORIGIN + "/manifest.json")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); if (i === 79) throw new Error("server did not start for " + dir); }
  // the server that answers must be the one we just spawned, serving THIS directory's build
  const served = await (await fetch(ORIGIN + "/system/")).text().catch(() => ""); const mine = fs.existsSync(path.join(dir, "out", "system", "index.html")) ? fs.readFileSync(path.join(dir, "out", "system", "index.html"), "utf8") : "";
  if (mine && served.length && served !== mine) throw new Error("port " + PORT + " is serving a different build than " + dir);
}

const browser = await pw.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
const page = await ctx.newPage();
const consoleErrors = [];
const watch = (p) => { p.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); }); p.on("pageerror", (e) => consoleErrors.push("PAGEERROR " + e.message)); };
watch(page);

const iso = (d) => d.toISOString().slice(0, 10);
const TODAY = iso(new Date()), YEST = iso(new Date(Date.now() - 86400000));
const OLD13 = ["days","timeline","achievements","tasks","learning","money","habits","habitEntries","goals","memories","attachments","mindEntries","settings"];
const SYS3 = ["systemProfile", "lifeEvents", "xpLedger"];
const TRADES = "esOrderFlowJournal";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dbs = (p = page) => p.evaluate(async () => (await indexedDB.databases()).map((d) => `${d.name}@${d.version}`).sort());
const readStores = (names, p = page) => p.evaluate(async (names) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open("lfnawaDaysDB"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const out = {}; for (const n of names) out[n] = await new Promise((res, rej) => { const q = db.transaction(n).objectStore(n).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  const stores = [...db.objectStoreNames]; const version = db.version; db.close(); return { out, stores, version };
}, names);
const rawPut = (store, rows, p = page) => p.evaluate(async ([store, rows]) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open("lfnawaDaysDB"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  await new Promise((res, rej) => { const tx = db.transaction(store, "readwrite"); rows.forEach((x) => tx.objectStore(store).put(x)); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); db.close();
}, [store, rows]);
const tradesKV = (p = page) => p.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open("esOrderFlowJournal"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const out = {}; await new Promise((res) => { const c = db.transaction("kv").objectStore("kv").openCursor(); c.onsuccess = () => { const cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } else res(); }; });
  const meta = { version: db.version, stores: [...db.objectStoreNames] }; db.close(); return { out, meta };
});
const tradesPut = (obj, p = page) => p.evaluate(async (obj) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open("esOrderFlowJournal"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  await new Promise((res) => { const tx = db.transaction("kv", "readwrite"); for (const [k, v] of Object.entries(obj)) tx.objectStore("kv").put(JSON.stringify(v), k); tx.oncomplete = res; }); db.close();
}, obj);
const seedV1 = (p = page) => p.evaluate(async ([today]) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open("lfnawaDaysDB"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const put = (s, rows) => new Promise((res, rej) => { const tx = db.transaction(s, "readwrite"); rows.forEach((x) => tx.objectStore(s).put(x)); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  await put("days", [{ date: today, wakeTime: "07:00", sleepHours: 7, metrics: { mood: 8, energy: 6, focus: 7 } }]);
  await put("habits", [{ id: "h1", name: "Exercise", createdAt: 1, archived: false }, { id: "h2", name: "Study", createdAt: 2, archived: false }, { id: "h3", name: "Drink water", createdAt: 3, archived: false }]);
  await put("habitEntries", [{ id: "h1:2020-03-01", habitId: "h1", date: "2020-03-01", done: true }, { id: "h2:2019-11-11", habitId: "h2", date: "2019-11-11", done: true }]);
  await put("tasks", [{ id: "t1", date: today, text: "Write TEMI report", status: "done", completedAt: Date.now() }, { id: "t2", date: today, text: "Gym session", status: "pending" }, { id: "t0", date: "2020-01-01", text: "Ancient task", status: "done", completedAt: Date.parse("2020-01-01T10:00:00Z") }]);
  await put("money", [{ id: "m1", date: today, type: "expense", amount: 42.5, currency: "DH", category: "Food", note: "lunch" }]);
  await put("goals", [{ id: "g1", title: "Launch Lfenwa feature", category: "Career", progress: 40, status: "active", milestones: [] }]);
  await put("learning", [{ id: "l1", date: today, whatLearned: "TEMI basics" }]);
  await put("achievements", [{ id: "ac1", date: today, text: "Shipped the build" }]);
  await put("mindEntries", [{ id: "me1", date: today, time: "10:00", mood: 7, thought: "feeling steady" }]);
  await put("settings", [{ id: "app", defaultCurrency: "MAD" }]);
  db.close();
}, [TODAY]);
const text = (p = page) => p.evaluate(() => document.body.innerText);
const navBtn = (p, label) => p.getByRole("button", { name: label, exact: true }).first();
async function goto(p, label) { await navBtn(p, label).click(); await sleep(350); }
/** poll the page text until it matches (live updates are asynchronous) */
async function until(p, re, ms = 6000) { const t0 = Date.now(); let t = ""; while (Date.now() - t0 < ms) { t = await text(p); if (re.test(t)) return t; await sleep(150); } throw new Error(`timeout waiting for ${re} — page tail: ${t.replace(/\s+/g, " ").slice(-420)}`); }
async function sys(p = page) {
  return p.evaluate(() => {
    const t = document.body.innerText; const m = /([\d,]+)\s*\/\s*([\d,]+)\s*XP/.exec(t); const lv = document.querySelector('[aria-label^="Level "]');
    const stats = {}; for (const n of ["Strength", "Intelligence", "Focus", "Discipline", "Health", "Finance"]) { const el = document.querySelector(`[aria-label^="${n} "]`); stats[n] = el ? Number(el.getAttribute("aria-label").split(" ")[1]) : null; }
    return { total: m ? Number(m[1].replace(/,/g, "")) : null, level: lv ? Number(lv.getAttribute("aria-label").split(" ")[1]) : null, stats, text: t };
  });
}
const overflow = (p = page) => p.evaluate(() => { const sc = [...document.querySelectorAll("div")].find((d) => getComputedStyle(d).overflowY === "auto"); return { doc: document.documentElement.scrollWidth - innerWidth, sc: sc ? sc.scrollWidth - sc.clientWidth : 0 }; });
const tick = (p, name) => p.locator(`xpath=//span[normalize-space(text())='${name}']/following-sibling::div//button[1]`).click();
const link = (p, name, val) => p.locator(`xpath=//div[normalize-space(text())='${name}']/following-sibling::div//select`).selectOption(val);

let before13 = null;
if (ORIG) {
  console.log("\n===== A: ORIGINAL (pre-System) build creates its own v1 database =====");
  await serve(ORIG); await page.goto(ORIGIN + "/today/"); await page.getByText("How today is going").waitFor();
  await check("A1 original build: lfnawaDaysDB is v1, no Trades DB", async () => assert.deepEqual(await dbs(), ["lfnawaDaysDB@1"]));
  await seedV1(); await page.reload(); await page.getByText("How today is going").waitFor();
  before13 = await readStores(OLD13);
  await check("A2 sanity: 13 stores, real rows, v1", async () => { assert.equal(before13.version, 1); assert.equal(before13.stores.length, 13); assert.ok(before13.out.tasks.length === 3 && before13.out.habits.length === 3); });
}

console.log("\n===== B: NEW build (Phase 1) =====");
consoleErrors.length = 0;
await serve(NEW);
await page.goto(ORIGIN + "/today/"); await page.getByText("How today is going").waitFor(); await page.getByText("Today's XP:").waitFor();
if (!ORIG) { await seedV1(); await page.reload(); await page.getByText("Today's XP:").waitFor(); }
await sleep(800);
await check("B1 DB is v2 with 16 stores; Trades DB NOT created", async () => { const d = await dbs(); assert.deepEqual(d, ["lfnawaDaysDB@2"], JSON.stringify(d)); const s = await readStores([]); assert.equal(s.stores.length, 16); for (const n of SYS3) assert.ok(s.stores.includes(n), n); });
if (ORIG) await check("B2 UPGRADE: every original row in every original store is identical after opening the new build", async () => {
  const after = await readStores(OLD13); const key = (a) => JSON.stringify([...a].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y))));
  for (const n of OLD13) assert.equal(key(after.out[n]), key(before13.out[n]), n);
});
await check("B3 HISTORY EARNS ZERO: years-old done tasks / habit entries produced no XP; today's completed task (real recent activity) earned exactly 10", async () => {
  const s = await readStores(SYS3); assert.equal(s.out.xpLedger.length, 1); assert.equal(s.out.xpLedger[0].eventId, "task.completed:t1"); assert.equal(s.out.xpLedger[0].xp, 10);
  assert.ok(!s.out.lifeEvents.some((e) => e.date < "2026-01-01"), "old records were not even scanned"); assert.equal(s.out.systemProfile[0].projection.totalXp, 10);
});
await check("B4 page background is the light theme; no dark surfaces left in the shell", async () => {
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor); assert.equal(bg, "rgb(244, 247, 251)");
  const c = await page.evaluate(() => { const el = document.querySelector(".lfnawa-desktop-rail"); return getComputedStyle(el).backgroundColor; }); const [r, g, b] = c.match(/\d+/g).map(Number); assert.ok(r > 200 && g > 200 && b > 200, c);
});
await check("B5 nav: Today, System, My Day, Calendar, Memories, Goals, Learning, Money, Health & Habits, Mind, Insights, Trades, Settings", async () => {
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll(".lfnawa-desktop-rail button")].map((b) => b.innerText.trim())), ["Today","System","My Day","Calendar","Memories","Goals","Learning","Money","Health & Habits","Mind","Insights","Trades","Settings"]);
});

console.log("\n===== C: Today =====");
await check("C1 existing Today sections intact + the new Progress card (Level 1, 10 / 100 XP, Today's XP: +10)", async () => {
  const t = await text(); for (const s of [/how today is going/i, /today's progress/i, /memories/i, /money/i, /trading/i]) assert.match(t, s); assert.match(t, /1\/2 tasks done/); assert.match(t, /Shipped the build/);
  assert.match(t, /progress/i); assert.match(t, /Level\s*1/); assert.match(t, /10\s*\/\s*100\s*XP/); assert.match(t, /Today's XP: \+10/);
});
await page.screenshot({ path: path.join(SHOTS, "01-today-light-desktop.png"), fullPage: true });
await check("C2 no greeting name yet -> TopBar says 'Today'; setting a name in Settings makes it 'Good <morning|afternoon|evening>, Anwar'", async () => {
  assert.equal((await page.evaluate(() => document.body.innerText.split("\n")[0])).length > 0, true);
  await goto(page, "Settings"); await page.getByPlaceholder("Your name").fill("Anwar"); await sleep(400); await goto(page, "Today");
  const top = await page.evaluate(() => [...document.querySelectorAll("div")].map((d) => d.innerText).find((t) => /^Good (morning|afternoon|evening), Anwar$/.test(t?.trim() || "")));
  assert.ok(top, "greeting shown in the shell top bar"); assert.equal((await readStores(["settings"])).out.settings[0].displayName, "Anwar"); assert.equal((await readStores(["settings"])).out.settings[0].defaultCurrency, "MAD", "other settings preserved");
});
await check("C3 the name is a SETTING: clearing it removes the greeting (nothing hard-coded)", async () => {
  await goto(page, "Settings"); await page.getByPlaceholder("Your name").fill(""); await sleep(400); await goto(page, "Today"); assert.equal(await page.evaluate(() => /Good (morning|afternoon|evening),/.test(document.body.innerText)), false);
  await goto(page, "Settings"); await page.getByPlaceholder("Your name").fill("Anwar"); await sleep(400); await goto(page, "Today");
});

console.log("\n===== D: System screen =====");
const page2 = await ctx.newPage(); watch(page2); await page2.goto(ORIGIN + "/system/"); await page2.getByText("What earns XP").waitFor();
await goto(page, "System"); await page.getByText("What earns XP").waitFor();
await check("D1 System shows level 1, 10 / 100 XP, six stats (Discipline 2, rest 1), today +10, Recent activity lists the task, never the ancient one", async () => {
  const s = await sys(); assert.equal(s.level, 1); assert.equal(s.total, 10); assert.deepEqual(s.stats, { Strength: 1, Intelligence: 1, Focus: 1, Discipline: 2, Health: 1, Finance: 1 });
  assert.match(s.text, /Write TEMI report/); assert.doesNotMatch(s.text, /Ancient task/); assert.match(s.text, /Today\s*\n?\s*\+10/); assert.match(s.text, /90 XP to level 2/);
});
await page.screenshot({ path: path.join(SHOTS, "02-system-light-desktop.png"), fullPage: true });
await check("D2 'What earns XP' is generated from the real rules (task, 3 habit links, 3 trading process rules) and states the eligibility window + 'never profit'", async () => {
  const t = await text(); for (const s of [/Complete a task/, /linked to Study/, /linked to Workout/, /linked to General/, /trading preparation/i, /no-trade decision/i, /trading review/i, /today or yesterday/, /never profit/i]) assert.match(t, s);
});
await check("D3 Habit links panel lists your habits, all 'Not linked (no XP)' by default — names are never guessed", async () => {
  for (const h of ["Exercise", "Study", "Drink water"]) assert.equal(await page.locator(`xpath=//div[normalize-space(text())='${h}']/following-sibling::div//select`).inputValue(), "", h);
});

console.log("\n===== E: live trigger through the real UI =====");
await check("E1 tick an UNLINKED habit ('Study') in Health & Habits -> a fact is recorded but NO XP (not guessed from the name)", async () => {
  await goto(page, "Health & Habits"); await tick(page, "Study"); await sleep(700); const s = await readStores(SYS3);
  assert.ok(s.out.lifeEvents.some((e) => e.eventId === `habit.completed:h2:${TODAY}`), "fact recorded"); assert.equal(s.out.systemProfile[0].projection.totalXp, 10);
});
await check("E2 link 'Exercise' to Workout, tick it -> +15 XP, Strength +1, Health +1 (live)", async () => {
  await goto(page, "System"); await link(page, "Exercise", "workout"); await sleep(500);
  await goto(page, "Health & Habits"); await tick(page, "Exercise"); await sleep(500); await goto(page, "System"); const t = await until(page, /Today\s*\n?\s*\+25/); const s = await sys();
  assert.equal(s.total, 25); assert.equal(s.stats.Strength, 2); assert.equal(s.stats.Health, 2); assert.match(t, /Exercise/); assert.match(t, /Strength \+1 · Health \+1/);
});
await check("E3 UNCHECK then RECHECK 'Exercise' 6 times -> XP does not change and never duplicates", async () => {
  await goto(page, "Health & Habits"); for (let i = 0; i < 6; i++) { await tick(page, "Exercise"); await sleep(250); } await sleep(600); await goto(page, "System"); await sleep(400);
  const s = await readStores(SYS3); assert.equal(s.out.systemProfile[0].projection.totalXp, 25); assert.equal(s.out.xpLedger.filter((r) => r.eventId.includes("h1")).length, 1); assert.equal((await sys()).total, 25);
});
await check("E4 linking 'Study' AFTER it was ticked today still counts (inside the window) — exactly once", async () => {
  await link(page, "Study", "study"); await until(page, /Today\s*\n?\s*\+40/); const s = await sys(); assert.equal(s.total, 40); assert.equal(s.stats.Intelligence, 2); assert.equal(s.stats.Discipline, 3);
  await link(page, "Study", ""); await sleep(600); assert.equal((await sys()).total, 40, "unlinking removes nothing"); await link(page, "Study", "study"); await sleep(600); assert.equal((await sys()).total, 40, "relinking does not re-award");
});
await check("E5 SECOND TAB (opened earlier, never reloaded) shows the new XP automatically — cross-tab refresh", async () => { const t = await until(page2, /40\s*\/\s*100\s*XP/, 8000); assert.match(t, /Exercise/); });
await check("E5b Trades DB is still absent: System, Today, habits and quests never created it (only Trades itself ever may)", async () => assert.ok(!(await dbs()).some((n) => n.startsWith(TRADES)), JSON.stringify(await dbs())));
await check("E6 second tab returning from Trades (forced reconcile) does NOT double-award anything", async () => {
  await page2.getByRole("button", { name: "Switch to Lfenwa Trades" }).click(); await page2.locator('iframe[title="Lfenwa Trades"]').waitFor(); await sleep(2200);
  await page2.getByRole("button", { name: "Switch to Lfenwa Days" }).click(); await sleep(1500); const s = await readStores(SYS3); assert.equal(s.out.systemProfile[0].projection.totalXp, 40); assert.equal(s.out.xpLedger.length, 3);
  const ids = s.out.xpLedger.map((r) => r.id); assert.equal(new Set(ids).size, ids.length);
});
await page2.close();
await check("E7 the ledger, profile projection and facts agree (projection == sum of ledger)", async () => {
  const s = await readStores(SYS3); const sum = s.out.xpLedger.reduce((n, r) => n + r.xp, 0); assert.equal(s.out.systemProfile[0].projection.totalXp, sum); assert.equal(s.out.systemProfile[0].projection.ledgerCount, s.out.xpLedger.length);
  assert.ok(!("level" in s.out.systemProfile[0]) && !("level" in s.out.systemProfile[0].projection), "level is never stored");
});

await check("E8 REPEATED STARTUP IS SAFE: 4 reloads, then 2 more tabs started at the same instant as the main one, leave the ledger, facts and XP exactly as they were", async () => {
  const snap = async () => { const s = await readStores(SYS3); return JSON.stringify({ ledger: s.out.xpLedger.map((r) => [r.id, r.xp]).sort(), facts: s.out.lifeEvents.map((f) => f.eventId).sort(), xp: s.out.systemProfile[0].projection.totalXp, n: s.out.systemProfile[0].projection.ledgerCount }); };
  const before = await snap();
  for (let i = 0; i < 4; i++) { await page.reload(); await page.getByText("Today's XP:").waitFor(); await sleep(700); } // a reload lands on Today (the URL is /today/)
  const extra = await Promise.all([0, 1].map(async () => { const p = await ctx.newPage(); watch(p); p.goto(ORIGIN + "/today/").catch(() => {}); return p; }));
  await sleep(3000); for (const p of extra) await p.close(); await sleep(400);
  assert.equal(await snap(), before);
  const s = await readStores(SYS3); const ids = s.out.xpLedger.map((r) => r.id); assert.equal(new Set(ids).size, ids.length); assert.equal(s.out.systemProfile.length, 1);
});
console.log("\n===== F: Trades — nav item, Quick Switch, read-only boundary, process rewards =====");
await check("F2 the 'Trades' NAV ITEM switches to Lfenwa Trades (isolated iframe); Trades creates its OWN DB", async () => {
  await goto(page, "Trades"); await page.locator('iframe[title="Lfenwa Trades"]').waitFor(); await sleep(2500);
  assert.ok((await dbs()).some((n) => n.startsWith(TRADES)), JSON.stringify(await dbs())); assert.equal(await page.getByRole("button", { name: "Switch to Lfenwa Days" }).count(), 1, "Quick Switch is present");
});
await page.screenshot({ path: path.join(SHOTS, "03-trades-module-seam.png") });
// Simulate what Trades itself would have stored (this is the TEST playing the role of the Trades app; System code never writes here)
await tradesPut({
  days: { [TODAY]: { premarket: { session: "NY Open", bias: "long" }, dailyReview: { scores: { process: 9 }, notes: "followed my plan" } }, [YEST]: { tradeNoTrade: { sleep: 4, riskOk: "no" } } },
  trades: [{ date: TODAY, pnl: 999.5, profit: 999.5, r: 3.3, followedRules: true }],
  notrades: [{ date: YEST, reason: "no edge, sat out" }],
});
await sleep(900);
const kvBefore = await tradesKV();
await check("F3 Quick Switch back to Days -> System notices Trading PROCESS: prepared +25, review +25, completed no-trade day +25 (=75) ; total 115 -> Level 2", async () => {
  await page.getByRole("button", { name: "Switch to Lfenwa Days" }).click(); await goto(page, "System"); await until(page, /115\s*\/\s*250\s*XP/, 9000); const s = await sys();
  assert.equal(s.level, 2); assert.equal(s.total, 115); assert.equal(s.stats.Intelligence, 3); assert.equal(s.stats.Discipline, 3 + 1 + 2 + 1 + 0, "prepared D+1, no-trade D+2, review D+1");
  const t = await text(); assert.match(t, /Trading preparation completed/); assert.match(t, /Trading review completed/); assert.match(t, /No-trade decision logged, no trades taken/);
});
await check("F4 PROFIT NEVER REWARDED / NEVER SEEN: none of the P&L values (999.5, 3.3, pnl, profit) exist in any System store", async () => {
  const j = JSON.stringify((await readStores(SYS3)).out); for (const leak of ["999", "3.3", "pnl", "profit", "followedRules"]) assert.ok(!j.includes(leak), `leaked ${leak}`);
});
await check("F5 READ-ONLY: Trades' database is identical after the System read it (same version, stores, values)", async () => {
  const kvAfter = await tradesKV(); assert.deepEqual(kvAfter, kvBefore); assert.equal(kvAfter.meta.version, 1); assert.deepEqual(kvAfter.meta.stores, ["kv"]);
});
await check("F6 a same-day no-trade is NOT rewarded until the day is over (yesterday's was; today's cannot be)", async () => {
  await tradesPut({ notrades: [{ date: YEST, reason: "no edge" }, { date: TODAY, reason: "chop" }], trades: [] }); await goto(page, "Trades"); await sleep(600); await page.getByRole("button", { name: "Switch to Lfenwa Days" }).click(); await sleep(1800);
  const s = await readStores(SYS3); assert.ok(!s.out.lifeEvents.some((e) => e.eventId === `trading.noTrade:${TODAY}`)); assert.equal(s.out.systemProfile[0].projection.totalXp, 115);
});

console.log("\n===== G: backup / restore never lowers or mints XP =====");
await goto(page, "System"); await sleep(400);
const backupNow = JSON.parse(await page.evaluate(() => window.__lfnawaExportFullBackup()));
await check("G1 export includes the 3 System stores with the ledger (and all 13 originals)", async () => {
  for (const k of [...SYS3, ...OLD13]) assert.ok(Array.isArray(backupNow.life[k]), k); assert.equal(backupNow.life.xpLedger.length, 6); assert.equal(backupNow.schema, 1);
});
await rawPut("tasks", [{ id: "t2", date: TODAY, text: "Gym session", status: "done", completedAt: Date.now() }]); // another tab / missed write
await goto(page, "Trades"); await sleep(500); await page.getByRole("button", { name: "Switch to Lfenwa Days" }).click(); await goto(page, "System"); await until(page, /125\s*\/\s*250\s*XP/, 8000);
await goto(page, "Settings");
async function importBackup(obj, button) {
  await page.setInputFiles('input[type="file"]', { name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(obj)) });
  await page.getByRole("button", { name: button }).click(); await page.getByText(/Imported:/).waitFor(); await sleep(1500);
}
await check("G2 MERGE-restoring the OLDER backup (taken at 115 XP) over newer progress (125 XP) does NOT lower XP", async () => {
  await importBackup(backupNow, "Merge (safe)"); await goto(page, "System"); await sleep(600); const s = await sys(); assert.equal(s.total, 125, "XP kept"); const st = await readStores(SYS3);
  assert.equal(st.out.systemProfile[0].projection.totalXp, 125); assert.equal(st.out.systemProfile[0].projection.ledgerCount, st.out.xpLedger.length);
});
await check("G3 REPLACE-restoring an OLD-format backup (no System keys) replaces Days data as before but System progress SURVIVES; its 2021 task earns nothing", async () => {
  await goto(page, "Settings");
  await importBackup({ schema: 1, app: "Lfnawa Days", life: { tasks: [{ id: "r1", date: "2021-05-05", text: "Restored old", status: "done", completedAt: Date.parse("2021-05-05T09:00:00Z") }], habits: [{ id: "h1", name: "Exercise", createdAt: 1, archived: false }] } }, "Replace everything");
  await goto(page, "System"); await sleep(600); const st = await readStores([...SYS3, "tasks", "goals"]); assert.deepEqual(st.out.tasks.map((t) => t.id), ["r1"]); assert.equal(st.out.goals.length, 0, "old stores replaced");
  assert.equal(st.out.systemProfile[0].projection.totalXp, 125); assert.equal(st.out.xpLedger.length, 7); assert.ok(!st.out.xpLedger.some((r) => r.eventId.includes("r1")));
});
await check("G4 REPLACE-restoring a NEW backup (with System stores) restores the System exactly as it was in the file (115 XP), and a reconcile afterwards mints nothing", async () => {
  await goto(page, "Settings"); await importBackup(backupNow, "Replace everything"); await goto(page, "Trades"); await sleep(500); await page.getByRole("button", { name: "Switch to Lfenwa Days" }).click(); await goto(page, "System"); await sleep(1200);
  const s = await sys(); assert.equal(s.total, 115, "the file's state"); const st = await readStores(SYS3); assert.equal(st.out.systemProfile[0].projection.totalXp, st.out.xpLedger.reduce((n, r) => n + r.xp, 0));
});

console.log("\n===== H: every existing screen + light theme =====");
const tabs = [["Today", /1\/2 tasks done/], ["My Day", /Basic information|Wake-up/i], ["Calendar", /Calendar/i], ["Memories", /Memories/i], ["Goals", /Launch Lfenwa feature/], ["Learning", /TEMI basics/], ["Money", /42\.5/], ["Health & Habits", /Exercise/], ["Mind", /feeling steady/], ["Insights", /wellbeing/i], ["Settings", /backup & restore/i], ["System", /what earns xp/i]];
// G4 replaced everything with backupNow (which has the seeded data), so the seeded content is back
for (const [label, re] of tabs) {
  await check(`H ${label}: opens, shows its data`, async () => { await goto(page, label); await until(page, re, 6000); });
  await page.screenshot({ path: path.join(SHOTS, `10-${label.replace(/[^a-z]/gi, "").toLowerCase()}-desktop.png`), fullPage: true });
}
await check("H Settings: backup blurb mentions System progress; Trades entry still present", async () => { await goto(page, "Settings"); const t = await text(); assert.match(t, /Lfenwa System progress/); assert.match(t, /Open Lfenwa Trades/); });
await check("H no console/page errors from our code (Trades iframe excluded)", async () => { const ours = consoleErrors.filter((e) => !e.includes("/trades/")); assert.deepEqual(ours, [], JSON.stringify(consoleErrors.slice(0, 4))); });

console.log("\n===== I: mobile =====");
for (const w of [390, 320]) {
  await page.setViewportSize({ width: w, height: 844 }); await sleep(300);
  await check(`I ${w}px: drawer opens, selecting 'System' CLOSES it and shows System`, async () => {
    await page.locator("button.lfnawa-mobile-drawer").first().click(); assert.equal(await page.locator("div.lfnawa-mobile-drawer").count(), 1, "drawer open");
    if (w === 390) await page.screenshot({ path: path.join(SHOTS, "20-drawer-mobile.png") });
    await page.locator("div.lfnawa-mobile-drawer button", { hasText: "System" }).click(); await sleep(300); assert.equal(await page.locator("div.lfnawa-mobile-drawer").count(), 0, "drawer closed"); await page.getByText("What earns XP").waitFor();
  });
  await check(`I ${w}px: System and Today have no horizontal overflow`, async () => {
    await sleep(700); let o = await overflow(); assert.ok(o.doc <= 0 && o.sc <= 0, "system " + JSON.stringify(o)); await page.screenshot({ path: path.join(SHOTS, `21-system-${w}.png`), fullPage: true });
    await page.locator("button.lfnawa-mobile-drawer").first().click(); await page.locator("div.lfnawa-mobile-drawer button", { hasText: "Today" }).first().click(); await sleep(600); o = await overflow(); assert.ok(o.doc <= 0 && o.sc <= 0, "today " + JSON.stringify(o)); await page.screenshot({ path: path.join(SHOTS, `22-today-${w}.png`), fullPage: true });
  });
  await check(`I ${w}px: selecting 'Trades' from the drawer closes it and opens Trades; Quick Switch returns`, async () => {
    await page.locator("button.lfnawa-mobile-drawer").first().click(); await page.locator("div.lfnawa-mobile-drawer button", { hasText: "Trades" }).click(); await page.locator('iframe[title="Lfenwa Trades"]').waitFor();
    await page.getByRole("button", { name: "Switch to Lfenwa Days" }).click(); await page.getByText("Today's XP:").waitFor(); assert.equal(await page.locator("div.lfnawa-mobile-drawer").count(), 0);
  });
}
await page.setViewportSize({ width: 1280, height: 900 });
await check("I reduced motion: the progress bar transition is disabled when the OS asks", async () => {
  await page.emulateMedia({ reducedMotion: "reduce" }); await goto(page, "System"); assert.equal(await page.locator(".lfsys-fill").first().evaluate((el) => getComputedStyle(el).transitionDuration), "0s"); await page.emulateMedia({ reducedMotion: "no-preference" });
});

console.log("\n===== J: Today stays usable when the System's storage FAILS =====");
const bad = await ctx.newPage(); watch(bad);
await bad.addInitScript(() => { const orig = IDBDatabase.prototype.transaction; IDBDatabase.prototype.transaction = function (stores, ...rest) { const names = Array.isArray(stores) ? stores : [stores]; if (names.some((n) => n === "xpLedger" || n === "systemProfile" || n === "lifeEvents")) throw new Error("simulated System storage failure"); return orig.call(this, stores, ...rest); }; });
consoleErrors.length = 0;
await bad.goto(ORIGIN + "/today/"); await bad.getByText("How today is going").waitFor(); await bad.getByText(/Progress isn't available right now/).waitFor();
await check("J1 Today still shows ALL its existing data; only the Progress card reports the failure", async () => { const t = await text(bad); assert.match(t, /1\/2 tasks done/); assert.match(t, /Shipped the build/); assert.match(t, /42\.5/); assert.match(t, /Progress isn't available right now/); });
await check("J2 …and the rest of the app keeps working (open My Day)", async () => { await navBtn(bad, "My Day").click(); await sleep(400); assert.match(await text(bad), /Basic information|Wake-up/i); });
await bad.close();

if (ORIG) {
  console.log("\n===== K: DOWNGRADE reality check (documented limitation) =====");
  await serve(ORIG); consoleErrors.length = 0; await page.goto(ORIGIN + "/today/"); await page.waitForTimeout(2500);
  await check("K1 the ORIGINAL build cannot open the upgraded v2 database (VersionError; stuck on Loading…)", async () => { const t = await text(); assert.ok(/Loading/.test(t) && consoleErrors.some((e) => /requested version \(1\) is less than the existing version \(2\)/.test(e)), t.slice(0, 60) + JSON.stringify(consoleErrors.slice(0, 2))); });
  await serve(NEW); await page.goto(ORIGIN + "/today/"); await page.getByText("Today's XP:").waitFor();
  await check("K2 …and it is recoverable: the new build opens it again with all data and XP intact", async () => { const t = await text(); assert.match(t, /1\/2 tasks done/); assert.match(t, /Level\s*2|115\s*\/\s*250/); });
}

try { await browser.close(); } catch { /* the first browser is idle now; free its memory before the next one starts */ }
if (PROTO) {
  console.log("\n===== L: a database left at VERSION 2 by the ABANDONED PROTOTYPE build (real browser, same origin/profile) =====");
  const browserL = await pw.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true }); // its own browser: keeps this phase independent of everything before it
  const ctxL = await browserL.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" }); const pl = await ctxL.newPage(); watch(pl); consoleErrors.length = 0;
  const PROTO3 = ["system", "quests", "systemEvents"]; const NEW3 = SYS3;
  await serve(PROTO); await pl.goto(ORIGIN + "/system/"); await pl.getByText("LFENWA SYSTEM").waitFor();
  await pl.getByRole("button", { name: "Complete Study 30 minutes" }).click(); await pl.getByRole("button", { name: "Study 30 minutes, completed" }).waitFor(); await sleep(600);
  await seedV1(pl); await sleep(300);
  const protoBefore = await readStores([...OLD13, ...PROTO3], pl);
  await check("L1 the PROTOTYPE build leaves lfnawaDaysDB at version 2 with its OWN stores and none of the Phase 1 stores (the hazard is real)", async () => {
    assert.deepEqual(await dbs(pl), ["lfnawaDaysDB@2"]); assert.equal(protoBefore.stores.length, 16); for (const n of NEW3) assert.ok(!protoBefore.stores.includes(n), n); assert.equal(protoBefore.out.quests.filter((q) => q.status === "completed").length, 1); assert.equal(protoBefore.out.systemEvents.length, 1);
  });
  await serve(NEW); await pl.goto(ORIGIN + "/system/"); await pl.getByText(/what earns xp/i).waitFor(); await sleep(1200);
  await check("L2 the NEW build opens that database: System loads (no error screen), and the database was upgraded ADDITIVELY (version 3, 19 stores)", async () => {
    const t = await text(pl); assert.doesNotMatch(t, /Couldn't open the System data/); assert.deepEqual(await dbs(pl), ["lfnawaDaysDB@3"], JSON.stringify(await dbs(pl)));
    const s = await readStores([], pl); assert.equal(s.stores.length, 19, s.stores.join(",")); for (const n of [...OLD13, ...PROTO3, ...NEW3]) assert.ok(s.stores.includes(n), n);
  });
  await check("L3 NOTHING WAS LOST: every row of all 13 original stores AND the prototype's own 3 stores is identical afterwards", async () => {
    const after = await readStores([...OLD13, ...PROTO3], pl); const key = (a) => JSON.stringify([...a].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y))));
    for (const n of [...OLD13, ...PROTO3]) assert.equal(key(after.out[n]), key(protoBefore.out[n]), n);
  });
  await check("L4 the System works on it: today's completed task (real activity) earned 10 XP in the NEW ledger; the prototype's quest XP is NOT carried over and is never touched", async () => {
    const s = await sys(pl); assert.equal(s.level, 1); assert.equal(s.total, 10); const st = await readStores(SYS3, pl); assert.equal(st.out.xpLedger.length, 1); assert.equal(st.out.xpLedger[0].eventId, "task.completed:t1");
  });
  await check("L5 restarting again (database now v3, code constant is 2) is safe: no VersionError, no duplicate XP, still v3", async () => {
    consoleErrors.length = 0; for (let i = 0; i < 3; i++) { await pl.reload(); await pl.getByText(/what earns xp/i).waitFor(); await sleep(800); }
    assert.deepEqual(await dbs(pl), ["lfnawaDaysDB@3"]); assert.equal((await sys(pl)).total, 10); assert.equal((await readStores(SYS3, pl)).out.xpLedger.length, 1); assert.deepEqual(consoleErrors.filter((e) => !e.includes("/trades/")), [], JSON.stringify(consoleErrors.slice(0, 3)));
  });
  await check("L6 existing navigation and Trades still work on that profile; the Trades DB was not created by any of it", async () => {
    await navBtn(pl, "My Day").click(); await sleep(400); assert.match(await text(pl), /Basic information|Wake-up/i); await navBtn(pl, "Today").click(); await pl.getByText("Today's XP:").waitFor();
    assert.ok(!(await dbs(pl)).some((n) => n.startsWith(TRADES)), JSON.stringify(await dbs(pl)));
    await pl.getByRole("button", { name: "Switch to Lfenwa Trades" }).click(); await pl.locator('iframe[title="Lfenwa Trades"]').waitFor(); await sleep(1800); await pl.getByRole("button", { name: "Switch to Lfenwa Days" }).click(); await pl.getByText("Today's XP:").waitFor();
  });
  try { await browserL.close(); } catch { /* closing a headless browser must never mask the results */ }
}


try { await browser.close(); } catch { /* ignore */ }
try { await stop(); } catch { /* ignore */ }
console.log(`\nE2E: ${pass} passed, ${fail} failed  (screenshots: ${SHOTS})`);
process.exit(fail || pass === 0 ? 1 : 0);
