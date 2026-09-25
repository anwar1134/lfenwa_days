import { xpForTier } from "@/lib/system/config/xp";
import type { DailyQuestDefinition } from "./definitions";

export const MIN_DAILY_QUESTS = 3;
export const MAX_DAILY_QUESTS = 5;
export const DEFAULT_DAILY_QUESTS = 4;

export interface DailyQuest {
  id: string;
  date: string;
  definitionId: string;
  title: string;
  description: string;
  category: DailyQuestDefinition["category"];
  tier: DailyQuestDefinition["tier"];
  xp: number;
  stats: Record<string, number>;
  core: boolean;
  status: "pending" | "completed";
  completedAt: number | null;
}

function assertDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date: ${date}`);
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`Invalid date: ${date}`);
  }
}

export function dailyQuestId(date: string, definitionId: string): string {
  assertDate(date);

  if (!definitionId.trim()) {
    throw new Error("definitionId must not be empty");
  }

  return `daily:${date}:${definitionId}`;
}

function dayNumber(date: string): number {
  assertDate(date);

  const [year, month, day] = date.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function selectDailyDefinitions(
  date: string,
  definitions: readonly DailyQuestDefinition[],
  count = DEFAULT_DAILY_QUESTS,
): readonly DailyQuestDefinition[] {
  assertDate(date);

  const target = Math.max(
    MIN_DAILY_QUESTS,
    Math.min(MAX_DAILY_QUESTS, Math.trunc(count)),
  );

  const core = definitions.filter((definition) => definition.core);
  const rotating = definitions.filter((definition) => !definition.core);

  if (core.length > target) {
    return core.slice(0, target);
  }

  const needed = target - core.length;

  if (needed <= 0 || rotating.length === 0) {
    return core.slice();
  }

  const start = dayNumber(date) % rotating.length;
  const selected: DailyQuestDefinition[] = [];

  for (let i = 0; i < Math.min(needed, rotating.length); i += 1) {
    selected.push(rotating[(start + i) % rotating.length]);
  }

  return [...core, ...selected];
}

export function questFromDefinition(
  date: string,
  definition: DailyQuestDefinition,
): DailyQuest {
  const stats = Object.fromEntries(
    Object.entries(definition.stats).map(([key, value]) => [key, Math.max(0, Math.trunc(value))]),
  );

  return {
    id: dailyQuestId(date, definition.id),
    date,
    definitionId: definition.id,
    title: definition.title,
    description: definition.description,
    category: definition.category,
    tier: definition.tier,
    xp: Math.max(0, xpForTier(definition.tier)),
    stats,
    core: definition.core,
    status: "pending",
    completedAt: null,
  };
}

export function buildDailyQuests(
  date: string,
  definitions: readonly DailyQuestDefinition[],
  count = DEFAULT_DAILY_QUESTS,
): readonly DailyQuest[] {
  return selectDailyDefinitions(date, definitions, count).map((definition) =>
    questFromDefinition(date, definition),
  );
}

export function markQuestCompleted(
  quest: DailyQuest,
  completedAt: number,
): DailyQuest {
  if (quest.status === "completed") {
    return quest;
  }

  return {
    ...quest,
    status: "completed",
    completedAt,
  };
}
