/* Deterministic ids. The same real-world fact must always map to the same id
   (whichever trigger or tab noticed it) — that is the whole idempotency story. */

export const habitCompletedId = (habitId: string, date: string) => `habit.completed:${habitId}:${date}`;
export const taskCompletedId = (taskId: string) => `task.completed:${taskId}`;
// Part of the event-id contract. Only the id shape lives here in Phase 1; the Goals integration that emits it is Phase 2.
export const goalMilestoneCompletedId = (goalId: string, milestoneId: string) => `goal.milestone.completed:${goalId}:${milestoneId}`;
export const tradingEventId = (kind: "prepared" | "checkedIn" | "noTrade" | "reviewed", date: string) => `trading.${kind}:${date}`;

/** One ledger row per (rule, event): a second award for the same pair cannot exist. */
export const ledgerId = (ruleId: string, eventId: string) => `${ruleId}::${eventId}`;
