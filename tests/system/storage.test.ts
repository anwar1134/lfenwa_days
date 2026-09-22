import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { P, V1_STORES, NEW_STORES, createRunner, makeV1WithData, dbList, rawOpen } from "./helpers";

const scenario = process.argv[2];
const runner = createRunner(`storage:${scenario}`);
const t = runner.t;

async function main() {
  const storage = await import("@/lib/storage");
  const sys = await import("@/lib/system/store");
  const { getLevelProgress } = await import("@/lib/system/engine");

  if (scenario === "upgrade") {
    const before = await makeV1WithData();
    assert.deepEqual(await dbList(), ["lfnawaDaysDB@1"]);
    await t("v1 DB (13 stores, real-shaped rows) upgrades to v2 on first use", async () => { await storage.dbGetAll("days"); assert.deepEqual(await dbList(), ["lfnawaDaysDB@2"]); });
    await t("EVERY pre-existing row in EVERY pre-existing store is byte-identical after the upgrade", async () => {
      for (const [name, rows] of Object.entries(before)) {
        const after = await storage.dbGetAll(name as never);
        assert.equal(after.length, rows.length, `${name}: row count`);
        const key = V1_STORES[name];
        const byKey = (a: unknown[]) => Object.fromEntries((a as Record<string, unknown>[]).map((r) => [String(r[key]), P(r)]));
        assert.deepEqual(byKey(after), byKey(rows), `${name}: contents`);
      }
    });
    await t("existing by_date / by_habit indexes still work after the upgrade", async () => {
      assert.equal((await storage.dbGetByDate("tasks", "2026-09-19")).length, 2);
      assert.equal((await storage.dbGetByHabit("h1")).length, 2);
    });
    await t("the 3 new stores exist and start empty; quests/systemEvents have a working by_date index", async () => {
      for (const s of NEW_STORES) assert.equal((await storage.dbGetAll(s as never)).length, 0, s);
      assert.deepEqual(await storage.dbGetByDate("quests", "2026-09-19"), []);
      assert.deepEqual(await storage.dbGetByDate("systemEvents", "2026-09-19"), []);
    });
    await t("upgrade did NOT create the protected Trades database", async () => { assert.ok(!(await dbList()).some((n) => n.startsWith("esOrderFlowJournal")), P(await dbList())); });
    await t("no System profile is auto-created by the upgrade itself (created lazily, only if absent)", async () => { assert.equal(await storage.dbGet("system", "profile"), null); });
    await t("first System open creates a fresh profile (0 XP, stats all 1) and leaves user data untouched", async () => {
      const p = await sys.loadOrCreateProfile(); assert.equal(p.totalXp, 0); assert.deepEqual(Object.values(p.stats), [1, 1, 1, 1, 1, 1]);
      assert.equal((await storage.dbGetAll("tasks")).length, 3);
    });
  }

  if (scenario === "fresh") {
    await t("brand-new install: DB opens at v2 with all 16 stores", async () => {
      await storage.dbGetAll("days"); assert.deepEqual(await dbList(), ["lfnawaDaysDB@2"]);
      const db = await rawOpen("lfnawaDaysDB", 2); const names = [...db.objectStoreNames].sort(); db.close();
      assert.equal(names.length, 16, names.join(",")); for (const s of NEW_STORES) assert.ok(names.includes(s), s);
    });
    await t("20 CONCURRENT loadOrCreateProfile() calls -> exactly ONE profile row, all callers agree", async () => {
      const ps = await Promise.all(Array.from({ length: 20 }, () => sys.loadOrCreateProfile()));
      assert.equal((await storage.dbGetAll("system")).length, 1);
      assert.equal(new Set(ps.map((p) => p.createdAt)).size, 1);
    });
    await t("loadOrCreateProfile NEVER overwrites an existing profile", async () => {
      const cur = await storage.dbGet("system", "profile");
      await storage.dbPut("system", { ...cur!, totalXp: 777, stats: { ...cur!.stats, strength: 18 } });
      const p = await sys.loadOrCreateProfile(); assert.equal(p.totalXp, 777); assert.equal(p.stats.strength, 18);
      assert.equal((await storage.dbGet("system", "profile"))!.totalXp, 777);
    });
    await t("a corrupt stored profile is repaired on read, not thrown on", async () => {
      await storage.dbPut("system", { id: "profile", totalXp: "junk", stats: { strength: -4 } } as never);
      const p = await sys.loadOrCreateProfile(); assert.equal(p.totalXp, 0); assert.equal(p.stats.strength, 1); assert.equal(p.stats.finance, 1);
    });
    await t("Trades DB is never created by any System/Days operation", async () => { assert.ok(!(await dbList()).some((n) => n.startsWith("esOrderFlowJournal")), P(await dbList())); });
  }

  if (scenario === "award") {
    const base = { date: "2026-09-19", source: "quest" as const, label: "Study 30 min" };
    await t("award applies XP + stats, writes an event, and reports no level-up under threshold", async () => {
      const r = await sys.awardXp({ ...base, eventId: "quest:a", xp: 30, stats: { intelligence: 2, discipline: 1 } });
      assert.equal(r.applied, true); assert.equal(r.duplicate, false); assert.equal(r.leveledUp, false); assert.equal(r.profile.totalXp, 30);
      assert.equal(r.profile.stats.intelligence, 3); assert.equal(r.profile.stats.discipline, 2);
      const ev = await storage.dbGetAll("systemEvents"); assert.equal(ev.length, 1); assert.equal(ev[0].id, "quest:a"); assert.equal(ev[0].xp, 30);
    });
    await t("SAME eventId again is a no-op (duplicate:true), XP unchanged", async () => {
      const r = await sys.awardXp({ ...base, eventId: "quest:a", xp: 30, stats: { intelligence: 2 } });
      assert.equal(r.applied, false); assert.equal(r.duplicate, true);
      assert.equal((await storage.dbGet("system", "profile"))!.totalXp, 30); assert.equal((await storage.dbGetAll("systemEvents")).length, 1);
    });
    await t("10 CONCURRENT awards with the SAME id -> applied exactly once (no XP farming by double-tap)", async () => {
      const rs = await Promise.all(Array.from({ length: 10 }, () => sys.awardXp({ ...base, eventId: "habit:h1:2026-09-19", source: "habit", xp: 15, stats: { health: 1 } })));
      assert.equal(rs.filter((r) => r.applied).length, 1); assert.equal(rs.filter((r) => r.duplicate).length, 9);
      const p = (await storage.dbGet("system", "profile"))!; assert.equal(p.totalXp, 45); assert.equal(p.stats.health, 2);
    });
    await t("level-up is detected exactly when a threshold is crossed (45 -> 100 XP = L1 -> L2)", async () => {
      const r = await sys.awardXp({ ...base, eventId: "quest:big", xp: 55 });
      assert.equal(r.profile.totalXp, 100); assert.equal(r.levelBefore, 1); assert.equal(r.levelAfter, 2); assert.equal(r.leveledUp, true);
    });
    await t("one big award can skip levels (100 -> 700 = L2 -> L5)", async () => {
      const r = await sys.awardXp({ ...base, eventId: "boss:1", source: "quest", xp: 600 }); assert.equal(r.levelBefore, 2); assert.equal(r.levelAfter, 5); assert.equal(r.leveledUp, true);
    });
    await t("negative XP and negative stat gains can never reduce anything", async () => {
      const before = (await storage.dbGet("system", "profile"))!;
      const r = await sys.awardXp({ ...base, eventId: "neg:1", xp: -500, stats: { strength: -9 } });
      assert.equal(r.applied, false); const after = (await storage.dbGet("system", "profile"))!;
      assert.equal(after.totalXp, before.totalXp); assert.deepEqual(after.stats, before.stats);
    });
    await t("an award that grants nothing (xp 0, no stats) writes no event", async () => {
      const n = (await storage.dbGetAll("systemEvents")).length; const r = await sys.awardXp({ ...base, eventId: "zero:1", xp: 0 });
      assert.equal(r.applied, false); assert.equal((await storage.dbGetAll("systemEvents")).length, n);
    });
    await t("empty eventId is rejected (it is the idempotency key)", async () => { await assert.rejects(() => sys.awardXp({ ...base, eventId: "  ", xp: 5 }), /eventId/); });
    await t("first-ever award with NO existing profile creates the profile atomically with the event", async () => {
      // wipe just the profile to simulate 'profile never created'
      await storage.dbDelete("system", "profile");
      const r = await sys.awardXp({ ...base, eventId: "fresh:1", xp: 10 }); assert.equal(r.applied, true); assert.equal(r.profile.totalXp, 10);
      assert.deepEqual(Object.values(r.profile.stats), [1, 1, 1, 1, 1, 1]);
    });
    await t("getXpForDate / getRecentEvents / getEventsForDate are consistent", async () => {
      const all = await storage.dbGetAll("systemEvents"); const today = all.filter((e) => e.date === "2026-09-19").reduce((s, e) => s + e.xp, 0);
      assert.equal(await sys.getXpForDate("2026-09-19"), today); assert.equal(await sys.getXpForDate("1999-01-01"), 0);
      const rec = await sys.getRecentEvents(3); assert.equal(rec.length, 3); assert.ok(rec[0].at >= rec[1].at && rec[1].at >= rec[2].at);
    });
    await t("ATOMICITY: if work throws after writing, NOTHING is persisted (rollback)", async () => {
      const before = P(await storage.dbGet("system", "profile")); const evBefore = (await storage.dbGetAll("systemEvents")).length;
      await assert.rejects(() => storage.dbTransaction(["system", "systemEvents"], "readwrite", async (tx) => {
        await storage.idbReq(tx.objectStore("system").put({ id: "profile", totalXp: 999999, stats: {}, createdAt: 1, updatedAt: 1, schemaVersion: 1 }));
        await storage.idbReq(tx.objectStore("systemEvents").put({ id: "half:1", date: "d", at: 1, source: "manual", label: "x", xp: 1, stats: {} }));
        throw new Error("boom");
      }), /boom/);
      assert.equal(P(await storage.dbGet("system", "profile")), before, "profile unchanged"); assert.equal((await storage.dbGetAll("systemEvents")).length, evBefore, "no half-written event");
    });
    await t("progress math end-to-end: stored XP -> getLevelProgress agrees with engine", async () => {
      const p = (await storage.dbGet("system", "profile"))!; const lp = getLevelProgress(p.totalXp); assert.ok(lp.level >= 1 && lp.fraction >= 0 && lp.fraction < 1);
    });
  }

  if (scenario === "backup") {
    const before = await makeV1WithData();
    await sys.awardXp({ eventId: "q:1", date: "2026-09-19", source: "quest", label: "Workout", xp: 120, stats: { strength: 2 } });
    await t("export includes the 3 System stores (and all 13 old ones) — desktop auto-backup uses this same function", async () => {
      const b = await storage.exportFullBackup(); assert.equal(b.schema, 1);
      for (const s of [...Object.keys(V1_STORES), ...NEW_STORES]) assert.ok(Array.isArray((b.life as Record<string, unknown>)[s]), s);
      assert.equal(b.life.system.length, 1); assert.equal(b.life.system[0].totalXp, 120); assert.equal(b.life.systemEvents.length, 1);
    });
    // an OLD-format backup: exactly the 13 v1 keys, no System keys
    const oldBackup = { schema: 1, app: "Lfnawa Days", exportedAt: "2026-09-01T00:00:00Z", life: { days: [{ date: "2026-08-01", note: "from old backup" }], tasks: [{ id: "oldtask", date: "2026-08-01", text: "old", status: "done" }] } };
    await t("OLD backup, MERGE: imports fine, System progress untouched, existing data kept", async () => {
      const r = await storage.importLifeBackup(oldBackup, "merge"); assert.equal(r.ok, true);
      assert.equal((await storage.dbGet("system", "profile"))!.totalXp, 120); assert.equal((await storage.dbGetAll("systemEvents")).length, 1);
      assert.equal((await storage.dbGetAll("tasks")).length, 4); // 3 original + 1 from backup
    });
    await t("OLD backup, REPLACE: old stores are replaced as before, but System progress SURVIVES", async () => {
      const r = await storage.importLifeBackup(oldBackup, "replace"); assert.equal(r.ok, true);
      const tasks = await storage.dbGetAll("tasks"); assert.deepEqual(tasks.map((x) => x.id), ["oldtask"], "tasks replaced by backup");
      assert.equal((await storage.dbGetAll("habits")).length, 0, "stores absent from the backup are cleared, exactly like before");
      assert.equal((await storage.dbGet("system", "profile"))!.totalXp, 120, "System XP preserved"); assert.equal((await storage.dbGetAll("systemEvents")).length, 1, "System log preserved");
    });
    await t("NEW backup (with System stores), REPLACE: System is restored from the backup", async () => {
      const newBackup = { schema: 1, app: "Lfnawa Days", exportedAt: "x", life: { system: [{ id: "profile", schemaVersion: 1, createdAt: 1, updatedAt: 2, totalXp: 5000, stats: { strength: 30, intelligence: 30, focus: 30, discipline: 30, health: 30, finance: 30 } }], quests: [], systemEvents: [] } };
      const r = await storage.importLifeBackup(newBackup, "replace"); assert.equal(r.ok, true);
      assert.equal((await storage.dbGet("system", "profile"))!.totalXp, 5000); assert.equal((await storage.dbGetAll("systemEvents")).length, 0);
    });
    await t("garbage payload is rejected without touching anything", async () => {
      const r = await storage.importLifeBackup({ nope: 1 }, "replace"); assert.equal(r.ok, false); assert.equal((await storage.dbGet("system", "profile"))!.totalXp, 5000);
    });
    await t("round-trip: export -> replace-import reproduces identical data (System included)", async () => {
      const a = await storage.exportFullBackup(); await storage.importLifeBackup(JSON.parse(JSON.stringify(a)), "replace"); const b = await storage.exportFullBackup();
      assert.equal(P(a.life), P(b.life));
    });
    await t("Trades DB was never created by export/import (read-only bridge intact)", async () => { assert.ok(!(await dbList()).some((n) => n.startsWith("esOrderFlowJournal")), P(await dbList())); });
    void before;
  }
  runner.done();
}
main().catch((e) => { console.error("HARNESS ERROR", e); process.exit(2); });
