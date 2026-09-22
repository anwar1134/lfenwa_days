/* ============================================================
   LFENWA SYSTEM — pure engine
   ============================================================
   XP -> level maths, profile creation/normalisation, and applying
   an award to a profile. Everything here is a PURE function: no
   IndexedDB, no React, no clock unless one is passed in. That keeps
   it trivially testable and lets the persistence layer
   (lib/system/store.ts) stay a thin wrapper.

   Design rules enforced here:
     - XP and stat gains are never negative (no default penalties).
     - Level is derived from total XP, never stored.
     - Corrupt / missing values degrade to safe defaults instead of
       throwing, so a bad row can never crash the app.
   ============================================================ */

import type { LevelProgress, QuestDefinition, QuestSummary, StatBlock, StatRewards, SystemProfile, SystemQuest, XpAward } from "@/types/system";
import {
  DAILY_QUEST_COUNT,
  DAILY_QUEST_DEFINITIONS,
  INITIAL_STAT_VALUE,
  LEVEL_EXTENSION,
  LEVEL_THRESHOLDS,
  MAX_DAILY_QUESTS,
  MAX_LEVEL_ITERATIONS,
  MIN_DAILY_QUESTS,
  PROFILE_ID,
  STAT_DEFS,
  STAT_KEYS,
  SYSTEM_SCHEMA_VERSION,
} from "./config";

/* ---------- number hygiene ---------- */

/** Coerce anything to a finite integer >= 0. NaN / Infinity / negatives -> 0. */
export function toNonNegativeInt(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.floor(v);
}

/** Keep only known stats with positive integer gains. */
export function sanitizeStatRewards(rewards: StatRewards | undefined | null): StatRewards {
  const out: StatRewards = {};
  if (!rewards) return out;
  for (const key of STAT_KEYS) {
    const gain = toNonNegativeInt(rewards[key]);
    if (gain > 0) out[key] = gain;
  }
  return out;
}

/** Group digits the same way everywhere ("1,240"), independent of device locale. */
export function formatXp(n: number): string {
  return toNonNegativeInt(n).toLocaleString("en-US");
}

/* ---------- levels ---------- */

// The size of the gap between the last two table levels — the seed for
// extending the curve past the table (see LEVEL_EXTENSION in config.ts).
function lastTableGap(): number {
  const t = LEVEL_THRESHOLDS;
  return t.length >= 2 ? t[t.length - 1] - t[t.length - 2] : 100;
}

/** Total XP required to REACH `level` (level 1 = 0). Never caps. */
export function xpForLevel(level: number): number {
  const target = Math.min(MAX_LEVEL_ITERATIONS, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)));
  const table = LEVEL_THRESHOLDS;
  if (target <= table.length) return table[target - 1];
  let xp = table[table.length - 1];
  let gap = lastTableGap();
  for (let l = table.length + 1; l <= target; l++) {
    gap += LEVEL_EXTENSION.stepIncrease;
    xp += gap;
  }
  return xp;
}

/** The level a given lifetime XP corresponds to. Single pass, O(level). */
export function levelFromXp(totalXp: number): number {
  const xp = toNonNegativeInt(totalXp);
  const table = LEVEL_THRESHOLDS;

  // Walk the explicit table. table[level] is the XP needed for level + 1.
  let level = 1;
  while (level < table.length && xp >= table[level]) level++;
  if (level < table.length) return level;

  // Reached the end of the table: continue along the extension curve.
  let start = table[table.length - 1];
  let gap = lastTableGap();
  for (let i = 0; i < MAX_LEVEL_ITERATIONS; i++) {
    gap += LEVEL_EXTENSION.stepIncrease;
    const next = start + gap;
    if (xp < next) break;
    start = next;
    level++;
  }
  return level;
}

