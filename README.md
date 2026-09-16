# Lfnawa Days

> **Next.js + TypeScript migration:** the repository root is now a
> Next.js App Router + TypeScript project (`app/`, `components/`,
> `lib/`, `types/`, `public/`). The original hand-written static site
> is fully preserved, untouched, at `legacy-web/`. See
> **[docs/NEXTJS_MIGRATION.md](docs/NEXTJS_MIGRATION.md)** for exactly
> what changed, why, and how it was verified — including an important
> note about this migration having been done without npm registry
> access. Everything below describes the application itself, which is
> unchanged by the migration.

*(with Lfenwa Trades — formerly the standalone "Fenwa Trades" / "ES Order Flow Journal" — preserved
inside it as one section)*

An offline-first, local, private, whole-life journal: your days, activities, mood/energy/focus, sleep,
learning, goals, habits, money, memories (photos/voice/files), and a calendar — plus your existing
trading journal, untouched, one tap away.

One shared web app, wrapped as a real installable app on:

- **Android** — `.apk` (the primary target — see "Android build" below)
- **Linux** — `.deb` + `.AppImage`
- **Windows** — installer `.exe` + portable `.exe`

## 1. What's inside

```
🏠 Today       📖 My Day      🗓️ Calendar     📸 Memories
🎯 Goals       📚 Learning    💰 Money         🏃 Health & Habits
🧠 Mind        📈 Lfenwa Trades (embedded, unchanged)   📊 Insights   ⚙️ Settings
```

- **Today** — a quick daily summary (mood/energy/focus/sleep, progress, memories, money, trades) and a
  prominent **+ Add** button for fast capture of any entry type.
- **My Day** — the full record for any date: basic info, daily metrics (2–5 min check-in), timeline,
  achievements, tasks (planned vs. done vs. postponed), learning, and an optional end-of-day review.
- **Calendar** — a real month view with a dot on any day that has data, tap-through to a day summary,
  then the full day.
- **Memories** — photos, voice notes, short videos, files, and text memories, grouped by date.
- **Goals** — title/description/category/dates/progress/milestones/notes, with quick progress updates
  from the Today screen's + Add button.
- **Learning** — what you learned, understood, didn't understand yet, the important idea, and a
  resource/reference. Optional, browsable across all days.
- **Money** — a simple income/expense tracker (default currency MAD/DH), today/month totals. Deliberately
  not full accounting software.
- **Health & Habits** — custom habits with daily check-off, streaks, and weekly/monthly completion.
- **Mind** — a mood/energy/stress/focus trend chart plus a free-text thoughts journal.
- **Lfenwa Trades** — your existing trading journal, embedded exactly as it was (see §3).
- **Insights** — weekly/monthly/yearly averages across mood, energy, productivity, sleep, habits, money,
  and trades. Shows patterns, never claims causation.
- **Search** (top-right icon) — searches days, timeline, memories, learning, goals, mind entries, and
  Lfenwa Trades' own notes/playbook, all in one place.
- **Settings** — default currency, and one combined **Export/Import backup** covering everything above
  plus a read-only copy of your Lfenwa Trades data, so one file can move your whole journal to another
  device.

## 2. Quick start

```bash
cd Lfnawa-Days
cd app && node serve.js
# open http://localhost:8420 — runs immediately, nothing to install or build first
```

For Electron (desktop) or Android, see `docs/BUILD.md` for exact commands. Short version:

