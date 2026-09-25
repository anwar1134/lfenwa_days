import type { LifeEvent } from "@/types/system";
import type { DailyQuest } from "@/lib/system/quests";
import { isValidDate } from "../engine";
import type { Integration } from "./types";

export function questCompletedEvent(
  quest: DailyQuest | null | undefined,
  now: number,
): LifeEvent | null {
  if (!quest || quest.status !== "completed") return null;
  if (typeof quest.id !== "string" || quest.id === "") return null;
  if (!isValidDate(quest.date)) return null;
  if (!Number.isFinite(now) || now <= 0) return null;

  return {
    eventId: `quest:${quest.id}`,
    source: "quests",
    type: "quest.completed",
    date: quest.date,
    timestamp: now,
    occurredAt: quest.completedAt ?? now,
    title: quest.title.trim().slice(0, 120) || "Daily quest",
    ref: {
      domain: "system",
      store: "dailyQuests",
      id: quest.id,
    },
    metadata: {
      questId: quest.id,
      definitionId: quest.definitionId,
      tier: quest.tier,
      stats: JSON.stringify(quest.stats),
    },
  };
}

export const questsIntegration: Integration = {
  id: "quests",
  stores: [],

  async onWrite() {
    return [];
  },

  async reconcile() {
    return [];
  },
};
