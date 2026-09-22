"use client";
import React from "react";
import { C, MONO, Panel } from "../ui";
import { formatXp } from "@/lib/system/engine";
import SystemBoundary from "./SystemBoundary";
import SystemStyles from "./SystemStyles";
import { ProgressBar } from "./XpProgress";
import { useSystemSnapshot } from "./useSystemSnapshot";

function Card({ onOpenSystem }: { onOpenSystem: () => void }) {
  const { snapshot, error } = useSystemSnapshot();
  const link = (
    <button type="button" onClick={onOpenSystem} style={{ background: "none", border: "none", color: C.accent, fontSize: 12, cursor: "pointer" }}>
      Open System →
    </button>
  );
  return (
    <Panel title="Level &amp; XP" right={link}>
      <SystemStyles />
      {error ? (
        <div style={{ fontSize: 13, color: C.inkFaint }}>Progress isn&apos;t available right now.</div>
      ) : !snapshot ? (
        <div style={{ fontSize: 13, color: C.inkFaint }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>
              Level <span style={MONO}>{snapshot.progress.level}</span>
            </div>
            <div style={{ fontSize: 13, color: C.inkDim, ...MONO }}>
              {formatXp(snapshot.totalXp)} / {formatXp(snapshot.progress.nextLevelXp)} XP
            </div>
          </div>
          <ProgressBar fraction={snapshot.progress.fraction} height={8} label="Progress through the current level" />
          <div style={{ fontSize: 13, color: snapshot.todayXp > 0 ? C.good : C.inkDim, marginTop: 8, ...MONO }}>Today&apos;s XP: +{formatXp(snapshot.todayXp)}</div>
        </>
      )}
    </Panel>
  );
}

/** The small System card on Today. Self-contained and wrapped in a boundary: if the System fails, Today is unaffected. */
export default function TodayProgressCard({ onOpenSystem }: { onOpenSystem: () => void }) {
  return (
    <SystemBoundary>
      <Card onOpenSystem={onOpenSystem} />
    </SystemBoundary>
  );
}
