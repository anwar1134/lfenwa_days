/* ============================================================
   LFENWA SYSTEM — configuration (all tunable numbers live here)
   ============================================================
   Components and the engine never hard-code XP amounts, level
   thresholds, or stat lists. Change the game's balance here.
   ============================================================ */

import type { QuestDefinition, StatKey } from "@/types/system";

export const SYSTEM_SCHEMA_VERSION = 1;
export const PROFILE_ID = "profile" as const;

/* ---------- stats ---------- */

export interface StatDef {
  key: StatKey;
  label: string;
  /** One-line meaning, shown as a hint. */
  hint: string;
}

// Display order of the six core stats.
export const STAT_DEFS: readonly StatDef[] = [
  { key: "strength", label: "Strength", hint: "Training and physical effort" },
  { key: "intelligence", label: "Intelligence", hint: "Study and learning" },
  { key: "focus", label: "Focus", hint: "Deep, undistracted work" },
  { key: "discipline", label: "Discipline", hint: "Showing up consistently" },
  { key: "health", label: "Health", hint: "Body and recovery" },
  { key: "finance", label: "Finance", hint: "Tracking and saving money" },
];

export const STAT_KEYS: readonly StatKey[] = STAT_DEFS.map((s) => s.key);

// New profiles start every stat at 1 (never overwrites existing data —
// a profile is only ever created when none exists).
export const INITIAL_STAT_VALUE = 1;

/* ---------- XP values ---------- */

export interface XpTier {
  label: string;
  xp: number;
}

export const XP_TIERS = {
  smallTask: { label: "Small task", xp: 10 },
  simpleHabit: { label: "Simple habit", xp: 15 },
  mediumTask: { label: "Medium task", xp: 25 },
  session30: { label: "Training / study, 30 min", xp: 30 },
  session60: { label: "Training / study, 1 hour", xp: 50 },
  hardTask: { label: "Hard task", xp: 75 },
  majorQuest: { label: "Major quest", xp: 150 },
  bossQuest: { label: "Boss quest", xp: 300 },
} as const satisfies Record<string, XpTier>;

export type XpTierKey = keyof typeof XP_TIERS;

export function xpForTier(tier: XpTierKey): number {
  return XP_TIERS[tier].xp;
}

/* ---------- levels ---------- */

// Total XP required to REACH each level. Index 0 is level 1.
//   Level 1 -> 0, Level 2 -> 100, Level 3 -> 250, ... Level 10 -> 2700
export const LEVEL_THRESHOLDS: readonly number[] = [0, 100, 250, 450, 700, 1000, 1350, 1750, 2200, 2700];

// Beyond the table above the game never caps: each further level costs
// `stepIncrease` more XP than the level before it. This is the same rule
// the table already follows (gaps of 100, 150, 200 ... 500), so the curve
// continues smoothly: L10->L11 costs 550, L11->L12 costs 600, and so on.
export const LEVEL_EXTENSION = {
  stepIncrease: 50,
} as const;

// Safety valve for corrupted/absurd XP values so level maths can never
// spin for long. ~1,000,000 levels is far beyond any real use.
export const MAX_LEVEL_ITERATIONS = 1_000_000;

/* ---------- daily quests (Phase 2) ---------- */

// A day's set is: every `core` definition, topped up to DAILY_QUEST_COUNT from
// the non-core ones by a fixed, date-driven rotation (see selectDailyDefinitions
// in engine.ts). Same date in, same set out — no randomness, no adaptation yet
// (that is a later phase). Rewards here are the ONLY place quest XP/stat numbers
// are written; they are copied onto each quest when it is generated.
export const MIN_DAILY_QUESTS = 3;
export const MAX_DAILY_QUESTS = 5;
export const DAILY_QUEST_COUNT = 4;

export const DAILY_QUEST_DEFINITIONS: readonly QuestDefinition[] = [
  {
    id: "morning-routine",
    type: "daily",
    title: "Morning routine",
    description: "Start the day on purpose, before the phone and the noise.",
    category: "Routine",
    xp: 20,
    stats: { discipline: 2 },
    core: true,
  },
  {
    id: "study-30",
    type: "daily",
    title: "Study 30 minutes",
    description: "One focused study block. TEMI, a course, or a book.",
    category: "Learning",
    xp: XP_TIERS.session30.xp,
    stats: { intelligence: 2, discipline: 1 },
    core: true,
  },
  {
    id: "workout",
    type: "daily",
    title: "Workout",
    description: "Train for real, even if it is short.",
    category: "Fitness",
    xp: XP_TIERS.session30.xp,
    stats: { strength: 2, health: 1 },
    core: true,
  },
  {
    id: "focus-30",
    type: "daily",
    title: "Focus session",
    description: "30 minutes on one thing, with nothing else open.",
    category: "Work",
    xp: XP_TIERS.session30.xp,
    stats: { focus: 2, discipline: 1 },
  },
  {
    id: "track-spending",
    type: "daily",
    title: "Track spending",
    description: "Log today's spending in Money.",
    category: "Money",
    xp: XP_TIERS.simpleHabit.xp,
    stats: { finance: 1 },
  },
  {
    id: "learn-something",
    type: "daily",
    title: "Learn something new",
    description: "One new idea, written down in your own words.",
    category: "Learning",
    xp: 20,
    stats: { intelligence: 1 },
  },
];
