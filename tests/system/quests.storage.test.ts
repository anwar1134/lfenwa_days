/* Phase 2 — quest generation / completion / persistence / backup against an in-memory IndexedDB.
   Usage: quests.storage.test.ts <generation|completion|persistence|existing|backup>
   (one scenario per process: lib/storage.ts caches its DB handle at module level) */
import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { P, NEW_STORES, createRunner, makeV1WithData, dbList, assertOriginalDataIntact, rawOpen } from "./helpers";

const scenario = process.argv[2];
const runner = createRunner(`quests:storage:${scenario}`);
const t = runner.t;
const D = "2026-09-19";

/** Read a store through a SEPARATE raw connection (bypasses lib/storage entirely) — proves what is really on disk. */
async function rawAll(store: string): Promise<any[]> {
  const db = await rawOpen("lfnawaDaysDB", 2);
  const rows = await new Promise<any[]>((res, rej) => { const q = db.transaction(store).objectStore(store).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  db.close();
  return rows;
}

async function main() {
  const storage = await import("@/lib/storage");
  const sys = await import("@/lib/system/store");
  const eng = await import("@/lib/system/engine");
  const cfg = await import("@/lib/system/config");
  const profile = async () => (await storage.dbGet("system", "profile"))!;
  const events = () => storage.dbGetAll("systemEvents");
  const idOf = (def: string, date = D) => eng.dailyQuestId(date, def);

  if (scenario === "generation") {
    await t("today's quests are created: 3..5, all daily+pending, stored exactly as returned", async () => {
      const qs = await sys.ensureDailyQuests(D);
      assert.ok(qs.length >= 3 && qs.length <= 5, String(qs.length));
      assert.ok(qs.every((q) => q.type === "daily" && q.status === "pending" && q.date === D));
      assert.equal(P((await sys.getQuestsForDate(D)).map((q) => q.id).sort()), P(qs.map((q) => q.id).sort()));
    });
    await t("stored quests carry valid rewards (positive int XP, known stats, positive int gains)", async () => {
      for (const q of await storage.dbGetAll("quests")) {
        assert.ok(Number.isInteger(q.xpReward) && q.xpReward > 0, q.id);
        for (const [k, v] of Object.entries(q.statRewards)) { assert.ok((cfg.STAT_KEYS as readonly string[]).includes(k)); assert.ok(Number.isInteger(v) && (v as number) > 0); }
      }
    });
    await t("repeated generation (10 sequential calls) creates NO duplicates", async () => {
      const n = (await storage.dbGetAll("quests")).length;
      for (let i = 0; i < 10; i++) await sys.ensureDailyQuests(D);
      assert.equal((await storage.dbGetAll("quests")).length, n);
    });
    await t("20 CONCURRENT generation calls (Today + System + double effects) -> still exactly one set", async () => {
      const day = "2026-10-01"; const rs = await Promise.all(Array.from({ length: 20 }, () => sys.ensureDailyQuests(day)));
      assert.equal((await sys.getQuestsForDate(day)).length, rs[0].length);
      assert.equal(new Set(rs.map((r) => P(r.map((q) => q.id)))).size, 1, "every caller saw the same set");
    });
    await t("a different date gets its own independent set; the first date is untouched", async () => {
      const before = P(await sys.getQuestsForDate(D)); await sys.ensureDailyQuests("2026-09-20");
      assert.equal(P(await sys.getQuestsForDate(D)), before); assert.ok((await sys.getQuestsForDate("2026-09-20")).length >= 3);
    });
    await t("regeneration NEVER resets a completed quest back to pending", async () => {
      const id = idOf("study-30"); await sys.completeQuest(id);
      for (let i = 0; i < 3; i++) await sys.ensureDailyQuests(D);
      const q = (await sys.getQuestsForDate(D)).find((x) => x.id === id)!; assert.equal(q.status, "completed"); assert.ok(typeof q.completedAt === "number");
    });
    await t("a day that already has daily quests is never topped up or altered", async () => {
      const day = "2026-11-05"; await storage.dbPut("quests", { id: `daily:${day}:custom`, type: "daily", date: day, title: "Hand-made", status: "pending", xpReward: 5, statRewards: {}, completedAt: null });
      const qs = await sys.ensureDailyQuests(day); assert.deepEqual(qs.map((q) => q.title), ["Hand-made"]); assert.equal((await sys.getQuestsForDate(day)).length, 1);
    });
    await t("non-daily quests on the same date do not block (or get mixed into) daily generation", async () => {
      const day = "2026-11-06"; await storage.dbPut("quests", { id: `boss:${day}:x`, type: "boss", date: day, title: "Boss", status: "pending", xpReward: 300, statRewards: {}, completedAt: null });
      const qs = await sys.ensureDailyQuests(day); assert.ok(qs.length >= 3 && qs.every((q) => q.type === "daily")); assert.equal((await sys.getQuestsForDate(day)).length, qs.length + 1);
    });
    await t("generating quests does not touch the profile or the XP log", async () => { assert.equal((await storage.dbGetAll("system")).length <= 1, true); assert.equal((await events()).filter((e) => e.date === "2026-10-01").length, 0); });
  }

  if (scenario === "completion") {
    await sys.ensureDailyQuests(D);
    const study = idOf("study-30");
    await t("completing a quest awards the right XP and the right stats (study: +30 XP, Int +2, Disc +1)", async () => {
      const before = await sys.loadOrCreateProfile(); const r = await sys.completeQuest(study);
      assert.equal(r.status, "completed"); assert.equal(r.award!.applied, true); assert.equal(r.quest!.status, "completed"); assert.ok(typeof r.quest!.completedAt === "number");
      const after = await profile(); assert.equal(after.totalXp, before.totalXp + 30); assert.equal(after.stats.intelligence, before.stats.intelligence + 2); assert.equal(after.stats.discipline, before.stats.discipline + 1);
      for (const k of ["strength", "focus", "health", "finance"] as const) assert.equal(after.stats[k], before.stats[k], `${k} must not change`);
    });
    await t("activity is recorded: one 'quest' event with the quest title, XP, stats and id quest:<id>", async () => {
      const ev = (await events()).filter((e) => e.sourceId === study); assert.equal(ev.length, 1);
      assert.deepEqual([ev[0].id, ev[0].source, ev[0].label, ev[0].xp, ev[0].stats, ev[0].date], [`quest:${study}`, "quest", "Study 30 minutes", 30, { intelligence: 2, discipline: 1 }, D]);
      assert.equal(await sys.getXpForDate(D), 30);
    });
    await t("completing AGAIN: no extra XP, no extra stats, no extra event ('already-completed')", async () => {
      const before = P(await profile()); const n = (await events()).length; const r = await sys.completeQuest(study);
      assert.equal(r.status, "already-completed"); assert.equal(r.award, null); assert.equal(P(await profile()), before); assert.equal((await events()).length, n);
    });
    await t("10 CONCURRENT completions of one quest -> rewarded exactly once", async () => {
      const id = idOf("workout"); const before = await profile(); const rs = await Promise.all(Array.from({ length: 10 }, () => sys.completeQuest(id)));
      assert.equal(rs.filter((r) => r.status === "completed").length, 1); assert.equal(rs.filter((r) => r.status === "already-completed").length, 9);
      const after = await profile(); assert.equal(after.totalXp, before.totalXp + 30); assert.equal(after.stats.strength, before.stats.strength + 2); assert.equal(after.stats.health, before.stats.health + 1);
      assert.equal((await events()).filter((e) => e.sourceId === id).length, 1);
    });
    await t("unknown quest id -> 'not-found', nothing changes", async () => {
      const before = P(await profile()); const n = (await events()).length; const r = await sys.completeQuest("daily:1999-01-01:nope");
      assert.deepEqual([r.status, r.quest, r.award], ["not-found", null, null]); assert.equal(P(await profile()), before); assert.equal((await events()).length, n);
    });
    await t("completing every quest of the day: totals equal the sum of the quest rewards; each stat rises by exactly its rewards", async () => {
      const qs = await sys.ensureDailyQuests(D); const start = await profile();
      for (const q of qs) await sys.completeQuest(q.id);
      const all = await sys.getQuestsForDate(D); assert.ok(all.every((q) => q.status === "completed"));
      const expectXp = qs.reduce((s, q) => s + q.xpReward, 0); const end = await profile();
      assert.equal(end.totalXp, expectXp); assert.equal(await sys.getXpForDate(D), expectXp); assert.equal(eng.summarizeQuests(all).xpEarned, expectXp);
      const gain: Record<string, number> = {}; for (const q of qs) for (const [k, v] of Object.entries(q.statRewards)) gain[k] = (gain[k] ?? 0) + (v as number);
      for (const k of cfg.STAT_KEYS) assert.equal(end.stats[k], 1 + (gain[k] ?? 0), k); void start;
    });
    await t("XP never goes negative and no stat ever decreases across many completions (checked after every step)", async () => {
      for (const day of ["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04"]) {
        const qs = (await sys.ensureDailyQuests(day)).reverse(); let prev = await profile();
        for (const q of qs) { await sys.completeQuest(q.id); await sys.completeQuest(q.id); const now = await profile();
          assert.ok(now.totalXp >= prev.totalXp && now.totalXp >= 0); for (const k of cfg.STAT_KEYS) assert.ok(now.stats[k] >= prev.stats[k], `${k} decreased`); prev = now; }
      }
    });
    await t("tampered quest with NEGATIVE rewards cannot reduce XP or stats (quest closes, nothing is granted)", async () => {
      await storage.dbPut("quests", { id: "daily:2027-01-01:bad", type: "daily", date: "2027-01-01", title: "Bad", status: "pending", xpReward: -500, statRewards: { strength: -9, focus: 2.9 } as never, completedAt: null });
      const before = await profile(); const r = await sys.completeQuest("daily:2027-01-01:bad"); const after = await profile();
      assert.equal(r.status, "completed"); assert.equal(after.totalXp, before.totalXp + 0); assert.equal(after.stats.strength, before.stats.strength); assert.equal(after.stats.focus, before.stats.focus + 2);
    });
    await t("level-up is reported when a quest crosses a threshold (90 XP -> +30 = level 1 -> 2)", async () => {
      const cur = await profile(); await storage.dbPut("system", { ...cur, totalXp: 90 }); await sys.ensureDailyQuests("2027-02-01");
      const r = await sys.completeQuest(idOf("study-30", "2027-02-01")); assert.equal(r.award!.levelBefore, 1); assert.equal(r.award!.levelAfter, 2); assert.equal(r.award!.leveledUp, true);
    });
    await t("completing writes the quest, profile and event together (all three present after one call)", async () => {
      const day = "2027-03-01"; await sys.ensureDailyQuests(day); const id = idOf("morning-routine", day); const n = (await events()).length; const xp = (await profile()).totalXp;
      await sys.completeQuest(id); assert.equal((await events()).length, n + 1); assert.equal((await profile()).totalXp, xp + 20); assert.equal((await storage.dbGet("quests", id))!.status, "completed");
    });
  }

  if (scenario === "persistence") {
    await sys.ensureDailyQuests(D);
    await sys.completeQuest(idOf("morning-routine")); await sys.completeQuest(idOf("study-30"));
    // Everything below is read through a SEPARATE raw IndexedDB connection: this is what is actually stored.
    await t("completed state persists on disk (raw read): two quests completed, the rest pending", async () => {
      const q = await rawAll("quests"); const done = q.filter((x) => x.status === "completed").map((x) => x.definitionId).sort();
      assert.deepEqual(done, ["morning-routine", "study-30"]); assert.ok(q.filter((x) => x.status === "pending").length >= 1); assert.ok(q.filter((x) => x.status === "completed").every((x) => typeof x.completedAt === "number"));
    });
    await t("rewards persist on disk: profile XP = 20 + 30, stats raised accordingly", async () => {
      const [p] = await rawAll("system"); assert.equal(p.totalXp, 50); assert.equal(p.stats.discipline, 1 + 2 + 1); assert.equal(p.stats.intelligence, 1 + 2);
    });
    await t("activity persists on disk: two quest events, ids quest:<id>", async () => {
      const ev = await rawAll("systemEvents"); assert.deepEqual(ev.map((e) => e.id).sort(), [`quest:${idOf("morning-routine")}`, `quest:${idOf("study-30")}`].sort()); assert.ok(ev.every((e) => e.source === "quest" && e.date === D));
    });
    await t("'reload': re-running generation + reading again changes nothing on disk (no duplicate quests, no re-award)", async () => {
      const before = P([await rawAll("quests"), await rawAll("system"), await rawAll("systemEvents")]);
      for (let i = 0; i < 3; i++) { await sys.ensureDailyQuests(D); await sys.loadOrCreateProfile(); await sys.getXpForDate(D); await sys.completeQuest(idOf("study-30")); }
      assert.equal(P([await rawAll("quests"), await rawAll("system"), await rawAll("systemEvents")]), before);
    });
    await t("Today's XP read back from the log = sum of completed quest rewards", async () => { assert.equal(await sys.getXpForDate(D), 50); });
  }

  if (scenario === "existing") {
    const before = await makeV1WithData(D);
    await t("with a real v1-shaped database: generating + completing quests leaves EVERY original row identical", async () => {
      const qs = await sys.ensureDailyQuests(D); for (const q of qs) await sys.completeQuest(q.id); await sys.ensureDailyQuests("2026-09-20");
      await assertOriginalDataIntact(storage as never, before);
    });
    await t("only the System stores were written to (quests, system, systemEvents populated; nothing else added)", async () => {
      for (const s of NEW_STORES) assert.ok((await storage.dbGetAll(s as never)).length > 0, s);
      assert.equal((await storage.dbGetAll("tasks")).length, 3); assert.equal((await storage.dbGetAll("habitEntries")).length, 2);
    });
    await t("quest completion does NOT create tasks/habit/achievement/money rows (no side effects on life data)", async () => {
      const ach = await storage.dbGetAll("achievements"); assert.equal(ach.length, 1); assert.equal((await storage.dbGetAll("money")).length, 1);
    });
    await t("Trades stays independent: esOrderFlowJournal is never created or opened by any quest operation", async () => { assert.ok(!(await dbList()).some((n) => n.startsWith("esOrderFlowJournal")), P(await dbList())); });
  }

  if (scenario === "backup") {
    await sys.ensureDailyQuests(D);
    const beforeCompletion = await storage.exportFullBackup(); // quests pending, no events
    await sys.completeQuest(idOf("study-30"));
    await t("export includes quests (with completed state) and the quest events", async () => {
      const b = await storage.exportFullBackup(); assert.equal(b.life.quests.filter((q) => q.status === "completed").length, 1); assert.equal(b.life.systemEvents.length, 1); assert.equal(b.life.system[0].totalXp, 30);
    });
    await t("OLD backup (no System keys), REPLACE: quests, XP log and profile all survive", async () => {
      const old = { schema: 1, app: "Lfnawa Days", life: { tasks: [{ id: "x", date: D, text: "x", status: "done" }] } };
      const r = await storage.importLifeBackup(old, "replace"); assert.equal(r.ok, true);
      assert.ok((await storage.dbGetAll("quests")).length >= 3); assert.equal((await events()).length, 1); assert.equal((await profile()).totalXp, 30);
    });
    await t("STALE backup MERGED over newer progress: the quest may revert to pending, but re-completing can NEVER double-award", async () => {
      const r = await storage.importLifeBackup(JSON.parse(JSON.stringify(beforeCompletion)), "merge"); assert.equal(r.ok, true);
      const reverted = (await storage.dbGet("quests", idOf("study-30")))!; assert.equal(reverted.status, "pending", "documented: merge upserts by id");
      const xpBefore = (await profile()).totalXp;
      const c = await sys.completeQuest(idOf("study-30")); assert.equal(c.status, "completed"); assert.equal(c.award!.applied, false); assert.equal(c.award!.duplicate, true);
      assert.equal((await profile()).totalXp, Math.max(xpBefore, 30), "no additional XP"); assert.equal((await events()).filter((e) => e.sourceId === idOf("study-30")).length, 1);
      assert.equal((await storage.dbGet("quests", idOf("study-30")))!.status, "completed");
    });
    await t("MERGE of an OLDER backup never LOWERS System progress (profile keeps its higher XP; stats too)", async () => {
      await sys.completeQuest(idOf("workout")); await sys.completeQuest(idOf("morning-routine"));                         // now 30 + 30 + 20 = 80 XP
      const older = JSON.parse(JSON.stringify(await storage.exportFullBackup())); const cur = await profile();
      // craft a genuinely older profile row inside the backup (30 XP)
      older.life.system = [{ ...cur, totalXp: 30, stats: { ...cur.stats, strength: 1, health: 1 } }];
      const r = await storage.importLifeBackup(older, "merge"); assert.equal(r.ok, true);
      const after = await profile(); assert.equal(after.totalXp, 80); assert.equal(after.stats.strength, cur.stats.strength);
      assert.equal(after.totalXp, (await events()).reduce((s, e) => s + e.xp, 0), "profile XP still equals the XP log");
    });
    await t("MERGE of a NEWER backup DOES raise progress (more XP wins)", async () => {
      const cur = await profile(); const newer = { schema: 1, life: { system: [{ ...cur, totalXp: 500, stats: { ...cur.stats, focus: 9 } }] } };
      await storage.importLifeBackup(newer, "merge"); const after = await profile(); assert.equal(after.totalXp, 500); assert.equal(after.stats.focus, 9);
    });
    await t("MERGE with a MALFORMED incoming profile (no totalXp) is ignored, never overwrites progress", async () => {
      const before = P(await profile()); await storage.importLifeBackup({ schema: 1, life: { system: [{ id: "profile" }] } }, "merge"); assert.equal(P(await profile()), before);
    });
    await t("NEW backup with quests, REPLACE: quests + state are restored from the backup", async () => {
      const pending = (await sys.getQuestsForDate(D)).find((q) => q.status === "pending"); assert.ok(pending, "need a still-pending quest for this check");
      const snap = await storage.exportFullBackup(); await sys.completeQuest(pending!.id); assert.equal((await storage.dbGet("quests", pending!.id))!.status, "completed");
      await storage.importLifeBackup(JSON.parse(JSON.stringify(snap)), "replace"); assert.equal(P((await storage.exportFullBackup()).life.quests), P(snap.life.quests));
      assert.equal((await storage.dbGet("quests", pending!.id))!.status, "pending", "replace restored the backup's state");
    });
    await t("Trades DB never created by quest / backup operations", async () => { assert.ok(!(await dbList()).some((n) => n.startsWith("esOrderFlowJournal")), P(await dbList())); });
  }
  runner.done();
}
main().catch((e) => { console.error("HARNESS ERROR", e); process.exit(2); });
