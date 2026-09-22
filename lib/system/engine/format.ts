import type { StatGains } from "@/types/system";
import { STAT_DEFS } from "../config/stats";
import { sanitizeGains, toNonNegativeInt } from "./numbers";

/** Group digits the same way everywhere ("1,240"), independent of device locale. */
export function formatXp(n: number): string {
  return toNonNegativeInt(n).toLocaleString("en-US");
}

/** "Intelligence +2 · Discipline +1" — registered stats in registry order, then any unknown ones. */
export function describeGains(gains: StatGains | undefined | null): string {
  const g = sanitizeGains(gains);
  const known = STAT_DEFS.filter((d) => g[d.id]).map((d) => `${d.label} +${g[d.id]}`);
  const knownIds = new Set(STAT_DEFS.map((d) => d.id));
  const extra = Object.keys(g).filter((id) => !knownIds.has(id)).map((id) => `${id} +${g[id]}`);
  return [...known, ...extra].join(" · ");
}
