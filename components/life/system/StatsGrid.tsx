"use client";
import React from "react";
import { C, MONO } from "../ui";
import { STAT_DEFS } from "@/lib/system/config";
import type { StatBlock } from "@/types/system";
import { PROGRESS_GRADIENT } from "./XpProgress";

// Stats have no cap, so bars are relative to the highest stat (never below this floor, so
// a fresh profile with every stat at 1 doesn't show six full bars).
const BAR_SCALE_FLOOR = 10;

export default function StatsGrid({ stats }: { stats: StatBlock }) {
  const rows = [...STAT_DEFS.map((d) => ({ id: d.id, label: d.label, hint: d.hint })), ...Object.keys(stats).filter((id) => !STAT_DEFS.some((d) => d.id === id)).map((id) => ({ id, label: id, hint: "" }))];
  const scale = Math.max(BAR_SCALE_FLOOR, ...rows.map((r) => stats[r.id] ?? 0));
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 14 }}>
      {rows.map((r) => {
        const value = stats[r.id] ?? 1;
        return (
          <li key={r.id}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{r.label}</div>
                {r.hint && <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 1 }}>{r.hint}</div>}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.ink, ...MONO }} aria-label={`${r.label} ${value}`}>
                {value}
              </div>
            </div>
            <div aria-hidden="true" style={{ marginTop: 6, height: 5, borderRadius: 999, background: C.bgAlt, overflow: "hidden" }}>
              <div className="lfsys-fill" style={{ width: `${Math.min(100, (value / scale) * 100)}%`, height: "100%", borderRadius: 999, background: PROGRESS_GRADIENT }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
