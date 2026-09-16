/* ============================================================
   LFNAWA DAYS — shared TypeScript types
   ============================================================
   These mirror, field-for-field, the shapes documented in the
   original app/src/life/storage.js comments. Nothing about the
   data model changed in the Next.js migration — this file exists
   purely to give the existing shapes real types.
   ============================================================ */

export interface DayMetrics {
  mood?: number | null;
  energy?: number | null;
  focus?: number | null;
  motivation?: number | null;
  stress?: number | null;
  productivity?: number | null;
}

export interface DayReview {
  best?: string;
  worst?: string;
  learned?: string;
  change?: string;
  tomorrowPriority?: string;
  rating?: number | null;
}

export interface DayRecord {
  date: string;
  wakeTime?: string;
  sleepTime?: string;
  sleepHours?: number | "";
  location?: string;
  note?: string;
  metrics?: DayMetrics;
  review?: DayReview;
}

export interface TimelineEntry {
  id: string;
  date: string;
  time: string;
  activity: string;
  category: string;
  note?: string;
}

export interface Achievement {
  id: string;
  date: string;
  text: string;
}

export type TaskStatus = "pending" | "done" | "postponed";

export interface TaskEntry {
  id: string;
  date: string;
  text: string;
  status: TaskStatus;
  completedAt?: number | null;
}

export interface LearningEntry {
  id: string;
  date: string;
  whatLearned: string;
  whatUnderstood?: string;
  whatConfused?: string;
  importantIdea?: string;
  resource?: string;
}

export type MoneyType = "income" | "expense";

export interface MoneyEntry {
  id: string;
  date: string;
  type: MoneyType;
  amount: number;
  currency: string;
  category: string;
  note?: string;
}

export interface Habit {
  id: string;
  name: string;
  emoji?: string;
  color?: string;
  createdAt: number;
  archived?: boolean;
}

export interface HabitEntry {
  id: string; // `${habitId}:${date}`
  habitId: string;
  date: string;
  done: boolean;
}

export interface Milestone {
  id: string;
  text: string;
  done: boolean;
}

export type GoalStatus = "active" | "paused" | "done";

export interface Goal {
  id: string;
  title: string;
  description?: string;
  category: string;
  startDate?: string;
  targetDate?: string;
  progress: number;
  status: GoalStatus;
  milestones: Milestone[];
  notes?: string;
}

export type MemoryType = "photo" | "video" | "voice" | "file" | "text";

export interface Memory {
  id: string;
  date: string;
  type: MemoryType;
  text?: string;
  attachmentId?: string | null;
  createdAt: number;
}

export interface Attachment {
  id: string;
  mime: string;
  dataUrl: string;
  filename?: string;
}

export interface MindEntry {
  id: string;
  date: string;
  time: string;
  mood?: number | null;
  energy?: number | null;
  stress?: number | null;
  focus?: number | null;
  thought?: string;
}

export interface AppSettings {
  id: "app";
  defaultCurrency?: string;
}

/* ---------- object store registry ---------- */

export type StoreName =
  | "days"
  | "timeline"
  | "achievements"
  | "tasks"
  | "learning"
  | "money"
  | "habits"
  | "habitEntries"
  | "goals"
  | "memories"
  | "attachments"
  | "mindEntries"
  | "settings";

export interface StoreValueMap {
  days: DayRecord;
  timeline: TimelineEntry;
  achievements: Achievement;
  tasks: TaskEntry;
  learning: LearningEntry;
  money: MoneyEntry;
  habits: Habit;
  habitEntries: HabitEntry;
  goals: Goal;
  memories: Memory;
  attachments: Attachment;
  mindEntries: MindEntry;
  settings: AppSettings;
}

/* ============================================================
   LFENWA TRADES (esOrderFlowJournal) — read-only boundary types.
   This app never owns, rebuilds, or fully models Lfenwa Trades'
   schema (see lib/storage.ts). These are deliberately minimal —
   only the fields this app's read-only bridge actually touches
   (trade counts, search, backup folding) are named; everything
   else about a trade/no-trade/playbook record is intentionally
   left as unknown, since this app must never assume more about
   that schema than it needs to.
   ============================================================ */

export interface TradeLike {
  date: string;
  notes?: string;
  setupTags?: string;
  mistakeTags?: string;
  [key: string]: unknown;
}

export interface NoTradeLike {
  date: string;
  reason?: string;
  [key: string]: unknown;
}

export interface PlaybookEntryLike {
  name?: string;
  description?: string;
  [key: string]: unknown;
}

/* ---------- navigation ---------- */

export type TabKey =
  | "today"
  | "myday"
  | "calendar"
  | "memories"
  | "goals"
  | "learning"
  | "money"
  | "habits"
  | "mind"
  | "trades"
  | "insights"
  | "settings";

/* ---------- backup / restore ---------- */

export interface LifeBackupPayload {
  schema: number;
  app: "Lfnawa Days";
  exportedAt: string;
  life: { [K in StoreName]: StoreValueMap[K][] };
  trades: {
    trades: TradeLike[];
    noTrades: NoTradeLike[];
    days: Record<string, unknown>;
    playbook: PlaybookEntryLike[];
    settings: Record<string, unknown>;
  };
}

export interface ImportResult {
  ok: boolean;
  counts?: Partial<Record<StoreName, number>>;
  error?: string;
}
