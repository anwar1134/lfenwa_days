/* ============================================================
   LFENWA SYSTEM — store / service layer
   ============================================================
   THE ONLY module that reads or writes the System's stores (systemProfile,
   lifeEvents, xpLedger), and the only place XP is ever granted:

       processEvents()  →  record fact  →  evaluate rules (pure engine)
                        →  append ledger row  →  update projection
                        all in ONE transaction, idempotent by key.

   UI and integrations call this file; nothing else may write those stores.
   ============================================================ */
import { dbGet, dbTransaction, idbReq } from "@/lib/storage";
import type { HabitCategory, LifeEvent, ProcessResult, ProfileProjection, SystemProfile, SystemSnapshot, XpLedgerEntry } from "@/types/system";
import { ELIGIBLE_DAYS_BACK, PROFILE_ID, REWARD_RULES } from "../config";
import { addDays, applyLedgerEntry, createProfile, dedupeEvents, evaluateRewards, foldLedger, getLevelProgress, isEligibleDate, isProjectionStale, isValidEvent, ledgerId, normalizeProfile, toNonNegativeInt } from "../engine";
import { notifySystemChange } from "./changes";

const SYSTEM_STORES = ["systemProfile", "lifeEvents", "xpLedger"] as const;
type SysStore = (typeof SYSTEM_STORES)[number];
const STORES: SysStore[] = [...SYSTEM_STORES];

/* ---------- profile (+ self-healing projection) ---------- */

async function countLedger(): Promise<number> {
  return dbTransaction(["xpLedger"], "readonly", (t) => idbReq(t.objectStore("xpLedger").count()));
}

/**
 * The profile, with its projection guaranteed consistent with the ledger.
 * Creates the profile if none exists (race-safe) and rebuilds the cached projection
 * whenever it no longer matches the ledger (e.g. after a restore or merge).
 */
export async function loadProfile(): Promise<SystemProfile> {
  // Fast path: read-only, the overwhelmingly common case.
  const [raw, count] = await Promise.all([dbGet("systemProfile", PROFILE_ID), countLedger()]);
  if (raw) {
    const p = normalizeProfile(raw);
    if (!isProjectionStale(p.projection, count)) return p;
  }
  // Slow path: create and/or heal inside one readwrite transaction that re-checks first.
  const healed = await dbTransaction(["systemProfile", "xpLedger"], "readwrite", async (t) => {
    const profiles = t.objectStore("systemProfile");
    const ledger = t.objectStore("xpLedger");
    const existing = (await idbReq(profiles.get(PROFILE_ID))) as unknown;
    const profile = existing ? normalizeProfile(existing) : createProfile();
    const all = (await idbReq(ledger.getAll())) as XpLedgerEntry[];
    if (!existing || isProjectionStale(profile.projection, all.length)) {
      profile.projection = foldLedger(all);
      profile.updatedAt = Date.now();
      await idbReq(profiles.put(profile));
      return { profile, changed: true };
    }
    return { profile, changed: false };
  });
  if (healed.changed) notifySystemChange();
  return healed.profile;
}

/** Discard the cached projection and recompute it from the ledger (safe to call any time). */
export async function rebuildProjection(): Promise<ProfileProjection> {
  const projection = await dbTransaction(["systemProfile", "xpLedger"], "readwrite", async (t) => {
    const profiles = t.objectStore("systemProfile");
    const existing = (await idbReq(profiles.get(PROFILE_ID))) as unknown;
    const profile = existing ? normalizeProfile(existing) : createProfile();
    profile.projection = foldLedger((await idbReq(t.objectStore("xpLedger").getAll())) as XpLedgerEntry[]);
    profile.updatedAt = Date.now();
    await idbReq(profiles.put(profile));
    return profile.projection;
  });
  notifySystemChange();
  return projection;
}

/* ---------- THE XP GATE ---------- */

/**
 * Record facts and grant whatever the reward rules say they are worth.
 *
 *  - Idempotent at every level: an event id already stored is not stored again, and a
 *    (rule, event) ledger row that already exists is never created again — so processing
 *    the same event any number of times, from any trigger or tab, awards XP once.
 *  - Only events dated within the eligibility window (today / yesterday) can earn XP;
 *    older or future-dated events are recorded as facts and stay unrewarded.
 *  - Daily caps are enforced from the ledger inside the same transaction.
 *  - Nothing here can subtract: the engine has no way to express a negative reward.
 *
 * @param today the app's todayStr() — passed in so the logic stays deterministic/testable
 */
