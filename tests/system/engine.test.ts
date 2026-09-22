/* Phase 1 — the new pure engine: dates/eligibility, ids, events, reward rules + caps,
   ledger projection, profile repair, and validity of the CONFIG itself. No storage. */
import assert from "node:assert/strict";
import { createRunner } from "./helpers";
import { ELIGIBLE_DAYS_BACK, REWARD_RULES, STAT_DEFS, STAT_IDS, XP_TIERS, INITIAL_STAT_VALUE, isXpTier, xpForTier } from "@/lib/system/config";
import { addDays, applyLedgerEntry, goalMilestoneCompletedId, createProfile, dateOfTimestamp, dedupeEvents, describeGains, emptyProjection, evaluateRewards, foldLedger, habitCompletedId, isEligibleDate, isProjectionStale, isValidDate, isValidEvent, ledgerId, normalizeProfile, normalizeProjection, recentDates, resolveAttributes, sanitizeGains, taskCompletedId, tradingEventId } from "@/lib/system/engine";
import type { LifeEvent, RewardRule } from "@/types/system";

const { t, done } = createRunner("engine");
const ev = (over: Partial<LifeEvent> = {}): LifeEvent => ({ eventId: "habit.completed:h1:2026-09-19", source: "habits", type: "habit.completed", date: "2026-09-19", timestamp: 1, title: "Exercise", metadata: { habitId: "h1", habitName: "Exercise" }, ...over });
const NO_LINKS = { habitLinks: {} };

/* ---------- config validity ---------- */
t("config: every reward rule references a REAL XP tier, has a positive XP value and a sane cap", () => {
  for (const r of REWARD_RULES) { assert.ok(isXpTier(r.tier), `${r.id}: unknown tier ${r.tier}`); assert.ok(xpForTier(r.tier) > 0, r.id); assert.ok(Number.isInteger(r.dailyCap) && r.dailyCap >= 1, `${r.id} cap`); }
});
t("config: rule ids are unique", () => { const ids = REWARD_RULES.map((r) => r.id); assert.equal(new Set(ids).size, ids.length); });
t("config: every stat a rule grants is a REGISTERED stat with a positive integer gain (no negatives)", () => {
  for (const r of REWARD_RULES) for (const [id, g] of Object.entries(r.stats)) { assert.ok(STAT_IDS.includes(id), `${r.id}: unknown stat ${id}`); assert.ok(Number.isInteger(g) && g > 0, `${r.id}.${id}=${g}`); }
});
t("config: the six core stats, in order, all starting at 1", () => {
  assert.deepEqual(STAT_IDS, ["strength", "intelligence", "focus", "discipline", "health", "finance"]); assert.equal(INITIAL_STAT_VALUE, 1); assert.equal(STAT_DEFS.length, 6);
  assert.deepEqual(Object.keys(emptyProjection().stats), STAT_IDS); assert.ok(Object.values(emptyProjection().stats).every((v) => v === 1));
});
t("config: rules reference XP tiers by KEY — no rule carries a raw XP number", () => {
  for (const r of REWARD_RULES) assert.equal(typeof r.tier, "string", r.id); assert.ok(!REWARD_RULES.some((r) => "xp" in (r as object)));
});
t("config: eligibility window is 'today or yesterday' (1 day back)", () => assert.equal(ELIGIBLE_DAYS_BACK, 1));
t("config: rules never reward profit — no rule matches a P&L-like event type", () => { for (const r of REWARD_RULES) assert.doesNotMatch(r.eventType, /pnl|profit|loss|win|money|p&l/i, r.id); });

/* ---------- dates & eligibility ---------- */
t("isValidDate / addDays across month, year and leap boundaries", () => {
  assert.equal(isValidDate("2026-09-19"), true); assert.equal(isValidDate("2026-02-30"), false); assert.equal(isValidDate("2026-9-1"), false); assert.equal(isValidDate(""), false);
  assert.equal(addDays("2026-03-01", -1), "2026-02-28"); assert.equal(addDays("2028-03-01", -1), "2028-02-29"); assert.equal(addDays("2026-01-01", -1), "2025-12-31"); assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.throws(() => addDays("nope", 1), /Invalid date/);
});
t("dateOfTimestamp is the UTC date (same convention as todayStr)", () => { assert.equal(dateOfTimestamp(Date.UTC(2026, 8, 19, 23, 59)), "2026-09-19"); assert.equal(dateOfTimestamp(Date.UTC(2026, 8, 20, 0, 0)), "2026-09-20"); });
t("recentDates(today, 1) = [yesterday, today]", () => assert.deepEqual(recentDates("2026-09-19", 1), ["2026-09-18", "2026-09-19"]));
t("ELIGIBILITY: today YES, yesterday YES, day before yesterday NO, tomorrow NO, ancient NO, malformed NO", () => {
  const today = "2026-09-19";
  assert.equal(isEligibleDate("2026-09-19", today, 1), true); assert.equal(isEligibleDate("2026-09-18", today, 1), true);
  assert.equal(isEligibleDate("2026-09-17", today, 1), false); assert.equal(isEligibleDate("2026-09-20", today, 1), false);
  assert.equal(isEligibleDate("2020-01-01", today, 1), false); assert.equal(isEligibleDate("garbage", today, 1), false); assert.equal(isEligibleDate("2026-09-19", "garbage", 1), false);
});
t("ELIGIBILITY works across a month boundary (today = 1st: yesterday = last day of previous month)", () => { assert.equal(isEligibleDate("2026-08-31", "2026-09-01", 1), true); assert.equal(isEligibleDate("2026-08-30", "2026-09-01", 1), false); });

