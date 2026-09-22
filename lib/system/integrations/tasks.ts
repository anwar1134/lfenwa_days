/* Tasks → facts. Tasks are the one domain that records WHEN something was completed
   (completedAt), so the event belongs to the day it was actually completed. */
import { dbGetByDateRange } from "@/lib/storage";
import type { TaskEntry } from "@/types/life";
import type { LifeEvent } from "@/types/system";
import { addDays, dateOfTimestamp, isEligibleDate, isValidDate, taskCompletedId } from "../engine";
import { TASK_SCAN_BAND_DAYS } from "../config";
import type { Integration } from "./types";

/** PURE. null unless the task is done. Reopening a task never produces (or removes) an event. */
export function taskCompletedEvent(task: Partial<TaskEntry> | null | undefined, now: number): LifeEvent | null {
  if (!task || task.status !== "done") return null;
  if (typeof task.id !== "string" || task.id === "") return null;
  const completedAt = typeof task.completedAt === "number" && Number.isFinite(task.completedAt) && task.completedAt > 0 ? task.completedAt : undefined;
  const date = completedAt !== undefined ? dateOfTimestamp(completedAt) : typeof task.date === "string" ? task.date : "";
  if (!isValidDate(date)) return null;
  const ev: LifeEvent = {
    eventId: taskCompletedId(task.id),
    source: "tasks",
    type: "task.completed",
    date,
    timestamp: now,
    title: (task.text || "").trim().slice(0, 120) || "Task",
    ref: { domain: "life", store: "tasks", id: task.id },
    metadata: { taskDate: typeof task.date === "string" ? task.date : date },
  };
  if (completedAt !== undefined) ev.occurredAt = completedAt;
  return ev;
}

export const tasksIntegration: Integration = {
  id: "tasks",
  stores: ["tasks"],

  async onWrite(e) {
    if (e.store !== "tasks" || e.op !== "put") return [];
    const ev = taskCompletedEvent(e.value as Partial<TaskEntry>, Date.now());
    return ev ? [ev] : [];
  },

  async reconcile({ today, dates }) {
    // A task is dated for the day it was PLANNED, but the event belongs to the day it was
    // COMPLETED — so scan a band of planned dates around today, then keep only events that
    // can still earn XP.
    const tasks = await dbGetByDateRange("tasks", addDays(today, -TASK_SCAN_BAND_DAYS), addDays(today, TASK_SCAN_BAND_DAYS));
    const now = Date.now();
    const out: LifeEvent[] = [];
    for (const t of tasks) {
      const ev = taskCompletedEvent(t, now);
      if (ev && isEligibleDate(ev.date, today, dates.length - 1)) out.push(ev);
    }
    return out;
  },
};