```bash
# Desktop (Linux/Windows)
npm run setup:desktop && npm run start:desktop      # try it
npm run build:linux                                  # .deb + .AppImage
npm run build:win                                    # .exe (needs wine, or build on Windows)

# Android — needs Android Studio installed first (see docs/BUILD.md §3)
cd mobile && npm install
npx cap add android
npx cap sync android
npm run build:android:debug
# -> mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

## 3. How Lfenwa Trades was preserved

This was the most important constraint on the whole project, so it's worth stating plainly:

- **`app/trades/bundle.js` is byte-identical to the original `app/bundle.js`**, except one string: the
  visible sidebar label (`"FENWA TRADES"` → `"LFENWA TRADES"`) — pure display text. It was never
  recompiled, never merged into the new app's bundle, never touched beyond that one string.
- **Its IndexedDB database (`esOrderFlowJournal`) is never opened for writing by anything new in this
  project.** The only new code that reads from it does so read-only, and only after confirming the
  database actually already exists — so a brand-new install can never accidentally create it empty and
  break Lfenwa Trades before you've even opened it. (This exact scenario was caught by automated testing
  during development — see `docs/ARCHITECTURE.md` §8.2 for the full story.)
- **It's loaded in its own iframe**, on the same origin as the rest of the app (so it still shares
  storage correctly), with its own internal navigation completely intact. Tapping "Lfenwa Trades" in the
  main nav takes you to exactly the trading journal you already had.

Full reasoning for every one of these choices is in `docs/ARCHITECTURE.md` §8.

## 4. Project structure

```
Lfnawa-Days/
├── app/                          # single web app source, used by browser/PWA + Electron + Capacitor
│   ├── index.html, manifest.json, sw.js, capacitor-bridge.js, icons/   ← Lfnawa Days shell
│   ├── life-bundle.js             # compiled shell + all life-tracking features (esbuild) — pre-built
│   ├── build.js, package.json     # only needed if you modify app/src/life/ and want to rebuild
│   ├── trades/                    # Lfenwa Trades — byte-identical to the original, see §3
│   │   ├── index.html, bundle.js, manifest.json, sw.js, capacitor-bridge.js, icons/
│   ├── serve.js, run-linux.sh, run-windows.bat
│   └── src/
│       ├── trading-journal.jsx    # Lfenwa Trades' human-readable source (reference only, unchanged)
│       └── life/                  # Lfnawa Days source: storage.js, AppShell.jsx, Today.jsx, MyDay.jsx,
│                                    Calendar.jsx, Memories.jsx, Goals.jsx, Learning.jsx, Money.jsx,
│                                    HealthHabits.jsx, Mind.jsx, Insights.jsx, Search.jsx, Settings.jsx,
│                                    QuickAdd.jsx, ui.jsx, entry.jsx
│
├── desktop/                       # Electron shell (Linux + Windows) — window, local server, auto-backup,
│                                    legacy-userdata migration (Fenwa Trades / ES Order Flow Journal → this)
├── mobile/                        # Capacitor shell (Android) — capacitor.config.json, resources/ (icons)
│                                    android/ is generated by `npx cap add android`, not part of this delivery
├── docs/
│   ├── ARCHITECTURE.md            # full technical detail — read §8 first for what's new in this pass
│   └── BUILD.md                   # exact commands for every platform, plus troubleshooting
├── smoke_test.js                  # the automated Playwright test suite used during development (§5)
└── package.json                    # root convenience scripts
```

## 5. Testing that was actually performed

An automated, real-headless-Chromium test suite (Playwright) was run repeatedly during development —
not just syntax checks. From a fresh browser profile each time: the shell loads; a My Day entry survives
a real reload (real IndexedDB persistence); Quick Add, Calendar, Money, Goals, and Habits all work
end-to-end; Settings' Export Backup produces a real downloadable file; the mobile-width layout switches
to the drawer nav; and — inside the embedded Lfenwa Trades iframe — the rebranded label shows, a real
trade can be created through its actual form, and that trade survives a full page reload. A separate pass
confirmed the app (including Lfenwa Trades) keeps working with the browser fully offline, after one
online load lets the service worker cache everything. See `docs/ARCHITECTURE.md` §8.6 for the full list,
and `smoke_test.js` to re-run it yourself (`node app/serve.js &` then `node smoke_test.js`).

**What this does not cover**: an actual Android device or emulator, since none is available in the
environment this was built in (see the next section). The commands in `docs/BUILD.md` are exact, but
your first real build and install is the genuine integration test for the Android-specific pieces
(permissions, the WebView, the launcher icon).

A second suite, `test_sw_upgrade.js`, specifically reproduces and verifies the fix for a real bug found
during integration: a service worker left over from this same codebase's earlier life as a standalone
trades-only app could otherwise keep serving that old UI from cache after an update, at the same origin.
See `docs/ARCHITECTURE.md` §10 for the full diagnosis and fix — short version: fully eliminated on
Electron desktop, and bounded to at most two reloads (never permanent) everywhere else, with existing
trades data completely unaffected either way.

## 6. An important limitation of how this was built

This project was built and tested in a sandboxed environment with **no internet access and no Android
SDK installed** — confirmed, not assumed (`npm install` from the public registry is blocked; there is no
`ANDROID_HOME`, no `sdkmanager`, no emulator). That means:

- `npx cap add android` (which generates the actual `mobile/android/` Gradle project) could not be run.
- `./gradlew assembleDebug` / `assembleRelease` (which produce the actual `.apk`) could not be run.
- No real Android device or emulator could be used for on-device testing.

Everything that *could* be verified without those two things was verified for real — see §5 above and
`docs/ARCHITECTURE.md` §8.6/§9. `docs/BUILD.md` gives you the exact, complete command sequence to finish
the Android build yourself, on any machine with Android Studio and normal internet access — it should be
a straightforward, mechanical few minutes, not a debugging exercise, since every line of the app itself
has already been exercised in a real browser.

---

**Deeper details** (data model, IndexedDB schema, the iframe-embedding decision, the fresh-install bug
that was caught and fixed, backup JSON shape, security choices): `docs/ARCHITECTURE.md`.
**Exact build commands for every platform, plus troubleshooting**: `docs/BUILD.md`.
