"use client";
import React from "react";
import { C, MONO, Panel } from "../ui";
import { ELIGIBLE_DAYS_BACK, REWARD_RULES, xpForTier } from "@/lib/system/config";
import { describeGains, formatXp } from "@/lib/system/engine";

/** "What earns XP" — generated from the SAME reward rules the engine uses, so it can never drift from the truth. */
export default function RulesPanel() {
  return (
    <Panel title="What earns XP">
      <div style={{ fontSize: 12, color: C.inkDim, marginBottom: 10, lineHeight: 1.6 }}>
        Only activity from today{ELIGIBLE_DAYS_BACK >= 1 ? " or yesterday" : ""} earns XP; older records are kept but never rewarded. Trading rewards process, never profit.
      </div>
      {REWARD_RULES.map((r) => (
        <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: C.ink }}>{r.label}</div>
            <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 2 }}>
              {describeGains(r.stats)} · up to {r.dailyCap}/day
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.accent, whiteSpace: "nowrap", ...MONO }}>+{formatXp(xpForTier(r.tier))} XP</div>
        </div>
      ))}
    </Panel>
  );
}
