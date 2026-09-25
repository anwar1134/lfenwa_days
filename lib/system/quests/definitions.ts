import type { StatGains } from "@/types/system";
import type { XpTierKey } from "@/lib/system/config/xp";

export interface DailyQuestDefinition {
  id: string;
  title: string;
  description: string;
  category: "routine" | "study" | "workout" | "focus" | "finance" | "learning";
  tier: XpTierKey;
  stats: StatGains;
  core: boolean;
}

export const DAILY_QUEST_DEFINITIONS: readonly DailyQuestDefinition[] = [
  {
    id: "morning-routine",
    title: "Morning routine",
    description: "Complete your morning routine.",
    category: "routine",
    tier: "shortQuest",
    stats: { discipline: 2 },
    core: true,
  },
  {
    id: "study-30",
    title: "Study for 30 minutes",
    description: "Complete 30 minutes of focused study.",
    category: "study",
    tier: "session30",
    stats: { intelligence: 2, discipline: 1 },
    core: true,
  },
  {
    id: "workout",
    title: "Workout",
    description: "Complete a workout session.",
    category: "workout",
    tier: "session30",
    stats: { strength: 2, health: 1 },
    core: true,
  },
  {
    id: "focus-30",
    title: "Focus session",
    description: "Complete a 30-minute focused work session.",
    category: "focus",
    tier: "session30",
    stats: { focus: 2, discipline: 1 },
    core: false,
  },
  {
    id: "track-spending",
    title: "Track spending",
    description: "Record and review today's spending.",
    category: "finance",
    tier: "simpleHabit",
    stats: { finance: 1 },
    core: false,
  },
  {
    id: "learn-something-new",
    title: "Learn something new",
    description: "Learn one useful new thing.",
    category: "learning",
    tier: "shortQuest",
    stats: { intelligence: 1 },
    core: false,
  },
];
