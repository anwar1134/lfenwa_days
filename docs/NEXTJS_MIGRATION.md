# Next.js + TypeScript Migration

This document records the migration of Lfnawa Days from a hand-written
static React/PWA site (`legacy-web/`, formerly `app/`) to a Next.js 15 +
TypeScript App Router project, for import into Rocket.new. Written in
the same spirit as `docs/ARCHITECTURE.md` — decisions and reasoning,
not just a diff.

## 0. Sandbox limitation — please read this first

This migration was performed in a sandboxed environment **with no
internet access** (confirmed: `npm ping` / `npm install` return `403
Forbidden` against the npm registry). This means:

- `npm install` for this project's new dependencies (`next`, `react`
  19, `typescript`, `eslint-config-next`, etc.) **could not be run
  here**, and therefore neither could `next dev`, `next build`, or
  `next start`.
- Every file in this migration was written by hand and reviewed for
  correctness, but the Next.js toolchain itself was never available to
  compile/build/run this exact project end-to-end in this environment.

To compensate, the two things that could be verified **without** the
`next` package were verified for real, not assumed:

1. **A full offline TypeScript sanity pass** over every migrated file
   in `types/`, `lib/`, and `components/life/` — using the `tsc`
   compiler that IS available locally, against a scratch ambient shim
   for `react`/`next` (since `@types/react` and `next`'s own bundled
   types also require the registry). The shim's own gaps were
   individually triaged (see §7) and confirmed to be shim artifacts,
   not defects in this code — but this is not a substitute for the
   real `@types/react`/`next` packages, and `npm run typecheck` should
   be run for real once `npm install` succeeds.
2. **A real, running Playwright test** of the single most
   safety-critical piece of logic in this whole migration — the
   IndexedDB layer in `lib/storage.ts` — compiled to plain JS and
   exercised in an actual Chromium browser against real IndexedDB
   (see §6). This is the same class of verification `smoke_test.js`
   already used against the original app, extended to specifically
   target the `esOrderFlowJournal` preservation requirement.

**Before you do anything else with this repo:**

```
npm install
npm run typecheck   # tsc --noEmit, now against the REAL @types/react/next
npm run build        # next build (writes the static export to out/)
npm run dev           # next dev, for local development
```

If `npm run build` surfaces anything, it is almost certainly one of
the shim-artifact categories already identified in §7 resolving itself
now that real types are present — but please don't take that on faith;
read the actual output.

## 1. What changed, in one paragraph

The old `app/` folder (hand-written `index.html` + esbuild-bundled
`life-bundle.js`) has been fully preserved, untouched, at
`legacy-web/`. The repository root is now itself the Next.js project:
`app/` is the App Router (routes), `components/life/` holds the
migrated screens as TypeScript, `lib/storage.ts` is a typed port of
the old `storage.js` with **zero logic changes**, and
`public/trades/` holds a **byte-identical** copy of the pre-built
Lfenwa Trades bundle. Nothing about the trading journal's own code,
database, or schema was touched.

## 2. Directory map: before → after

| Old (`legacy-web/`, preserved) | New | Notes |
|---|---|---|
| `app/index.html` + `app/src/life/entry.jsx` | `app/layout.tsx` + `app/page.tsx` + `components/life/ClientBoot.tsx` | Next.js owns the HTML shell now; `ClientBoot` replaces entry.jsx's side effects (SW registration, `storage.persist()`, the Electron backup hook) |
| `app/src/life/*.jsx` (13 screens + AppShell + ui.jsx) | `components/life/*.tsx` | Converted to TypeScript, "use client", logic preserved 1:1 (see §5) |
| `app/src/life/storage.js` | `lib/storage.ts` | Typed port, **same DB name**, same read-only trades bridge, same fresh-install safety check |
| `app/trades/*` (compiled bundle) | `public/trades/*` | **Byte-identical copy**, verified via `diff` (see §4) |
| `app/icons/*`, `app/manifest.json`, `app/sw.js`, `app/capacitor-bridge.js` | `public/icons/*`, `public/manifest.json`, `public/sw.js`, `public/capacitor-bridge.js` | Manifest/SW adapted for the new build (see §8); capacitor-bridge.js copied verbatim |
| `app/src/trading-journal.jsx` (2,862-line source reference for the pre-built bundle) | *(stays in `legacy-web/` only)* | Not touched, not migrated — the trading app ships as its existing compiled bundle, per the brief's §8 guidance ("if source integration is unsafe, keep the existing bundle functional... using an appropriate isolated integration strategy") |
| `app/serve.js` | `scripts/serve-export.js` | Adapted for serving `out/` instead of `app/`; same zero-dependency philosophy, same hardened path-traversal check |
| — | `types/life.ts` | New — shared TypeScript interfaces for every data model |

