import type { LifeEvent } from "@/types/system";
import { isValidDate } from "./dates";

/** Structural check for an event before it is stored: never trust an integration. */
export function isValidEvent(e: unknown): e is LifeEvent {
  if (!e || typeof e !== "object") return false;
  const ev = e as Partial<LifeEvent>;
  if (typeof ev.eventId !== "string" || ev.eventId.trim() === "") return false;
  if (typeof ev.source !== "string" || ev.source === "") return false;
  if (typeof ev.type !== "string" || ev.type === "") return false;
  if (typeof ev.date !== "string" || !isValidDate(ev.date)) return false;
  if (typeof ev.timestamp !== "number" || !Number.isFinite(ev.timestamp)) return false;
  if (typeof ev.title !== "string") return false;
  if (!ev.metadata || typeof ev.metadata !== "object" || Array.isArray(ev.metadata)) return false;
  for (const v of Object.values(ev.metadata)) {
    if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") return false;
  }
  return true;
}

/** Keep the first occurrence of each eventId (a batch can contain the same fact twice). */
export function dedupeEvents(events: readonly LifeEvent[]): LifeEvent[] {
  const seen = new Set<string>();
  const out: LifeEvent[] = [];
  for (const e of events) {
    if (seen.has(e.eventId)) continue;
    seen.add(e.eventId);
    out.push(e);
  }
  return out;
}
