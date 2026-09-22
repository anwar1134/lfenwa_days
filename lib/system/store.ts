/* ============================================================
   LFENWA SYSTEM — persistence
   ============================================================
   Thin layer over lib/storage.ts (lfnawaDaysDB). It never opens a
   database itself and never touches the Trades database — it only
   uses the existing storage helpers plus the multi-store transaction
   helper added to storage.ts for the System.

   THIS FILE IS THE SYSTEM'S SERVICE BOUNDARY: UI code (System screen,
   Today) calls the functions exported here and nothing lower-level.
   Business rules live in engine.ts; this file only reads/writes.

   Guarantees:
     - loadOrCreateProfile(): creates a profile only if NONE exists
       (race-safe: two callers at once still produce one profile) and
       never overwrites an existing one.
     - awardXp(): the XP event and the profile update are written in
       ONE transaction (both or neither) and an eventId that was
       already applied is never applied again — so double-taps,
       re-renders, and toggling a habit off/on cannot farm XP.
   ============================================================ */

import { dbGet, dbGetAll, dbGetByDate, dbTransaction, idbReq } from "@/lib/storage";
import type { AwardResult, CompleteQuestResult, SystemEvent, SystemProfile, SystemQuest, XpAward } from "@/types/system";
import { PROFILE_ID } from "./config";
import {
  applyAward,
  buildDailyQuests,
  canCompleteQuest,
  createInitialProfile,
  levelFromXp,
  markQuestCompleted,
  normalizeProfile,
  questToAward,
  sanitizeStatRewards,
  sortQuests,
  toNonNegativeInt,
} from "./engine";

/**
 * Read the System profile, creating a fresh one (0 XP, all stats at 1) only
 * when none exists yet. Existing installs therefore initialise exactly once,
 * and existing user data is never touched.
 */
export async function loadOrCreateProfile(): Promise<SystemProfile> {
  // Fast path: a plain read (no write lock) for the overwhelmingly common case.
  const existing = await dbGet("system", PROFILE_ID);
  if (existing) return normalizeProfile(existing);

  // Slow path: create inside one readwrite transaction that re-checks first,
  // so concurrent callers (e.g. React dev double-effects) can't both create.
  return dbTransaction(["system"], "readwrite", async (t) => {
    const store = t.objectStore("system");
    const again = (await idbReq(store.get(PROFILE_ID))) as unknown;
    if (again) return normalizeProfile(again);
    const fresh = createInitialProfile();
    await idbReq(store.put(fresh));
    return fresh;
  });
}

/**
 * THE one place XP and stat gains are applied. It runs INSIDE a transaction the
 * caller opened (which must include "system" and "systemEvents", readwrite), so
 * callers that need more than an award — e.g. completing a quest — can make
 * their own writes atomic with it. Do not add a second way to grant XP.
 *
 * `award.eventId` is the idempotency key. If an event with that id already
 * exists, nothing changes and `{ applied: false, duplicate: true }` is returned.
 * Negative values are impossible by construction (see engine.ts).
 */
async function applyAwardInTransaction(t: IDBTransaction, award: XpAward): Promise<AwardResult> {
  if (typeof award.eventId !== "string" || award.eventId.trim() === "") {
    throw new Error("awardXp: eventId is required (it is the idempotency key)");
  }
  const xp = toNonNegativeInt(award.xp);
  const stats = sanitizeStatRewards(award.stats);
  const hasStats = Object.keys(stats).length > 0;

  const sys = t.objectStore("system");
  const log = t.objectStore("systemEvents");

  const [rawProfile, existingEvent] = await Promise.all([idbReq(sys.get(PROFILE_ID)), idbReq(log.get(award.eventId))]);
  const profile = rawProfile ? normalizeProfile(rawProfile) : createInitialProfile();
  const levelBefore = levelFromXp(profile.totalXp);

  // Nothing to apply: already-applied event, or an award that grants nothing.
  if (existingEvent || (xp === 0 && !hasStats)) {
    return { applied: false, duplicate: Boolean(existingEvent), profile, levelBefore, levelAfter: levelBefore, leveledUp: false } satisfies AwardResult;
  }

  const now = Date.now();
  const next = applyAward(profile, { xp, stats }, now);
  const event: SystemEvent = {
    id: award.eventId,
    date: award.date,
    at: now,
    source: award.source,
    label: award.label,
    xp,
    stats,
  };
  if (award.sourceId) event.sourceId = award.sourceId;

  await Promise.all([idbReq(log.put(event)), idbReq(sys.put(next))]);

  const levelAfter = levelFromXp(next.totalXp);
  return { applied: true, duplicate: false, profile: next, levelBefore, levelAfter, leveledUp: levelAfter > levelBefore } satisfies AwardResult;
}

