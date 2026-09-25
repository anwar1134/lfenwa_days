/* Ported from the prototype: the pure level / progression maths and its tests.
   (Only the level + XP-tier cases; nothing of the prototype's stores or quests is carried over.) */
import assert from "node:assert/strict";
import { LEVEL_THRESHOLDS } from "@/lib/system/config/levels";
import { XP_TIERS } from "@/lib/system/config/xp";
import { xpForLevel, levelFromXp, getLevelProgress, formatXp, toNonNegativeInt } from "@/lib/system/engine";

let pass = 0, fail = 0;
function t(name: string, fn: () => void) { try { fn(); pass++; console.log("PASS", name); } catch (e) { fail++; console.log("FAIL", name, "\n   ", (e as Error).message.split("\n")[0]); } }

// --- the spec's exact table
const SPEC = [0,100,250,450,700,1000,1350,1750,2200,2700];
t("config table equals the spec table exactly", () => assert.deepEqual([...LEVEL_THRESHOLDS], SPEC));
t("xpForLevel(1..10) matches spec", () => SPEC.forEach((xp, i) => assert.equal(xpForLevel(i + 1), xp)));
t("levelFromXp at each threshold = that level; one below = previous", () => {
  SPEC.forEach((xp, i) => { assert.equal(levelFromXp(xp), i + 1); if (i > 0) assert.equal(levelFromXp(xp - 1), i); });
});
// --- extension beyond the table
t("extension continues the curve: L11=3250 (gap 550), L12=3850 (gap 600)", () => { assert.equal(xpForLevel(11), 3250); assert.equal(xpForLevel(12), 3850); });
t("closed form 25*L*(L+1)-50 holds for L=1..300 (table + extension agree)", () => {
  for (let L = 1; L <= 300; L++) assert.equal(xpForLevel(L), 25 * L * (L + 1) - 50, `L=${L}`);
});
t("levelFromXp and xpForLevel are inverse for L=1..300 (boundary and boundary-1)", () => {
  for (let L = 1; L <= 300; L++) { const x = xpForLevel(L); assert.equal(levelFromXp(x), L); if (L > 1) assert.equal(levelFromXp(x - 1), L - 1); }
});
t("boundaries around the table end: 2699->L9, 2700->L10, 3249->L10, 3250->L11", () => {
  assert.equal(levelFromXp(2699), 9); assert.equal(levelFromXp(2700), 10); assert.equal(levelFromXp(3249), 10); assert.equal(levelFromXp(3250), 11);
});
// --- progress numbers (the spec's example figures: 1,240 / 1,350)
t("getLevelProgress(1240): L6, 1240/1350, 110 to go, 240 of 350", () => {
  const p = getLevelProgress(1240);
  assert.equal(p.level, 6); assert.equal(p.nextLevelXp, 1350); assert.equal(p.xpToNext, 110);
  assert.equal(p.levelStartXp, 1000); assert.equal(p.xpIntoLevel, 240); assert.equal(p.xpSpan, 350);
  assert.ok(Math.abs(p.fraction - 240 / 350) < 1e-12);
});
t("getLevelProgress(0): L1, 0%, 100 to go", () => { const p = getLevelProgress(0); assert.equal(p.level, 1); assert.equal(p.fraction, 0); assert.equal(p.xpToNext, 100); });
t("fraction is 0 exactly at a level boundary and never reaches 1", () => { const p = getLevelProgress(1350); assert.equal(p.level, 7); assert.equal(p.fraction, 0); const q = getLevelProgress(1349); assert.ok(q.fraction < 1 && q.fraction > 0.99); });
// --- hostile input
t("NaN / -5 / Infinity / 'abc' / undefined / null all -> level 1 (no throw)", () => {
  for (const bad of [NaN, -5, Infinity, -Infinity, "abc", undefined, null] as unknown[]) assert.equal(levelFromXp(bad as number), 1);
});
t("huge finite XP (1e15) returns quickly with an integer level", () => {
  const s = Date.now(); const L = levelFromXp(1e15); const ms = Date.now() - s;
  assert.ok(Number.isInteger(L) && L > 1); assert.ok(ms < 1000, `took ${ms}ms`);
});
t("fractional XP is floored", () => assert.equal(levelFromXp(99.9), 1));
t("xpForLevel(0 / -3 / NaN) clamps to level 1 (0 XP)", () => { assert.equal(xpForLevel(0), 0); assert.equal(xpForLevel(-3), 0); assert.equal(xpForLevel(NaN), 0); });
// --- XP table = the spec
t("XP tiers equal the current spec, including shortQuest", () => {
  assert.deepEqual(Object.values(XP_TIERS).map((x) => x.xp), [10, 15, 25, 20, 30, 50, 75, 150, 300]);
});
t("formatXp is locale-independent: 1240 -> '1,240'", () => { assert.equal(formatXp(1240), "1,240"); assert.equal(formatXp(-4), "0"); });
t("toNonNegativeInt basics", () => { assert.equal(toNonNegativeInt("12"), 12); assert.equal(toNonNegativeInt(-1), 0); assert.equal(toNonNegativeInt(3.7), 3); });
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail || pass === 0 ? 1 : 0);
