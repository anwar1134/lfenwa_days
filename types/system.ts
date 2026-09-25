/* ============================================================
   LFENWA SYSTEM — shared types
   ============================================================
   The System is the progression layer underneath Lfnawa Days:

     life activity → LifeEvent (a FACT) → reward rules (a DECISION)
       → XP ledger → profile projection → level (always derived)

   This file is types only: no runtime code and no imports, so any
   layer (including types/life.ts) can import it without cycles.
   ============================================================ */

/* ---------- stats ---------- */

/** Stats are registry-driven data (lib/system/config/stats.ts), not a closed union. */
export type StatId = string;
export type StatBlock = Record<StatId, number>;
export type StatGains = Record<StatId, number>;

/* ---------- events (facts) ---------- */

export type EventScalar = string | number | boolean;

export interface LifeEvent {
  /**
   * Deterministic. It doubles as the idempotency key, so the same real-world
   * fact always has the same id no matter which trigger (live / reconcile) or
   * which tab produced it. e.g. `habit.completed:<habitId>:<date>`.
   */
  eventId: string;
  /** Which domain integration produced it: "habits" | "tasks" | "trading" | … */
  source: string;
  /** What happened: "habit.completed" | "task.completed" | "trading.reviewed" | … */
  type: string;
  /** The day (YYYY-MM-DD, the app's todayStr() convention) the fact belongs to. */
  date: string;
  /** When the System first recorded the fact (epoch ms). */
  timestamp: number;
  /** Only when the DOMAIN really knows when it happened (tasks do; habits and Trades don't). */
  occurredAt?: number;
  title: string;
  /** Evidence pointer into the owning domain — never a copy of its record. */
  ref?: { domain: string; store: string; id: string };
  /** Small, flat, factual. Never contains money amounts or P&L. */
  metadata: Record<string, EventScalar>;
}

/* ---------- reward rules (decisions) ---------- */

export interface RewardRule {
  id: string;
  /** Human sentence shown in "What earns XP". */
  label: string;
  eventType: string;
  /** Every key must equal the event's metadata / derived attribute (e.g. { category: "study" }). */
  match?: Record<string, EventScalar>;
  /** Key into XP_TIERS (lib/system/config/xp.ts). Rules never carry raw XP numbers. */
  tier: string;
  stats: StatGains;
  /** Max ledger entries this rule may create per event date. 0 disables the rule. */
  dailyCap: number;
}

export interface RewardDecision {
  ruleId: string;
  xp: number;
  stats: StatGains;
}

/** Context the pure reward engine needs (all of it is System-owned settings). */
export interface RewardContext {
  habitLinks: Record<string, HabitCategory>;
}

/* ---------- XP ledger (append-only) ---------- */

export interface XpLedgerEntry {
  /** `${ruleId}::${eventId}` — makes double-awarding structurally impossible. */
  id: string;
  ruleId: string;
  eventId: string;
  /** The event's date (not the grant time). Indexed as by_date. */
  date: string;
  /** When it was granted (epoch ms). */
  at: number;
  xp: number;
  stats: StatGains;
  cause: { source: string; type: string; title: string };
  ref?: LifeEvent["ref"];
}

/* ---------- profile (one row: id "profile") ---------- */

/** A habit is linked to a System category by the USER, explicitly. Never inferred from its name. */
export type HabitCategory = "study" | "workout" | "general";

export interface SystemSettings {
  habitLinks: Record<string, HabitCategory>;
}

/** A cache of the ledger. The ledger is the truth; this can always be rebuilt. */
export interface ProfileProjection {
  totalXp: number;
  stats: StatBlock;
  /** Number of ledger rows this projection was computed from — used to detect a stale cache. */
  ledgerCount: number;
}

export interface SystemProfile {
  id: "profile";
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
  projection: ProfileProjection;
  settings: SystemSettings;
}

/* ---------- derived views ---------- */

export interface LevelProgress {
  level: number;
  totalXp: number;
  levelStartXp: number;
  nextLevelXp: number;
  xpIntoLevel: number;
  xpSpan: number;
  xpToNext: number;
  fraction: number;
}

export interface SystemSnapshot {
  totalXp: number;
  stats: StatBlock;
  progress: LevelProgress;
  todayXp: number;
  /** Newest first. */
  recent: XpLedgerEntry[];
  habitLinks: Record<string, HabitCategory>;
  completedQuestIds: string[];
}


export interface ProcessResult {
  /** Events newly stored as facts. */
  recorded: number;
  /** Ledger entries created by this call (empty when everything was already processed). */
  rewarded: XpLedgerEntry[];
}

/* ---------- Trading boundary ---------- */

/**
 * The ONLY shape the System ever receives from Trading. Booleans and counts —
 * by construction there is no profit / loss / price / size field anywhere here.
 */
export interface TradingDaySummary {
  date: string;
  prepared: boolean;
  checkedIn: boolean;
  reviewed: boolean;
  noTradeCount: number;
  tradeCount: number;
}
