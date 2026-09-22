# Lfenwa System — Core (Phase 1)

The System is the progression layer **underneath Lfnawa Days**. It is not a separate
app and not a game bolted on: XP and stats come only from real activity the app can
observe.

```
life activity → LifeEvent (a FACT) → reward rules (a DECISION) → XP ledger
             → profile projection → level (always derived)
```

## Rules the code follows

1. One life, one shell. Trading is a domain of Lfnawa Days; its data stays isolated.
2. A domain owns its data. The System owns progression.
3. Domains produce facts (`LifeEvent`). **Only the reward rules decide XP/stat gains.**
4. Event ids are deterministic, so processing the same fact twice can never pay twice.
5. XP has **one gate**: `processEvents()` in `lib/system/store/service.ts`.
6. **Level is derived** from lifetime XP and is never stored.
7. The engine is pure (no React, no storage). UI talks to the store layer only.

## Where things live

| Path | Role |
| --- | --- |
| `types/system.ts` | Types only |
| `lib/system/config/` | Data: XP tiers, level table, stat registry, reward rules, eligibility window |
| `lib/system/engine/` | **Pure** logic: levels, dates/eligibility, ids, event validation, reward evaluation + caps, ledger projection, profile repair, formatting |
| `lib/system/store/` | Persistence + the service (`processEvents`, `getSnapshot`, `setHabitLink`, `rebuildProjection`) and change notifications |
| `lib/system/integrations/` | Domain → facts: `habits`, `tasks`, `trading`, plus the runner (live + reconcile triggers) |
| `components/life/system/` | UI only (System screen, Today card, habit links, "what earns XP") |
| `lib/storage.ts` | Adds `subscribeToWrites` / `subscribeToBulkChange` / `withoutWriteNotifications`, `dbTransaction`, `dbGetByDateRange`, and the three stores |

## Events (facts)

```ts
interface LifeEvent {
  eventId: string;            // deterministic — also the idempotency key
  source: string;             // "habits" | "tasks" | "trading"
  type: string;               // "habit.completed" | "task.completed" | "trading.reviewed" …
  date: string;               // the day it belongs to (todayStr() convention)
  timestamp: number;          // when the System recorded it
  occurredAt?: number;        // only when the DOMAIN knows (tasks do; habits and Trades don't)
  title: string;
  ref?: { domain: string; store: string; id: string };   // a pointer, never a copy
  metadata: Record<string, string | number | boolean>;   // small, flat, never money
}
```

| Fact | Id |
| --- | --- |
| habit completed | `habit.completed:<habitId>:<date>` |
| task completed | `task.completed:<taskId>` |
| trading prepared / check-in / no-trade / review | `trading.<kind>:<date>` |
| ledger row | `<ruleId>::<eventId>` |

Unchecking a habit never removes XP. Rechecking it maps to the same id, so it never pays twice.

## Rewards

Rules are configuration (`lib/system/config/rules.ts`): event type → XP **tier** (never a raw
number) → stat gains → daily cap. Domains cannot award XP and UI code contains no XP numbers.

| Rule | Tier | Stats | Cap/day |
| --- | --- | --- | --- |
| task completed | small task (10) | Discipline +1 | 5 |
| habit linked to **Study** | simple habit (15) | Intelligence +1, Discipline +1 | 3 |
| habit linked to **Workout** | simple habit (15) | Strength +1, Health +1 | 2 |
| habit linked to **General** | simple habit (15) | Discipline +1 | 5 |
| trading preparation | medium task (25) | Discipline +1 | 1 |
| no-trade decision, no trades (completed day) | medium task (25) | Discipline +2 | 1 |
| trading review | medium task (25) | Intelligence +1, Discipline +1 | 1 |

* **Habits earn XP only when the user links them** (System screen → Habit links). A habit is
  never classified by its name. Linking a habit you already ticked today counts (it is inside
  the window). Unlinking removes nothing.
* **Eligibility:** only events dated **today or yesterday** can earn XP. Older events (and
  future-dated ones) are still recorded as facts but stay unrewarded — so existing history,
  edited old records and restored backups cannot mint XP.
* Rewards can never be negative, by construction (`sanitizeGains`, `toNonNegativeInt`).
* **Study / workout duration is never claimed.** Learning has no duration field and workouts
  have no records; evidence today is an explicitly linked habit.

## Ledger and projection

`xpLedger` is append-only (one row per `(rule, event)`). `systemProfile` holds a **cache** of
the fold of the ledger (total XP, stats, `ledgerCount`) plus the user's System settings
(habit links). If the cache disagrees with the ledger — after a merge, a restore, or any
corruption — it is rebuilt from the ledger on the next read, and the XP gate heals it before
building on it. Stats start at 1 and only increase.

