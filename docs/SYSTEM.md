# Lfenwa System

A progression layer **inside** Lfnawa Days:

    Action → Quest → Completion → XP + Stats → Level → Achievements → Notifications

It adds to the app; it replaces nothing. Existing screens, data, and the
embedded Lfenwa Trades module are untouched.

## Status by phase

| Phase | Scope | State |
|---|---|---|
| 1 | Types, persistence, XP + level maths, six stats, System status screen | **done** |
| 2 | Daily quests, quest completion, System activity, Today section | **done** |
| 3 | Weekly quests, boss quests, streaks, achievements | planned |
| 4 | Notifications, Habits/Learning/Money/Goals integrations, polish | planned |

## Where things live

| Path | Role |
|---|---|
| `types/system.ts` | Types only (profile, quest, event, award, level progress) |
| `lib/system/config.ts` | **All tunable numbers**: XP tiers, level thresholds, stat list |
| `lib/system/engine.ts` | Pure functions: level maths, profile create/normalise, apply award |
| `lib/system/store.ts` | **The System's service boundary** — the only module UI calls: profile, `awardXp`, `ensureDailyQuests`, `completeQuest`, event queries |
| `components/life/system/` | UI: `SystemStatus`, `XpProgress`, `StatsGrid`, `DailyQuestsPanel` (+ `useDailyQuests`), `TodaySystemSection`, `SystemBoundary`, `theme` |
| `tests/system/` | Test suites + `run.sh` (see "Verification") |
| `app/system/page.tsx` | Route (same pattern as the other tabs) |

## Storage (lfnawaDaysDB, version 2)

Three stores were added in **one** additive bump (v1 → v2), so later phases
need no further schema change:

| Store | Key | Holds |
|---|---|---|
| `system` | `id` | one row, `id: "profile"`: `totalXp`, `stats`, timestamps |
| `quests` | `id` (+ `by_date`) | quests (Phase 2+) |
| `systemEvents` | `id` (+ `by_date`) | append-only XP log |

The existing `onupgradeneeded` handler only creates stores that are missing,
so every v1 store and row is left exactly as it was (verified against a
database created by the previous build — see "Verification").

**Known trade-off — no downgrades.** IndexedDB refuses to open a database at a
lower version than it already has. A build that still says `DB_VERSION = 1`
will fail on a profile that has been upgraded: it throws
`The requested version (1) is less than the existing version (2)` and sits on
"Loading…". No data is lost, and opening the profile with a v2+ build again
restores everything. This bites when switching between a System branch and an
older branch on the **same origin** (e.g. `localhost:3000`).

**Upgrade can be blocked** if a tab running the old build is still open on the
same origin; close/reload it.

`esOrderFlowJournal` (Lfenwa Trades) is never opened for writing and is never
created by any System code.

## Data rules

- **Level is derived** from `totalXp`; it is never stored.
- **No negative XP or stat loss**, enforced in the engine (not just the UI).
- **`awardXp` is atomic and idempotent.** The event and the profile update are
  one IndexedDB transaction; `eventId` is the idempotency key. Use
  deterministic ids for anything that can be repeated, e.g.
  `habit:<habitId>:<date>` or `quest:<questId>`, so toggling or double-tapping
  can never award twice.
- **The profile is created lazily**, only if none exists (race-safe), with all
  stats at 1. Nothing is initialised over existing data.
- Day boundaries use `todayStr()` (a UTC date) like the rest of the app, so
  quests line up with tasks and habits.

## Daily quests (Phase 2)

**Model** (`SystemQuest`): `id, type, date, title, description, category,
status, xpReward, statRewards, completedAt, definitionId`. `type` is
`daily | weekly | one-time | boss`; Phase 2 only creates `daily`. Status is
`pending | completed` (`failed` is reserved and never set). Rewards are
*copied* onto the quest when it is generated, so rebalancing `config.ts` never
rewrites history.

**Definitions** live in `lib/system/config.ts` (`DAILY_QUEST_DEFINITIONS`);
XP reuses `XP_TIERS` where a reward matches a tier. A day's set = every `core`
definition + a rotating window of the others, up to `DAILY_QUEST_COUNT` (4),
clamped to 3–5. The rotation depends only on the date — same date, same set;
no randomness and nothing adaptive yet.

**Generation** (`ensureDailyQuests`) is idempotent: ids are deterministic
(`daily:<date>:<definitionId>`); the insert runs in one transaction that
re-checks "does this day already have daily quests?" and uses `store.add`
(never `put`), so Today + System + double effects + two tabs cannot duplicate,
and a completed quest can never be reset. A day is generated once; later
changes to the definitions only affect future days.

**Completion** (`completeQuest`) is the *only* way a quest completes. One
transaction covers the quest row, the profile and the XP log: check not
already completed → grant XP + stats through the **same** internal function
`awardXp` uses (`applyAwardInTransaction`) with event id `quest:<questId>` →
mark completed. Second click, second tab, reload: no additional reward. There
is no undo, and XP is never removed.

**UI.** `DailyQuestsPanel` (one component, one hook) is used by both the
System screen ("Today's Quests") and Today (compact). Today wraps its section
in `SystemBoundary` and it loads its own data, so a System failure cannot
affect Today's existing content.

## Levels

Table (total XP to reach): 0, 100, 250, 450, 700, 1000, 1350, 1750, 2200, 2700
for levels 1–10. Beyond the table each level costs 50 more than the previous
one (L10→11 = 550, L11→12 = 600 …), which is the rule the table already
follows, so the curve never caps. The UI shows `total XP / XP for next level`;
the bar shows progress through the *current* level.

## Backup / restore

The System stores are covered by `exportFullBackup()` automatically (it walks
`STORES`), including the desktop auto-backup hook. Old backups still import:
absent keys are simply skipped. In **replace** mode a System store is cleared
only if the backup actually carries it, so restoring a pre-System backup can
not wipe System progress. In **merge** mode the single profile row is only
replaced by a profile with *more* XP, so merging an older backup can never
roll progress back (a quest row may revert to pending, but re-completing it
cannot double-award: the XP log still holds `quest:<id>`). The backup `schema`
stays `1`.

## Verification (Phase 1 + Phase 2)

Run everything with `bash tests/system/run.sh` (add `--e2e` for the browser
suite after `npm run build`). The runner installs `tsx` and `fake-indexeddb`
into a temp directory — the project's `package.json` is not touched, and
`tests/` is excluded from the project's `tsc`.

- `npm run typecheck`, `npm run build`, `npm run lint`: clean.
- Pure logic: level table/boundaries/hostile input; quest definitions,
  selection, determinism over 800 dates, completion transitions.
- Storage (in-memory IndexedDB): v1→v2 upgrade with real-shaped data, concurrent
  generation and completion, rollback, persistence read through an independent
  connection, backup import/export (replace + merge). Safeguards were
  mutation-tested (each deliberately broken → the right tests fail).
- Real headless Chromium: database created by the previous build upgraded by
  this one with every row verified identical; quests, completion, two-tab race,
  double-click, reload; Today with System storage forced to fail; all existing
  screens; Quick Switch to Trades and back; 390 px / 320 px layouts.
- **Not verified:** a real Android device, the Electron shell, and the
  service-worker update path (the service worker was blocked in the browser
  test; `public/sw.js` is unchanged).
