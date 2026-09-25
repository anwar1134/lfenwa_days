/* XP values — the ONLY place XP amounts are written. Reward rules refer to a
   tier by key; UI code never contains an XP number. */
export const XP_TIERS = {
  smallTask: { label: "Small task", xp: 10 },
  simpleHabit: { label: "Simple habit", xp: 15 },
  mediumTask: { label: "Medium task", xp: 25 },
  shortQuest: { label: "Short daily quest", xp: 20 },
  session30: { label: "Training / study, 30 min", xp: 30 },
  session60: { label: "Training / study, 1 hour", xp: 50 },
  hardTask: { label: "Hard task", xp: 75 },
  majorQuest: { label: "Major quest", xp: 150 },
  bossQuest: { label: "Boss quest", xp: 300 },
} as const;

export type XpTierKey = keyof typeof XP_TIERS;

export function isXpTier(key: string): key is XpTierKey {
  return Object.prototype.hasOwnProperty.call(XP_TIERS, key);
}

/** XP for a tier key; an unknown key is worth 0 (never throws, never negative). */
export function xpForTier(key: string): number {
  return isXpTier(key) ? XP_TIERS[key].xp : 0;
}
