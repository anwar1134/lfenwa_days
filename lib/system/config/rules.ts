/* Reward rules and eligibility — configuration, not code.

   A DOMAIN never awards XP. Domains produce facts (LifeEvents); these rules —
   and only these — decide what a fact is worth. Each rule maps an event type
   to an XP tier, stat gains and a daily cap. */
import type { HabitCategory, RewardRule } from "@/types/system";

export const SYSTEM_SCHEMA_VERSION = 1;
export const PROFILE_ID = "profile" as const;

// An event earns XP only if its date is today or up to this many days back.
// Older events are still recorded as facts, but stay unrewarded — so existing
// history, edited old records and restored backups can never mint XP.
export const ELIGIBLE_DAYS_BACK = 1;

// Reconcile scans the same window (today + yesterday), no further.
export const RECONCILE_LOOKBACK_DAYS = ELIGIBLE_DAYS_BACK;

// Tasks are dated for the day they were PLANNED; the reconcile scan looks this many days either
// side of today for tasks completed recently (the event itself belongs to the completion day).
export const TASK_SCAN_BAND_DAYS = 30;

// Minimum gap between automatic reconcile passes (focus/visibility spam guard).
export const RECONCILE_MIN_INTERVAL_MS = 15_000;

export const HABIT_CATEGORIES: readonly { id: HabitCategory; label: string; hint: string }[] = [
  { id: "study", label: "Study", hint: "Rewards Intelligence" },
  { id: "workout", label: "Workout", hint: "Rewards Strength and Health" },
  { id: "general", label: "General", hint: "Rewards Discipline" },
];

export const REWARD_RULES: readonly RewardRule[] = [
  // ---- tasks (My Day) ----
  { id: "task.done", label: "Complete a task", eventType: "task.completed", tier: "smallTask", stats: { discipline: 1 }, dailyCap: 5 },

  // ---- habits: ONLY when you have explicitly linked the habit ----
  { id: "habit.study", label: "Complete a habit linked to Study", eventType: "habit.completed", match: { category: "study" }, tier: "simpleHabit", stats: { intelligence: 1, discipline: 1 }, dailyCap: 3 },
  { id: "habit.workout", label: "Complete a habit linked to Workout", eventType: "habit.completed", match: { category: "workout" }, tier: "simpleHabit", stats: { strength: 1, health: 1 }, dailyCap: 2 },
  { id: "habit.general", label: "Complete a habit linked to General", eventType: "habit.completed", match: { category: "general" }, tier: "simpleHabit", stats: { discipline: 1 }, dailyCap: 5 },

  // ---- trading PROCESS (never profit) — provisional definitions, verified in Phase 2 ----
  { id: "trading.prepared", label: "Complete your trading preparation", eventType: "trading.prepared", tier: "mediumTask", stats: { discipline: 1 }, dailyCap: 1 },
  { id: "trading.noTrade", label: "Log a no-trade decision and take no trades", eventType: "trading.noTrade", tier: "mediumTask", stats: { discipline: 2 }, dailyCap: 1 },
  { id: "trading.reviewed", label: "Complete your trading review", eventType: "trading.reviewed", tier: "mediumTask", stats: { intelligence: 1, discipline: 1 }, dailyCap: 1 },
];
