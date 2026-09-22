/* ============================================================
   LFENWA SYSTEM — shared TypeScript types
   ============================================================
   The System is a progression layer INSIDE Lfnawa Days:

     Action -> Quest -> Completion -> XP + Stats -> Level

   These types describe what is persisted in lfnawaDaysDB (stores
   "system", "quests", "systemEvents" — see lib/storage.ts) and what
   the pure engine in lib/system/engine.ts operates on.

   This file is types only: no runtime code, no imports, so it can be
   imported from anywhere (including types/life.ts) without cycles.
   ============================================================ */

/* ---------- stats ---------- */

export type StatKey = "strength" | "intelligence" | "focus" | "discipline" | "health" | "finance";

/** A full set of the six core stats. */
export type StatBlock = Record<StatKey, number>;

/** A partial stat gain, e.g. { intelligence: 2, discipline: 1 }. */
export type StatRewards = Partial<Record<StatKey, number>>;

/* ---------- profile (one row: id "profile") ---------- */

export interface SystemSettings {
  // Reserved for a possible future opt-in "Enable Quest Penalties".
  // Nothing reads or writes this yet — the default (and only) behaviour
  // is: no negative XP, ever.
  questPenalties?: boolean;
}

export interface SystemProfile {
  id: "profile";
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
  /** Lifetime XP. Level is always DERIVED from this, never stored. */
  totalXp: number;
  stats: StatBlock;
  settings?: SystemSettings;
}

/* ---------- quests (store "quests") ---------- */

/**
 * What kind of quest this is. Phase 2 only ever creates "daily"; the other
 * values exist so weekly / one-time / boss quests can be added later without
 * reshaping stored data or this type.
 */
export type QuestType = "daily" | "weekly" | "one-time" | "boss";

/**
 * "pending" and "completed" are the only states Phase 2 uses. "failed" is
 * reserved for a possible future opt-in penalty mode and is never set today:
 * an unfinished quest simply stays pending.
 */
export type QuestStatus = "pending" | "completed" | "failed";

export interface SystemQuest {
  /**
   * Deterministic for generated quests (`daily:<date>:<definitionId>`), which is
   * what makes generation idempotent. Also the basis of the reward's
   * idempotency key (`quest:<id>`).
   */
  id: string;
  type: QuestType;
  /**
   * YYYY-MM-DD. Daily: the day the quest belongs to. (Future: weekly = the
   * week's start; one-time / boss = created-on.) Indexed as by_date.
   */
  date: string;
  title: string;
  description?: string;
  category?: string;
  status: QuestStatus;
  /** Copied from the definition at generation time, so later balance changes never rewrite history. */
  xpReward: number;
  statRewards: StatRewards;
  completedAt?: number | null;
  /** Which config definition produced this quest (absent for hand-made quests). */
  definitionId?: string;
}

/** A predefined quest template (lib/system/config.ts). */
export interface QuestDefinition {
  /** Stable id, e.g. "study-30". Never reuse or rename once shipped. */
  id: string;
  type: QuestType;
  title: string;
  description: string;
  category: string;
  xp: number;
  stats: StatRewards;
  /** Core definitions are always part of a day's set; the rest rotate in. */
  core?: boolean;
}

export interface QuestSummary {
  total: number;
  completed: number;
  /** XP still on the table from pending quests. */
  xpAvailable: number;
  /** XP already earned from completed quests. */
  xpEarned: number;
}

export type CompleteQuestStatus = "completed" | "already-completed" | "not-found";

export interface CompleteQuestResult {
  status: CompleteQuestStatus;
  /** The quest after the call (null if not found). */
  quest: SystemQuest | null;
  /** The reward outcome. null unless this call completed the quest. */
  award: AwardResult | null;
}

/* ---------- event log (store "systemEvents") ---------- */

// Phase 2 only ever writes "quest". The rest name future sources so the log
// never needs reshaping when they arrive.
export type SystemEventSource = "quest" | "habit" | "task" | "learning" | "money" | "goal" | "trading-day" | "streak" | "achievement" | "manual" | "system";

export interface SystemEvent {
  /**
   * Doubles as the idempotency key: an award with an id that already
   * exists is never applied twice (e.g. `habit:<habitId>:<date>`).
   */
  id: string;
  /** YYYY-MM-DD the award belongs to (indexed as by_date). */
  date: string;
  /** Epoch ms when it was applied. */
  at: number;
  source: SystemEventSource;
  sourceId?: string;
  label: string;
  xp: number;
  stats: StatRewards;
}

/* ---------- engine inputs / outputs ---------- */

export interface XpAward {
  /** Idempotency key (see SystemEvent.id). */
  eventId: string;
  date: string;
  source: SystemEventSource;
  sourceId?: string;
  label: string;
  xp: number;
  stats?: StatRewards;
}

export interface LevelProgress {
  level: number;
  totalXp: number;
  /** Total XP at which the current level began. */
  levelStartXp: number;
  /** Total XP at which the next level is reached. */
  nextLevelXp: number;
  /** XP earned inside the current level. */
  xpIntoLevel: number;
  /** Size of the current level (nextLevelXp - levelStartXp). */
  xpSpan: number;
  /** XP still needed for the next level. */
  xpToNext: number;
  /** 0..1 progress through the current level. */
  fraction: number;
}

export interface AwardResult {
  /** True only if this call actually changed the profile. */
  applied: boolean;
  /** True if the eventId had already been applied (no change made). */
  duplicate: boolean;
  profile: SystemProfile;
  levelBefore: number;
  levelAfter: number;
  leveledUp: boolean;
}