export function getLevelProgress(totalXp: number): LevelProgress {
  const xp = toNonNegativeInt(totalXp);
  const level = levelFromXp(xp);
  const levelStartXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const xpSpan = Math.max(1, nextLevelXp - levelStartXp);
  const xpIntoLevel = xp - levelStartXp;
  const fraction = Math.min(1, Math.max(0, xpIntoLevel / xpSpan));
  return { level, totalXp: xp, levelStartXp, nextLevelXp, xpIntoLevel, xpSpan, xpToNext: nextLevelXp - xp, fraction };
}

/* ---------- profile ---------- */

export function initialStats(): StatBlock {
  const stats = {} as StatBlock;
  for (const key of STAT_KEYS) stats[key] = INITIAL_STAT_VALUE;
  return stats;
}

/** A brand-new profile: 0 XP, every stat at INITIAL_STAT_VALUE. */
export function createInitialProfile(now: number = Date.now()): SystemProfile {
  return {
    id: PROFILE_ID,
    schemaVersion: SYSTEM_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    totalXp: 0,
    stats: initialStats(),
  };
}

/**
 * Make any stored value safe to use as a profile: fills missing stats
 * (e.g. a stat added by a later version), repairs bad numbers, and
 * PRESERVES unknown fields so an older build never strips data written
 * by a newer one.
 */
export function normalizeProfile(raw: unknown, now: number = Date.now()): SystemProfile {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<SystemProfile> & Record<string, unknown>;
  const rawStats = (r.stats && typeof r.stats === "object" ? r.stats : {}) as Partial<Record<string, unknown>>;
  const stats = {} as StatBlock;
  for (const key of STAT_KEYS) {
    const v = rawStats[key];
    stats[key] = typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : INITIAL_STAT_VALUE;
  }
  return {
    ...r,
    id: PROFILE_ID,
    schemaVersion: typeof r.schemaVersion === "number" ? r.schemaVersion : SYSTEM_SCHEMA_VERSION,
    createdAt: typeof r.createdAt === "number" && Number.isFinite(r.createdAt) ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === "number" && Number.isFinite(r.updatedAt) ? r.updatedAt : now,
    totalXp: toNonNegativeInt(r.totalXp),
    stats,
  };
}

/** Apply an XP + stat award to a profile, returning a NEW profile. Never subtracts. */
export function applyAward(profile: SystemProfile, award: { xp: number; stats?: StatRewards }, now: number = Date.now()): SystemProfile {
  const gains = sanitizeStatRewards(award.stats);
  const stats = { ...profile.stats };
  for (const key of STAT_KEYS) stats[key] = stats[key] + (gains[key] ?? 0);
  return { ...profile, totalXp: profile.totalXp + toNonNegativeInt(award.xp), stats, updatedAt: now };
}

/** "+2 Intelligence · +1 Discipline" style text, in the fixed stat order. */
export function describeStatGains(stats: StatRewards | undefined | null): string {
  const gains = sanitizeStatRewards(stats);
  return STAT_DEFS.filter((d) => (gains[d.key] ?? 0) > 0)
    .map((d) => `${d.label} +${gains[d.key]}`)
    .join(" · ");
}

/* ============================================================
   QUESTS (Phase 2)
   ============================================================
   Everything about WHICH quests exist for a day and HOW a quest
   becomes completed lives here, as pure functions. lib/system/store.ts
   persists the results; React components never contain this logic.
   ============================================================ */

/** Quest ids for generated dailies are deterministic — that is what makes generation idempotent. */
export function dailyQuestId(date: string, definitionId: string): string {
  return `daily:${date}:${definitionId}`;
}

/** The idempotency key of a quest's reward event in the XP log. */
export function questRewardEventId(questId: string): string {
  return `quest:${questId}`;
}

