import type { StatGains } from "@/types/system";

/** Coerce anything to a finite integer >= 0. NaN / Infinity / negatives -> 0. */
export function toNonNegativeInt(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.floor(v);
}

/**
 * Keep only positive integer gains. There is no way to express a negative
 * reward: a negative, zero, NaN or fractional-below-1 gain is dropped.
 * (Unknown stat ids are kept, so a later version can add stats safely.)
 */
export function sanitizeGains(gains: StatGains | undefined | null): StatGains {
  const out: StatGains = {};
  if (!gains || typeof gains !== "object") return out;
  for (const [id, raw] of Object.entries(gains)) {
    const gain = toNonNegativeInt(raw);
    if (gain > 0) out[id] = gain;
  }
  return out;
}
