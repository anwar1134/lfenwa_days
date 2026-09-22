"use client";
import React from "react";
import { C, MONO } from "../ui";
import { STAT_DEFS } from "@/lib/system/config";
import type { StatBlock } from "@/types/system";
import { SYS } from "./theme";

// Bars are relative, not absolute: stats have no cap, so each bar is scaled
// against the highest stat (never below this floor, so a fresh profile with
// every stat at 1 doesn't render six full bars).
const BAR_SCALE_FLOOR = 10;

export default function StatsGrid({ stats }: { stats: StatBlock }) {
  const scale = Math.max(BAR_SCALE_FLOOR, ...STAT_DEFS.map((d) => stats[d.key]));

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 14 }}>
      {STAT_DEFS.map((def) => {
        const value = stats[def.key];
        const pct = Math.min(100, (value / scale) * 100);
        return (
          <li key={def.key} title={def.hint}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{def.label}</div>
                <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 1 }}>{def.hint}</div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: SYS.white, ...MONO }} aria-label={`${def.label} ${value}`}>
                {value}
              </div>
            </div>
            <div aria-hidden="true" style={{ marginTop: 6, height: 4, borderRadius: 999, background: "#08111B", overflow: "hidden" }}>
              <div className="lfsys-fill" style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${SYS.blueDim}, ${SYS.blue})` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