`legacy-web/` is a complete, still-runnable copy of the original app
(`node legacy-web/serve.js`) — the recovery path required by the
brief's Phase 2.

## 3. Why the repo root became the Next.js project (not a `web/` subfolder)

The brief's proposed structure (§6) shows `app/`, `components/`,
`lib/`, `public/`, `types/` at the repository root. Tools that import
"a Next.js + TypeScript application" (Rocket.new included) generally
expect the project root itself to contain `package.json` with `next`
as a dependency and a root-level `next.config`. Nesting the new
project inside a subfolder would have meant either a second,
disconnected `package.json`/`node_modules` or asking Rocket.new to
target a subdirectory — extra friction with no upside — so the
existing pre-Next `app/` folder was renamed to `legacy-web/` (fully
preserved) and the repository root itself became the Next.js project.

## 4. Lfenwa Trades: untouched, verified byte-for-byte

Per the brief's §8 (a core, non-negotiable requirement), Lfenwa Trades
was **not** rebuilt, re-bundled, or modified in any way. It was copied
as-is from `app/trades/` to `public/trades/`, and every file was
diffed against the original after copying:

```
IDENTICAL bundle.js            (324,387 bytes)
IDENTICAL index.html
IDENTICAL manifest.json
IDENTICAL sw.js
IDENTICAL capacitor-bridge.js
```

Next.js serves everything under `public/` as static files at the site
root, unprocessed — so `public/trades/bundle.js` is served at
`/trades/bundle.js` with the exact same bytes it always had, including
the one embedded reference to `esOrderFlowJournal`
(`grep -c esOrderFlowJournal public/trades/bundle.js` → `1`, matching
the original).

**One necessary, deliberate adaptation:** the iframe that embeds
Lfenwa Trades now points at `src="/trades/index.html"` (absolute)
instead of the original `src="./trades/index.html"` (relative). This
is required, not optional — the original app had exactly one HTML
file, so a relative path always resolved the same way; this app now
has real routes (`/`, `/today`, `/trades`, `/settings`, ...), and a
relative path would resolve *against the current route* (e.g. loading
from `/trades` would request `/trades/trades/index.html` and 404).
This is the only functional change made to how Trades is embedded.

## 5. Life-tracking screens: logic preserved, only typed

Every screen in `components/life/` (`Today`, `MyDay`, `Calendar`,
`Memories`, `Goals`, `Learning`, `Money`, `HealthHabits`, `Mind`,
`Insights`, `Search`, `Settings`, `QuickAdd`) and `AppShell` itself
were converted field-by-field from the original `.jsx`, keeping every
handler, every IndexedDB call, and every piece of JSX structurally
identical — the only additions are `"use client"` directives, prop/
state type annotations, and the shared interfaces in `types/life.ts`.
The Android hardware back-button handling in `AppShell.tsx` — the most
behaviorally sensitive piece of logic in the shell, and the subject of
dedicated tests in the original `smoke_test.js`/`test_sw_upgrade.js` —
was diffed line-by-line against `legacy-web/src/life/AppShell.jsx` and
is unchanged apart from typing `tab`/`tabHistory` as `TabKey`.

### Navigation model — deliberately NOT rebuilt around Next.js routing

