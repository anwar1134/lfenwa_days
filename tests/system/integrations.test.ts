/* Phase 1 — integration derivations (PURE): habits, tasks, and the provisional Trading adapter. */
import assert from "node:assert/strict";
import { createRunner } from "./helpers";
import { habitCompletedEvent } from "@/lib/system/integrations/habits";
import { taskCompletedEvent } from "@/lib/system/integrations/tasks";
import { deriveTradingEvents, hasContent, summarizeTradingDay } from "@/lib/system/integrations/trading";
import { isValidEvent } from "@/lib/system/engine";

const { t, done } = createRunner("integrations");
const T = "2026-09-19", Y = "2026-09-18";

/* ---------- habits ---------- */
t("habit: a completed entry -> a deterministic, valid fact with a pointer (not a copy)", () => {
  const e = habitCompletedEvent({ id: "h1", name: "Exercise" }, { id: `h1:${T}`, habitId: "h1", date: T, done: true }, 123)!;
  assert.equal(e.eventId, `habit.completed:h1:${T}`); assert.equal(e.type, "habit.completed"); assert.equal(e.source, "habits"); assert.equal(e.date, T); assert.equal(e.timestamp, 123);
  assert.deepEqual(e.ref, { domain: "life", store: "habitEntries", id: `h1:${T}` }); assert.deepEqual(e.metadata, { habitId: "h1", habitName: "Exercise" }); assert.equal(e.occurredAt, undefined, "habits do not know WHEN");
  assert.equal(isValidEvent(e), true);
});
t("habit: UNCHECKED (done:false) produces NO event — unchecking can never create or remove anything", () => { assert.equal(habitCompletedEvent({ id: "h1", name: "x" }, { id: `h1:${T}`, habitId: "h1", date: T, done: false }, 1), null); });
t("habit: check -> uncheck -> recheck all map to the SAME event id (so XP cannot duplicate)", () => {
  const a = habitCompletedEvent(null, { habitId: "h1", date: T, done: true }, 1)!; const b = habitCompletedEvent(null, { habitId: "h1", date: T, done: true }, 999)!; assert.equal(a.eventId, b.eventId);
});
t("habit: malformed entries (no habitId / bad date / null) -> null, never a throw", () => {
  for (const bad of [null, undefined, {}, { done: true }, { habitId: "", date: T, done: true }, { habitId: "h", date: "nope", done: true }, { habitId: "h", date: T, done: "yes" as never }]) assert.equal(habitCompletedEvent(null, bad as never, 1), null, JSON.stringify(bad));
});
t("habit: a missing/blank habit name falls back to 'Habit'", () => { assert.equal(habitCompletedEvent(null, { habitId: "h", date: T, done: true }, 1)!.title, "Habit"); assert.equal(habitCompletedEvent({ id: "h", name: "  " }, { habitId: "h", date: T, done: true }, 1)!.title, "Habit"); });

/* ---------- tasks ---------- */
const NOON = Date.UTC(2026, 8, 19, 12, 0);
t("task: done + completedAt -> event on the COMPLETION day (UTC) with occurredAt", () => {
  const e = taskCompletedEvent({ id: "t1", date: Y, text: "Write report", status: "done", completedAt: NOON }, 5)!;
  assert.equal(e.eventId, "task.completed:t1"); assert.equal(e.date, T, "planned yesterday, completed today -> today"); assert.equal(e.occurredAt, NOON); assert.equal(e.metadata.taskDate, Y); assert.equal(e.title, "Write report"); assert.equal(isValidEvent(e), true);
});
t("task: done without completedAt falls back to its planned date; no occurredAt", () => { const e = taskCompletedEvent({ id: "t1", date: Y, text: "x", status: "done", completedAt: null }, 5)!; assert.equal(e.date, Y); assert.equal(e.occurredAt, undefined); });
t("task: pending / postponed / junk -> null (reopening never creates an event)", () => {
  for (const status of ["pending", "postponed"] as const) assert.equal(taskCompletedEvent({ id: "t", date: T, text: "x", status }, 1), null);
  for (const bad of [null, undefined, {}, { id: "", status: "done", date: T }, { id: "t", status: "done", date: "junk", completedAt: null }]) assert.equal(taskCompletedEvent(bad as never, 1), null);
});
t("task: title is trimmed and capped at 120 chars; blank -> 'Task'", () => { assert.equal(taskCompletedEvent({ id: "t", date: T, text: "  hi  ", status: "done", completedAt: NOON }, 1)!.title, "hi"); assert.equal(taskCompletedEvent({ id: "t", date: T, text: "x".repeat(500), status: "done", completedAt: NOON }, 1)!.title.length, 120); assert.equal(taskCompletedEvent({ id: "t", date: T, text: " ", status: "done", completedAt: NOON }, 1)!.title, "Task"); });

/* ---------- Trading: hasContent ---------- */
t("hasContent: real entries yes; null/''/whitespace/[]/{}/all-empty no; numbers & booleans (answers) yes", () => {
  for (const yes of ["a", 0, 5, false, true, ["x"], { a: 1 }, { a: { b: "z" } }]) assert.equal(hasContent(yes), true, JSON.stringify(yes));
  for (const no of [null, undefined, "", "   ", [], {}, { a: null }, { a: "", b: [] }, { a: { b: { c: null } } }, NaN]) assert.equal(hasContent(no as never), false, JSON.stringify(no));
});

