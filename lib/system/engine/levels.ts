/* Level maths — ported from the prototype (verified against the spec table and
   its continuation). PURE: no storage, no React. Level is always derived from
   lifetime XP; it is never stored. */
import type { LevelProgress } from "@/types/system";
import { LEVEL_EXTENSION, LEVEL_THRESHOLDS, MAX_LEVEL_ITERATIONS } from "../config/levels";
import { toNonNegativeInt } from "./numbers";

function lastTableGap(): number {
  const t = LEVEL_THRESHOLDS;
  return t.length >= 2 ? t[t.length - 1] - t[t.length - 2] : 100;
}

/** Total XP required to REACH `level` (level 1 = 0). Never caps. */
export function xpForLevel(level: number): number {
  const target = Math.min(MAX_LEVEL_ITERATIONS, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)));
  const table = LEVEL_THRESHOLDS;
  if (target <= table.length) return table[target - 1];
  let xp = table[table.length - 1];
  let gap = lastTableGap();
  for (let l = table.length + 1; l <= target; l++) {
    gap += LEVEL_EXTENSION.stepIncrease;
    xp += gap;
  }
  return xp;
}

/** The level a given lifetime XP corresponds to. Single pass, O(level). */
export function levelFromXp(totalXp: number): number {
  const xp = toNonNegativeInt(totalXp);
  const table = LEVEL_THRESHOLDS;
  let level = 1;
  while (level < table.length && xp >= table[level]) level++;
  if (level < table.length) return level;

  let start = table[table.length - 1];
  let gap = lastTableGap();
  for (let i = 0; i < MAX_LEVEL_ITERATIONS; i++) {
    gap += LEVEL_EXTENSION.stepIncrease;
    const next = start + gap;
    if (xp < next) break;
    start = next;
    level++;
  }
  return level;
}

export function getLevelProgress(totalXp: number): LevelProgress {
  const xp = toNonNegativeInt(totalXp);
  const level = levelFromXp(xp);
  const levelStartXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const xpSpan = Math.max(1, nextLevelXp - levelStartXp);
  const xpIntoLevel = xp - levelStartXp;
  const fraction = Math.min(1, Math.max(0, xpIntoLevel / xpSpan));
  return { level, totalXp: xp, levelStartXp, nextLevelXp, xpIntoLevel, xpSpan, xpToNext: nextLevelXp - xp, fraction };
}
