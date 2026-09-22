"use client";
import React from "react";
import { FiCheck } from "react-icons/fi";
import { C, MONO, Panel } from "../ui";
import { describeStatGains, formatXp } from "@/lib/system/engine";
import { useDailyQuests } from "./useDailyQuests";
import { SYS, SYSTEM_PANEL_STYLE } from "./theme";

/**
 * Today's quests: a checklist, "n / N completed", and today's XP.
 *
 * Used by BOTH the System screen and Today (compact) — one component, one hook,
 * one service. It renders and forwards taps; every rule lives in lib/system.
 */
export default function DailyQuestsPanel({
  date,
  title,
  right,
  compact = false,
  onChange,
}: {
  date: string;
  title: React.ReactNode;
  right?: React.ReactNode;
  compact?: boolean;
  /** Called after a quest completion has been saved (e.g. so a parent can refresh its own numbers). */
  onChange?: () => void;
}) {
  const { quests, summary, xpToday, error, busyId, lastResult, complete, reload } = useDailyQuests(date, onChange);

  const justCompleted = lastResult?.status === "completed" ? lastResult : null;

  return (
    <Panel title={title} right={right} style={SYSTEM_PANEL_STYLE}>
      {!quests && !error && <div style={{ fontSize: 13, color: C.inkFaint }}>Loading quests…</div>}

      {error && (
        <div style={{ fontSize: 13, color: C.inkFaint, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span>Couldn&apos;t load today&apos;s quests.</span>
          <button type="button" onClick={reload} style={{ background: "none", border: `1px solid ${C.line}`, borderRadius: 8, color: C.ink, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      )}

      {quests && quests.length === 0 && !error && <div style={{ fontSize: 13, color: C.inkFaint }}>No quests for today.</div>}

      {quests && quests.length > 0 && (
        <>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {quests.map((q, i) => {
              const done = q.status === "completed";
              const gains = describeStatGains(q.statRewards);
              return (
                <li key={q.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: compact ? "8px 0" : "10px 0", borderBottom: i === quests.length - 1 ? "none" : `1px solid ${C.lineSoft}` }}>
                  <button
                    type="button"
                    onClick={() => complete(q.id)}
                    disabled={done || busyId !== null}
                    aria-label={done ? `${q.title}, completed` : `Complete ${q.title}`}
                    style={{
                      flex: "0 0 auto",
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      border: `1px solid ${done ? SYS.blue : SYS.blueControl}`,
                      background: done ? SYS.blueDim : C.bgAlt,
                      color: SYS.blueBright,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: done || busyId !== null ? "default" : "pointer",
                      opacity: busyId === q.id ? 0.6 : 1,
                      padding: 0,
                    }}
                  >
                    {done && <FiCheck size={16} />}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: done ? C.inkDim : C.ink }}>{q.title}</div>
                    {!compact && q.description && <div style={{ fontSize: 12, color: C.inkFaint, marginTop: 2 }}>{q.description}</div>}
                    {gains && <div style={{ fontSize: 11, color: done ? C.inkFaint : C.inkDim, marginTop: 2 }}>{gains}</div>}
                  </div>
                  <div style={{ flex: "0 0 auto", fontSize: 13, fontWeight: 700, color: done ? C.inkFaint : SYS.blue, whiteSpace: "nowrap", ...MONO }}>+{formatXp(q.xpReward)} XP</div>
                </li>
              );
            })}
          </ul>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${SYS.blueLine}` }}>
            <span style={{ fontSize: 13, color: C.inkDim, ...MONO }}>
              {summary.completed} / {summary.total} completed
            </span>
            <span style={{ fontSize: 13, color: xpToday > 0 ? C.good : C.inkDim, ...MONO }}>Today XP: +{formatXp(xpToday)}</span>
          </div>
        </>
      )}

      {/* Result of the last completion — local to this panel, not a notification system. */}
      <div role="status" aria-live="polite">
        {justCompleted && justCompleted.quest && (
          <div style={{ marginTop: 10, fontSize: 12, color: SYS.blueBright, background: SYS.blueDeep, border: `1px solid ${SYS.blueLine}`, borderRadius: 8, padding: "8px 10px" }}>
            <strong>Quest complete</strong> · {justCompleted.quest.title}
            {justCompleted.award?.applied ? ` · +${formatXp(justCompleted.quest.xpReward)} XP` : ""}
            {justCompleted.award?.applied && describeStatGains(justCompleted.quest.statRewards) ? ` · ${describeStatGains(justCompleted.quest.statRewards)}` : ""}
            {justCompleted.award?.leveledUp ? ` · Level ${justCompleted.award.levelAfter} reached` : ""}
          </div>
        )}
      </div>
    </Panel>
  );
}