The original app was a single HTML page whose `AppShell` component
manages which "tab" is showing entirely via `useState`, with its own
in-memory history stack for the Android back button (§8.4 of
`ARCHITECTURE.md`) — nothing to do with browser history.

This migration adds **12 real Next.js routes** (`/today`, `/myday`,
`/calendar`, ... `/settings`) so the app is bookmarkable/deep-linkable
and Rocket.new sees genuine routes, per the brief's §16. But each
route is a thin page that mounts the *same* `AppShell`, just with a
different `initialTab`. Internal navigation between tabs still never
touches the URL or browser history — exactly like the original.

This was a deliberate choice, not an oversight. The alternative —
making `AppShell` actually swap content based on the current Next.js
route — would require rebuilding the tab-history-stack/back-button
logic to reconcile with Next.js's own client-side routing, and this
sandbox has no way to verify that such a rework wouldn't subtly change
back-button or state-loss behavior (there's no way to run the real
Next.js router here to check). Given the brief's own instruction
("If the current application uses a single-page shell/navigation
system, preserve that behavior where it makes sense" — §16) and that
compatibility is explicitly prioritized over architectural purity
(§2, §5), the safe, verified-by-inspection option was chosen over an
unverifiable rework. If you'd like the tab state to also sync into the
URL bar as the user navigates (so refreshing `/trades` after tapping
into Goals keeps you on Goals), that's a reasonable follow-up now that
a real `next dev` server is available to test it against.

## 6. IndexedDB compatibility — actually verified, not assumed

This is the single requirement the brief calls out most emphatically
(§3, §9), so it got the most verification. `lib/storage.ts` was
compiled to plain JS (types stripped by `tsc`, zero logic changes) and
exercised with Playwright in a real headless Chromium browser against
real IndexedDB. All 14 checks passed:

```
PASS  storage.js module imports cleanly in a real browser
PASS  readTradesKV() on fresh install returns null (no data yet)
PASS  readTradesKV() on fresh install does NOT create esOrderFlowJournal
PASS  dbPut/dbGet roundtrip on the app's own store works
PASS  the app's own database is named exactly "lfnawaDaysDB"
PASS  no accidental second/renamed database was created
PASS  readTradesKV() correctly reads a pre-existing esOrderFlowJournal
PASS  getTradesForDate() correctly filters by date via the read-only bridge
PASS  exportFullBackup() folds the trading journal into one combined file
PASS  esOrderFlowJournal is byte-for-byte unchanged after export (read-only, never mutated)
PASS  importLifeBackup(mode='merge') reports success
PASS  merge import keeps the pre-existing record AND adds the imported one (no silent data loss)
PASS  'replace' import clears only this app's OWN stores
PASS  'replace' import NEVER touches esOrderFlowJournal (the destructive path is fully scoped away from the trading database)
```

This directly re-proves the exact regression `storage.js`'s own
comments warn about (calling `indexedDB.open("esOrderFlowJournal")`
with no existence check would silently create an empty database and
permanently break Lfenwa Trades' own schema upgrade) — and confirms
the fix survived the TypeScript conversion unchanged.

For completeness, the *original, unmodified* app was also verified
first, before any migration work began: `legacy-web/serve.js` was run
and the project's own `smoke_test.js` was executed against it with
Playwright — **17/17 checks passed** — establishing a working baseline
to migrate from.

## 7. TypeScript sanity check — what was and wasn't verifiable here

`tsc --noEmit` was run against every file in `types/`, `lib/`, and
`components/life/` using a scratch ambient shim for `react`/`next`
(real `@types/react` needs the npm registry). The real, locally
installed `react-icons` package (with its genuine type declarations)
was used rather than shimmed. After the shim was refined to type
`useState`/`useEffect`/`useCallback`/`useRef` as real generic
functions (not `any`) and to model React's `key`-prop handling
correctly, **zero errors remained that traced back to this project's
own code.** The 28 remaining diagnostics were individually confirmed
to be shim limitations, not real bugs:

- 8 errors: react-icons' real type declarations reference
  `React.SVGAttributes`/`CSSProperties`/`Context`/etc., which the
  minimal scratch shim doesn't define (real `@types/react` does).
- 2 errors (`style` prop "doesn't exist" on an icon component):
  direct consequence of the above — confirmed by reading
  react-icons' actual `iconBase.d.ts`, which extends
  `React.SVGAttributes<SVGElement>` (which does include `style`).
- 17 errors ("parameter implicitly has an 'any' type" on inline
  `onChange={(e) => ...}` handlers): the scratch shim types every
  native DOM element's props as `any` for simplicity, losing the
  contextual inference real `@types/react-dom` provides for
  `HTMLInputElement`'s `onChange`. This is exactly how the original
  `.jsx` files wrote these handlers too — unannotated and correct.
- 1 error (`useRef<HTMLInputElement>(null)`): the scratch shim's
  simplified `useRef` signature doesn't include the standard
  nullable-ref overload real `@types/react` ships.

Run `npm run typecheck` for the real, authoritative answer once
`npm install` has real `@types/react`/`@types/react-dom`/`next` to
check against.

## 8. PWA / service worker

The original `sw.js` precached a short, fixed list of filenames
(`life-bundle.js`, etc.). A Next.js static export instead produces
content-hashed filenames under `/_next/static/...` that change on
every build, so a fixed precache list isn't meaningful anymore.
`public/sw.js` was rewritten around three rules instead of a filename
list:

1. `/_next/static/*` (content-hashed, therefore immutable) →
   cache-first.
2. HTML navigations and `/trades/bundle.js` specifically → network-
   first, falling back to cache only when offline (same policy the
   original used for shell-critical files, for the same reason: an
   update should be visible on the very next load).
3. Everything else (icons, manifest, `capacitor-bridge.js`, Trades'
   other static files) → cache-first with background refresh.

The cache name (`lfnawa-days-shell-v3`) keeps the same versioned-
prefix isolation scheme as before, so this service worker's cleanup
step can never delete Lfenwa Trades' own, independently-scoped
`/trades/` service worker cache. `desktop/main.js`'s
`SHELL_CONTENT_VERSION` was bumped to `"lfnawa-days-shell-3"` so any
already-installed Electron copy clears its old cached shell exactly
once on first launch of this build — this does not touch IndexedDB.

`public/manifest.json`'s `start_url`/`scope` changed from the original
`"./index.html"` / `"./"` to `"/"` / `"/"`, since the app is no longer
a single physical HTML file.

## 9. Desktop and mobile

`desktop/main.js` now points `APP_DIR` at `../out` (the Next.js static
export) instead of `../app`; `desktop/server.js` itself needed **no
changes** — it already just serves whatever folder it's given, unaware
of Next.js either way. `mobile/sync-www.js` now copies `../out` into
`mobile/www` instead of `../app`, and no longer needs its old skip-list
(`src/`, `serve.js`, etc.) since `out/` only ever contains files meant
to be served. Both require `npm run build` to have produced `out/`
first — this could not be executed in this sandbox (§0).

## 10. What's left to actually do (in an environment with internet)

1. `npm install` at the repo root.
2. `npm run typecheck` — confirm §7's shim-artifact analysis holds up
   against real types (it should).
3. `npm run build` — first real `next build` of this project. Fix
   anything it finds; none of the design decisions above depend on
   this succeeding blind, but it has never actually been run.
4. `npm run dev` — click through all 12 tabs, confirm Lfenwa Trades
   still loads correctly in its iframe, confirm My Day / Memories /
   Goals / etc. read and write real data.
5. `npm run start` — confirm `scripts/serve-export.js` serves the
   `out/` folder correctly (mirrors the original `app/serve.js`
   almost exactly, so this should be low-risk).
6. `npm run setup:desktop && npm run start:desktop` — confirm Electron
   still launches against `out/`.
7. `npm run setup:mobile && npm run sync:android` — confirm the
   Capacitor sync step (already updated to read from `out/`) still
   produces a working `mobile/www/`.
8. Consider whether tab changes should sync into the URL bar (see the
   note at the end of §5) now that a real dev server exists to test
   against.
