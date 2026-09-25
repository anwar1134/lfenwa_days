"use client";
import React from "react";
import { C, MONO, Panel, StatTile, fmtDateLong, fmtDateShort } from "../ui";
import { todayStr } from "@/lib/storage";
import { describeGains, formatXp } from "@/lib/system/engine";
import HabitLinksPanel from "./HabitLinksPanel";
import RulesPanel from "./RulesPanel";
import DailyQuestsPanel from "./DailyQuestsPanel";
import StatsGrid from "./StatsGrid";
import SystemStyles from "./SystemStyles";
import XpProgress from "./XpProgress";
import { useSystemSnapshot } from "./useSystemSnapshot";

// Presentation-only labels for where a piece of activity came from.
const SOURCE_LABEL: Record<string, string> = { habits: "Habit", tasks: "Task", trading: "Trading", quests: "Quest" };

export default function SystemScreen() {
  const { snapshot, error, reload } = useSystemSnapshot();
  const date = todayStr();

  if (error) {
    return (
      <Panel title="System">
        <div style={{ fontSize: 13, color: C.bad, marginBottom: 6 }}>Couldn&apos;t open the System data on this device.</div>
        <div style={{ fontSize: 12, color: C.inkFaint }}>{error}</div>
      </Panel>
    );
  }
  if (!snapshot) return <div style={{ color: C.inkDim, padding: 20 }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <SystemStyles />

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>System</div>
        <div style={{ fontSize: 13, color: C.inkDim }}>{fmtDateLong(date)}</div>
      </div>

      <Panel style={{ background: `linear-gradient(180deg, ${C.accentDim} 0%, ${C.panel} 70%)` }}>
        <XpProgress progress={snapshot.progress} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
          <StatTile label="Total XP" value={formatXp(snapshot.totalXp)} />
          <StatTile label="Today" value={`+${formatXp(snapshot.todayXp)}`} tone={snapshot.todayXp > 0 ? "good" : undefined} />
          <StatTile label="Next level" value={formatXp(snapshot.progress.xpToNext)} sub="XP to go" />
        </div>
      </Panel>

      <Panel title="Attributes">
        <StatsGrid stats={snapshot.stats} />
      </Panel>

      <Panel title="Recent activity">
        {snapshot.recent.length === 0 ? (
          <div style={{ fontSize: 13, color: C.inkFaint, lineHeight: 1.6 }}>Nothing earned yet. Complete a task, or link a habit below and tick it off — XP and stat gains from real activity appear here.</div>
        ) : (
          snapshot.recent.map((e, i) => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "8px 0", borderBottom: i === snapshot.recent.length - 1 ? "none" : `1px solid ${C.lineSoft}` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: C.ink, overflowWrap: "anywhere" }}>{e.cause.title}</div>
                <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 2 }}>
                  {SOURCE_LABEL[e.cause.source] || e.cause.source} · {fmtDateShort(e.date)}
                  {describeGains(e.stats) ? ` · ${describeGains(e.stats)}` : ""}
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.accent, whiteSpace: "nowrap", ...MONO }}>+{formatXp(e.xp)} XP</div>
            </div>
          ))
        )}
      </Panel>

      <DailyQuestsPanel snapshot={snapshot} reload={reload} />
      <HabitLinksPanel links={snapshot.habitLinks} />
      <RulesPanel />
    </div>
  );
}
