"use client";
import React, { useEffect, useState } from "react";
import { C, MONO } from "../ui";
import { formatXp } from "@/lib/system/engine";
import type { LevelProgress } from "@/types/system";

/** Blue used for progress fills: the app accent, and a lighter stop for the gradient. */
export const PROGRESS_GRADIENT = `linear-gradient(90deg, ${C.accent}, #5B9BF0)`;

/** A thin progress bar that animates in. Honors prefers-reduced-motion via the .lfsys-fill class (see SystemStyles). */
export function ProgressBar({ fraction, height = 10, label }: { fraction: number; height?: number; label: string }) {
  const target = Math.round(Math.min(1, Math.max(0, fraction)) * 1000) / 10;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(target));
    return () => cancelAnimationFrame(id);
  }, [target]);
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(target)} style={{ height, borderRadius: 999, background: C.bgAlt, border: `1px solid ${C.line}`, overflow: "hidden" }}>
      <div className="lfsys-fill" style={{ width: `${shown}%`, height: "100%", borderRadius: 999, background: PROGRESS_GRADIENT }} />
    </div>
  );
}

/** LEVEL n · "1,240 / 1,350 XP" · progress bar. Numbers are total XP over the XP needed for the next level; the bar is progress through the CURRENT level. */
export default function XpProgress({ progress }: { progress: LevelProgress }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.22em", color: C.accent }}>LEVEL</div>
          <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1, color: C.ink, ...MONO }} aria-label={`Level ${progress.level}`}>
            {progress.level}
          </div>
        </div>
        <div style={{ textAlign: "right", paddingBottom: 4 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.ink, ...MONO }}>
            {formatXp(progress.totalXp)} <span style={{ color: C.inkFaint }}>/</span> {formatXp(progress.nextLevelXp)} <span style={{ fontSize: 12, color: C.accent }}>XP</span>
          </div>
          <div style={{ fontSize: 12, color: C.inkDim, marginTop: 2 }}>
            {formatXp(progress.xpToNext)} XP to level {progress.level + 1}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <ProgressBar fraction={progress.fraction} label="Progress through the current level" />
      </div>
    </div>
  );
}
