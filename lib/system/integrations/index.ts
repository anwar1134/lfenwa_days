/* ============================================================
   Integration runner: live + reconcile → one idempotent pipeline
   ============================================================ */
import { subscribeToBulkChange, subscribeToWrites, todayStr, type WriteEvent } from "@/lib/storage";
import type { HabitCategory, LifeEvent, ProcessResult } from "@/types/system";
import { RECONCILE_LOOKBACK_DAYS, RECONCILE_MIN_INTERVAL_MS } from "../config";
import { recentDates } from "../engine";
import { processEvents, rebuildProjection, setHabitLink } from "../store";
import { habitsIntegration } from "./habits";
import { questsIntegration } from "./quests";
export { listLinkableHabits } from "./habits";
import { tasksIntegration } from "./tasks";
import { tradingIntegration } from "./trading";
import type { Integration } from "./types";

export const INTEGRATIONS: readonly Integration[] = [habitsIntegration, tasksIntegration, tradingIntegration, questsIntegration];

/* ---------- reconcile (startup / focus / returning from Trades) ---------- */

/** Derive facts from every integration for the recent window and push them through the one gate. */
export async function reconcileNow(): Promise<ProcessResult> {
  const today = todayStr();
  const window = { today, dates: recentDates(today, RECONCILE_LOOKBACK_DAYS) };
  const events: LifeEvent[] = [];
  for (const integration of INTEGRATIONS) {
    try {
      events.push(...(await integration.reconcile(window)));
    } catch (err) {
      console.error(`[system] ${integration.id} reconcile failed:`, err); // one failing domain never blocks the rest
    }
  }
  return processEvents(events, today);
}

let running: Promise<void> | null = null;
let queued = false;
let lastRunAt = 0;

/** Throttled and coalesced: focus spam runs once; a request during a run schedules exactly one more. */
export function requestReconcile(force = false): Promise<void> {
  if (!force && Date.now() - lastRunAt < RECONCILE_MIN_INTERVAL_MS) return running ?? Promise.resolve();
  if (running) {
    queued = true;
    return running;
  }
  running = (async () => {
    do {
      queued = false;
      lastRunAt = Date.now();
      try {
        await reconcileNow();
      } catch (err) {
        console.error("[system] reconcile failed:", err);
      }
    } while (queued);
  })().finally(() => {
    running = null;
  });
  return running;
}

/* ---------- live (after a successful Lfnawa Days write) ---------- */

let chain: Promise<void> = Promise.resolve();

/** Live events are handled one at a time, in write order. Failures are logged and swallowed. */
function handleWrite(e: WriteEvent): void {
  chain = chain.then(async () => {
    for (const integration of INTEGRATIONS) {
      if (!integration.onWrite || !integration.stores.includes(e.store)) continue;
      try {
        const events = await integration.onWrite(e);
        if (events.length > 0) await processEvents(events, todayStr());
      } catch (err) {
        console.error(`[system] ${integration.id} live handler failed:`, err);
      }
    }
  });
}

/** Resolves once queued live handling and any running reconcile have finished. (Used by tests and by UI that must wait.) */
export async function flushIntegrations(): Promise<void> {
  let seen: Promise<void>;
  do {
    seen = chain;
    await seen;
    if (running) await running;
  } while (seen !== chain);
}

/* ---------- lifecycle ---------- */

let refCount = 0;
let teardown: Array<() => void> = [];

/**
 * Start the System's triggers. Idempotent (safe under React StrictMode double-mount):
 * one set of subscriptions no matter how many callers. Returns a stop function.
 */
export function startSystemIntegrations(): () => void {
  refCount++;
  if (refCount === 1) {
    teardown.push(subscribeToWrites(handleWrite));
    // A restore/import replaced data in bulk (its per-record notifications were suppressed):
    // heal the projection from the ledger, then look at recent facts once.
    teardown.push(
      subscribeToBulkChange(async () => {
        await rebuildProjection();
        await requestReconcile(true);
      })
    );
    if (typeof window !== "undefined") {
      const onFocus = () => void requestReconcile();
      const onVisible = () => {
        if (document.visibilityState === "visible") void requestReconcile();
      };
      window.addEventListener("focus", onFocus);
      document.addEventListener("visibilitychange", onVisible);
      teardown.push(() => window.removeEventListener("focus", onFocus), () => document.removeEventListener("visibilitychange", onVisible));
    }
    void requestReconcile(true); // startup
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0) {
      teardown.forEach((fn) => fn());
      teardown = [];
    }
  };
}

/** Link (or unlink) a habit to a System category, then re-evaluate recent facts so it takes effect now. */
export async function linkHabit(habitId: string, category: HabitCategory | null): Promise<void> {
  await setHabitLink(habitId, category);
  await requestReconcile(true);
}
