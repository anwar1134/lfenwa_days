import { processEvents } from "@/lib/system/store";
import { questCompletedEvent } from "@/lib/system/integrations/quests";
import { markQuestCompleted, type DailyQuest } from "./engine";

export async function completeDailyQuest(
  quest: DailyQuest,
  now: number,
): Promise<boolean> {
  if (quest.status === "completed") return false;

  const completed = markQuestCompleted(quest, now);
  const event = questCompletedEvent(completed, now);

  if (!event) return false;

  await processEvents([event], quest.date);
  return true;
}
