/* Habits → facts. A completed habit entry is a FACT; whether it earns XP depends
   on the link the user set (System settings), resolved later by the reward rules. */
import { dbGet, dbGetAll } from "@/lib/storage";
import type { Habit, HabitEntry } from "@/types/life";
import type { LifeEvent } from "@/types/system";
import { habitCompletedId, isValidDate } from "../engine";
import type { Integration } from "./types";

/** PURE. null unless the entry is a valid, completed one. Unchecking never produces an event. */
export function habitCompletedEvent(habit: Pick<Habit, "id" | "name"> | null, entry: Partial<HabitEntry> | null | undefined, now: number): LifeEvent | null {
  if (!entry || entry.done !== true) return null;
  if (typeof entry.habitId !== "string" || entry.habitId === "") return null;
  if (typeof entry.date !== "string" || !isValidDate(entry.date)) return null;
  const name = habit?.name?.trim() || "Habit";
  return {
    eventId: habitCompletedId(entry.habitId, entry.date),
    source: "habits",
    type: "habit.completed",
    date: entry.date,
    timestamp: now,
    title: name,
    ref: { domain: "life", store: "habitEntries", id: typeof entry.id === "string" ? entry.id : `${entry.habitId}:${entry.date}` },
    metadata: { habitId: entry.habitId, habitName: name },
  };
}

/** The habits a user can link to a System category (active ones). A domain READ, exposed here so UI never touches the store. */
export async function listLinkableHabits(): Promise<Array<Pick<Habit, "id" | "name">>> {
  return (await dbGetAll("habits")).filter((h) => !h.archived).map((h) => ({ id: h.id, name: h.name }));
}

export const habitsIntegration: Integration = {
  id: "habits",
  stores: ["habitEntries"],

  async onWrite(e) {
    if (e.store !== "habitEntries" || e.op !== "put") return [];
    const entry = e.value as Partial<HabitEntry> | undefined;
    if (!entry || entry.done !== true || typeof entry.habitId !== "string") return [];
    const habit = await dbGet("habits", entry.habitId);
    const ev = habitCompletedEvent(habit, entry, Date.now());
    return ev ? [ev] : [];
  },

  async reconcile({ dates }) {
    // habitEntries has no date index; entries are keyed `${habitId}:${date}`, so look each
    // (habit, recent date) pair up directly instead of scanning the whole store.
    const habits = await dbGetAll("habits");
    const now = Date.now();
    const out: LifeEvent[] = [];
    for (const h of habits) {
      for (const d of dates) {
        const ev = habitCompletedEvent(h, await dbGet("habitEntries", `${h.id}:${d}`), now);
        if (ev) out.push(ev);
      }
    }
    return out;
  },
};