## Integrations: two triggers, one idempotent result

* **Live:** after a successful `dbPut`/`dbDelete` commits, listeners are notified. A listener
  that throws or rejects can never affect the write. Screens are unchanged and unaware.
* **Reconcile** (startup, window focus, visibility, returning from Trades): each integration
  derives facts for today + yesterday. It covers missed writes, other tabs, existing recent
  records, and Trades (which cannot push).
* Both produce the same deterministic ids; the ledger key makes a second award impossible.
* Imports/restores suppress per-record notifications (decided when each write **starts**) and
  announce **one** bulk change, after which the projection is rebuilt.

## Trading boundary (protected)

```
esOrderFlowJournal → readTradesKV (existing, untouched, read-only)
                   → lib/system/integrations/trading.ts → TradingDaySummary → facts
```

* `TradingDaySummary` = `{ date, prepared, checkedIn, reviewed, noTradeCount, tradeCount }`.
  Booleans and counts only: **no profit/loss field exists**, so profit cannot be rewarded.
* The System never writes to Trades, never names its database, never modifies the bridge.
* Reads are wrapped in a timeout: the bridge parses JSON inside an IndexedDB handler, so a
  malformed value would leave its promise pending forever; the adapter treats that as "no data".
* **Provisional definitions** (verified read-only against real Trades records in Phase 2):
  prepared = Daily Prep fields filled; review = Daily Review has content (the self-*scores* never
  matter); no-trade = a no-trade logged **and** no trades that day, emitted only for **completed
  days** (a morning no-trade must not be contradicted by an afternoon trade). Every trading fact
  carries `metadata.definition = "provisional"`.

## Database (`lfnawaDaysDB` v1 → v2)

Additive only; no record is migrated, renamed or deleted.

| Store | Key | Indexes |
| --- | --- | --- |
| `systemProfile` | `id` | — |
| `lifeEvents` | `eventId` | `by_date`, `by_type` |
| `xpLedger` | `id` | `by_date`, `by_event` |

**Which version a database ends up at** (all additive; nothing is ever deleted or rewritten):

| Database found | Result |
| --- | --- |
| none (fresh install) | created at v2 with all 16 stores |
| v1 (your original) | v2, the 3 new stores added |
| **v2 left by the abandoned prototype** (its own `system` / `quests` / `systemEvents` stores, none of the Phase 1 stores) | one additive bump to **v3** that adds the 3 Phase 1 stores. The prototype stores stay in the database, **dormant and unread** (they are not exported in backups, and a Replace restore never clears them) |
| higher than the code's constant (e.g. v3 on the next start) | opened as it is (no `VersionError`) |

IndexedDB only runs an upgrade when the version *increases*, so `openDB` checks for missing stores after
opening and performs that single additive bump itself. It also closes its connection when another tab needs
to upgrade (`onversionchange`) and reopens on the next operation; a tab still running an *older* build that
holds the database open makes the upgrade wait until it is closed or reloaded.

**No downgrades.** IndexedDB refuses to open a database at a lower version. A build that still says
`DB_VERSION = 1` (your original) cannot open an upgraded profile (the data is safe; a newer build opens it).
Try the new build on a different origin (port) first if you want to avoid upgrading your real profile.
Backups: the new stores are exported automatically (schema stays 1); *Replace* with a backup that lacks System
stores does not clear them; *Merge* heals the projection from the ledger.

## Theme

Light, calm, blue, via the existing `C` token object in `components/life/ui.tsx` (plus a handful
of literals, `globals.css`, `manifest.json`, `layout.tsx`). Every text/background pair used was
checked against WCAG AA (4.5:1). Lfenwa Trades is unchanged and stays dark inside its iframe.

## Verification

`bash tests/system/run.sh` (unit + storage + architecture suites; installs `tsx` + `fake-indexeddb`
into a temp dir, never into the project) and `bash tests/system/run.sh --e2e` (real headless
Chromium, after `npm run build`).

* `architecture.test.ts` enforces the structural claims by reading the source: one XP gate
  (a ledger row is created in exactly one place), an append-only ledger, a pure engine, a
  read-only Trading adapter with no P&L path, a UI that goes through the store layer, and
  **Trades files and the `readTradesKV` bridge byte-identical to the approved baseline commit
  `cc2df0a`** (so any future change to protected Trades code fails loudly).
* `bash tests/system/inspect-project.sh [repo] [--run]` is a **read-only** inspection of a checkout
  (git state, which Phase 1/prototype code exists, the `lfnawaDaysDB` implementation, Trades
  fingerprints, the System surface; `--run` also runs typecheck/build/lint/tests). It writes nothing.

Not verified: real Android/Electron, the service-worker update path, browsers other than Chromium,
and the Trading definitions against real Trades records (Phase 2).