/* ---------- Trading: summaries ---------- */
const days = { [T]: { premarket: { session: "NY Open", bias: "long" }, mentalState: { sleep: 7 }, tradeNoTrade: { sleep: 7, energy: 6, riskOk: "yes" }, dailyReview: { scores: { process: 8 }, notes: "ok" } }, [Y]: { tradeNoTrade: { sleep: 3, riskOk: "no" } } };
const trades = [{ date: T, pnl: 1234.5, profit: 900, r: 2.5, followedRules: true }, { date: Y, pnl: -500 }];
const notrades = [{ date: Y, reason: "choppy" }, { date: Y, reason: "news" }, { date: T, reason: "x" }];
t("summary: exactly the six approved fields — booleans and counts, nothing else", () => {
  const s = summarizeTradingDay(T, days, trades, notrades); assert.deepEqual(Object.keys(s).sort(), ["checkedIn", "date", "noTradeCount", "prepared", "reviewed", "tradeCount"]);
  assert.deepEqual(s, { date: T, prepared: true, checkedIn: true, reviewed: true, noTradeCount: 1, tradeCount: 1 });
});
t("summary: per-date counts and flags are independent (yesterday: check-in only, 2 no-trades, 1 trade)", () => { assert.deepEqual(summarizeTradingDay(Y, days, trades, notrades), { date: Y, prepared: false, checkedIn: true, reviewed: false, noTradeCount: 2, tradeCount: 1 }); });
t("summary: NO P&L can leak — profit/pnl/R values present in the raw Trades data appear nowhere in the summary", () => {
  const json = JSON.stringify([summarizeTradingDay(T, days, trades, notrades), summarizeTradingDay(Y, days, trades, notrades)]);
  for (const leak of ["1234", "900", "2.5", "-500", "pnl", "profit"]) assert.ok(!json.includes(leak), `leaked ${leak}`);
});
t("summary: MALFORMED / missing Trades data reads as 'nothing happened' and never throws", () => {
  const empty = { date: T, prepared: false, checkedIn: false, reviewed: false, noTradeCount: 0, tradeCount: 0 };
  for (const bad of [null, undefined, "x", 5, [], [1, 2], { [T]: 5 }, { [T]: null }, { [T]: "str" }, { [T]: [] }]) assert.deepEqual(summarizeTradingDay(T, bad, bad, bad), empty, JSON.stringify(bad));
  assert.deepEqual(summarizeTradingDay(T, { [T]: { tradeNoTrade: null, dailyReview: {}, premarket: "" } }, [null, 5, "x", { date: 7 }], [[], { d: T }]), empty);
});
t("summary: a blank/untouched form is NOT completion (empty strings, nulls, empty scores)", () => {
  const s = summarizeTradingDay(T, { [T]: { tradeNoTrade: { sleep: null, riskOk: "" }, dailyReview: { scores: {}, notes: "" }, premarket: { bias: "  " } } }, [], []); assert.equal(s.checkedIn, false); assert.equal(s.reviewed, false); assert.equal(s.prepared, false);
});

/* ---------- Trading: events ---------- */
const kinds = (es: { type: string }[]) => es.map((e) => e.type).sort();
t("events: prepared / checkedIn / reviewed are emitted for the day they belong to, with deterministic ids", () => {
  const es = deriveTradingEvents({ date: T, prepared: true, checkedIn: true, reviewed: true, noTradeCount: 0, tradeCount: 0 }, T, 1);
  assert.deepEqual(kinds(es), ["trading.checkedIn", "trading.prepared", "trading.reviewed"]); assert.ok(es.every((e) => isValidEvent(e) && e.eventId === `${e.type}:${T}` && e.date === T && e.source === "trading"));
});
t("events: the Daily Review self-SCORES never matter — only that a review was completed", () => {
  const lo = summarizeTradingDay(T, { [T]: { dailyReview: { scores: { process: 1 } } } }, [], []); const hi = summarizeTradingDay(T, { [T]: { dailyReview: { scores: { process: 10 } } } }, [], []);
  assert.deepEqual(lo, hi); assert.deepEqual(deriveTradingEvents(lo, T, 1), deriveTradingEvents(hi, T, 1));
});
t("no-trade (PROVISIONAL): logged AND zero trades AND the day is over -> emitted for yesterday", () => {
  const es = deriveTradingEvents({ date: Y, prepared: false, checkedIn: false, reviewed: false, noTradeCount: 2, tradeCount: 0 }, T, 1); assert.deepEqual(kinds(es), ["trading.noTrade"]); assert.equal(es[0].metadata.noTradeCount, 2); assert.equal(es[0].metadata.definition, "provisional");
});
t("no-trade: NOT emitted for TODAY (the day isn't over — an afternoon trade would contradict a morning reward)", () => {
  assert.deepEqual(kinds(deriveTradingEvents({ date: T, prepared: false, checkedIn: false, reviewed: false, noTradeCount: 1, tradeCount: 0 }, T, 1)), []);
});
t("no-trade: NOT emitted if any trade was taken that day, or if none was logged", () => {
  assert.deepEqual(kinds(deriveTradingEvents({ date: Y, prepared: false, checkedIn: false, reviewed: false, noTradeCount: 3, tradeCount: 1 }, T, 1)), []);
  assert.deepEqual(kinds(deriveTradingEvents({ date: Y, prepared: false, checkedIn: false, reviewed: false, noTradeCount: 0, tradeCount: 0 }, T, 1)), []);
});
t("events carry only { definition:'provisional', noTradeCount? } as metadata — no money-shaped fields, ever", () => {
  const es = deriveTradingEvents({ date: Y, prepared: true, checkedIn: true, reviewed: true, noTradeCount: 1, tradeCount: 0 }, T, 1); for (const e of es) for (const k of Object.keys(e.metadata)) assert.ok(["definition", "noTradeCount"].includes(k), k);
  assert.ok(es.every((e) => e.metadata.definition === "provisional"));
});
done();
