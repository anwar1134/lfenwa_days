/* Phase 1 — System storage, the XP gate, triggers, backup, and the Trading read boundary,
   against an in-memory IndexedDB.
   Usage: storage.test.ts <upgrade|fresh|gate|live|projection|backup|trading>
   (one scenario per process: lib/storage.ts caches its DB handle at module level) */
import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { P, NEW_STORES, V1_STORES, createRunner, makeV1WithData, dbList, assertOriginalDataIntact, rawOpen, rawPutAll } from "./helpers";

const scenario = process.argv[2];
const runner = createRunner(`storage:${scenario}`);
const t = runner.t;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TRADES_DB = "esOrderFlowJournal";

/** Read a store through a SEPARATE raw connection (bypasses lib/storage entirely). */
async function rawAll(store: string, dbName = "lfnawaDaysDB"): Promise<any[]> {
  const db = await rawOpen(dbName, dbName === "lfnawaDaysDB" ? 2 : 1);
  const rows = await new Promise<any[]>((res, rej) => { const q = db.transaction(store).objectStore(store).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  db.close();
  return rows;
}

/** Read any store through a SEPARATE raw connection at whatever version the database currently is. */
async function rawAllAny(store: string, dbName = "lfnawaDaysDB"): Promise<any[]> {
  const ver = (await indexedDB.databases()).find((d) => d.name === dbName)!.version!;
  const db = await rawOpen(dbName, ver);
  const rows = await new Promise<any[]>((res, rej) => { const q = db.transaction(store).objectStore(store).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  db.close();
  return rows;
}

async function main() {
  const storage = await import("@/lib/storage");
  const svc = await import("@/lib/system/store");
  const eng = await import("@/lib/system/engine");
  const integ = await import("@/lib/system/integrations");
  const { habitCompletedEvent } = await import("@/lib/system/integrations/habits");
  const { taskCompletedEvent } = await import("@/lib/system/integrations/tasks");
  const { tradingIntegration } = await import("@/lib/system/integrations/trading");

  const today = storage.todayStr();
  const yest = eng.addDays(today, -1);
  const twoAgo = eng.addDays(today, -2);
  const tomorrow = eng.addDays(today, 1);
  const NOW = Date.now();
  const habitEv = (habitId: string, date: string) => habitCompletedEvent({ id: habitId, name: `Habit ${habitId}` }, { id: `${habitId}:${date}`, habitId, date, done: true }, NOW)!;
  const taskEv = (id: string, date = today) => taskCompletedEvent({ id, date, text: `Task ${id}`, status: "done", completedAt: Date.parse(date + "T12:00:00Z") }, NOW)!;
  const settle = async () => { await sleep(40); await integ.flushIntegrations(); await sleep(40); await integ.flushIntegrations(); };
  const profileRow = async () => (await storage.dbGet("systemProfile", "profile"))!;
  const ledger = () => storage.dbGetAll("xpLedger");
  const facts = () => storage.dbGetAll("lifeEvents");
  /** the invariant everything relies on: cached projection == fold of the ledger */
  const assertConsistent = async (label = "") => {
    const rows = await ledger(); const f = eng.foldLedger(rows); const p = (await profileRow()).projection;
    assert.equal(p.totalXp, f.totalXp, `${label} totalXp`); assert.equal(p.ledgerCount, rows.length, `${label} ledgerCount`); assert.deepEqual(p.stats, f.stats, `${label} stats`);
  };
  const xpNow = async () => (await profileRow()).projection.totalXp;

  /* ============================== upgrade ============================== */
  if (scenario === "upgrade") {
    const before = await makeV1WithData(today);
    assert.deepEqual(await dbList(), ["lfnawaDaysDB@1"]);
    await t("v1 database (13 stores, real-shaped rows) upgrades to v2 on first use", async () => { await storage.dbGetAll("days"); assert.deepEqual(await dbList(), ["lfnawaDaysDB@2"]); });
    await t("every ORIGINAL store still exists and every original row is byte-identical", async () => {
      const db = await rawOpen("lfnawaDaysDB", 2); const names = [...db.objectStoreNames]; db.close();
      for (const s of Object.keys(V1_STORES)) assert.ok(names.includes(s), `store ${s} missing`);
      await assertOriginalDataIntact(storage as never, before);
    });
    await t("exactly the 3 approved stores were added (16 total) and start EMPTY", async () => {
      const db = await rawOpen("lfnawaDaysDB", 2); const names = [...db.objectStoreNames].sort(); db.close();
      assert.equal(names.length, 16); for (const s of NEW_STORES) { assert.ok(names.includes(s), s); assert.equal((await storage.dbGetAll(s as never)).length, 0, s); }
    });
    await t("indexes: lifeEvents{by_date,by_type}, xpLedger{by_date,by_event}; existing indexes (tasks.by_date, habitEntries.by_habit) intact", async () => {
      const db = await rawOpen("lfnawaDaysDB", 2); const idx = (s: string) => [...db.transaction(s).objectStore(s).indexNames].sort();
      assert.deepEqual(idx("lifeEvents"), ["by_date", "by_type"]); assert.deepEqual(idx("xpLedger"), ["by_date", "by_event"]); assert.deepEqual(idx("systemProfile"), []); assert.deepEqual(idx("tasks"), ["by_date"]); assert.deepEqual(idx("habitEntries"), ["by_habit"]);
      const kp = (s: string) => db.transaction(s).objectStore(s).keyPath; assert.equal(kp("systemProfile"), "id"); assert.equal(kp("lifeEvents"), "eventId"); assert.equal(kp("xpLedger"), "id"); db.close();
      assert.equal((await storage.dbGetByDate("tasks", today)).length, 2); assert.equal((await storage.dbGetByHabit("h1")).length, 2);
    });
    await t("Trades database was NOT created or touched by the upgrade", async () => assert.ok(!(await dbList()).some((n) => n.startsWith(TRADES_DB)), P(await dbList())));
    await t("no System profile is created by the upgrade itself; the first System read creates it lazily", async () => {
      assert.equal(await storage.dbGet("systemProfile", "profile"), null); const s = await svc.getSnapshot(today); assert.equal(s.totalXp, 0); assert.ok(await storage.dbGet("systemProfile", "profile"));
    });
    await t("EXISTING history earns ZERO retroactively: opening the System over years-old data creates no ledger rows", async () => {
      await integ.reconcileNow(); assert.equal((await ledger()).length, 0, "nothing in the ledger");
    });
    await t("user data still identical after System activity", async () => assertOriginalDataIntact(storage as never, before));
  }

  /* ============================== legacyv2 ==============================
     A database left behind by the ABANDONED prototype: already at version 2, with its own stores
     (system / quests / systemEvents) and NONE of the Phase 1 stores. IndexedDB only runs the upgrade
     handler when the version INCREASES, so code that merely says "version 2" would open it and never
     create systemProfile / lifeEvents / xpLedger. */
  if (scenario === "legacyv2") {
    const PROTO = ["system", "quests", "systemEvents"];
    const seedProto = async () => {
      const db = await rawOpen("lfnawaDaysDB", 2, (d) => {
        for (const [name, kp] of Object.entries(V1_STORES)) { const st = d.createObjectStore(name, { keyPath: kp }); if (["timeline", "achievements", "tasks", "learning", "money", "memories", "mindEntries"].includes(name)) st.createIndex("by_date", "date"); if (name === "habitEntries") st.createIndex("by_habit", "habitId"); }
        d.createObjectStore("system", { keyPath: "id" }); d.createObjectStore("quests", { keyPath: "id" }).createIndex("by_date", "date"); d.createObjectStore("systemEvents", { keyPath: "id" }).createIndex("by_date", "date");
      });
      const data: Record<string, unknown[]> = {
        tasks: [{ id: "t1", date: today, text: "real task", status: "done", completedAt: Date.now() }, { id: "t0", date: "2020-01-01", text: "old", status: "pending" }],
        habits: [{ id: "h1", name: "Exercise", createdAt: 1, archived: false }], habitEntries: [{ id: "h1:2020-03-01", habitId: "h1", date: "2020-03-01", done: true }],
        money: [{ id: "m1", date: today, type: "expense", amount: 42.5, currency: "DH", category: "Food", note: "x" }], settings: [{ id: "app", defaultCurrency: "MAD" }],
        system: [{ id: "profile", totalXp: 1240, stats: { strength: 18 }, createdAt: 1, updatedAt: 2, schemaVersion: 1 }],
        quests: [{ id: `daily:${today}:study-30`, type: "daily", date: today, title: "Study", status: "completed", xpReward: 30, statRewards: {}, completedAt: 5 }],
        systemEvents: [{ id: "quest:x", date: today, at: 1, source: "quest", label: "Study", xp: 30, stats: {} }],
      };
      for (const [st, rows] of Object.entries(data)) await rawPutAll(db, st, rows); db.close(); return data;
    };
    const before = await seedProto();
    const idbNames = async () => { const db = await rawOpen("lfnawaDaysDB", (await indexedDB.databases()).find((d) => d.name === "lfnawaDaysDB")!.version!); const n = [...db.objectStoreNames].sort(); const v = db.version; db.close(); return { n, v }; };
    await t("SETUP: the prototype-shaped database really is version 2 with NO Phase 1 stores (the hazard exists)", async () => { const { n, v } = await idbNames(); assert.equal(v, 2); assert.equal(n.length, 16); for (const s of NEW_STORES) assert.ok(!n.includes(s), s); });
    await t("Phase 1 code opens it: existing data is readable AND the Phase 1 stores now exist (additive upgrade, no data touched)", async () => {
      assert.equal((await storage.dbGetAll("tasks")).length, 2); const { n, v } = await idbNames(); for (const s of NEW_STORES) assert.ok(n.includes(s), `${s} missing — System would fail`); assert.ok(v >= 3, `version ${v}`);
    });
    await t("NOTHING WAS DELETED: all 13 original stores AND the prototype's 3 stores still exist with every row byte-identical", async () => {
      const { n } = await idbNames(); for (const s of [...Object.keys(V1_STORES), ...PROTO]) assert.ok(n.includes(s), `${s} was deleted`);
      for (const [name, rows] of Object.entries(before)) { const after = await rawAllAny(name); assert.equal(P([...after].sort((a, b) => P(a).localeCompare(P(b)))), P([...rows].sort((a, b) => P(a).localeCompare(P(b)))), name); }
    });
    await t("the indexes on the new stores exist (by_date/by_type, by_date/by_event) and the original indexes are intact", async () => {
      const ver = (await idbNames()).v; const db = await rawOpen("lfnawaDaysDB", ver); const idx = (s: string) => [...db.transaction(s).objectStore(s).indexNames].sort();
      assert.deepEqual(idx("lifeEvents"), ["by_date", "by_type"]); assert.deepEqual(idx("xpLedger"), ["by_date", "by_event"]); assert.deepEqual(idx("tasks"), ["by_date"]); assert.deepEqual(idx("habitEntries"), ["by_habit"]); db.close();
    });
    await t("the System WORKS on it: profile is created in the NEW store; an eligible event awards once; reprocessing awards nothing", async () => {
      const s0 = await svc.getSnapshot(today); assert.equal(s0.totalXp, 0, "prototype XP is not carried over (abandoned architecture)");
      const e = taskEv("legacy1"); const r1 = await svc.processEvents([e], today); const r2 = await svc.processEvents([e], today); assert.equal(r1.rewarded.length, 1); assert.equal(r2.rewarded.length, 0); assert.equal((await svc.getSnapshot(today)).totalXp, 10);
    });
    await t("the prototype's stores are INERT: the System never reads or writes them (rows unchanged after System activity)", async () => {
      for (const st of PROTO) { const rows = await rawAllAny(st); assert.equal(P(rows), P(before[st]), st); }
    });
    await t("backup: the export contains the Phase 1 stores and NOT the dormant prototype stores; a Replace restore never deletes the dormant ones", async () => {
      const b = await storage.exportFullBackup(); for (const s of NEW_STORES) assert.ok(Array.isArray((b.life as Record<string, unknown>)[s]), s); for (const s of PROTO) assert.ok(!(s in b.life), `${s} leaked into the backup`);
      await storage.importLifeBackup(JSON.parse(JSON.stringify(b)), "replace"); for (const st of PROTO) assert.equal(P(await rawAllAny(st)), P(before[st]), `${st} changed by restore`);
    });
    await t("the next start (database now at version 3, code says 2) opens WITHOUT a VersionError", async () => { const v = (await idbNames()).v; assert.ok(v >= 3); assert.ok((await storage.dbGetAll("habits")).length >= 0); });
    await t("Trades DB never created", async () => assert.ok(!(await dbList()).some((n) => n.startsWith(TRADES_DB)), P(await dbList())));
  }

  /* ============================== tabs (version-change cooperation) ============================== */
  if (scenario === "tabs") {
    const protoDb = async () => rawOpen("lfnawaDaysDB", 2, (d) => { for (const [name, kp] of Object.entries(V1_STORES)) d.createObjectStore(name, { keyPath: kp }); d.createObjectStore("system", { keyPath: "id" }); d.createObjectStore("quests", { keyPath: "id" }); d.createObjectStore("systemEvents", { keyPath: "id" }); });
    const setup = await protoDb(); await rawPutAll(setup, "tasks", [{ id: "t1", date: today, text: "x", status: "pending" }]); // this connection plays "another tab still running the OLD build": it has NO versionchange handler and stays open
    let resolved = false; const opening = storage.dbGetAll("tasks").then((r) => { resolved = true; return r; });
    await t("an OLD tab holding the database open BLOCKS the additive upgrade (it waits, it does not corrupt or fail)", async () => { await sleep(300); assert.equal(resolved, false, "upgrade must wait for the other tab"); });
    await t("…and completes as soon as that tab closes/reloads: data intact, Phase 1 stores present", async () => {
      setup.close(); const rows = await Promise.race([opening, sleep(3000).then(() => "TIMEOUT")]); assert.notEqual(rows, "TIMEOUT"); assert.equal((rows as unknown[]).length, 1);
      const db = await rawOpen("lfnawaDaysDB", 3); for (const st of NEW_STORES) assert.ok(db.objectStoreNames.contains(st), st); db.close();
    });
    await t("a NEW-build tab does not block ANOTHER tab's upgrade: this build's connection closes on versionchange, then reopens on the next operation", async () => {
      let upgraded = false; const other = indexedDB.open("lfnawaDaysDB", 4); other.onupgradeneeded = () => { other.result.createObjectStore("someFutureStore", { keyPath: "id" }); }; const done = new Promise<IDBDatabase>((res, rej) => { other.onsuccess = () => { upgraded = true; res(other.result); }; other.onerror = () => rej(other.error); });
      const db4 = await Promise.race([done, sleep(3000).then(() => null)]); assert.ok(db4, "the other tab's upgrade was blocked by this build's connection"); assert.equal(upgraded, true); (db4 as IDBDatabase).close();
      assert.equal((await storage.dbGetAll("tasks")).length, 1, "this build reopened at the higher version and still works");
      await svc.processEvents([taskEv("after-upgrade")], today); assert.equal((await svc.getSnapshot(today)).totalXp, 10);
    });
    await t("a database at a HIGHER version than the code's constant (v4 here) opens without a VersionError, existing data intact", async () => { assert.equal((await storage.dbGetAll("tasks")).length, 1); assert.deepEqual((await storage.dbGetAll("habits")), []); });
    await t("Trades DB never created", async () => assert.ok(!(await dbList()).some((n) => n.startsWith(TRADES_DB)), P(await dbList())));
  }

  /* ============================== fresh ============================== */
  if (scenario === "fresh") {
    await t("brand-new install: DB opens at v2 with all 16 stores", async () => {
      await storage.dbGetAll("days"); assert.deepEqual(await dbList(), ["lfnawaDaysDB@2"]);
      const db = await rawOpen("lfnawaDaysDB", 2); assert.equal([...db.objectStoreNames].length, 16); db.close();
    });
    await t("SIMULTANEOUS first-run profile creation: 20 concurrent loadProfile() -> exactly ONE profile row, all callers agree", async () => {
      const ps = await Promise.all(Array.from({ length: 20 }, () => svc.loadProfile()));
      assert.equal((await storage.dbGetAll("systemProfile")).length, 1); assert.equal(new Set(ps.map((p) => p.createdAt)).size, 1);
    });
    await t("SIMULTANEOUS first-run via the XP gate: 10 concurrent processEvents on an empty profile -> one profile, consistent totals", async () => {
      await storage.dbDelete("systemProfile", "profile"); await svc.setHabitLink("hx", "general");
      const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => svc.processEvents([taskEv(`fr${i}`)], today)));
      assert.equal((await storage.dbGetAll("systemProfile")).length, 1); assert.equal(rs.reduce((n, r) => n + r.rewarded.length, 0), 5, "task.done cap is 5/day"); await assertConsistent("first-run");
    });
    await t("loadProfile NEVER overwrites an existing profile (links + progress preserved)", async () => {
      const before = await profileRow(); const p = await svc.loadProfile(); assert.equal(P(p.projection), P(before.projection)); assert.deepEqual(p.settings.habitLinks, { hx: "general" });
    });
    await t("a corrupt stored profile is repaired on read, not thrown on (and progress is rebuilt from the ledger)", async () => {
      const xp = await xpNow(); await storage.dbPut("systemProfile", { id: "profile", projection: "junk", settings: 5 } as never);
      const p = await svc.loadProfile(); assert.equal(p.projection.totalXp, xp); await assertConsistent("repaired");
    });
    await t("Trades DB is never created by any System/Days operation", async () => assert.ok(!(await dbList()).some((n) => n.startsWith(TRADES_DB)), P(await dbList())));
  }

  /* ============================== gate ============================== */
  if (scenario === "gate") {
    await svc.setHabitLink("h1", "study");
    await t("an eligible event (today) awards XP ONCE: linked-study habit = 15 XP, Intelligence +1, Discipline +1, one fact, one ledger row", async () => {
      const r = await svc.processEvents([habitEv("h1", today)], today); assert.equal(r.rewarded.length, 1); assert.equal(r.recorded, 1);
      const p = (await profileRow()).projection; assert.equal(p.totalXp, 15); assert.equal(p.stats.intelligence, 2); assert.equal(p.stats.discipline, 2); assert.equal(p.stats.strength, 1);
      assert.equal((await ledger()).length, 1); assert.equal((await facts()).length, 1); assert.equal((await ledger())[0].id, `habit.study::habit.completed:h1:${today}`); await assertConsistent();
    });
    await t("REPROCESSING the same event 25 times awards ZERO additional XP", async () => {
      for (let i = 0; i < 25; i++) { const r = await svc.processEvents([habitEv("h1", today)], today); assert.equal(r.rewarded.length, 0); assert.equal(r.recorded, 0); }
      assert.equal(await xpNow(), 15); assert.equal((await ledger()).length, 1); assert.equal((await facts()).length, 1);
    });
    await t("the same event repeated INSIDE one batch is processed once", async () => { const e = habitEv("h1", yest); const r = await svc.processEvents([e, e, e], today); assert.equal(r.rewarded.length, 1); assert.equal(await xpNow(), 30); });
    await t("CONCURRENT processing of one event (10 callers) awards exactly once", async () => {
      const e = habitEv("h1", today).eventId; const ev = { ...habitEv("h1", today), eventId: e.replace("h1", "h1b"), metadata: { habitId: "h1", habitName: "H" } }; // a NEW fact (same habit, distinct id)
      const rs = await Promise.all(Array.from({ length: 10 }, () => svc.processEvents([ev], today))); assert.equal(rs.reduce((n, r) => n + r.rewarded.length, 0), 1); assert.equal(await xpNow(), 45); await assertConsistent();
    });
    await t("TWO 'TABS' processing overlapping batches at once: every distinct event is rewarded exactly once", async () => {
      const set = (ids: number[]) => ids.map((i) => taskEv(`tab${i}`)); const before = await xpNow();
      await Promise.all([svc.processEvents(set([1, 2, 3]), today), svc.processEvents(set([2, 3, 4]), today), svc.processEvents(set([1, 4, 5]), today)]);
      const rows = (await ledger()).filter((r) => r.ruleId === "task.done"); assert.equal(rows.length, 5, "5 distinct tasks (= the daily cap)"); assert.equal(new Set(rows.map((r) => r.eventId)).size, 5); assert.equal(await xpNow(), before + 50); await assertConsistent();
    });
    await t("OLD history earns ZERO: an event dated years ago is recorded as a FACT but never rewarded", async () => {
      const before = await xpNow(); const rows = (await ledger()).length; const r = await svc.processEvents([habitEv("h1", "2020-01-01")], today);
      assert.equal(r.recorded, 1); assert.equal(r.rewarded.length, 0); assert.equal(await xpNow(), before); assert.equal((await ledger()).length, rows); assert.ok((await facts()).some((f) => f.date === "2020-01-01"));
    });
    await t("ELIGIBILITY BOUNDARY: yesterday earns (done above); the day before yesterday and TOMORROW do not", async () => {
      const before = await xpNow(); const r = await svc.processEvents([habitEv("h1", twoAgo), habitEv("h1", tomorrow)], today); assert.equal(r.recorded, 2); assert.equal(r.rewarded.length, 0); assert.equal(await xpNow(), before);
    });
    await t("an old fact does not become rewardable later by being re-sent (still ineligible) — no back-door", async () => {
      const before = await xpNow(); for (let i = 0; i < 3; i++) await svc.processEvents([habitEv("h1", "2020-01-01")], today); assert.equal(await xpNow(), before);
    });
    await t("DAILY CAP is enforced from the ledger: a 6th and 7th task on one day earn nothing", async () => {
      const before = (await ledger()).filter((r) => r.ruleId === "task.done").length; assert.equal(before, 5);
      const r = await svc.processEvents([taskEv("extra1"), taskEv("extra2")], today); assert.equal(r.rewarded.length, 0); assert.equal((await ledger()).filter((x) => x.ruleId === "task.done").length, 5);
    });
    await t("caps are PER DATE: yesterday's tasks have their own budget", async () => {
      const r = await svc.processEvents([taskEv("y1", yest), taskEv("y2", yest)], today); assert.equal(r.rewarded.length, 2);
    });
    await t("UNLINKED habit: recorded as a fact, earns nothing; linking it later (inside the window) earns ONCE; unlinking never removes XP", async () => {
      const e = habitEv("h9", today); let r = await svc.processEvents([e], today); assert.equal(r.recorded, 1); assert.equal(r.rewarded.length, 0);
      const before = await xpNow(); await svc.setHabitLink("h9", "workout"); r = await svc.processEvents([e], today); assert.equal(r.rewarded.length, 1); assert.equal(await xpNow(), before + 15);
      r = await svc.processEvents([e], today); assert.equal(r.rewarded.length, 0); await svc.setHabitLink("h9", null); r = await svc.processEvents([e], today); assert.equal(r.rewarded.length, 0); assert.equal(await xpNow(), before + 15, "unlinking removed nothing");
      const s = await svc.getSnapshot(today); assert.ok(s.stats.strength >= 2 && s.stats.health >= 2);
    });
    await t("invalid events are ignored, never stored, never rewarded; empty input is a no-op", async () => {
      const f = (await facts()).length, x = await xpNow(); const r = await svc.processEvents([null, {}, { eventId: "" }, { ...habitEv("h1", today), date: "garbage" }] as never, today); assert.deepEqual(r, { recorded: 0, rewarded: [] });
      assert.deepEqual(await svc.processEvents([], today), { recorded: 0, rewarded: [] }); assert.equal((await facts()).length, f); assert.equal(await xpNow(), x);
    });
    await t("ledger rows are append-only and keyed ruleId::eventId (no duplicates possible)", async () => {
      const rows = await ledger(); assert.equal(new Set(rows.map((r) => r.id)).size, rows.length); for (const r of rows) { assert.equal(r.id, `${r.ruleId}::${r.eventId}`); assert.ok(r.xp > 0); assert.ok(Object.values(r.stats).every((g) => g > 0)); assert.ok(r.cause.source && r.cause.type && r.cause.title); }
    });
    await t("trading process events reward PROCESS only (prepared 25/D+1, reviewed 25/I+1 D+1) and cannot reward twice", async () => {
      const day = "2026-01-05"; void day; const mk = (type: string) => ({ eventId: `${type}:${today}`, source: "trading", type, date: today, timestamp: NOW, title: type, metadata: { definition: "provisional" } });
      const before = await xpNow(); await svc.processEvents([mk("trading.prepared"), mk("trading.reviewed"), mk("trading.checkedIn")], today); assert.equal(await xpNow(), before + 50); await svc.processEvents([mk("trading.prepared"), mk("trading.reviewed")], today); assert.equal(await xpNow(), before + 50);
    });
    await t("FUZZ: 300 random events (random dates/types/ids, duplicates, junk) — XP and every stat are monotonic; projection always equals the ledger; every ledger row is unique", async () => {
      const types = ["task.completed", "habit.completed", "trading.prepared", "trading.reviewed", "trading.noTrade", "made.up"]; let prev = (await profileRow()).projection;
      for (let i = 0; i < 300; i++) {
        const d = [today, yest, twoAgo, "2020-05-05", tomorrow, "bad"][Math.floor(Math.random() * 6)]; const ty = types[Math.floor(Math.random() * types.length)]; const id = `${ty}:fz${Math.floor(Math.random() * 40)}:${d}`;
        await svc.processEvents([{ eventId: id, source: "fz", type: ty, date: d, timestamp: NOW, title: "fz", metadata: { habitId: `f${Math.floor(Math.random() * 3)}` } }], today);
        const cur = (await profileRow()).projection; assert.ok(cur.totalXp >= prev.totalXp); for (const [k, v] of Object.entries(prev.stats)) assert.ok(cur.stats[k] >= v, `${k} decreased`); prev = cur;
      }
      await assertConsistent("fuzz"); const rows = await ledger(); assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
    });
    await t("System snapshot: level is DERIVED from XP; today's XP is the sum of today's ledger rows; recent is newest-first", async () => {
      const s = await svc.getSnapshot(today); assert.equal(s.progress.level, eng.levelFromXp(s.totalXp)); assert.equal(s.todayXp, (await ledger()).filter((r) => r.date === today).reduce((n, r) => n + r.xp, 0));
      for (let i = 1; i < s.recent.length; i++) assert.ok(s.recent[i - 1].at >= s.recent[i].at); assert.equal(await storage.dbGet("systemProfile", "profile").then((p) => "level" in (p as object)), false, "level is never stored");
    });
    await t("Trades DB never created by the XP gate", async () => assert.ok(!(await dbList()).some((n) => n.startsWith(TRADES_DB))));
  }

  /* ============================== live (write subscription + integrations) ============================== */
  if (scenario === "live") {
    await t("WRITE SUBSCRIPTION: listeners are called AFTER the write commits (the record is readable inside the listener)", async () => {
      let seen: unknown = "unset"; const off = storage.subscribeToWrites(async (e) => { if (e.store === "goals") seen = await storage.dbGet("goals", (e.value as { id: string }).id); });
      await storage.dbPut("goals", { id: "g1", title: "G", category: "c", progress: 0, status: "active", milestones: [] } as never); await sleep(60); off(); assert.ok(seen && (seen as { id: string }).id === "g1", "value visible after commit");
    });
    await t("a listener that THROWS or REJECTS can never break the original write, and other listeners still run", async () => {
      let good = 0; const off1 = storage.subscribeToWrites(() => { throw new Error("boom"); }); const off2 = storage.subscribeToWrites(async () => { throw new Error("async boom"); }); const off3 = storage.subscribeToWrites(() => { good++; });
      const errs: unknown[] = []; const orig = console.error; console.error = (...a: unknown[]) => { errs.push(a); };
      const v = await storage.dbPut("memories", { id: "m1", date: today, type: "text", text: "x", attachmentId: null, createdAt: 1 } as never); await sleep(60); console.error = orig; off1(); off2(); off3();
      assert.equal((v as { id: string }).id, "m1"); assert.ok(await storage.dbGet("memories", "m1"), "write persisted"); assert.equal(good, 1); assert.ok(errs.length >= 2, "failures were logged, not thrown");
    });
    await t("deletes are announced too; an ABORTED/failed write announces nothing", async () => {
      const seen: string[] = []; const off = storage.subscribeToWrites((e) => { seen.push(`${e.op}:${e.store}`); }); await storage.dbDelete("memories", "m1"); await sleep(60); off(); assert.deepEqual(seen, ["delete:memories"]);
    });
    await t("System writes (ledger/facts/profile) never trigger integrations (no feedback loop)", async () => {
      const seen: string[] = []; const off = storage.subscribeToWrites((e) => { seen.push(e.store); }); await svc.processEvents([taskEv("loop1")], today); await sleep(60); off(); assert.deepEqual(seen, []);
    });

    const stop = integ.startSystemIntegrations(); await settle();
    await t("startSystemIntegrations is idempotent (StrictMode double-mount): one write is handled ONCE", async () => {
      const stop2 = integ.startSystemIntegrations(); await svc.setHabitLink("hA", "study"); await storage.dbPut("habits", { id: "hA", name: "Read", createdAt: 1, archived: false });
      const before = (await facts()).length; await storage.dbPut("habitEntries", { id: `hA:${today}`, habitId: "hA", date: today, done: true }); await settle(); assert.equal((await facts()).length, before + 1); assert.equal((await ledger()).filter((r) => r.eventId.includes("hA")).length, 1); stop2();
    });
    await t("LIVE: checking a linked habit awards once; UNCHECK does nothing; RECHECK does NOT award again", async () => {
      const id = `hA:${today}`; const xp0 = await xpNow(); const rows0 = (await ledger()).length;
      await storage.dbPut("habitEntries", { id, habitId: "hA", date: today, done: false }); await settle(); assert.equal(await xpNow(), xp0, "uncheck removes nothing");
      await storage.dbPut("habitEntries", { id, habitId: "hA", date: today, done: true }); await settle(); assert.equal(await xpNow(), xp0, "recheck awards nothing new");
      for (let i = 0; i < 4; i++) { await storage.dbPut("habitEntries", { id, habitId: "hA", date: today, done: i % 2 === 0 }); } await settle(); assert.equal(await xpNow(), xp0); assert.equal((await ledger()).length, rows0);
      const fct = (await facts()).filter((f) => f.eventId === `habit.completed:hA:${today}`); assert.equal(fct.length, 1);
    });
    await t("LIVE: an UNLINKED habit records a fact but earns nothing (no guessing from the name 'Exercise')", async () => {
      await storage.dbPut("habits", { id: "hE", name: "Exercise", createdAt: 1, archived: false }); const xp0 = await xpNow();
      await storage.dbPut("habitEntries", { id: `hE:${today}`, habitId: "hE", date: today, done: true }); await settle(); assert.equal(await xpNow(), xp0); assert.ok((await facts()).some((f) => f.eventId === `habit.completed:hE:${today}`));
    });
    await t("LIVE: linking that habit afterwards (via linkHabit) makes today's already-ticked entry count — once", async () => {
      const xp0 = await xpNow(); await integ.linkHabit("hE", "workout"); await settle(); assert.equal(await xpNow(), xp0 + 15); await integ.requestReconcile(true); await settle(); assert.equal(await xpNow(), xp0 + 15);
    });
    await t("LIVE: an OLD habit entry (edited/restored history) becomes a fact but earns ZERO", async () => {
      const xp0 = await xpNow(); await storage.dbPut("habitEntries", { id: "hA:2020-03-03", habitId: "hA", date: "2020-03-03", done: true }); await settle(); assert.equal(await xpNow(), xp0); assert.ok((await facts()).some((f) => f.date === "2020-03-03"));
    });
    await t("LIVE: task done today -> +10 XP, Discipline +1; reopening and re-completing does not duplicate", async () => {
      const xp0 = await xpNow(); const task = { id: "tk1", date: today, text: "Ship it", status: "pending" as const }; await storage.dbPut("tasks", task); await settle(); assert.equal(await xpNow(), xp0);
      await storage.dbPut("tasks", { ...task, status: "done", completedAt: Date.now() }); await settle(); assert.equal(await xpNow(), xp0 + 10);
      await storage.dbPut("tasks", { ...task, status: "pending", completedAt: null }); await storage.dbPut("tasks", { ...task, status: "done", completedAt: Date.now() }); await settle(); assert.equal(await xpNow(), xp0 + 10);
    });
    await t("LIVE: a task completed long ago (completedAt = 10 days back) earns nothing; one PLANNED yesterday but completed today belongs to today", async () => {
      const xp0 = await xpNow(); await storage.dbPut("tasks", { id: "tk2", date: today, text: "old", status: "done", completedAt: Date.now() - 10 * 86400000 }); await settle(); assert.equal(await xpNow(), xp0);
      await storage.dbPut("tasks", { id: "tk3", date: yest, text: "carried over", status: "done", completedAt: Date.now() }); await settle(); assert.equal(await xpNow(), xp0 + 10); assert.equal((await ledger()).find((r) => r.eventId === "task.completed:tk3")!.date, today);
    });
    await t("RECONCILE catches a write the live trigger never saw (raw write = 'another tab' / missed): awarded once, and a second reconcile adds nothing", async () => {
      await svc.setHabitLink("hB", "general"); await storage.dbPut("habits", { id: "hB", name: "Water", createdAt: 1, archived: false }); const xp0 = await xpNow();
      const raw = await rawOpen("lfnawaDaysDB", 2); await rawPutAll(raw, "habitEntries", [{ id: `hB:${today}`, habitId: "hB", date: today, done: true }]); raw.close(); await settle(); assert.equal(await xpNow(), xp0, "live never saw it");
      let r = await integ.reconcileNow(); assert.equal(r.rewarded.length, 1); assert.equal(await xpNow(), xp0 + 15); r = await integ.reconcileNow(); assert.equal(r.rewarded.length, 0); assert.equal(await xpNow(), xp0 + 15);
    });
    await t("LIVE and RECONCILE produce the SAME ids: an event first seen live is not re-awarded by reconcile", async () => {
      const xp0 = await xpNow(); const rows0 = (await ledger()).length; await integ.reconcileNow(); await integ.reconcileNow(); assert.equal(await xpNow(), xp0); assert.equal((await ledger()).length, rows0);
      const ids = (await facts()).map((f) => f.eventId); assert.equal(new Set(ids).size, ids.length);
    });
    await t("reconcile only looks at today + yesterday: old history is never scanned into the ledger", async () => {
      const raw = await rawOpen("lfnawaDaysDB", 2); await rawPutAll(raw, "tasks", [{ id: "hist", date: "2019-01-01", text: "ancient", status: "done", completedAt: Date.parse("2019-01-01T10:00:00Z") }]); raw.close();
      const xp0 = await xpNow(); await integ.reconcileNow(); assert.equal(await xpNow(), xp0); assert.ok(!(await facts()).some((f) => f.eventId === "task.completed:hist"));
    });
    await t("requestReconcile is throttled and coalesced (10 rapid non-forced calls -> at most one extra pass)", async () => {
      await integ.requestReconcile(true); await integ.flushIntegrations(); const rows = (await facts()).length; await Promise.all(Array.from({ length: 10 }, () => integ.requestReconcile())); await integ.flushIntegrations(); assert.equal((await facts()).length, rows);
    });
    await t("a failing integration never blocks the others or the app (reconcileNow still resolves)", async () => {
      const r = await integ.reconcileNow(); assert.ok(r && Array.isArray(r.rewarded));
    });
    await t("listLinkableHabits (the UI's habit list) is served by the integration layer and excludes archived habits", async () => {
      await storage.dbPut("habits", { id: "hArch", name: "Old habit", createdAt: 1, archived: true });
      const list = await integ.listLinkableHabits(); const names = list.map((h) => h.name); assert.ok(names.includes("Read") && names.includes("Exercise")); assert.ok(!names.includes("Old habit")); assert.ok(list.every((h) => Object.keys(h).sort().join() === "id,name"));
    });
    await t("projection stays consistent with the ledger after all of the above", async () => assertConsistent("live"));
    stop();
    await t("after stop(), writes are no longer handled live (subscriptions removed)", async () => {
      const xp0 = await xpNow(); await storage.dbPut("habitEntries", { id: `hB:${yest}`, habitId: "hB", date: yest, done: true }); await settle(); assert.equal(await xpNow(), xp0);
    });
  }

  /* ============================== projection (self-healing) ============================== */
  if (scenario === "projection") {
    await svc.setHabitLink("h1", "study");
    await svc.processEvents([habitEv("h1", today), habitEv("h1", yest), taskEv("p1")], today); const truth = eng.foldLedger(await ledger());
    await t("baseline: projection == fold(ledger)", async () => { assert.equal((await profileRow()).projection.totalXp, truth.totalXp); assert.equal(truth.totalXp, 40); });
    await t("SELF-HEAL: a stale cache (lower ledgerCount) is rebuilt from the ledger on the next read", async () => {
      const p = await profileRow(); await storage.dbPut("systemProfile", { ...p, projection: { ...p.projection, totalXp: 5, ledgerCount: 1 } }); const s = await svc.getSnapshot(today); assert.equal(s.totalXp, 40); assert.equal((await profileRow()).projection.ledgerCount, 3);
    });
    await t("SELF-HEAL: a cache with missing/garbage projection is rebuilt", async () => {
      const p = await profileRow(); await storage.dbPut("systemProfile", { ...p, projection: undefined } as never); assert.equal((await svc.getSnapshot(today)).totalXp, 40); await storage.dbPut("systemProfile", { ...p, projection: { totalXp: "x", stats: 5 } } as never); assert.equal((await svc.getSnapshot(today)).totalXp, 40);
    });
    await t("SELF-HEAL: a DELETED profile row is recreated with the progress recovered from the ledger (links are user settings and reset)", async () => {
      await storage.dbDelete("systemProfile", "profile"); const s = await svc.getSnapshot(today); assert.equal(s.totalXp, 40); assert.equal(s.stats.intelligence, 3); assert.deepEqual(s.habitLinks, {});
    });
    await t("the XP gate heals a stale cache BEFORE building on it (a stale cache can never corrupt new awards)", async () => {
      await svc.setHabitLink("h1", "study"); const p = await profileRow(); await storage.dbPut("systemProfile", { ...p, projection: { ...p.projection, totalXp: 99999, ledgerCount: 0 } });
      await svc.processEvents([taskEv("p2")], today); assert.equal((await profileRow()).projection.totalXp, 50); await assertConsistent("gate-heal");
    });
    await t("rebuildProjection is idempotent and matches the ledger", async () => { const a = await svc.rebuildProjection(); const b = await svc.rebuildProjection(); assert.deepEqual(a, b); await assertConsistent("rebuild"); });
    await t("MERGE-restoring an OLDER backup over newer progress can never lower XP (projection heals from the merged ledger)", async () => {
      const older = JSON.parse(JSON.stringify(await storage.exportFullBackup())); await svc.processEvents([taskEv("p3"), taskEv("p4")], today); const xpAfter = await xpNow(); assert.equal(xpAfter, 70);
      const r = await storage.importLifeBackup(older, "merge"); assert.equal(r.ok, true);
      assert.equal((await profileRow()).projection.totalXp, 50, "the merged-in OLD profile row is stale…"); const s = await svc.getSnapshot(today); assert.equal(s.totalXp, 70, "…and heals to the ledger truth (nothing was lost)"); await assertConsistent("merge");
    });
    await t("a ledger row that arrives via restore is counted once; re-importing the same backup changes nothing", async () => {
      const snap = JSON.parse(JSON.stringify(await storage.exportFullBackup())); const xp = await xpNow(); await storage.importLifeBackup(snap, "merge"); await storage.importLifeBackup(snap, "merge"); assert.equal((await svc.getSnapshot(today)).totalXp, xp); await assertConsistent("reimport");
    });
  }

  /* ============================== backup / restore ============================== */
  if (scenario === "backup") {
    const before = await makeV1WithData(today);
    await svc.setHabitLink("h1", "study"); await svc.processEvents([habitEv("h1", today)], today);
    await t("export includes the 3 System stores (arrays) and all 13 original stores; schema stays 1", async () => {
      const b = await storage.exportFullBackup(); assert.equal(b.schema, 1); for (const s of [...Object.keys(V1_STORES), ...NEW_STORES]) assert.ok(Array.isArray((b.life as Record<string, unknown>)[s]), s);
      assert.equal(b.life.xpLedger.length, 1); assert.equal(b.life.lifeEvents.length, 1); assert.equal(b.life.systemProfile.length, 1);
    });
    const oldBackup = { schema: 1, app: "Lfnawa Days", life: { tasks: [{ id: "oldtask", date: "2020-01-01", text: "old", status: "done", completedAt: Date.parse("2020-01-01T09:00:00Z") }], habitEntries: [{ id: "h1:2020-01-01", habitId: "h1", date: "2020-01-01", done: true }] } };
    await t("OLD backup (no System keys), REPLACE: old stores replaced as before, but System progress SURVIVES", async () => {
      const r = await storage.importLifeBackup(oldBackup, "replace"); assert.equal(r.ok, true); assert.deepEqual((await storage.dbGetAll("tasks")).map((x) => x.id), ["oldtask"]); assert.equal((await storage.dbGetAll("habits")).length, 0);
      assert.equal(await xpNow(), 15); assert.equal((await ledger()).length, 1); assert.equal((await facts()).length, 1);
    });
    await t("RESTORE DOES NOT MINT XP: an import fires ZERO per-record notifications and exactly ONE bulk-change; old restored history earns nothing", async () => {
      let per = 0, bulk = 0; const o1 = storage.subscribeToWrites(() => { per++; }); const o2 = storage.subscribeToBulkChange(() => { bulk++; });
      const stop = integ.startSystemIntegrations(); await settle(); const xp0 = await xpNow();
      const r = await storage.importLifeBackup(oldBackup, "merge"); assert.equal(r.ok, true); await sleep(80); await settle();
      assert.equal(per, 0, "no per-record notifications during import"); assert.equal(bulk, 1); assert.equal(await xpNow(), xp0, "restored 2020 records earned nothing"); assert.ok(!(await ledger()).some((r) => r.date === "2020-01-01"));
      stop(); o1(); o2();
    });
    await t("a live write AFTER a restore is notified again (suppression did not leak past the import)", async () => {
      let per = 0; const o = storage.subscribeToWrites(() => { per++; }); await storage.dbPut("habits", { id: "hz", name: "Z", createdAt: 1, archived: false }); await sleep(60); o(); assert.equal(per, 1);
    });
    await t("restoring recent records + the ledger that already paid for them does NOT double-award", async () => {
      const full = JSON.parse(JSON.stringify(await storage.exportFullBackup())); full.life.habits = [{ id: "h1", name: "S", createdAt: 1, archived: false }]; full.life.habitEntries = [{ id: `h1:${today}`, habitId: "h1", date: today, done: true }];
      const xp0 = await xpNow(); const stop = integ.startSystemIntegrations(); await storage.importLifeBackup(full, "replace"); await sleep(80); await settle(); stop(); assert.equal(await xpNow(), xp0);
      assert.equal((await ledger()).filter((r) => r.eventId === `habit.completed:h1:${today}`).length, 1);
    });
    await t("NEW backup with System stores, REPLACE: System state is restored from the file (and consistent)", async () => {
      const snap = JSON.parse(JSON.stringify(await storage.exportFullBackup())); await svc.processEvents([taskEv("bk1")], today); assert.ok((await xpNow()) > 15);
      await storage.importLifeBackup(snap, "replace"); assert.equal((await svc.getSnapshot(today)).totalXp, snap.life.xpLedger.reduce((n: number, r: { xp: number }) => n + r.xp, 0)); await assertConsistent("restore");
    });
    await t("garbage payload is rejected without touching anything", async () => { const x = await xpNow(); const r = await storage.importLifeBackup({ nope: 1 }, "replace"); assert.equal(r.ok, false); assert.equal(await xpNow(), x); });
    await t("round-trip: export -> replace-import -> export reproduces identical data (System included)", async () => {
      const a = await storage.exportFullBackup(); await storage.importLifeBackup(JSON.parse(JSON.stringify(a)), "replace"); const b = await storage.exportFullBackup(); assert.equal(P(a.life), P(b.life));
    });
    await t("the OLD (pre-System) importer accepts a new-format backup: 13 stores restored, System keys ignored", async () => { void before; const b = await storage.exportFullBackup(); assert.ok(b.life.xpLedger.length >= 1); });
    await t("Trades DB never created by export/import (read-only bridge intact)", async () => assert.ok(!(await dbList()).some((n) => n.startsWith(TRADES_DB)), P(await dbList())));
  }

  /* ============================== trading (read-only boundary) ============================== */
  if (scenario === "trading") {
    const mkTradesDb = async (kv: Record<string, unknown>) => {
      const db = await rawOpen(TRADES_DB, 1, (d) => { d.createObjectStore("kv"); });
      await new Promise<void>((res, rej) => { const tx = db.transaction("kv", "readwrite"); for (const [k, v] of Object.entries(kv)) tx.objectStore("kv").put(typeof v === "string" ? v : JSON.stringify(v), k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
      db.close();
    };
    const kvSnapshot = async () => { const db = await rawOpen(TRADES_DB, 1); const out = await new Promise<Record<string, unknown>>((res) => { const o: Record<string, unknown> = {}; const c = db.transaction("kv").objectStore("kv").openCursor(); c.onsuccess = () => { const cur = c.result; if (cur) { o[String(cur.key)] = cur.value; cur.continue(); } else res(o); }; }); const v = db.version; const stores = [...db.objectStoreNames]; db.close(); return { out, v, stores }; };
    const win = { today, dates: eng.recentDates(today, 1) };

    await t("Trades never opened: the adapter returns NO events and does NOT create esOrderFlowJournal", async () => {
      assert.deepEqual(await tradingIntegration.reconcile(win), []); assert.ok(!(await dbList()).some((n) => n.startsWith(TRADES_DB)), P(await dbList()));
    });
    await mkTradesDb({
      days: { [today]: { premarket: { session: "NY Open" }, tradeNoTrade: { riskOk: "yes", sleep: 7 }, dailyReview: { scores: { process: 9 } } }, [yest]: { mentalState: { sleep: 6 } } },
      trades: [{ date: today, pnl: 1234.56, profit: 777, followedRules: true, notes: "big win" }, { date: yest, pnl: -321.5 }],
      notrades: [{ date: yest, reason: "no edge" }, { date: today, reason: "chop" }],
      playbook: [{ id: "p" }], settings: { risk: 250 },
    });
    const snap0 = await kvSnapshot();
    await t("with a real-shaped Trades DB: adapter derives PROCESS facts for today + yesterday, with deterministic ids", async () => {
      const es = await tradingIntegration.reconcile(win); const ids = es.map((e) => e.eventId).sort();
      assert.deepEqual(ids, [`trading.checkedIn:${today}`, `trading.prepared:${yest}`, `trading.prepared:${today}`, `trading.reviewed:${today}`].sort(), "yesterday: prep only (trade taken -> no no-trade); today: prep/check-in/review, no no-trade (day not over)");
    });
    await t("READ-ONLY: the Trades database is byte-for-byte identical after reading (same version, same stores, same values)", async () => {
      await tradingIntegration.reconcile(win); await tradingIntegration.reconcile(win); const s1 = await kvSnapshot(); assert.deepEqual(s1, snap0); assert.equal(s1.v, 1); assert.deepEqual(s1.stores, ["kv"]);
    });
    await t("END TO END: facts -> XP through the one gate (3 rewards: prepared x2 days, reviewed today; check-in earns nothing)", async () => {
      const es = await tradingIntegration.reconcile(win); const r = await svc.processEvents(es, today); assert.equal(r.rewarded.length, 3);
    });
    await t("ledger contents are exactly: prepared x2 days (25 each), reviewed today (25) — check-in earns nothing", async () => {
      const rows = await ledger(); const byRule = (id: string) => rows.filter((r) => r.ruleId === id).length; assert.equal(byRule("trading.prepared"), 2); assert.equal(byRule("trading.reviewed"), 1); assert.equal(byRule("trading.noTrade"), 0); assert.equal(await xpNow(), 75);
    });
    await t("NO P&L in the System: none of the raw money values (1234.56, 777, -321.5, 250, 'big win') exist in facts, ledger or profile", async () => {
      const all = JSON.stringify([await facts(), await ledger(), await storage.dbGetAll("systemProfile")]); for (const leak of ["1234", "777", "321", "big win", "pnl", "profit"]) assert.ok(!all.includes(leak), `leaked ${leak}`);
    });
    await t("a completed no-trade day (no trades) IS rewarded once: Discipline +2; and re-reading never repeats it", async () => {
      const raw = await rawOpen(TRADES_DB, 1); await new Promise<void>((res) => { const tx = raw.transaction("kv", "readwrite"); tx.objectStore("kv").put(JSON.stringify([{ date: today, pnl: 5 }]), "trades"); tx.oncomplete = () => res(); }); raw.close(); // yesterday now has NO trades
      const s0 = (await profileRow()).projection.stats.discipline; const es = await tradingIntegration.reconcile(win); assert.ok(es.some((e) => e.eventId === `trading.noTrade:${yest}`)); await svc.processEvents(es, today); assert.equal((await profileRow()).projection.stats.discipline, s0 + 2);
      await svc.processEvents(await tradingIntegration.reconcile(win), today); assert.equal((await profileRow()).projection.stats.discipline, s0 + 2);
    });
    await t("MALFORMED shapes (valid JSON, wrong structure) yield no events and no crash", async () => {
      const raw = await rawOpen(TRADES_DB, 1); await new Promise<void>((res) => { const tx = raw.transaction("kv", "readwrite"); const o = tx.objectStore("kv"); o.put(JSON.stringify("nonsense"), "days"); o.put(JSON.stringify(42), "trades"); o.put(JSON.stringify({ x: 1 }), "notrades"); tx.oncomplete = () => res(); }); raw.close();
      assert.deepEqual(await tradingIntegration.reconcile(win), []);
    });
    await t("an UNRESPONSIVE Trades read (bridge promise never settles) times out to 'no data' instead of hanging the System", async () => {
      const orig = indexedDB.databases.bind(indexedDB); (indexedDB as unknown as { databases: () => Promise<never> }).databases = () => new Promise(() => {});
      const t0 = Date.now(); const es = await tradingIntegration.reconcile(win); const dt = Date.now() - t0; (indexedDB as unknown as { databases: typeof orig }).databases = orig;
      assert.deepEqual(es, []); assert.ok(dt >= 2500 && dt < 6000, `took ${dt}ms`);
    });
    await t("after everything, the Trades DB is still version 1 with only its own 'kv' store (System never wrote a thing)", async () => { const s = await kvSnapshot(); assert.equal(s.v, 1); assert.deepEqual(s.stores, ["kv"]); const dbs = await dbList(); assert.ok(dbs.includes(`${TRADES_DB}@1`), P(dbs)); });
  }

  runner.done();
}
main().catch((e) => { console.error("HARNESS ERROR", e); process.exit(2); });