/**
 * Apply an XP + stat award atomically and idempotently (event + profile in one
 * transaction). Behaviour is unchanged from Phase 1.
 */
export async function awardXp(award: XpAward): Promise<AwardResult> {
  if (typeof award.eventId !== "string" || award.eventId.trim() === "") {
    throw new Error("awardXp: eventId is required (it is the idempotency key)");
  }
  return dbTransaction(["system", "systemEvents"], "readwrite", (t) => applyAwardInTransaction(t, award));
}

/* ============================================================
   DAILY QUESTS (Phase 2)
   ============================================================ */

/** All quests stored for a date (any type), unsorted. */
export async function getQuestsForDate(date: string): Promise<SystemQuest[]> {
  return dbGetByDate("quests", date);
}

/**
 * Make sure the daily quests for `date` exist, and return them in display order.
 *
 * Idempotent and reload-safe:
 *   - deterministic ids + "only if this day has no daily quests yet", checked
 *     inside the same readwrite transaction that inserts them, so two callers at
 *     once (Today + System, React dev double-effects, two tabs) cannot both insert;
 *   - it only ever ADDS with store.add — it can never overwrite an existing quest,
 *     so a completed quest is never reset to pending by regeneration.
 * A day is generated once. Later changes to the definitions affect FUTURE days only.
 */
export async function ensureDailyQuests(date: string): Promise<SystemQuest[]> {
  const dailyOnly = (qs: SystemQuest[]) => qs.filter((q) => q.type === "daily");

  // Fast path: a plain read when the day already exists (nearly every call).
  const existing = dailyOnly(await getQuestsForDate(date));
  if (existing.length > 0) return sortQuests(existing);

  return dbTransaction(["quests"], "readwrite", async (t) => {
    const store = t.objectStore("quests");
    const again = dailyOnly((await idbReq(store.index("by_date").getAll(date))) as SystemQuest[]);
    if (again.length > 0) return sortQuests(again);
    const fresh = buildDailyQuests(date);
    await Promise.all(fresh.map((q) => idbReq(store.add(q))));
    return sortQuests(fresh);
  });
}

/**
 * Complete a quest. The ONLY way a quest becomes completed.
 *
 * One transaction covers the quest, the profile and the XP log, so "quest is
 * completed", "XP/stats granted" and "activity recorded" all happen together or
 * not at all. The reward goes through applyAwardInTransaction — the same code as
 * awardXp — with the deterministic event id `quest:<questId>`, so even if the
 * quest row and the log ever disagree (e.g. after a backup merge) the reward can
 * never be granted twice.
 *
 *   first call            -> { status: "completed", award }  (XP + stats granted)
 *   any later call        -> { status: "already-completed", award: null }  (nothing changes)
 *   unknown quest id      -> { status: "not-found" }
 */
export async function completeQuest(questId: string): Promise<CompleteQuestResult> {
  return dbTransaction(["quests", "system", "systemEvents"], "readwrite", async (t) => {
    const quests = t.objectStore("quests");
    const raw = (await idbReq(quests.get(questId))) as SystemQuest | undefined;
    if (!raw) return { status: "not-found", quest: null, award: null } satisfies CompleteQuestResult;
    if (!canCompleteQuest(raw)) return { status: "already-completed", quest: raw, award: null } satisfies CompleteQuestResult;

    const award = await applyAwardInTransaction(t, questToAward(raw));
    const done = markQuestCompleted(raw, Date.now());
    await idbReq(quests.put(done));
    return { status: "completed", quest: done, award } satisfies CompleteQuestResult;
  });
}

/** Most recent XP events, newest first. */
export async function getRecentEvents(limit = 8): Promise<SystemEvent[]> {
  const all = await dbGetAll("systemEvents");
  return all.sort((a, b) => b.at - a.at).slice(0, Math.max(0, limit));
}

/** All XP events recorded for a given YYYY-MM-DD, oldest first. */
export async function getEventsForDate(date: string): Promise<SystemEvent[]> {
  const events = await dbGetByDate("systemEvents", date);
  return events.sort((a, b) => a.at - b.at);
}

/** Total XP earned on a given day. */
export async function getXpForDate(date: string): Promise<number> {
  const events = await getEventsForDate(date);
  return events.reduce((sum, e) => sum + toNonNegativeInt(e.xp), 0);
}