export async function processEvents(input: readonly LifeEvent[], today: string): Promise<ProcessResult> {
  const events = dedupeEvents(input.filter(isValidEvent));
  if (events.length === 0) return { recorded: 0, rewarded: [] };

  const result = await dbTransaction(STORES, "readwrite", async (t) => {
    const profiles = t.objectStore("systemProfile");
    const facts = t.objectStore("lifeEvents");
    const ledger = t.objectStore("xpLedger");

    const rawProfile = (await idbReq(profiles.get(PROFILE_ID))) as unknown;
    let profile = rawProfile ? normalizeProfile(rawProfile) : createProfile();
    let dirty = !rawProfile;

    // Never build on a stale cache: heal first if the ledger and projection disagree.
    const ledgerCount = (await idbReq(ledger.count())) as number;
    if (isProjectionStale(profile.projection, ledgerCount)) {
      profile.projection = foldLedger((await idbReq(ledger.getAll())) as XpLedgerEntry[]);
      dirty = true;
    }

    const usageByDate = new Map<string, Record<string, number>>();
    const usageFor = async (date: string) => {
      let u = usageByDate.get(date);
      if (!u) {
        u = {};
        const rows = (await idbReq(ledger.index("by_date").getAll(date))) as XpLedgerEntry[];
        for (const r of rows) u[r.ruleId] = (u[r.ruleId] ?? 0) + 1;
        usageByDate.set(date, u);
      }
      return u;
    };

    let recorded = 0;
    const rewarded: XpLedgerEntry[] = [];

    for (const event of events) {
      // 1) the fact — insert-if-absent; facts are immutable
      if (!(await idbReq(facts.get(event.eventId)))) {
        await idbReq(facts.add(event));
        recorded++;
      }
      // 2) the decision — only recent events are eligible
      if (!isEligibleDate(event.date, today, ELIGIBLE_DAYS_BACK)) continue;
      const usage = await usageFor(event.date);
      const decisions = evaluateRewards(event, REWARD_RULES, { habitLinks: profile.settings.habitLinks }, usage);
      for (const d of decisions) {
        const id = ledgerId(d.ruleId, event.eventId);
        if (await idbReq(ledger.get(id))) continue; // already granted — the idempotency guarantee
        const entry: XpLedgerEntry = {
          id,
          ruleId: d.ruleId,
          eventId: event.eventId,
          date: event.date,
          at: Date.now(),
          xp: d.xp,
          stats: d.stats,
          cause: { source: event.source, type: event.type, title: event.title },
        };
        if (event.ref) entry.ref = event.ref;
        await idbReq(ledger.add(entry));
        usage[d.ruleId] = (usage[d.ruleId] ?? 0) + 1;
        profile = { ...profile, projection: applyLedgerEntry(profile.projection, entry) };
        rewarded.push(entry);
        dirty = true;
      }
    }

    if (dirty) {
      profile.updatedAt = Date.now();
      await idbReq(profiles.put(profile));
    }
    return { recorded, rewarded } satisfies ProcessResult;
  });

  if (result.recorded > 0 || result.rewarded.length > 0) notifySystemChange();
  return result;
}

/* ---------- user settings owned by the System ---------- */

/** Explicitly link (or unlink with null) a habit to a System category. Never inferred from names. */
export async function setHabitLink(habitId: string, category: HabitCategory | null): Promise<void> {
  if (typeof habitId !== "string" || habitId === "") throw new Error("setHabitLink: habitId required");
  await dbTransaction(["systemProfile"], "readwrite", async (t) => {
    const profiles = t.objectStore("systemProfile");
    const existing = (await idbReq(profiles.get(PROFILE_ID))) as unknown;
    const profile = existing ? normalizeProfile(existing) : createProfile();
    const links = { ...profile.settings.habitLinks };
    if (category) links[habitId] = category;
    else delete links[habitId];
    profile.settings = { ...profile.settings, habitLinks: links };
    profile.updatedAt = Date.now();
    await idbReq(profiles.put(profile));
  });
  notifySystemChange();
}

/* ---------- read model for the UI ---------- */

/** Everything the System screen / Today card shows. Every number comes from real System state. */
export async function getSnapshot(today: string): Promise<SystemSnapshot> {
  const profile = await loadProfile();
  const from = addDays(today, -6);
  const rows = await dbTransaction(["xpLedger"], "readonly", (t) => idbReq(t.objectStore("xpLedger").index("by_date").getAll(IDBKeyRange.bound(from, today))) as Promise<XpLedgerEntry[]>);
  const todayXp = rows.filter((r) => r.date === today).reduce((sum, r) => sum + toNonNegativeInt(r.xp), 0);
  const recent = [...rows].sort((a, b) => b.at - a.at).slice(0, 25);

const completedQuestIds = rows
  .filter(
    (row) =>
      row.ruleId === "quest.completed" &&
      row.eventId.startsWith("quest:"),
  )
  .map((row) => row.eventId.slice("quest:".length));

return {
  totalXp: profile.projection.totalXp,
  stats: profile.projection.stats,
  progress: getLevelProgress(profile.projection.totalXp),
  todayXp,
  recent,
  habitLinks: profile.settings.habitLinks,
  completedQuestIds,
};
}
