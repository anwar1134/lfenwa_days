"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { C, MONO, Panel, StatTile, fmtDateLong, fmtDateShort } from "../ui";
import { todayStr } from "@/lib/storage";
import { describeStatGains, formatXp, getLevelProgress } from "@/lib/system/engine";
import { getRecentEvents, getXpForDate, loadOrCreateProfile } from "@/lib/system/store";
import type { SystemEvent, SystemProfile } from "@/types/system";
import DailyQuestsPanel from "./DailyQuestsPanel";
import StatsGrid from "./StatsGrid";
import XpProgress from "./XpProgress";
import { SYS, SYSTEM_PANEL_STYLE, SYSTEM_WINDOW_STYLE, SysTitle, SystemStyles } from "./theme";

export default function SystemStatus() {
  const date = todayStr();
  const [profile, setProfile] = useState<SystemProfile | null>(null);
  const [recent, setRecent] = useState<SystemEvent[]>([]);
  const [todayXp, setTodayXp] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [p, events, xpToday] = await Promise.all([loadOrCreateProfile(), getRecentEvents(6), getXpForDate(date)]);
      setProfile(p);
      setRecent(events);
      setTodayXp(xpToday);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }, [date]);

  useEffect(() => {
    reload();
  }, [reload]);
  // Refresh when returning to the window/tab, like the other screens do.
  useEffect(() => {
    const onFocus = () => reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  const progress = useMemo(() => (profile ? getLevelProgress(profile.totalXp) : null), [profile]);

  if (error) {
    return (
      <Panel title="System" style={SYSTEM_PANEL_STYLE}>
        <div style={{ fontSize: 13, color: C.bad, marginBottom: 6 }}>Couldn&apos;t open the System data on this device.</div>
        <div style={{ fontSize: 12, color: C.inkFaint }}>{error}</div>
      </Panel>
    );
  }
  if (!profile || !progress) return <div style={{ color: C.inkDim, padding: 20 }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <SystemStyles />

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>Status</div>
        <div style={{ fontSize: 13, color: C.inkDim }}>{fmtDateLong(date)}</div>
      </div>

      <Panel style={SYSTEM_WINDOW_STYLE}>
        {/* faint top edge light — purely decorative */}
        <div aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${SYS.blue}, transparent)`, opacity: 0.7 }} />
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.32em", color: SYS.blueBright, marginBottom: 14 }}>LFENWA SYSTEM</div>
        <XpProgress progress={progress} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
          <StatTile label="Total XP" value={formatXp(progress.totalXp)} />
          <StatTile label="Today" value={`+${formatXp(todayXp)}`} tone={todayXp > 0 ? "good" : undefined} />
          <StatTile label="Next level" value={formatXp(progress.xpToNext)} sub="XP to go" />
        </div>
      </Panel>

      {/* After a completion is saved, refresh level/XP/stats/activity above. */}
      <DailyQuestsPanel date={date} title={<SysTitle>Today&apos;s Quests</SysTitle>} onChange={reload} />

      <Panel title={<SysTitle>Attributes</SysTitle>} style={SYSTEM_PANEL_STYLE}>
        <StatsGrid stats={profile.stats} />
      </Panel>

      <Panel title={<SysTitle>Recent activity</SysTitle>} style={SYSTEM_PANEL_STYLE}>
        {recent.length === 0 ? (
          <div style={{ fontSize: 13, color: C.inkFaint }}>Nothing earned yet. XP and stat gains will appear here.</div>
        ) : (
          recent.map((e) => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: C.ink }}>{e.label}</div>
                <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 2 }}>
                  {fmtDateShort(e.date)}
                  {describeStatGains(e.stats) ? ` · ${describeStatGains(e.stats)}` : ""}
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: SYS.blue, whiteSpace: "nowrap", ...MONO }}>+{formatXp(e.xp)} XP</div>
            </div>
          ))
        )}
      </Panel>
    </div>
  );
}
