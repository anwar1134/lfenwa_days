/* ============================================================
   Trading → facts   (the Trading read interface)
   ============================================================
       esOrderFlowJournal → readTradesKV (existing, untouched, read-only)
                          → THIS FILE → TradingDaySummary → LifeEvents

   This is the only System file that knows how Lfenwa Trades names and shapes its
   data. The CODE never references the database itself — it only calls the bridge
   (the diagram above is documentation). It is READ-ONLY and cannot write.

   What crosses the boundary is a TradingDaySummary: booleans and counts. There is
   no profit, loss, price or size anywhere in it — so the reward engine cannot even
   SEE P&L. The System rewards preparation, process, discipline and review; never
   outcome.

   ⚠ PROVISIONAL. These definitions come from static inspection of the compiled
   Trades bundle, not from real records. They are verified read-only in Phase 2,
   and every event carries metadata.definition = "provisional" until then.
   ============================================================ */
import { readTradesKV } from "@/lib/storage";
import type { LifeEvent, TradingDaySummary } from "@/types/system";
import { tradingEventId } from "../engine";
import type { Integration } from "./types";

const READ_TIMEOUT_MS = 3000;
const DEFINITION = "provisional";

/* ---------- safe reading ---------- */

/**
 * readTradesKV, made incapable of hanging or throwing. (The bridge parses JSON inside an
 * IndexedDB handler, so a malformed value would leave its promise pending forever; the
 * bridge is protected and stays as-is — the adapter defends itself instead.)
 */
async function readKV(key: string): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      readTradesKV(key).catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), READ_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** True when a value holds something the user actually entered (not null / "" / [] / {} / all-empty). */
export function hasContent(v: unknown, depth = 0): boolean {
  if (v === null || v === undefined || depth > 4) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "boolean") return true;
  if (Array.isArray(v)) return v.some((x) => hasContent(x, depth + 1));
  if (isRecord(v)) return Object.values(v).some((x) => hasContent(x, depth + 1));
  return false;
}

/* ---------- pure derivation ---------- */

/**
 * PURE. Build the constrained summary for one date from the raw (unknown-shaped) values.
 * Anything missing or malformed simply reads as "nothing happened".
 */
export function summarizeTradingDay(date: string, days: unknown, trades: unknown, notrades: unknown): TradingDaySummary {
  const day = isRecord(days) && isRecord(days[date]) ? (days[date] as Record<string, unknown>) : {};
  const countOn = (list: unknown) => (Array.isArray(list) ? list.filter((r) => isRecord(r) && r.date === date).length : 0);
  return {
    date,
    // Daily Prep (pre-market plan and mental state) has something filled in
    prepared: hasContent(day.premarket) || hasContent(day.mentalState),
    // the Trade / No-Trade check-in has something filled in
    checkedIn: hasContent(day.tradeNoTrade),
    // the Daily Review has something filled in — completion only, NEVER the self-scores' values
    reviewed: hasContent(day.dailyReview),
    noTradeCount: countOn(notrades),
    tradeCount: countOn(trades),
  };
}

/**
 * PURE. Facts for one day. `today` matters for exactly one rule: "no-trade AND no trades
 * taken that day" can only be known once the day is OVER, so it is emitted for completed
 * days only (otherwise a morning no-trade would be rewarded and then contradicted by an
 * afternoon trade).
 */
export function deriveTradingEvents(s: TradingDaySummary, today: string, now: number): LifeEvent[] {
  const base = (kind: "prepared" | "checkedIn" | "noTrade" | "reviewed", title: string, extra: Record<string, number> = {}): LifeEvent => ({
    eventId: tradingEventId(kind, s.date),
    source: "trading",
    type: `trading.${kind}`,
    date: s.date,
    timestamp: now,
    title,
    ref: { domain: "trading", store: "days", id: s.date },
    metadata: { definition: DEFINITION, ...extra },
  });
  const out: LifeEvent[] = [];
  if (s.prepared) out.push(base("prepared", "Trading preparation completed"));
  if (s.checkedIn) out.push(base("checkedIn", "Trade / No-Trade check-in completed")); // a fact; no reward rule
  if (s.noTradeCount > 0 && s.tradeCount === 0 && s.date < today) {
    out.push(base("noTrade", "No-trade decision logged, no trades taken", { noTradeCount: s.noTradeCount }));
  }
  if (s.reviewed) out.push(base("reviewed", "Trading review completed"));
  return out;
}

/* ---------- integration ---------- */

export const tradingIntegration: Integration = {
  id: "trading",
  stores: [], // Trades lives in its own database and its own iframe: nothing to subscribe to. Reconcile only.

  async reconcile({ today, dates }) {
    try {
      const [days, trades, notrades] = await Promise.all([readKV("days"), readKV("trades"), readKV("notrades")]);
      if (days == null && trades == null && notrades == null) return []; // Trades never opened / no data: nothing to say
      const now = Date.now();
      return dates.flatMap((d) => deriveTradingEvents(summarizeTradingDay(d, days, trades, notrades), today, now));
    } catch {
      return []; // never let Trading take the System down
    }
  },
};
