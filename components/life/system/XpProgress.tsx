"use client";
import React, { useEffect, useState } from "react";
import { C, MONO } from "../ui";
import { formatXp } from "@/lib/system/engine";
import type { LevelProgress } from "@/types/system";
import { SYS } from "./theme";

/**
 * LEVEL X · "1,240 / 1,350 XP" · progress bar.
 *
 * The numbers follow the spec: current TOTAL xp over the total xp needed
 * for the next level. The bar shows progress through the CURRENT level
 * (so it reads 0% right after a level-up and 100% just before the next).
 *
 * Expects <SystemStyles /> to be rendered by the host screen (for the bar
 * transition and its prefers-reduced-motion override).
 */
export default function XpProgress({ progress }: { progress: LevelProgress }) {
  const target = Math.round(progress.fraction * 1000) / 10; // 0..100, 1 decimal

  // Start at 0 and move to the target on the next frame so the bar animates in.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(target));
    return () => cancelAnimationFrame(id);
  }, [target]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.32em", color: SYS.blue }}>LEVEL</div>
          <div style={{ fontSize: 46, fontWeight: 800, lineHeight: 1, color: SYS.white, textShadow: `0 0 18px ${SYS.glow}`, ...MONO }} aria-label={`Level ${progress.level}`}>
            {progress.level}
          </div>
        </div>
        <div style={{ textAlign: "right", paddingBottom: 4 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.ink, ...MONO }}>
            {formatXp(progress.totalXp)} <span style={{ color: C.inkFaint }}>/</span> {formatXp(progress.nextLevelXp)} <span style={{ fontSize: 12, color: SYS.blue }}>XP</span>
          </div>
          <div style={{ fontSize: 12, color: C.inkDim, marginTop: 2 }}>
            {formatXp(progress.xpToNext)} XP to level {progress.level + 1}
          </div>
        </div>
      </div>

      <div
        role="progressbar"
        aria-label="Experience progress in the current level"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress.fraction * 100)}
        aria-valuetext={`${formatXp(progress.xpIntoLevel)} of ${formatXp(progress.xpSpan)} XP toward level ${progress.level + 1}`}
        style={{ marginTop: 14, height: 10, borderRadius: 999, background: "#08111B", border: `1px solid ${SYS.blueLine}`, overflow: "hidden" }}
      >
        <div
          className="lfsys-fill"
          style={{
            width: `${shown}%`,
            height: "100%",
            borderRadius: 999,
            background: `linear-gradient(90deg, ${SYS.blue}, ${SYS.blueBright})`,
            boxShadow: shown > 0 ? `0 0 12px ${SYS.glow}` : "none",
          }}
        />
      </div>
    </div>
  );
}
