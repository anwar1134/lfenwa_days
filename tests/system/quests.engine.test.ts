/* Phase 2 — pure quest logic (no storage): definitions, selection, generation, completion transitions. */
import assert from "node:assert/strict";
import { createRunner } from "./helpers";
import { DAILY_QUEST_COUNT, DAILY_QUEST_DEFINITIONS, MAX_DAILY_QUESTS, MIN_DAILY_QUESTS, STAT_KEYS, XP_TIERS } from "@/lib/system/config";
import { buildDailyQuests, canCompleteQuest, dailyQuestId, dayNumber, describeStatGains, markQuestCompleted, questRewardEventId, questToAward, selectDailyDefinitions, sortQuests, summarizeQuests } from "@/lib/system/engine";
import type { SystemQuest } from "@/types/system";

const { t, done } = createRunner("quests:engine");
const isPosInt = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n > 0;
function* dates(from: string, days: number) { const d = new Date(from + "T00:00:00Z"); for (let i = 0; i < days; i++) { yield d.toISOString().slice(0, 10); d.setUTCDate(d.getUTCDate() + 1); } }

/* ---------- definitions ---------- */
t("definitions: unique ids, non-empty text, type 'daily', at least MIN+ available", () => {
  const ids = DAILY_QUEST_DEFINITIONS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const d of DAILY_QUEST_DEFINITIONS) { assert.ok(d.id && d.title.trim() && d.description.trim() && d.category.trim(), d.id); assert.equal(d.type, "daily"); }
  assert.ok(DAILY_QUEST_DEFINITIONS.length >= MIN_DAILY_QUESTS);
});
t("definitions: every XP reward is a positive integer (and <= the biggest single tier, 300)", () => {
  for (const d of DAILY_QUEST_DEFINITIONS) { assert.ok(isPosInt(d.xp), `${d.id} xp=${d.xp}`); assert.ok(d.xp <= XP_TIERS.bossQuest.xp, d.id); }
});
t("definitions: every stat reward is a KNOWN stat with a positive integer gain; at least one stat each", () => {
  for (const d of DAILY_QUEST_DEFINITIONS) {
    const entries = Object.entries(d.stats); assert.ok(entries.length >= 1, d.id);
    for (const [k, v] of entries) { assert.ok((STAT_KEYS as readonly string[]).includes(k), `${d.id}: unknown stat ${k}`); assert.ok(isPosInt(v), `${d.id}.${k}=${v}`); }
  }
});
t("definitions match the spec's examples exactly", () => {
  const by = Object.fromEntries(DAILY_QUEST_DEFINITIONS.map((d) => [d.id, d]));
  assert.deepEqual([by["study-30"].xp, by["study-30"].stats], [30, { intelligence: 2, discipline: 1 }]);
  assert.deepEqual([by["workout"].xp, by["workout"].stats], [30, { strength: 2, health: 1 }]);
  assert.deepEqual([by["focus-30"].xp, by["focus-30"].stats], [30, { focus: 2, discipline: 1 }]);
  assert.deepEqual([by["morning-routine"].xp, by["morning-routine"].stats], [20, { discipline: 2 }]);
  assert.deepEqual([by["track-spending"].xp, by["track-spending"].stats], [15, { finance: 1 }]);
});
t("rewards reuse the central XP tiers where they match (no stray copies of 30 / 15)", () => {
  const by = Object.fromEntries(DAILY_QUEST_DEFINITIONS.map((d) => [d.id, d]));
  assert.equal(by["study-30"].xp, XP_TIERS.session30.xp); assert.equal(by["track-spending"].xp, XP_TIERS.simpleHabit.xp);
});
t("config: DAILY_QUEST_COUNT is within [MIN, MAX]", () => assert.ok(DAILY_QUEST_COUNT >= MIN_DAILY_QUESTS && DAILY_QUEST_COUNT <= MAX_DAILY_QUESTS));

