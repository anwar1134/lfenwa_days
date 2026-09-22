"use client";
import React from "react";
import { todayStr } from "@/lib/storage";
import type { TabKey } from "@/types/life";
import DailyQuestsPanel from "./DailyQuestsPanel";
import SystemBoundary from "./SystemBoundary";
import { SYS, SysTitle } from "./theme";

/**
 * The small System block on the Today screen. Self-contained on purpose: it
 * loads its own data, handles its own errors, and is wrapped in a boundary, so
 * nothing that goes wrong here can affect what Today already shows.
 */
export default function TodaySystemSection({ onNavigate }: { onNavigate: (tab: TabKey) => void }) {
  return (
    <SystemBoundary>
      <DailyQuestsPanel
        date={todayStr()}
        compact
        title={<SysTitle>System · Daily quests</SysTitle>}
        right={
          <button type="button" onClick={() => onNavigate("system")} style={{ background: "none", border: "none", color: SYS.blue, fontSize: 12, cursor: "pointer" }}>
            Open System →
          </button>
        }
      />
    </SystemBoundary>
  );
}
