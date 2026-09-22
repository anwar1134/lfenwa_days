import type { WriteEvent } from "@/lib/storage";
import type { StoreName } from "@/types/life";
import type { LifeEvent } from "@/types/system";

export interface ReconcileWindow {
  today: string;
  /** today and the days back that can still earn XP, oldest first. */
  dates: string[];
}

/**
 * A domain integration turns what happened in a domain into FACTS (LifeEvents).
 * It never grants XP, never writes to the domain, and never throws into the app.
 *
 * Two triggers feed the same deterministic ids, so they are idempotent together:
 *  - onWrite:   live, after a successful Lfnawa Days write to one of `stores`
 *  - reconcile: on startup / focus / returning from Trades — catches missed writes,
 *               other tabs, existing recent records, and Trades (which can't push)
 */
export interface Integration {
  id: string;
  /** Lfnawa Days stores whose writes this integration reacts to live (none for Trades). */
  stores: readonly StoreName[];
  onWrite?(e: WriteEvent): Promise<LifeEvent[]>;
  reconcile(window: ReconcileWindow): Promise<LifeEvent[]>;
}
