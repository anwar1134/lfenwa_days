"use client";

import React, { useMemo, useState } from "react";
import { C, MONO, Panel } from "../ui";
import { todayStr } from "@/lib/storage";
import { describeGains, formatXp } from "@/lib/system/engine";
import {
  DAILY_QUEST_DEFINITIONS,
  buildDailyQuests,
  markQuestCompleted,
  completeDailyQuest,
} from "@/lib/system/quests";
import type { SystemSnapshot } from "@/types/system";

interface DailyQuestsPanelProps {
  snapshot: SystemSnapshot;
  reload: () => Promise<void>;
}

export default function DailyQuestsPanel({
  snapshot,
  reload,
}: DailyQuestsPanelProps) {
  const date = todayStr();
  const [completingId, setCompletingId] = useState<string | null>(null);

  const quests = useMemo(() => {
    const base = buildDailyQuests(date, DAILY_QUEST_DEFINITIONS);

    return base.map((quest) => {
      if (!snapshot.completedQuestIds.includes(quest.id)) {
        return quest;
      }

      return markQuestCompleted(quest, 0);
    });
  }, [date, snapshot.completedQuestIds]);

  async function completeQuest(questId: string) {
    if (completingId) return;

    const quest = quests.find((item) => item.id === questId);
    if (!quest || quest.status === "completed") return;

    setCompletingId(questId);

    try {
      const completed = await completeDailyQuest(quest, Date.now());

      if (!completed) return;

      await reload();
    } finally {
      setCompletingId(null);
    }
  }

  const completedCount = quests.filter(
    (quest) => quest.status === "completed",
  ).length;

  return (
    <Panel title={`Daily Quests · ${completedCount}/${quests.length}`}>
      <div
        style={{
          fontSize: 12,
          color: C.inkDim,
          marginBottom: 10,
          lineHeight: 1.6,
        }}
      >
        Complete today&apos;s quests to earn XP and improve your attributes.
      </div>

      {quests.map((quest, index) => {
        const completed = quest.status === "completed";
        const loading = completingId === quest.id;

        return (
          <div
            key={quest.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              padding: "11px 0",
              borderBottom:
                index === quests.length - 1
                  ? "none"
                  : `1px solid ${C.lineSoft}`,
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 13,
                  color: completed ? C.inkFaint : C.ink,
                  textDecoration: completed ? "line-through" : "none",
                }}
              >
                {quest.title}
                {quest.core ? (
                  <span
                    style={{
                      marginLeft: 7,
                      fontSize: 10,
                      color: C.accent,
                    }}
                  >
                    CORE
                  </span>
                ) : null}
              </div>

              <div
                style={{
                  fontSize: 11,
                  color: C.inkFaint,
                  marginTop: 3,
                  lineHeight: 1.5,
                }}
              >
                {quest.description}
              </div>

              <div
                style={{
                  fontSize: 11,
                  color: C.inkFaint,
                  marginTop: 4,
                }}
              >
                {describeGains(quest.stats)}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 6,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: C.accent,
                  whiteSpace: "nowrap",
                  ...MONO,
                }}
              >
                +{formatXp(quest.xp)} XP
              </div>

              <button
                type="button"
                disabled={completed || loading}
                onClick={() => completeQuest(quest.id)}
                style={{
                  border: `1px solid ${
                    completed ? C.lineSoft : C.accent
                  }`,
                  borderRadius: 7,
                  padding: "5px 9px",
                  background: completed ? C.panel : C.accentDim,
                  color: completed ? C.inkFaint : C.ink,
                  cursor:
                    completed || loading ? "default" : "pointer",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {completed ? "Completed" : loading ? "Saving…" : "Complete"}
              </button>
            </div>
          </div>
        );
      })}
    </Panel>
  );
}
