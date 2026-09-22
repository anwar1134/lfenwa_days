/* Profile creation / repair. PURE. The profile row is a cache + the user's System
   settings; the XP ledger is the source of truth for progress. */
import type { HabitCategory, SystemProfile } from "@/types/system";
import { PROFILE_ID, SYSTEM_SCHEMA_VERSION } from "../config/rules";
import { emptyProjection, normalizeProjection } from "./projection";

const CATEGORIES: readonly HabitCategory[] = ["study", "workout", "general"];

export function createProfile(now: number = Date.now()): SystemProfile {
  return {
    id: PROFILE_ID,
    schemaVersion: SYSTEM_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    projection: emptyProjection(),
    settings: { habitLinks: {} },
  };
}

/** Make any stored value safe to use as a profile. Unknown fields are preserved (forward compatibility). */
export function normalizeProfile(raw: unknown, now: number = Date.now()): SystemProfile {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<SystemProfile> & Record<string, unknown>;
  const rawLinks = (r.settings && typeof r.settings === "object" && (r.settings as { habitLinks?: unknown }).habitLinks) || {};
  const habitLinks: Record<string, HabitCategory> = {};
  if (rawLinks && typeof rawLinks === "object") {
    for (const [habitId, cat] of Object.entries(rawLinks as Record<string, unknown>)) {
      if (CATEGORIES.includes(cat as HabitCategory)) habitLinks[habitId] = cat as HabitCategory;
    }
  }
  return {
    ...r,
    id: PROFILE_ID,
    schemaVersion: typeof r.schemaVersion === "number" ? r.schemaVersion : SYSTEM_SCHEMA_VERSION,
    createdAt: typeof r.createdAt === "number" && Number.isFinite(r.createdAt) ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === "number" && Number.isFinite(r.updatedAt) ? r.updatedAt : now,
    projection: normalizeProjection(r.projection),
    settings: { ...(r.settings && typeof r.settings === "object" ? r.settings : {}), habitLinks },
  };
}