/* ---------- ids & events ---------- */
t("event ids are deterministic and match the documented shapes", () => {
  assert.equal(habitCompletedId("h1", "2026-09-19"), "habit.completed:h1:2026-09-19"); assert.equal(taskCompletedId("t9"), "task.completed:t9");
  assert.equal(tradingEventId("reviewed", "2026-09-19"), "trading.reviewed:2026-09-19"); assert.equal(ledgerId("habit.study", "habit.completed:h1:2026-09-19"), "habit.study::habit.completed:h1:2026-09-19");
  assert.equal(habitCompletedId("h1", "2026-09-19"), habitCompletedId("h1", "2026-09-19"));
});
t("EVENT-ID CONTRACT: every example in the brief is produced exactly, and ids are pure functions of their inputs", () => {
  assert.equal(habitCompletedId("h1", "2026-09-19"), "habit.completed:h1:2026-09-19"); assert.equal(taskCompletedId("t9"), "task.completed:t9");
  assert.equal(tradingEventId("reviewed", "2026-09-19"), "trading.reviewed:2026-09-19"); assert.equal(goalMilestoneCompletedId("g1", "m2"), "goal.milestone.completed:g1:m2");
  for (let i = 0; i < 50; i++) assert.equal(goalMilestoneCompletedId("g1", "m2"), goalMilestoneCompletedId("g1", "m2"));
  assert.notEqual(goalMilestoneCompletedId("g1", "m2"), goalMilestoneCompletedId("g2", "m2")); assert.notEqual(habitCompletedId("h1", "2026-09-19"), habitCompletedId("h1", "2026-09-20"));
});
t("isValidEvent: accepts a good event; rejects missing id/type/source, bad date, non-scalar metadata, junk", () => {
  assert.equal(isValidEvent(ev()), true);
  for (const bad of [null, undefined, 5, "x", {}, ev({ eventId: "" }), ev({ type: "" }), ev({ source: "" }), ev({ date: "2026-13-40" }), ev({ timestamp: NaN }), ev({ metadata: { a: { b: 1 } as never } }), ev({ metadata: null as never })]) assert.equal(isValidEvent(bad), false, JSON.stringify(bad));
});
t("dedupeEvents keeps the first of each eventId", () => { const a = ev({ title: "A" }); const b = ev({ title: "B" }); assert.deepEqual(dedupeEvents([a, b]).map((e) => e.title), ["A"]); });

