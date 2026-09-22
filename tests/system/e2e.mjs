/* Real-browser (headless Chromium) end-to-end checks for Lfenwa System Phase 1 + 2.

   Run via:  bash tests/system/run.sh --e2e        (after `npm run build`, so `out/` exists)
   Env:
     LFENWA_REPO     repo root (set by run.sh). Its `out/` is served.
     ORIG_REPO_DIR   OPTIONAL: a repo root of the ORIGINAL (pre-System) app with its own built `out/`.
                     If set, the run also proves the upgrade of a database created by that build.
     E2E_SHOTS       where screenshots go (default: <tmp>/lfenwa-e2e-shots)
   Uses @sparticuz/chromium + playwright-core (installed by run.sh into a temp dir). The service worker is
   blocked so page reloads are deterministic; sw.js itself is unchanged by this work and is NOT exercised here. */
import chromium from "@sparticuz/chromium";
import { chromium as pw } from "playwright-core";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const NEW = process.env.LFENWA_REPO; const ORIG = process.env.ORIG_REPO_DIR || "";
if (!NEW || !fs.existsSync(path.join(NEW, "out", "index.html"))) { console.error("Build first: `npm run build` (need out/), and run via tests/system/run.sh"); process.exit(2); }
const SHOTS = process.env.E2E_SHOTS || path.join(os.tmpdir(), "lfenwa-e2e-shots"); fs.mkdirSync(SHOTS, { recursive: true });
const PORT = 4173, ORIGIN = `http://localhost:${PORT}`;
let pass = 0, fail = 0;
async function check(name, fn) { try { await fn(); pass++; console.log("PASS", name); } catch (e) { fail++; console.log("FAIL", name, "\n    ", String(e.message).split("\n").slice(0, 5).join(" | ")); } }

let server = null;
async function stop() { if (server) { server.kill(); await new Promise((r) => setTimeout(r, 300)); server = null; } }
async function serve(dir) {
  await stop();
  server = spawn("node", ["scripts/serve-export.js"], { cwd: dir, env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(ORIGIN + "/manifest.json")).ok) return; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  throw new Error("server did not start for " + dir);
}

const browser = await pw.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
const page = await ctx.newPage();
const consoleErrors = [];
const watch = (p) => { p.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); }); p.on("pageerror", (e) => consoleErrors.push("PAGEERROR " + e.message)); };
watch(page);

