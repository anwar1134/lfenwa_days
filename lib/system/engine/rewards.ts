/* The reward engine: given a FACT, which XP/stat gains do the configured rules
   grant? PURE — caps are applied from `usage` (how many ledger rows each rule
   already has for the event's date), which the store supplies. */
import type {
  EventScalar,
  LifeEvent,
  RewardContext,
  RewardDecision,
  RewardRule,
} from "@/types/system";
import { isXpTier, xpForTier } from "../config/xp";
import { sanitizeGains } from "./numbers";

/**
 * Attributes a rule may match on: the event's own metadata, plus values the
 * SYSTEM derives from its own settings (never from a domain's naming).
 * e.g. a habit's category comes from the link the user set, or "unlinked".
 */
export function resolveAttributes(
  event: LifeEvent,
  ctx: RewardContext,
): Record<string, EventScalar> {
  const attrs: Record<string, EventScalar> = { ...event.metadata };

  if (event.type === "habit.completed") {
    const habitId =
      typeof event.metadata.habitId === "string"
        ? event.metadata.habitId
        : "";

    attrs.category =
      (habitId && ctx.habitLinks[habitId]) || "unlinked";
  }

  return attrs;
}

export function ruleMatches(
  rule: RewardRule,
  event: LifeEvent,
  attrs: Record<string, EventScalar>,
): boolean {
  if (rule.eventType !== event.type) return false;

  if (event.type === "quest.completed" && event.source !== "quests") {
    return false;
  }

  if (!rule.match) return true;

  return Object.entries(rule.match).every(
    ([k, v]) => attrs[k] === v,
  );
}

function dynamicQuestReward(
  event: LifeEvent,
  fallback: RewardDecision,
): RewardDecision {
  if (event.type !== "quest.completed") return fallback;

  const rawTier = event.metadata.tier;
  const tier =
    typeof rawTier === "string" && isXpTier(rawTier)
      ? rawTier
      : null;

  let stats: Record<string, number> = {};

  const rawStats = event.metadata.stats;

  if (typeof rawStats === "string") {
    try {
      const parsed: unknown = JSON.parse(rawStats);

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        stats = sanitizeGains(parsed as Record<string, number>);
      }
    } catch {
      stats = {};
    }
  }

  return {
    ruleId: fallback.ruleId,
    xp: tier ? xpForTier(tier) : 0,
    stats,
  };
}

/**
 * @param usage ledger rows already granted per rule id for THIS event's date
 * @returns at most one decision per matching rule; never negative; never over the cap
 */
export function evaluateRewards(
  event: LifeEvent,
  rules: readonly RewardRule[],
  ctx: RewardContext,
  usage: Readonly<Record<string, number>>,
): RewardDecision[] {
  const attrs = resolveAttributes(event, ctx);
  const out: RewardDecision[] = [];

  for (const rule of rules) {
    if (!ruleMatches(rule, event, attrs)) continue;

    if (
      (usage[rule.id] ?? 0) >=
      Math.max(0, Math.floor(rule.dailyCap))
    ) {
      continue;
    }

    const baseDecision: RewardDecision = {
      ruleId: rule.id,
      xp: xpForTier(rule.tier),
      stats: sanitizeGains(rule.stats),
    };

    const decision = dynamicQuestReward(event, baseDecision);

    if (
      decision.xp <= 0 &&
      Object.keys(decision.stats).length === 0
    ) {
      continue;
    }

    out.push(decision);
  }

  return out;
}