/* ---------- selection / generation ---------- */
t("every day for 800 days (across leap day + year ends) yields 3..5 quests, all with unique ids", () => {
  let n = 0;
  for (const d of dates("2027-12-01", 800)) { const qs = buildDailyQuests(d); assert.ok(qs.length >= 3 && qs.length <= 5, `${d}: ${qs.length}`); assert.equal(new Set(qs.map((q) => q.id)).size, qs.length); n++; }
  assert.equal(n, 800);
});
t("deterministic: the same date always gives the identical set (deep-equal, repeated)", () => {
  for (const d of ["2026-09-19", "2028-02-29", "2030-01-01"]) { const a = buildDailyQuests(d); for (let i = 0; i < 5; i++) assert.deepEqual(buildDailyQuests(d), a); }
});
t("deterministic ids: daily:<date>:<definition>", () => { assert.equal(dailyQuestId("2026-09-19", "study-30"), "daily:2026-09-19:study-30"); assert.ok(buildDailyQuests("2026-09-19").some((q) => q.id === "daily:2026-09-19:study-30")); });
t("every core definition is present every single day", () => {
  const core = DAILY_QUEST_DEFINITIONS.filter((d) => d.core).map((d) => d.id);
  for (const d of dates("2026-01-01", 400)) { const ids = new Set(buildDailyQuests(d).map((q) => q.definitionId)); for (const c of core) assert.ok(ids.has(c!), `${d} missing ${c}`); }
});
t("rotation: every non-core definition shows up (variety), and consecutive days are not all identical", () => {
  const rot = DAILY_QUEST_DEFINITIONS.filter((d) => !d.core).map((d) => d.id); const seen = new Set<string>(); const signatures = new Set<string>();
  for (const d of dates("2026-09-01", 30)) { const ids = buildDailyQuests(d).map((q) => q.definitionId!); ids.filter((i) => rot.includes(i)).forEach((i) => seen.add(i)); signatures.add(ids.join(",")); }
  assert.deepEqual([...seen].sort(), [...rot].sort()); assert.ok(signatures.size > 1);
});
t("count is clamped to [3,5] whatever is asked (1 -> 3, 99 -> 5)", () => {
  assert.equal(selectDailyDefinitions("2026-09-19", DAILY_QUEST_DEFINITIONS, 1).length, 3);
  assert.equal(selectDailyDefinitions("2026-09-19", DAILY_QUEST_DEFINITIONS, 99).length, 5);
  assert.equal(selectDailyDefinitions("2026-09-19", DAILY_QUEST_DEFINITIONS, 4).length, 4);
});
t("generated quests: pending, no completedAt, rewards copied from the definition, definitionId recorded", () => {
  for (const q of buildDailyQuests("2026-09-19")) {
    const def = DAILY_QUEST_DEFINITIONS.find((d) => d.id === q.definitionId)!;
    assert.equal(q.status, "pending"); assert.equal(q.completedAt, null); assert.equal(q.type, "daily"); assert.equal(q.date, "2026-09-19");
    assert.equal(q.xpReward, def.xp); assert.deepEqual(q.statRewards, def.stats); assert.equal(q.title, def.title);
  }
});
t("generated quests do not alias config objects (mutating one cannot change the definitions)", () => {
  const q = buildDailyQuests("2026-09-19")[0]; const before = JSON.stringify(DAILY_QUEST_DEFINITIONS);
  (q.statRewards as Record<string, number>).strength = 999; q.xpReward = 12345; assert.equal(JSON.stringify(DAILY_QUEST_DEFINITIONS), before);
});
t("invalid dates are rejected (bad format, month 13, Feb 30, empty)", () => { for (const bad of ["", "abc", "2026-13-01", "2026-02-30", "2026-9-1", "19-09-2026"]) assert.throws(() => buildDailyQuests(bad), /Invalid date/, bad); });
t("dayNumber: epoch = 0, next day = 1, timezone-free and matches Date.UTC", () => { assert.equal(dayNumber("1970-01-01"), 0); assert.equal(dayNumber("1970-01-02"), 1); assert.equal(dayNumber("2026-09-19"), Math.floor(Date.UTC(2026, 8, 19) / 86400000)); });
t("the quest model can express future types without a shape change (weekly / one-time / boss are valid values)", () => {
  const q: SystemQuest = { id: "x", type: "boss", date: "2026-09-19", title: "T", status: "pending", xpReward: 300, statRewards: {}, completedAt: null }; const types: SystemQuest["type"][] = ["daily", "weekly", "one-time", "boss"]; assert.equal(types.length, 4); assert.equal(q.type, "boss");
});

/* ---------- completion transitions (pure) ---------- */
const q0 = () => buildDailyQuests("2026-09-19").find((q) => q.definitionId === "study-30")!;
t("canCompleteQuest: pending -> true, completed -> false", () => { assert.equal(canCompleteQuest(q0()), true); assert.equal(canCompleteQuest({ ...q0(), status: "completed" }), false); });
t("markQuestCompleted returns a NEW completed quest with completedAt; input untouched", () => {
  const q = q0(); const snap = JSON.stringify(q); const d = markQuestCompleted(q, 1234);
  assert.equal(d.status, "completed"); assert.equal(d.completedAt, 1234); assert.equal(JSON.stringify(q), snap); assert.notEqual(d, q);
});
t("questToAward: deterministic event id quest:<questId>, source quest, xp + stats straight from the quest", () => {
  const q = q0(); const a = questToAward(q);
  assert.equal(a.eventId, "quest:daily:2026-09-19:study-30"); assert.equal(a.eventId, questRewardEventId(q.id)); assert.equal(a.source, "quest"); assert.equal(a.sourceId, q.id);
  assert.equal(a.label, "Study 30 minutes"); assert.equal(a.xp, 30); assert.deepEqual(a.stats, { intelligence: 2, discipline: 1 }); assert.equal(a.date, "2026-09-19");
});
t("summarizeQuests: counts, XP earned, XP still available", () => {
  const qs = buildDailyQuests("2026-09-19"); const total = qs.reduce((s, q) => s + q.xpReward, 0);
  assert.deepEqual(summarizeQuests(qs), { total: qs.length, completed: 0, xpAvailable: total, xpEarned: 0 });
  const s = summarizeQuests([markQuestCompleted(qs[0]), ...qs.slice(1)]); assert.equal(s.completed, 1); assert.equal(s.xpEarned, qs[0].xpReward); assert.equal(s.xpAvailable, total - qs[0].xpReward);
  assert.deepEqual(summarizeQuests([]), { total: 0, completed: 0, xpAvailable: 0, xpEarned: 0 });
});
t("sortQuests: stable definition order regardless of input order; does not mutate", () => {
  const qs = buildDailyQuests("2026-09-19"); const shuffled = [...qs].reverse(); const snap = JSON.stringify(shuffled);
  assert.deepEqual(sortQuests(shuffled).map((q) => q.id), qs.map((q) => q.id)); assert.equal(JSON.stringify(shuffled), snap);
});
t("describeStatGains: fixed stat order, ignores junk", () => {
  assert.equal(describeStatGains({ discipline: 1, intelligence: 2 }), "Intelligence +2 · Discipline +1"); assert.equal(describeStatGains({}), ""); assert.equal(describeStatGains(undefined), "");
  assert.equal(describeStatGains({ strength: -3, health: 0 } as never), "");
});
done();