const TODAY = new Date().toISOString().slice(0, 10); // same UTC convention as the app's todayStr()
const OLD13 = ["days","timeline","achievements","tasks","learning","money","habits","habitEntries","goals","memories","attachments","mindEntries","settings"];
const dbs = (p = page) => p.evaluate(async () => (await indexedDB.databases()).map((d) => `${d.name}@${d.version}`).sort());
const readStores = (names, p = page) => p.evaluate(async (names) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open("lfnawaDaysDB"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const out = {}; for (const n of names) out[n] = await new Promise((res, rej) => { const q = db.transaction(n).objectStore(n).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  const stores = [...db.objectStoreNames]; const version = db.version; db.close(); return { out, stores, version };
}, names);
const seedLife = (p = page) => p.evaluate(async (today) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open("lfnawaDaysDB"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const put = (s, rows) => new Promise((res, rej) => { const tx = db.transaction(s, "readwrite"); rows.forEach((x) => tx.objectStore(s).put(x)); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  await put("days", [{ date: today, wakeTime: "07:00", sleepHours: 7, metrics: { mood: 8, energy: 6, focus: 7 } }]);
  await put("tasks", [{ id: "t1", date: today, text: "Write TEMI report", status: "done", completedAt: Date.now() }, { id: "t2", date: today, text: "Gym session", status: "pending" }]);
  await put("habits", [{ id: "h1", name: "Exercise", createdAt: 1, archived: false }]);
  await put("habitEntries", [{ id: "h1:" + today, habitId: "h1", date: today, done: true }]);
  await put("money", [{ id: "m1", date: today, type: "expense", amount: 42.5, currency: "DH", category: "Food", note: "lunch" }]);
  await put("goals", [{ id: "g1", title: "Launch Lfenwa feature", category: "Career", progress: 40, status: "active", milestones: [] }]);
  await put("learning", [{ id: "l1", date: today, whatLearned: "TEMI basics" }]);
  await put("achievements", [{ id: "ac1", date: today, text: "Shipped the build" }]);
  await put("mindEntries", [{ id: "me1", date: today, time: "10:00", mood: 7, thought: "feeling steady" }]);
  await put("settings", [{ id: "app", defaultCurrency: "MAD" }]);
  db.close();
}, TODAY);
const text = (p = page) => p.evaluate(() => document.body.innerText);
const rows = (p = page) => p.evaluate(() => [...document.querySelectorAll("ul li")].filter((li) => li.querySelector("button[aria-label]")).map((li) => ({ label: li.querySelector("button").getAttribute("aria-label"), disabled: li.querySelector("button").disabled, text: li.innerText, xp: Number((/\+([\d,]+) XP/.exec(li.innerText) || [0, "0"])[1].replace(/,/g, "")) })));
const overflow = (p = page) => p.evaluate(() => { const sc = [...document.querySelectorAll("div")].find((d) => getComputedStyle(d).overflowY === "auto"); return { doc: document.documentElement.scrollWidth - innerWidth, sc: sc ? sc.scrollWidth - sc.clientWidth : 0 }; });
const waitToday = async (p = page) => { await p.getByText("How today is going").waitFor(); await p.getByText(/completed$/).first().waitFor(); };

let seededBeforeUpgrade = null;
if (ORIG) {
  console.log("\n===== A: ORIGINAL (pre-System) build creates its own v1 database =====");
  await serve(ORIG); await page.goto(ORIGIN + "/today/"); await page.getByText("How today is going").waitFor();
  await check("A1 original build: lfnawaDaysDB is v1; Trades DB not created", async () => assert.deepEqual(await dbs(), ["lfnawaDaysDB@1"]));
  await seedLife(); await page.reload(); await page.getByText("How today is going").waitFor();
  await check("A2 original Today shows seeded data", async () => { const t = await text(); assert.match(t, /1\/2 tasks done/); assert.match(t, /Shipped the build/); });
  seededBeforeUpgrade = await readStores(OLD13);
  await check("A3 sanity: v1 has 13 stores and real rows", async () => { assert.equal(seededBeforeUpgrade.version, 1); assert.equal(seededBeforeUpgrade.stores.length, 13); });
}

console.log("\n===== B: NEW build =====");
consoleErrors.length = 0;
await serve(NEW);
await page.goto(ORIGIN + "/today/"); await waitToday();
if (!ORIG) { await seedLife(); await page.reload(); await waitToday(); }
await check("B1 database is v2 with 16 stores; Trades DB NOT created", async () => { const d = await dbs(); assert.deepEqual(d, ["lfnawaDaysDB@2"], JSON.stringify(d)); assert.equal((await readStores([])).stores.length, 16); });
if (ORIG) await check("B2 UPGRADE: every original row in every original store identical after opening the new build", async () => {
  const after = await readStores(OLD13); const key = (a) => JSON.stringify([...a].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y))));
  for (const n of OLD13) assert.equal(key(after.out[n]), key(seededBeforeUpgrade.out[n]), n);
});

console.log("\n===== C: Today — existing sections + the new System section =====");
await check("C1 all existing Today sections still present, with data", async () => {
  const t = await text(); for (const s of [/how today is going/i, /today's progress/i, /memories/i, /money/i, /trading/i]) assert.match(t, s);
  assert.match(t, /1\/2 tasks done/); assert.match(t, /Shipped the build/); assert.match(t, /42\.5/);
});
let questRows;
await check("C2 System section shows 3–5 daily quests, all pending, '0 / N completed', 'Today XP: +0', 'Open System →'", async () => {
  const t = await text(); assert.match(t, /system · daily quests/i); assert.match(t, /Open System →/);
  questRows = await rows(); assert.ok(questRows.length >= 3 && questRows.length <= 5, String(questRows.length)); assert.ok(questRows.every((r) => /^Complete /.test(r.label) && !r.disabled));
  assert.match(t, new RegExp(`0 / ${questRows.length} completed`)); assert.match(t, /Today XP: \+0/);
  for (const must of ["Morning routine", "Study 30 minutes", "Workout"]) assert.ok(questRows.some((r) => r.label === `Complete ${must}`), must);
});
await check("C3 the quests were persisted exactly once (raw read): count matches, ids deterministic daily:<date>:<id>", async () => {
  const q = (await readStores(["quests"])).out.quests; assert.equal(q.length, questRows.length); assert.ok(q.every((x) => x.id === `daily:${TODAY}:${x.definitionId}` && x.status === "pending" && x.type === "daily" && x.date === TODAY));
});
await page.screenshot({ path: path.join(SHOTS, "1-today-quests-desktop.png") });

// a second tab that loaded BEFORE anything was completed — its UI will be stale
const page2 = await ctx.newPage(); watch(page2); await page2.goto(ORIGIN + "/today/"); await waitToday(page2);

await check("C4 complete 'Study 30 minutes' from Today -> checked, '1 / N', 'Today XP: +30', result line with XP + stats", async () => {
  await page.getByRole("button", { name: "Complete Study 30 minutes" }).click();
  await page.getByRole("button", { name: "Study 30 minutes, completed" }).waitFor();
  const t = await text(); assert.match(t, new RegExp(`1 / ${questRows.length} completed`)); assert.match(t, /Today XP: \+30/);
  assert.match(t, /Quest complete · Study 30 minutes · \+30 XP · Intelligence \+2 · Discipline \+1/);
  assert.equal(await page.getByRole("button", { name: "Study 30 minutes, completed" }).isDisabled(), true);
});
await check("C5 rewards really stored once: profile 30 XP, Int 3, Disc 2; exactly one quest event", async () => {
  const s = await readStores(["system", "systemEvents", "quests"]); assert.equal(s.out.system[0].totalXp, 30); assert.equal(s.out.system[0].stats.intelligence, 3); assert.equal(s.out.system[0].stats.discipline, 2);
  assert.deepEqual(s.out.systemEvents.map((e) => e.id), [`quest:daily:${TODAY}:study-30`]); assert.equal(s.out.quests.filter((q) => q.status === "completed").length, 1);
});
await check("C6 SECOND TAB with a stale UI (still shows 'Complete Study 30 minutes') clicks it -> NO additional reward", async () => {
  assert.equal(await page2.getByRole("button", { name: "Complete Study 30 minutes" }).isEnabled(), true, "stale tab still offers the quest");
  await page2.getByRole("button", { name: "Complete Study 30 minutes" }).click(); await page2.getByRole("button", { name: "Study 30 minutes, completed" }).waitFor();
  const s = await readStores(["system", "systemEvents"]); assert.equal(s.out.system[0].totalXp, 30); assert.equal(s.out.system[0].stats.intelligence, 3); assert.equal(s.out.systemEvents.length, 1);
});
await check("C7 DOUBLE-CLICK on 'Workout' -> rewarded once (+30 only)", async () => {
  await page.getByRole("button", { name: "Complete Workout" }).dblclick(); await page.getByRole("button", { name: "Workout, completed" }).waitFor(); await page.waitForTimeout(300);
  const s = await readStores(["system", "systemEvents"]); assert.equal(s.out.system[0].totalXp, 60); assert.equal(s.out.system[0].stats.strength, 3); assert.equal(s.out.system[0].stats.health, 2); assert.equal(s.out.systemEvents.length, 2);
  assert.match(await text(), /2 \/ \d completed/); assert.match(await text(), /Today XP: \+60/);
});
await check("C8 RELOAD keeps everything: same quests, same completed state, same XP, no re-award, no duplicate quests", async () => {
  const before = await readStores(["quests", "system", "systemEvents"]); await page.reload(); await waitToday();
  const after = await readStores(["quests", "system", "systemEvents"]); assert.equal(JSON.stringify(after.out), JSON.stringify(before.out));
  const t = await text(); assert.match(t, /2 \/ \d completed/); assert.match(t, /Today XP: \+60/);
  assert.equal(await page.getByRole("button", { name: "Study 30 minutes, completed" }).isDisabled(), true); assert.equal(after.out.quests.length, questRows.length);
});
await page2.close();
await check("C9 Today's OTHER data unaffected by completing quests (tasks/habits/money/achievements untouched)", async () => {
  const s = await readStores(["tasks", "achievements", "money", "habits", "habitEntries"]); assert.equal(s.out.tasks.length, 2); assert.equal(s.out.achievements.length, 1); assert.equal(s.out.money.length, 1); assert.equal(s.out.habitEntries.length, 1);
  assert.match(await text(), /1\/2 tasks done/);
});

console.log("\n===== D: System screen =====");
await check("D1 'Open System →' from Today opens the System screen", async () => { await page.getByRole("button", { name: "Open System →" }).click(); await page.getByText("LFENWA SYSTEM").waitFor(); });
await check("D2 System shows Today's Quests with the same completed state, level/XP/stats/activity reflect the 2 quests", async () => {
  const t = await text(); assert.match(t, /today's quests/i); assert.match(t, /2 \/ \d completed/);
  assert.match(t, /60\s*\/\s*100\s*XP/); assert.match(t, /40 XP to level 2/); assert.equal(await page.getByLabel("Level 1").count(), 1);
  for (const [n, v] of [["Strength", 3], ["Intelligence", 3], ["Focus", 1], ["Discipline", 2], ["Health", 2], ["Finance", 1]]) assert.equal(await page.getByLabel(`${n} ${v}`, { exact: true }).count(), 1, `${n} ${v}`);
  assert.match(t, /Today\s*\n?\s*\+60/); assert.match(t, /Workout[\s\S]*Study 30 minutes|Study 30 minutes[\s\S]*Workout/); assert.match(t, /Strength \+2 · Health \+1/); assert.match(t, /Intelligence \+2 · Discipline \+1/);
});
await page.screenshot({ path: path.join(SHOTS, "2-system-quests-desktop.png"), fullPage: true });
await check("D3 complete 'Morning routine' ON the System screen -> XP window, stats, tile and activity update WITHOUT a reload", async () => {
  await page.getByRole("button", { name: "Complete Morning routine" }).click(); await page.getByRole("button", { name: "Morning routine, completed" }).waitFor(); await page.waitForTimeout(500);
  const t = await text(); assert.match(t, /80\s*\/\s*100\s*XP/); assert.match(t, /20 XP to level 2/); assert.equal(await page.getByLabel("Discipline 4", { exact: true }).count(), 1); assert.match(t, /Today\s*\n?\s*\+80/); assert.match(t, /Morning routine[\s\S]*Discipline \+2/);
});
await check("D4 finish the day's quests: totals equal the sum of the quest XP; level-up shown when crossing 100", async () => {
  for (const r of (await rows()).filter((r) => !r.disabled)) { await page.getByRole("button", { name: r.label }).click(); await page.getByRole("button", { name: r.label.replace(/^Complete /, "") + ", completed" }).waitFor(); }
  await page.waitForTimeout(500); const all = await rows(); const total = all.reduce((s, r) => s + r.xp, 0);
  assert.ok(all.every((r) => r.disabled)); const s = await readStores(["system"]); assert.equal(s.out.system[0].totalXp, total);
  const t = await text(); assert.match(t, new RegExp(`${all.length} / ${all.length} completed`)); assert.equal(await page.getByLabel(total >= 100 ? "Level 2" : "Level 1").count(), 1, `total ${total}`);
  if (total >= 100) assert.match(t, /Level 2 reached/);
});
await page.screenshot({ path: path.join(SHOTS, "3-system-all-done-desktop.png"), fullPage: true });
await check("D5 the desktop auto-backup hook (window.__lfnawaExportFullBackup) carries quests, XP log and profile", async () => {
  const b = JSON.parse(await page.evaluate(() => window.__lfnawaExportFullBackup())); const n = (await rows()).length;
  assert.equal(b.life.quests.length, n); assert.equal(b.life.quests.filter((q) => q.status === "completed").length, n); assert.equal(b.life.systemEvents.length, n); assert.equal(b.life.system.length, 1); assert.equal(b.life.tasks.length, 2);
});

console.log("\n===== E: existing screens + Quick Switch to Trades (protected module) =====");
const tabs = [["Today", /1\/2 tasks done/], ["My Day", /Basic information|Wake-up/i], ["Calendar", /Calendar/i], ["Memories", /Memories/i], ["Goals", /Launch Lfenwa feature/], ["Learning", /TEMI basics/], ["Money", /42\.5/], ["Health & Habits", /Exercise/], ["Mind", /feeling steady/], ["Insights", /wellbeing/i], ["Settings", /backup & restore/i], ["System", /LFENWA SYSTEM/]];
for (const [label, re] of tabs) await check(`E ${label}: opens and shows its data`, async () => { await page.getByRole("button", { name: label, exact: true }).first().click(); await page.waitForTimeout(400); assert.match(await text(), re); });
await check("E nav is Today, System, My Day, Calendar, Memories, Goals, Learning, Money, Health & Habits, Mind, Insights, Settings", async () => {
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll(".lfnawa-desktop-rail button")].map((b) => b.innerText.trim())), ["Today","System","My Day","Calendar","Memories","Goals","Learning","Money","Health & Habits","Mind","Insights","Settings"]);
});
await check("E1 Trades DB absent until Trades is opened (System/Today/quests never create it)", async () => assert.ok(!(await dbs()).some((n) => n.startsWith("esOrderFlowJournal")), JSON.stringify(await dbs())));
await check("E2 Quick Switch -> Trades loads; Trades creates its OWN database", async () => {
  await page.getByRole("button", { name: "Switch to Lfenwa Trades" }).click(); await page.locator('iframe[title="Lfenwa Trades"]').waitFor(); await page.waitForTimeout(2500);
  assert.ok(page.frames().some((f) => f.url().includes("/trades/index.html"))); assert.ok((await dbs()).some((n) => n.startsWith("esOrderFlowJournal")), JSON.stringify(await dbs()));
});
await check("E3 Quick Switch back -> Days returns; quest state + XP intact; Trades DB unchanged by us", async () => {
  const before = await dbs(); await page.getByRole("button", { name: "Switch to Lfenwa Days" }).click(); await page.getByRole("button", { name: "Today", exact: true }).first().click(); await waitToday();
  const n = (await rows()).length; assert.match(await text(), new RegExp(`${n} / ${n} completed`)); assert.deepEqual(await dbs(), before);
});
await check("E4 no console/page errors from our code across Today, System, every screen and Trades switching", async () => { const ours = consoleErrors.filter((e) => !e.includes("/trades/")); assert.deepEqual(ours, [], JSON.stringify(consoleErrors)); });

console.log("\n===== F: Today stays fully usable when the System's storage FAILS =====");
const bad = await ctx.newPage(); watch(bad);
await bad.addInitScript(() => { // simulate the System stores being unusable while life stores keep working
  const orig = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (stores, ...rest) { const names = Array.isArray(stores) ? stores : [stores]; if (names.some((n) => n === "quests" || n === "system" || n === "systemEvents")) throw new Error("simulated System storage failure"); return orig.call(this, stores, ...rest); };
});
consoleErrors.length = 0;
await bad.goto(ORIGIN + "/today/"); await bad.getByText("How today is going").waitFor(); await bad.getByText(/Couldn't load today's quests/).waitFor();
await check("F1 Today still shows ALL its existing life data; only the System block reports the failure (with a retry button)", async () => {
  const t = await text(bad); assert.match(t, /1\/2 tasks done/); assert.match(t, /Shipped the build/); assert.match(t, /42\.5/); assert.match(t, /memories/i); assert.match(t, /trading/i); assert.match(t, /Couldn't load today's quests/); assert.equal(await bad.getByRole("button", { name: "Try again" }).count(), 1);
});
await bad.screenshot({ path: path.join(SHOTS, "4-today-system-failure.png"), fullPage: true });
await check("F2 …and Today's own actions still work while the System is down (open My Day via nav)", async () => { await bad.getByRole("button", { name: "My Day", exact: true }).first().click(); await bad.waitForTimeout(400); assert.match(await text(bad), /Basic information|Wake-up/i); });
await bad.close();

console.log("\n===== G: mobile widths — no horizontal overflow =====");
for (const w of [390, 320]) {
  await page.setViewportSize({ width: w, height: 844 });
  await page.locator("button.lfnawa-mobile-drawer").first().click(); await page.locator("div.lfnawa-mobile-drawer button", { hasText: "Today" }).first().click(); await waitToday(); await page.waitForTimeout(300);
  await check(`G ${w}px Today (with System section): no horizontal overflow`, async () => { const o = await overflow(); assert.ok(o.doc <= 0 && o.sc <= 0, JSON.stringify(o)); });
  await check(`G ${w}px Today: quest check buttons are comfortable tap targets (>= 32px) and titles are visible`, async () => {
    const boxes = await page.evaluate(() => [...document.querySelectorAll("ul li button[aria-label]")].map((b) => { const r = b.getBoundingClientRect(); return { w: r.width, h: r.height, right: b.closest("li").getBoundingClientRect().right, vw: window.innerWidth }; }));
    assert.ok(boxes.length >= 3 && boxes.every((b) => b.w >= 32 && b.h >= 32 && b.right <= b.vw + 0.5), JSON.stringify(boxes));
  });
  await page.screenshot({ path: path.join(SHOTS, `5-today-${w}.png`), fullPage: true });
  await page.locator("button.lfnawa-mobile-drawer").first().click(); await page.locator("div.lfnawa-mobile-drawer button", { hasText: "System" }).click(); await page.getByText("LFENWA SYSTEM").waitFor(); await page.waitForTimeout(900);
  await check(`G ${w}px System (with quests): no horizontal overflow`, async () => { const o = await overflow(); assert.ok(o.doc <= 0 && o.sc <= 0, JSON.stringify(o)); });
  await page.screenshot({ path: path.join(SHOTS, `6-system-${w}.png`), fullPage: true });
}
await page.setViewportSize({ width: 1280, height: 900 });

if (ORIG) {
  console.log("\n===== H: DOWNGRADE reality check (documented limitation) =====");
  await serve(ORIG); consoleErrors.length = 0; await page.goto(ORIGIN + "/today/"); await page.waitForTimeout(2500);
  await check("H1 the ORIGINAL build cannot open the upgraded v2 database (VersionError; stuck on Loading…)", async () => { const t = await text(); assert.ok(/Loading/.test(t) && consoleErrors.some((e) => /requested version \(1\) is less than the existing version \(2\)/.test(e)), t.slice(0, 60) + JSON.stringify(consoleErrors)); });
  await serve(NEW); await page.goto(ORIGIN + "/today/"); await waitToday();
  await check("H2 …and it is recoverable: the new build opens it again with ALL data + quest progress intact", async () => { const n = (await rows()).length; assert.match(await text(), new RegExp(`${n} / ${n} completed`)); assert.match(await text(), /1\/2 tasks done/); });
}

await browser.close(); await stop();
console.log(`\nE2E: ${pass} passed, ${fail} failed  (screenshots: ${SHOTS})`);
process.exit(fail || pass === 0 ? 1 : 0);
