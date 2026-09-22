/* Level progression (ported unchanged from the prototype's verified math).
   Total XP required to REACH each level. Index 0 is level 1. */
export const LEVEL_THRESHOLDS: readonly number[] = [0, 100, 250, 450, 700, 1000, 1350, 1750, 2200, 2700];

// Beyond the table the game never caps: each further level costs `stepIncrease`
// more XP than the level before it — the same rule the table already follows
// (gaps of 100, 150, 200 … 500), so L10→11 costs 550, L11→12 costs 600, and so on.
export const LEVEL_EXTENSION = { stepIncrease: 50 } as const;

// Safety valve so corrupted/absurd XP can never make the level maths spin.
export const MAX_LEVEL_ITERATIONS = 1_000_000;