/* ---------- reward rules ---------- */
t("a habit LINKED to study earns the study rule (15 XP; Intelligence +1, Discipline +1)", () => {
  const d = evaluateRewards(ev(), REWARD_RULES, { habitLinks: { h1: "study" } }, {}); assert.deepEqual(d, [{ ruleId: "habit.study", xp: 15, stats: { intelligence: 1, discipline: 1 } }]);
});
t("workout link -> Strength +1, Health +1; general link -> Discipline +1; XP comes from the tier", () => {
  assert.deepEqual(evaluateRewards(ev(), REWARD_RULES, { habitLinks: { h1: "workout" } }, {}).map((x) => [x.ruleId, x.xp, x.stats]), [["habit.workout", XP_TIERS.simpleHabit.xp, { strength: 1, health: 1 }]]);
  assert.deepEqual(evaluateRewards(ev(), REWARD_RULES, { habitLinks: { h1: "general" } }, {}).map((x) => [x.ruleId, x.stats]), [["habit.general", { discipline: 1 }]]);
});
t("an UNLINKED habit earns NOTHING — and the name 'Exercise' / 'Study' is never used to guess", () => {
  for (const name of ["Exercise", "Study", "Workout", "Gym", "Read"]) assert.deepEqual(evaluateRewards(ev({ title: name, metadata: { habitId: "h1", habitName: name } }), REWARD_RULES, NO_LINKS, {}), [], name);
});
t("resolveAttributes: category comes from the user's link, or 'unlinked' — never from metadata.habitName", () => {
  assert.equal(resolveAttributes(ev(), { habitLinks: { h1: "study" } }).category, "study"); assert.equal(resolveAttributes(ev(), NO_LINKS).category, "unlinked");
  assert.equal(resolveAttributes(ev({ metadata: { habitId: "h1", category: "workout" } }), NO_LINKS).category, "unlinked", "a domain cannot smuggle in a category");
});
t("task.completed -> 10 XP, Discipline +1", () => { const d = evaluateRewards(ev({ type: "task.completed", metadata: {} }), REWARD_RULES, NO_LINKS, {}); assert.deepEqual(d, [{ ruleId: "task.done", xp: 10, stats: { discipline: 1 } }]); });
t("trading process events reward PROCESS: prepared D+1, no-trade D+2, reviewed I+1 D+1 (25 XP each)", () => {
  const g = (type: string) => evaluateRewards(ev({ type, metadata: {} }), REWARD_RULES, NO_LINKS, {});
  assert.deepEqual(g("trading.prepared").map((x) => [x.xp, x.stats]), [[25, { discipline: 1 }]]); assert.deepEqual(g("trading.noTrade").map((x) => [x.xp, x.stats]), [[25, { discipline: 2 }]]); assert.deepEqual(g("trading.reviewed").map((x) => [x.xp, x.stats]), [[25, { intelligence: 1, discipline: 1 }]]);
});
t("trading.checkedIn is a FACT with no reward (no double-dipping with 'prepared')", () => assert.deepEqual(evaluateRewards(ev({ type: "trading.checkedIn", metadata: {} }), REWARD_RULES, NO_LINKS, {}), []));
t("an unknown event type earns nothing", () => assert.deepEqual(evaluateRewards(ev({ type: "made.up", metadata: {} }), REWARD_RULES, NO_LINKS, {}), []));
t("DAILY CAP: at the cap -> nothing; below -> reward; per rule (task.done cap 5)", () => {
  const e = ev({ type: "task.completed", metadata: {} });
  assert.equal(evaluateRewards(e, REWARD_RULES, NO_LINKS, { "task.done": 4 }).length, 1); assert.equal(evaluateRewards(e, REWARD_RULES, NO_LINKS, { "task.done": 5 }).length, 0); assert.equal(evaluateRewards(e, REWARD_RULES, NO_LINKS, { "task.done": 99 }).length, 0);
  assert.equal(evaluateRewards(e, REWARD_RULES, NO_LINKS, { "habit.study": 99 }).length, 1, "another rule's usage is irrelevant");
});
t("a rule with cap 0 is disabled; a rule with an unknown tier and no stats is skipped (never NaN/negative XP)", () => {
  const rules: RewardRule[] = [{ id: "off", label: "", eventType: "x", tier: "smallTask", stats: { discipline: 1 }, dailyCap: 0 }, { id: "bad", label: "", eventType: "x", tier: "nope", stats: {}, dailyCap: 5 }, { id: "ok", label: "", eventType: "x", tier: "nope", stats: { focus: 2 }, dailyCap: 5 }];
  const d = evaluateRewards(ev({ type: "x" }), rules, NO_LINKS, {}); assert.deepEqual(d, [{ ruleId: "ok", xp: 0, stats: { focus: 2 } }]);
});
t("NO NEGATIVE REWARDS are expressible: a hostile rule with negative/NaN/fractional gains is sanitized", () => {
  const rules: RewardRule[] = [{ id: "evil", label: "", eventType: "x", tier: "smallTask", stats: { strength: -5, focus: NaN as never, health: 0.4, discipline: 2.9 }, dailyCap: 1 }];
  assert.deepEqual(evaluateRewards(ev({ type: "x" }), rules, NO_LINKS, {}), [{ ruleId: "evil", xp: 10, stats: { discipline: 2 } }]);
  assert.deepEqual(sanitizeGains({ a: -1, b: NaN as never, c: "3" as never, d: Infinity as never }), { c: 3 });
});
t("no reward engine input can produce a negative XP or a negative stat gain (fuzz: 2,000 random rules/events)", () => {
  for (let i = 0; i < 2000; i++) {
    const rnd = () => [(Math.random() - 0.5) * 100, NaN, -Infinity, "x", null, 7][Math.floor(Math.random() * 6)] as never;
    const rule: RewardRule = { id: "r", label: "", eventType: "x", tier: ["smallTask", "nope", "bossQuest", ""][i % 4], stats: { strength: rnd(), focus: rnd() }, dailyCap: rnd() };
    for (const d of evaluateRewards(ev({ type: "x" }), [rule], NO_LINKS, { r: rnd() })) { assert.ok(d.xp >= 0 && Number.isFinite(d.xp)); for (const g of Object.values(d.stats)) assert.ok(g > 0 && Number.isInteger(g)); }
  }
});
t("evaluateRewards is pure: same input twice -> identical output; inputs not mutated", () => {
  const usage = { "task.done": 1 }; const snap = JSON.stringify([REWARD_RULES, usage]); const e = ev({ type: "task.completed", metadata: {} });
  assert.deepEqual(evaluateRewards(e, REWARD_RULES, NO_LINKS, usage), evaluateRewards(e, REWARD_RULES, NO_LINKS, usage)); assert.equal(JSON.stringify([REWARD_RULES, usage]), snap);
});