/** Whole days since 1970-01-01 for a YYYY-MM-DD string. Timezone-free; throws on an invalid date. */
export function dayNumber(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid date "${date}" (expected YYYY-MM-DD)`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) throw new Error(`Invalid date "${date}"`);
  return Math.floor(ms / 86_400_000);
}

/**
 * Which definitions make up the daily set for `date`. Deterministic: all core
 * definitions, then the non-core ones taken as a rotating window whose start is
 * the day number. The result is always between MIN_DAILY_QUESTS and
 * MAX_DAILY_QUESTS (as far as the definitions allow) and keeps definition order.
 */
export function selectDailyDefinitions(
  date: string,
  definitions: readonly QuestDefinition[] = DAILY_QUEST_DEFINITIONS,
  count: number = DAILY_QUEST_COUNT
): QuestDefinition[] {
  const daily = definitions.filter((d) => d.type === "daily");
  const target = Math.min(MAX_DAILY_QUESTS, Math.max(MIN_DAILY_QUESTS, Math.floor(count)));
  const core = daily.filter((d) => d.core);
  const rotating = daily.filter((d) => !d.core);
  const chosen = new Set<QuestDefinition>(core.slice(0, target));
  const need = Math.min(target - chosen.size, rotating.length);
  if (need > 0) {
    const start = ((dayNumber(date) % rotating.length) + rotating.length) % rotating.length;
    for (let i = 0; i < need; i++) chosen.add(rotating[(start + i) % rotating.length]);
  } else {
    dayNumber(date); // still validate the date
  }
  return daily.filter((d) => chosen.has(d));
}

/** Turn a definition into a fresh, pending quest for `date` (rewards are copied, not referenced). */
export function questFromDefinition(date: string, def: QuestDefinition): SystemQuest {
  return {
    id: dailyQuestId(date, def.id),
    type: def.type,
    date,
    title: def.title,
    description: def.description,
    category: def.category,
    status: "pending",
    xpReward: toNonNegativeInt(def.xp),
    statRewards: sanitizeStatRewards(def.stats),
    completedAt: null,
    definitionId: def.id,
  };
}

/** The complete, pending daily quest set for `date`. Pure: same date, same result. */
export function buildDailyQuests(date: string, definitions: readonly QuestDefinition[] = DAILY_QUEST_DEFINITIONS, count: number = DAILY_QUEST_COUNT): SystemQuest[] {
  return selectDailyDefinitions(date, definitions, count).map((def) => questFromDefinition(date, def));
}

/** Stable display order: by definition order, unknown quests last (by title). Never mutates. */
export function sortQuests(quests: readonly SystemQuest[], definitions: readonly QuestDefinition[] = DAILY_QUEST_DEFINITIONS): SystemQuest[] {
  const rank = (q: SystemQuest) => {
    const i = definitions.findIndex((d) => d.id === q.definitionId);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...quests].sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

/** A quest can be completed unless it already is. (Missing a quest is never a state — it just stays pending.) */
export function canCompleteQuest(quest: SystemQuest): boolean {
  return quest.status !== "completed";
}

/** The completed version of a quest, as a NEW object. */
export function markQuestCompleted(quest: SystemQuest, now: number = Date.now()): SystemQuest {
  return { ...quest, status: "completed", completedAt: now };
}

/** The XP award a quest grants — the single place a quest is translated into a reward. */
export function questToAward(quest: SystemQuest): XpAward {
  return {
    eventId: questRewardEventId(quest.id),
    date: quest.date,
    source: "quest",
    sourceId: quest.id,
    label: quest.title,
    xp: quest.xpReward,
    stats: quest.statRewards,
  };
}

export function summarizeQuests(quests: readonly SystemQuest[]): QuestSummary {
  let completed = 0;
  let xpAvailable = 0;
  let xpEarned = 0;
  for (const q of quests) {
    if (q.status === "completed") {
      completed++;
      xpEarned += toNonNegativeInt(q.xpReward);
    } else {
      xpAvailable += toNonNegativeInt(q.xpReward);
    }
  }
  return { total: quests.length, completed, xpAvailable, xpEarned };
}
