/* The profile is a PROJECTION of the XP ledger: total XP and stats are just a
   fold over ledger rows. The cache can always be rebuilt, so a restore or merge
   that leaves it stale can never change what the user has actually earned. */
import type { ProfileProjection, StatBlock, XpLedgerEntry } from "@/types/system";
import { INITIAL_STAT_VALUE, STAT_IDS } from "../config/stats";
import { sanitizeGains, toNonNegativeInt } from "./numbers";

export function emptyProjection(): ProfileProjection {
  const stats: StatBlock = {};
  for (const id of STAT_IDS) stats[id] = INITIAL_STAT_VALUE;
  return { totalXp: 0, stats, ledgerCount: 0 };
}

/** A NEW projection with one ledger entry applied. Never subtracts. */
export function applyLedgerEntry(p: ProfileProjection, entry: Pick<XpLedgerEntry, "xp" | "stats">): ProfileProjection {
  const stats: StatBlock = { ...p.stats };
  for (const [id, gain] of Object.entries(sanitizeGains(entry.stats))) stats[id] = (stats[id] ?? INITIAL_STAT_VALUE) + gain;
  return { totalXp: p.totalXp + toNonNegativeInt(entry.xp), stats, ledgerCount: p.ledgerCount + 1 };
}

export function foldLedger(entries: readonly Pick<XpLedgerEntry, "xp" | "stats">[]): ProfileProjection {
  let p = emptyProjection();
  for (const e of entries) p = applyLedgerEntry(p, e);
  return p;
}

/** Make any stored value safe to use as a projection (missing stats filled, bad numbers repaired). */
export function normalizeProjection(raw: unknown): ProfileProjection {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<ProfileProjection>;
  const base = emptyProjection();
  const rawStats = (r.stats && typeof r.stats === "object" ? r.stats : {}) as Record<string, unknown>;
  const stats: StatBlock = { ...base.stats };
  for (const [id, v] of Object.entries(rawStats)) {
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) stats[id] = Math.floor(v);
  }
  return { totalXp: toNonNegativeInt(r.totalXp), stats, ledgerCount: toNonNegativeInt(r.ledgerCount) };
}

/** True when the cached projection cannot be trusted and must be rebuilt from the ledger. */
export function isProjectionStale(p: ProfileProjection | undefined | null, actualLedgerCount: number): boolean {
  if (!p || typeof p !== "object") return true;
  return toNonNegativeInt(p.ledgerCount) !== toNonNegativeInt(actualLedgerCount);
}