/* ---------- projection (ledger fold) ---------- */
const row = (xp: number, stats: Record<string, number>) => ({ xp, stats });
t("emptyProjection: 0 XP, six stats at 1, ledgerCount 0", () => { const p = emptyProjection(); assert.equal(p.totalXp, 0); assert.equal(p.ledgerCount, 0); });
t("applyLedgerEntry adds XP and gains, counts the row, and does not mutate the input", () => {
  const p = emptyProjection(); const snap = JSON.stringify(p); const n = applyLedgerEntry(p, row(15, { intelligence: 1, discipline: 1 }));
  assert.equal(n.totalXp, 15); assert.equal(n.stats.intelligence, 2); assert.equal(n.stats.discipline, 2); assert.equal(n.stats.strength, 1); assert.equal(n.ledgerCount, 1); assert.equal(JSON.stringify(p), snap);
});
t("foldLedger == applying each row in order; stats never decrease; unknown stat ids are kept starting at 1", () => {
  const rows = [row(10, { discipline: 1 }), row(25, { discipline: 2 }), row(15, { futureStat: 3 })]; const f = foldLedger(rows);
  assert.equal(f.totalXp, 50); assert.equal(f.stats.discipline, 4); assert.equal(f.stats.futureStat, 4); assert.equal(f.ledgerCount, 3);
  let p = emptyProjection(); for (const r of rows) p = applyLedgerEntry(p, r); assert.deepEqual(p, f);
});
t("a ledger row with negative XP / negative gains folds as zero (cannot reduce the projection)", () => { const f = foldLedger([row(-500, { strength: -9 })]); assert.equal(f.totalXp, 0); assert.equal(f.stats.strength, 1); });
t("isProjectionStale: detects a count mismatch, a missing cache and junk", () => {
  const p = foldLedger([row(10, { discipline: 1 })]); assert.equal(isProjectionStale(p, 1), false); assert.equal(isProjectionStale(p, 2), true); assert.equal(isProjectionStale(p, 0), true); assert.equal(isProjectionStale(undefined, 0), true); assert.equal(isProjectionStale(null, 5), true);
});
t("normalizeProjection repairs junk (missing stats -> 1, bad numbers -> safe)", () => {
  const p = normalizeProjection({ totalXp: "lots", stats: { strength: -4, focus: 9, health: NaN }, ledgerCount: -2 }); assert.equal(p.totalXp, 0); assert.equal(p.stats.strength, 1); assert.equal(p.stats.focus, 9); assert.equal(p.stats.health, 1); assert.equal(p.stats.finance, 1); assert.equal(p.ledgerCount, 0);
});

/* ---------- profile ---------- */
t("createProfile: fresh, no links, empty projection; normalizeProfile repairs junk and keeps unknown fields", () => {
  const p = createProfile(5); assert.equal(p.id, "profile"); assert.deepEqual(p.settings.habitLinks, {}); assert.equal(p.projection.totalXp, 0);
  const n = normalizeProfile({ id: "x", futureField: { a: 1 }, settings: { habitLinks: { h1: "study", h2: "bogus", h3: "workout" } }, projection: "garbage" }, 9) as never as Record<string, unknown> & ReturnType<typeof createProfile>;
  assert.equal(n.id, "profile"); assert.deepEqual(n.futureField, { a: 1 }); assert.deepEqual(n.settings.habitLinks, { h1: "study", h3: "workout" }); assert.equal(n.projection.totalXp, 0);
  for (const bad of [null, undefined, 42, "x", []]) assert.equal(normalizeProfile(bad).projection.ledgerCount, 0);
});
t("describeGains: registry order, ignores junk", () => { assert.equal(describeGains({ discipline: 1, intelligence: 2 }), "Intelligence +2 · Discipline +1"); assert.equal(describeGains({ strength: -3 } as never), ""); assert.equal(describeGains(undefined), ""); });
done();
