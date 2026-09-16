# Architecture — full details

## 1. Original project analysis (before any change)

| File | Role |
|---|---|
| `index.html` | Loads `bundle.js` only, `<div id="root">`, no external CDN script |
| `bundle.js` | React + ReactDOM + the whole app, built with esbuild (one IIFE, ~324KB), **self-contained** — no runtime external dependency |
| `serve.js` | Zero-dependency static server (Node's `http` + `fs` only) |
| `manifest.json` | Standard PWA manifest (name, icons, standalone display) |
| `sw.js` | Service worker: cache-first for the app shell, registered from inside `bundle.js` itself (`serviceWorker in navigator`) |
| `trading-journal.jsx` | The original source (2862 lines) — a Claude.ai artifact version, with real `import ... from "recharts"` / `"lucide-react"`. **This is not what `bundle.js` was built from** — the portable build used local drop-in replacements for the chart/icon libraries because the original build environment had no internet to install `recharts`/`lucide-react`. This is a pre-existing, documented limitation, unrelated to the Fenwa Trades rebrand.

### Storage layer (the important part)

```js
function hasHostStorage() {
  return typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";
}
```
An abstraction already existed before this project: `storageGet/storageSet/storageDelete/storageListKeys`
choose automatically between:
- `window.storage` (Claude.ai artifact host — not present in Electron/Capacitor)
- IndexedDB (`esOrderFlowJournal` database, `kv` object store) — what actually runs in Desktop/Android.

**This database name (`esOrderFlowJournal`) is untouched by the Fenwa Trades rebrand and must stay
that way** — it's the one hardcoded string that determines whether an existing user's trades load or
not. Renaming it would silently start every existing user with an empty journal (a new, differently
named IndexedDB database is empty by definition). The rebrand changed exactly one other hardcoded
string in `bundle.js`: the visible sidebar label (`"ORDERFLOW JOURNAL"` → `"FENWA TRADES"`), which is
pure display text with no relationship to the storage key.

Keys used: `trades`, `notrades`, `days`, `playbook`, `settings`, and `shots:trade:<id>` /
`shots:notrade:<id>` / `shots:playbook:<id>` for screenshots (JPEG data URLs, compressed via
`compressImage()`, canvas-based, max 640px, quality 0.7).

**This abstraction is exactly the extension point for a future Cloud Sync layer** — swapping
`storageGet/storageSet` for a new implementation (e.g. a fetch to a backend API) touches neither the UI
nor the calculation engine. Nothing about the rebrand implements or fakes this; it's left as a clean
extension point, per the original design.

### Export/Import (backup)

`exportAllJSON(store)` builds:
```json
{
  "schema": 2,
  "exportedAt": "2026-09-12T10:00:00.000Z",
  "trades": [...],
  "noTrades": [...],
  "days": {...},
  "playbook": [...],
  "settings": {...},
  "screenshots": { "shots:trade:abc123": "data:image/jpeg;base64,...", ... }
}
```
⚠️ Note: the storage key is `notrades` (no camelCase) while the JSON export field is `noTrades`.
`importAll()` (inside `useJournalStore`) reads `payload.trades` / `payload.noTrades` / `payload.days` /
`payload.playbook` only (not `settings` — settings are deliberately not touched by import, a choice
made by the original author). `desktop/main.js`'s auto-backup (`SNAPSHOT_SCRIPT`) builds the exact same
shape, so any automatic backup can be restored through the app's own normal Import with no extra
tooling. **None of this changed in the rebrand.**

Mechanism: `Blob` + `<a download>` + `.click()` — works in any browser and in Electron (Chromium shows
a native Save dialog automatically), but **does not work in an Android WebView** without help — hence
`capacitor-bridge.js` (unchanged by the rebrand).

### Responsive design

Already present before this project: a `NavRail` with `mobileOpen` state (hamburger menu), and one
media query `@media (max-width:780px){.grid-stack{grid-template-columns:1fr !important;}}` inlined in
`GLOBAL_CSS` (injected via `<style>{GLOBAL_CSS}</style>` in the React tree). This is sufficient for a
reasonable phone/tablet experience with no changes — verified by shrinking the Electron window to
~380px (see README §6).

## 2. Why Electron + Capacitor (and not something else)

| | Electron (Desktop) | Capacitor (Android) | Tauri (rejected for now) |
|---|---|---|---|
| Needs a rewrite? | No — loads the same `app/` as-is | No — same `app/` (via `www/`) | Same as Electron in theory |
| Extra toolchain | Node only | Android Studio (bundles JDK+SDK+Gradle) | Rust + system webview |
| Cross-build for Windows from Linux | Yes (via `wine`) | Not needed (Java/Gradle is cross-platform) | Difficult / poorly documented |
| .deb/.AppImage | Yes, directly via electron-builder | — | Yes, but less mature |
| IndexedDB consistency | Real Chromium, 100% matches browser behavior | Modern WebView, supports IndexedDB | WebKitGTK on Linux: known inconsistencies between distros |
| App size | Larger (~150-200MB, bundles Chromium) | N/A (native Android app with a WebView shell) | Much smaller |
| Maturity/docs | Most mature in its category | Most mature for PWA→native mobile | Newer, evolving fast but less proven for this exact case |

Decision: prioritize **stability and compatibility with the existing code** over app size. Tauri
remains a reasonable future option if app size/memory becomes a real problem. This reasoning did not
change with the rebrand.

## 3. Data durability (why data doesn't get lost)

Layers of protection (weakest to strongest):

1. **IndexedDB inside the app's own profile** (Electron: a stable `userData` directory; Android: app-private
   storage, not a "cache" the OS clears casually, especially after `navigator.storage.persist()`, added in
   `index.html`).
2. **Manual Export/Import** (pre-existing, unchanged) — Settings → Export full backup (JSON).
3. **Automatic backup every 15 minutes + on close** (Electron only) — JSON files in
   `~/.config/Fenwa Trades/backups/` (Linux) or `%APPDATA%/Fenwa Trades/backups/` (Windows), same shape
   as the manual export, last 30 copies kept (automatic rotation).
4. **Stable, explicitly-guarded origin** (`desktop/server.js`) — the IndexedDB origin
   (`http://127.0.0.1:<port>`) stays fixed between runs: the port is remembered in `server-port.json`
   and retried first (with several attempts, not just once) next time. If it's ever genuinely
   unavailable, the app says so explicitly rather than silently moving to a different origin. See §3.2.

**On Android**: there is no automatic background backup yet (would need a native background
task/WorkManager, out of scope for this pass) — relying on `navigator.storage.persist()` plus reminding
the user to Export periodically (the "This device" banner in Settings already covers this, unchanged).
Android auto-backup (WorkManager + `@capacitor/filesystem`) remains a possible future addition — **not
implemented, not faked**, exactly as requested.

### 3.1 The Fenwa Trades rename and existing user data (new in this pass)

Electron's `app.getPath("userData")` is derived purely from `app.setName(...)`. Renaming the product
from "ES Order Flow Journal" to "Fenwa Trades" therefore means Electron looks at a **different, empty**
folder on first launch after upgrading — and that folder is where the backups, the remembered server
port, *and Chromium's own storage for the app (including IndexedDB)* actually live.

`desktop/main.js` now runs a one-time migration before anything else touches storage:

```js
const legacyDir = path.join(path.dirname(USER_DATA_DIR), "ES Order Flow Journal");
if (userData folder is empty && legacyDir exists) {
  copy everything from legacyDir into the new userData folder (skipping stale Singleton lock files);
  write a small marker file so this only ever runs once;
}
```

This is a plain recursive file copy — it does not parse, reinterpret, or migrate any schema. It runs
synchronously, before `app.whenReady()`/`createWindow()`, so it completes before any `BrowserWindow` or
Chromium session is created against that directory. The old folder is **not deleted** afterward, so
even a failed or partial migration leaves the original data recoverable. On successful migration, the
person sees a one-time "Data carried over" dialog.

This is why the `appId` changes below are safe:

- **Windows `AppUserModelId`**: `com.esorderflow.journal` → `com.fenwatrades.app`. This only affects
  taskbar grouping / jump lists / notifications, not where data lives, and no installer was ever
  actually built and shipped under the old id from this project.
- **electron-builder `build.appId`**: same change, same reasoning — affects registry uninstall keys on
  a fresh install, not any existing one, since none has shipped yet.
- **Capacitor / Android `appId`**: `com.esorderflow.journal` → `com.fenwatrades.app`. Safe because
  `mobile/android/` has never been generated in this project (it's created by `npx cap add android`,
  which needs the Android SDK/internet this environment doesn't have) — there is no existing installed
  APK anywhere signed under the old id to break.

If any of these had already shipped to real users, the safer choice would have been to keep the old id
and rename only the display name — changing an Android `applicationId` after real installs exist
breaks in-place updates and orphans the old app entry entirely.

### 3.2 Stable origin: retry, explicit fallback, and why persisting a fallback would be wrong

The original `startStableServer()` tried the remembered port exactly once, then immediately moved
through a list of nearby alternates on the very first `EADDRINUSE`, and `desktop/main.js` persisted
*whatever port it ended up on* as the new "preferred" port for next time. Two problems with that,
neither of which was an outright bug but both of which were fragile:

- A single failed bind is treated the same whether the port is genuinely taken by something else, or
  just slow to release (a very common case: a previous instance's socket finishing its OS-level
  `TIME_WAIT` teardown, typically resolved within a second or two). The old code would move origins for
  a purely transient condition.
- Persisting whatever port was actually used means one transient conflict permanently drifts the "home"
  port forward — even after the original squatter is long gone, every future launch would keep
  preferring the fallback, never trying to get back to the origin the person's actual data lives under.

The fix, in `desktop/server.js`'s `startStableServer()`:

1. Retry the exact home port up to 5 times, 400ms apart (a small, bounded delay — at most ~2 seconds
   added to startup, and only in the conflict case).
2. Only after those retries are exhausted does it fall back to a nearby alternate port, and the result
   says so explicitly: `{ port, homePort, isFallback }`.
3. `desktop/main.js` only calls `rememberPort()` when `isFallback` is `false`. A fallback is never
   persisted — the *next* launch tries the real home port again on its own, so a transient conflict
   self-heals instead of compounding.
4. When `isFallback` is `true`, the person sees an explicit dialog naming both the usual address and the
   one actually in use, stating plainly that no data was touched, and explaining how to get back to the
   usual one. This is a deliberate design choice: a wrong-looking-empty journal with no explanation is a
   far worse experience than an honest, actionable warning.

**What this does *not* do, and why**: it does not attempt to copy IndexedDB data from the old origin to
a new one automatically. That would require loading a page *at* the old origin to read its storage —
but by definition, if the app is running as a fallback, something else now owns that port, so there is
no way to serve the journal's own page from it anymore to read its storage. **`esOrderFlowJournal` is
never deleted, renamed, or recreated by any of this in any scenario** — a fallback situation simply
means Chromium is looking at a different, likely-empty origin's storage; the original origin's data
sits untouched on disk. The safety net for the rare "truly stuck fallback" case is the same one that
already exists for every other scenario: restore from the automatic backups in `backups/`, or from a
manual export, via the app's own Import.

## 4. Security posture

- **`desktop/server.js` path-traversal check, hardened.** The original check was
  `filePath.startsWith(rootDir)`. This has a classic prefix-confusion flaw: if `rootDir` is
  `/home/x/app` (no trailing separator), a resolved path of `/home/x/app-evil/secret` or
  `/home/x/app2/secret` also satisfies `.startsWith(rootDir)` as plain strings, even though it's a
  completely different, sibling directory — `.startsWith` compares characters, not path segments. It's
  now `path.relative(rootDir, filePath)`-based: that call returns a path starting with `..` whenever the
  target is genuinely outside `rootDir`, with no string-prefix ambiguity, regardless of what the
  sibling directory happens to be named. `decodeURIComponent` and the `path.join`/`normalize` step are
  also now wrapped so malformed percent-encoding returns 400 instead of throwing an uncaught exception
  in the request handler. Verified with a raw-socket test reproducing the exact sibling-directory case
  (bypassing normal HTTP clients, which collapse `..` segments before ever sending the request) — see §7.
- Electron: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` (standard secure
  settings, unchanged). `preload.js` is still empty — the UI needs no Node/Electron API to function.
- Capacitor: `androidScheme: "https"` (modern default, avoids old mixed-content warnings),
  `allowMixedContent: false`.
- No authentication (as before) — fully local-first. The extension point for a future
  `Account/Login/Cloud Sync` is still `storageGet/storageSet` (§1) plus `preload.js` (for any IPC bridge
  Cloud Sync would need in Electron later).

## 5. The new "Start Fenwa Trades with system" setting

Implemented as a checkbox item in the Electron File menu (`desktop/menu.js`), backed by Electron's own
`app.setLoginItemSettings` / `app.getLoginItemSettings` — the standard, real mechanism (Windows Registry
Run key / Linux XDG autostart entry / macOS Login Items), not a custom or simulated one. Off by default;
the person switches it on themselves. This was deliberately implemented as a native menu toggle rather
than a new control inside the journal's own Settings screen, to avoid modifying `bundle.js`'s UI beyond
the one branding string — it is desktop-only and has no Android equivalent (Android has no concept of
"launch this app when the phone boots" without a lot of extra native scaffolding that would be out of
scope here, similar to the Android auto-backup limitation in §3).

## 6. Icons

The original 512×512 icon (`app/icons/icon-512.png`) was well-suited to the "Fenwa Trades" brand already
— dark background, gold bars, green accents, no text, no stock imagery — so the **design was kept
exactly as-is**, just regenerated at higher resolution and split into the pieces each platform needs:

- `desktop/build/icon.png` — same design, now 1024×1024 (electron-builder auto-generates `.ico`/`.icns`
  from a single PNG source; 1024px gives sharper results in Windows Explorer/taskbar than the previous
  512px source).
- `mobile/resources/icon.png`, `icon-foreground.png`, `icon-background.png` — same design, split into
  the foreground/background layers Android's adaptive icon format needs (see
  `mobile/resources/README.md`). Not yet run through `capacitor-assets generate` in this delivery —
  that step needs the Android SDK, which this environment doesn't have.
- `app/icons/*.png` — untouched (192/512/32/180 already existed and are fine for the PWA manifest and
  Electron window icon fallback).

## 8. Lfnawa Days: the whole-life app built around Lfenwa Trades (this pass)

This section documents the transformation from **Fenwa Trades** (a single-purpose trading journal)
into **Lfnawa Days** (a whole-life journal) with **Lfenwa Trades** preserved as one section inside it.
Everything in §1–§7 above describes Lfenwa Trades itself and remains accurate — nothing described there
changed in this pass except the two items called out explicitly below.

### 8.1 The one decision everything else follows: embed, don't merge

Lfenwa Trades is a large (2,862-line source / ~324KB compiled), already-tested, already-shipped React
app with its own internal navigation, its own IndexedDB database, and its own build (`app/trades/bundle.js`,
compiled independently, before this pass, from a slightly different source than `trading-journal.jsx` —
see §1's note about the recharts/lucide-react substitution). Two ways to fold it into a bigger app existed:

1. **Merge**: import `trading-journal.jsx` into one shared React tree/bundle alongside the new life
   screens, with one combined navigation.
2. **Embed**: keep `app/trades/` exactly as it already was (byte-identical, except one display string),
   and load it inside an `<iframe src="./trades/index.html">` from the new shell, on the same origin.

**Embed was chosen.** Merging would mean rebuilding Lfenwa Trades from `trading-journal.jsx` — the
source that, per §1, is *not* provably identical to what's actually shipped and tested in `bundle.js` —
reintroducing exactly the risk PART 18 of the brief exists to prevent. Embedding means Lfenwa Trades'
compiled output is never touched, recompiled, or merged with anything; the only change made to it, in
either pass, is the one cosmetic sidebar-label string. The cost is a small one: two navigation layers
when inside Trades (the outer Lfnawa Days top bar still shows, with Trades' own internal nav below it),
and the iframe needs a little extra care for the Android back button (§8.4).

**Why this is safe for storage**: an iframe only gets separate, partitioned storage from its parent when
it's a *different-origin* (third-party) frame. `app/trades/index.html` is served from the same origin as
the shell (`app/index.html`) — same scheme, host, and port, whether that's `http://localhost:8420` in
dev, `https://localhost` under Capacitor's `androidScheme: "https"`, or `http://127.0.0.1:<port>` in
Electron. A same-origin iframe shares IndexedDB with its parent exactly as if it had been navigated to
directly — confirmed with a real headless-browser test (§8.6), not assumed.

### 8.2 Two separate databases, one read-only bridge

- `esOrderFlowJournal` (Lfenwa Trades' own database, `kv` store) — **never opened for writing by
  anything new in this pass.** Only Lfenwa Trades' own compiled code writes to it, exactly as before.
- `lfnawaDaysDB` (new) — everything else: `days`, `timeline`, `achievements`, `tasks`, `learning`,
  `money`, `habits`, `habitEntries`, `goals`, `memories`, `attachments`, `mindEntries`, `settings`. One
  object store per entity (not one giant JSON blob, unlike Lfenwa Trades' `kv` pattern) since some of
  these — memories in particular — can hold base64 photo/audio data and benefit from being queryable and
  loadable independently rather than as one ever-growing blob.

`app/src/life/storage.js`'s `readTradesKV()` is the only code in the new layer that ever touches
`esOrderFlowJournal`, and only to read (trade counts on a Life Day, and folding trades into a combined
backup export). It is deliberately conservative: **it checks `indexedDB.databases()` for the name first
and does nothing at all if the database doesn't exist yet**, rather than opening it.

**Why that check exists — a real bug caught by testing, not a hypothetical**: `indexedDB.open(name)`,
called with no version number, *creates* the named database if it doesn't already exist — at version 1,
with zero object stores, since there's no `onupgradeneeded` handler at that call site to create one. On a
brand-new install, if anything in the new shell reads trades data (e.g. Today's "Trading" stat, or the
old version of `desktop/main.js`'s auto-backup snapshot script) *before* the user has ever opened the
Lfenwa Trades tab even once, it would silently create an empty, store-less `esOrderFlowJournal` first.
Then, when the user did open Lfenwa Trades, its own `indexedDB.open("esOrderFlowJournal", 1)` would see
"already at version 1" and skip `onupgradeneeded` entirely — permanently starting the journal with no
`kv` store, and every read/write inside Lfenwa Trades failing from that point on. This was caught by the
automated Playwright suite (§8.6) on the very first run, from a completely fresh browser profile — not
found by inspection. Fixed in both places it existed: `storage.js`'s `readTradesKV()` and
`desktop/main.js`'s `SNAPSHOT_SCRIPT` (the latter now simply calls the same `exportFullBackup()` the
in-app Settings screen uses, via a `window.__lfnawaExportFullBackup` hook `entry.jsx` exposes — one
source of truth for the backup shape instead of two hand-rolled copies).

### 8.3 File layout

```
app/
  index.html, manifest.json, sw.js, capacitor-bridge.js, icons/   ← Lfnawa Days shell (served/app root)
  life-bundle.js                                                   ← compiled shell + life features (esbuild)
  build.js, package.json                                           ← build tooling for life-bundle.js only
  trades/                                                           ← Lfenwa Trades, byte-identical except
    index.html, bundle.js, manifest.json, sw.js,                     one sidebar-label string; never rebuilt
    capacitor-bridge.js, icons/                                      from trading-journal.jsx by this pass
  src/
    trading-journal.jsx        ← Lfenwa Trades' human-readable source (unchanged except the same string)
    life/                      ← new: Lfnawa Days shell + all life-tracking screens (source for life-bundle.js)
      storage.js                 IndexedDB layer (lfnawaDaysDB) + read-only trades bridge + backup export/import
      ui.jsx                     shared theme/components (same color palette family as Lfenwa Trades)
      AppShell.jsx                navigation, routing, Quick Add / Search overlays, Android back button
      entry.jsx                   mounts AppShell; exposes the desktop backup hook
      Today.jsx, MyDay.jsx, Calendar.jsx, Memories.jsx, Goals.jsx,
      Learning.jsx, Money.jsx, HealthHabits.jsx, Mind.jsx,
      Insights.jsx, Search.jsx, Settings.jsx, QuickAdd.jsx
```

### 8.4 Android back button

`AppShell.jsx` listens for Capacitor's `backButton` event (via `window.Capacitor.Plugins.App`, the
`@capacitor/app` plugin already declared in `mobile/package.json`) — a no-op everywhere else, same
guarded pattern as `capacitor-bridge.js`. Behavior: close an open overlay (Quick Add / Search) first; else
pop to the previous tab (a small in-memory history stack, since this is a single-page app with no browser
history to lean on); else go to Today; else — a second back-press within 2 seconds — exit the app (the
standard Android "press back again to exit" pattern). The iframe itself is never a back-button target:
Lfenwa Trades manages its own internal view state with React state, not browser history, so there is
nothing at the browser-history level for a back-press to unwind inside it.

### 8.5 Known implementation risk: voice-note recording permissions

`Memories.jsx`'s voice-note recorder uses the standard web `getUserMedia`/`MediaRecorder` APIs (no extra
Capacitor plugin). This works in a normal browser and in Electron directly. In the Capacitor Android
WebView specifically, in-page microphone access sometimes needs the host `MainActivity` to override
`WebChromeClient.onPermissionRequest` to grant the WebView's own permission request after Android's
runtime permission dialog is accepted — recent Capacitor versions handle this automatically in most
cases, but **this could not be verified on a real device or emulator in this sandbox** (no Android SDK/
emulator available — see §7). If voice notes silently fail to record on-device after granting the
Android permission prompt, add this override in
`mobile/android/app/src/main/java/.../MainActivity.java` (generated by `cap add android`):

```java
@Override
public void onStart() {
    super.onStart();
    this.bridge.getWebView().setWebChromeClient(new BridgeWebChromeClient(this.bridge) {
        @Override
        public void onPermissionRequest(final android.webkit.PermissionRequest request) {
            request.grant(request.getResources());
        }
    });
}
```
Photo/video/file capture (plain `<input type="file" capture>`) does not have this risk — it delegates to
an external system app via an Android intent, which handles its own permissions independently of the
WebView.

### 8.6 Testing actually performed (this pass)

Unlike the previous rebrand pass (§7 — syntax checks and mocked-Electron-module tests only, since no
browser was exercised), this pass could run a **real headless Chromium browser** (Playwright, already
present in this environment) against the app served exactly as a device would load it. 17 automated
checks, from a fresh browser profile each run, covering: the shell loading, IndexedDB persistence across
a real reload, the fresh-install trades-database regression above, Quick Add end-to-end, Calendar
rendering, Money/Goals/Habits CRUD, backup export producing a real downloadable file, the mobile-width
layout switching to the drawer nav, and — inside the embedded Lfenwa Trades iframe — the rebranded label,
opening the real trade form, saving a real trade, and that trade surviving a full page reload. A separate
manual pass confirmed offline behavior: after one online load (letting the service worker cache both the
shell and `app/trades/*`), the browser context was set fully offline and the app — including the embedded
Lfenwa Trades — still loaded and rendered correctly. None of this substitutes for testing on a real
Android device, which still needs to happen once the APK is built (§ BUILD.md).

### 8.7 What was deliberately not built in this pass

- **PIN / biometric lock** (PART 26) — the brief explicitly says not to delay the Android build for this.
  Not implemented, and no fake toggle was added for it either.
- **Android background auto-backup** — same limitation already documented in §3 for Lfenwa Trades itself;
  the new life data has the same constraint (would need WorkManager + `@capacitor/filesystem`, out of
  scope here). Manual Export/Import in Settings covers it today, same as Lfenwa Trades always has.
- **Dedicated People/Events data model** (PART 14) — folded into Timeline entries via category values
  (`Person`, `Event`, `Conversation`, `Moment`) rather than a separate store, since the brief marks this
  optional and the "at minimum" data model list in PART 24 doesn't include it as its own entity. Easy to
  split out later if it outgrows a category tag.

## 9. Known risks / what could not be tested here (original Fenwa Trades rebrand pass)

The sandbox this project was rebranded and hardened in **has no internet access** and no Android SDK /
Wine installed, so:
- `npm install`, `npm run dist:*`, and `npx cap add android` / `gradlew` could not actually be run here.
- Every file was syntax-checked (`node --check` on every `.js` file, `tsc --jsx react --allowJs
  --checkJs false` on `trading-journal.jsx` since Node's own parser can't parse JSX, `JSON.parse` on
  every `.json` file), and the parts of the logic that don't need Electron or a browser were actually
  **executed** against real fixtures in this sandbox, not just read over:
  - `desktop/server.js` serving real files from `app/`, including a 404 case.
  - The exact prefix-confusion attack this hardening pass fixed (`/app` vs. a sibling `app-secret`
    directory), sent as a raw, percent-encoded socket request so it reaches the server unnormalized —
    confirmed rejected with 403 after the fix, and confirmed (in an isolated snippet, not the shipped
    file) that the *old* `.startsWith()` check would have wrongly allowed it.
  - The classic `../../../etc/passwd` traversal, same raw-socket technique — 403, no leak.
  - The new stable-origin logic: (a) a persistently-occupied home port correctly falls back and reports
    `isFallback: true` with the real `homePort` preserved; (b) a free home port binds directly with
    `isFallback: false`; (c) a *transiently* occupied home port self-heals via retry without ever
    falling back — all three run against real OS sockets, not mocks.
  - The legacy-user-data migration, using the real `desktop/main.js` with only the `electron` module
    mocked (a minimal stand-in for `app.getPath`/`setLoginItemSettings`/etc., since the real `electron`
    package isn't installed in this sandbox): full copy with correct file exclusions, and a second run
    proving it does not re-copy or clobber already-migrated data.
- **This same constraint still applies in the Lfnawa Days pass** (§8) — no Android SDK or npm registry
  access there either, which is exactly why §8.6 leans on a real headless browser instead: it's the one
  form of genuine, executed testing available in this environment for a browser-based app. See
  `docs/BUILD.md` for the exact commands to finish the Android build yourself, on a machine that has
  Android Studio and internet access.


## 10. Diagnosed: "only Lfenwa Trades appears" after an update (found and fixed this pass)

### 10.1 The report

After the initial integration, running the project could show **only the old, trades-only UI** even
though the Lfnawa Days source, `life-bundle.js`, and `app/index.html` were all correct on disk. This
section documents the actual root cause (found by reproducing it, not by guessing) and the fix.

### 10.2 Root cause

This exact codebase was, in an earlier form, a **standalone** trading journal served at the origin's
root: `index.html` loaded `bundle.js` directly at `/`, and that `bundle.js` itself registers a service
worker — `navigator.serviceWorker.register("./sw.js")`, resolving to `/sw.js` at **scope `/`** — which
then cache-first-serves `/`, `/index.html`, and `/bundle.js` from Cache Storage (see the line ending
`bundle.js` in the original `Fenwa-Trades/app/`, confirmed still present verbatim).

Once Lfnawa Days is deployed at **the same origin** (same `http://127.0.0.1:<port>` in Electron — which
deliberately keeps a *stable* port across launches, see §3.2 — or the same dev `http://localhost:8420`,
or the same installed Android package/WebView storage), that old service worker is still registered and
still active at scope `/`. A service worker's fetch handler intercepts requests **before they ever reach
any server**, so even though the new server now serves the new shell at `/index.html`, the old worker's
cache-first handler answers from its own cache first — serving the old trades-as-root page instead.

This is not a hypothetical: it was reproduced end-to-end in `test_sw_upgrade.js` by (1) serving the
genuine original standalone build, letting its real service worker install and take control, (2) creating
a real trade in it, (3) swapping the served root to the new Lfnawa Days `app/` folder at the exact same
port, then (4) reloading and inspecting what actually renders.

### 10.3 The fix (three parts, each targeting a different platform's actual constraint)

1. **`app/sw.js`** — the shell's own service worker was cache-first for everything, and used
   `cache.addAll()` (all-or-nothing: one failing resource fails the *entire* install, which can leave a
   new worker permanently stuck in a failed-install state and an old one in control forever). Changed to:
   - **Network-first** for shell-critical files specifically (`/`, `/index.html`, `/life-bundle.js`,
     `/trades/bundle.js`) — always prefers live content when reachable, falling back to cache only when
     offline. Non-critical, rarely-changing files (icons, manifest) stay cache-first for speed.
   - **`Promise.allSettled`** instead of `cache.addAll()` during install, so one unreachable resource can
     never block the whole update.
   - Cache name changed to the namespaced `lfnawa-days-shell-v2` (was the generic `lfnawa-days-v1`), and
     the activate-time cleanup now only deletes cache keys starting with `lfnawa-days-shell-` — it used to
     delete *any* cache name that wasn't its own, which would also wipe the embedded Lfenwa Trades
     iframe's independent cache (`es-order-flow-journal-v1`, from its own separately-scoped `/trades/`
     service worker) every time the shell's own worker updated. Not a data-loss bug (trades data lives in
     IndexedDB, untouched either way) but unnecessarily discarded that mini-app's offline cache for no
     reason.
2. **`app/src/life/entry.jsx`** — added a one-time `controllerchange` listener that reloads the page when
   a new service worker takes control mid-session, so an in-progress upgrade resolves itself visibly
   instead of leaving stale rendered UI on screen. Guarded to fire at most once per load (no reload loops).
3. **`desktop/main.js`** — Electron is the highest-risk platform here: its session persists service
   workers and Cache Storage across launches indefinitely, and unlike a browser tab, a packaged app gives
   the person no "hard refresh" button to escape a stuck one. Added
   `clearStaleServiceWorkerStateIfVersionChanged()`: a `SHELL_CONTENT_VERSION` constant (bump it whenever
   `app/index.html` or `app/sw.js`'s precache list meaningfully changes) is compared against a marker file
   in `userData` on every launch; on a version change (including "never recorded before"), the window's
   session has its `serviceworkers` and `cachestorage` cleared **before the first navigation** — so the
   very first launch after an update can never be intercepted by a leftover old worker at all. This never
   touches IndexedDB, localStorage, or anything else — only the two mechanisms that cache *code*.

### 10.4 What this does and doesn't guarantee

- **Electron desktop**: fully eliminated. Verified with a mocked-`electron` unit test (`electron` itself
  isn't installed in this sandbox — see §9's original testing note for why, and the same mocking
  technique) showing the cleanup fires exactly once per version bump and never again on an unchanged
  relaunch.
- **Web/PWA/Android WebView**: bounded, not instant. `test_sw_upgrade.js` shows the new shell reliably
  takes over within **at most two reloads** of the swap (the first reload can still be answered by the
  still-active old worker; the update-and-takeover completes in the background within about a second,
  and the *second* reload/relaunch is served by the now-active new worker). This is standard,
  well-documented service-worker behavior for any web app, not unique to this project — but it is
  bounded and self-correcting, which is what "cannot **permanently** override" (the actual requirement)
  calls for, rather than an unbounded stuck state requiring a manual cache clear.
- **Existing data is untouched throughout**: `test_sw_upgrade.js` also confirms a trade created *before*
  the swap is still visible in Lfenwa Trades *after* it — same `esOrderFlowJournal` database, same
  origin, completely unaffected by any of the above, since none of this fix touches IndexedDB.
- **Fresh installs are unaffected**: this entire scenario only applies to *upgrading* an origin that
  previously ran the old standalone build (or an earlier Lfnawa Days build). A brand-new install has no
  prior service worker to conflict with and shows the new shell immediately — confirmed by every one of
  `smoke_test.js`'s 17 checks, each starting from a fresh browser profile.
- **Android**: the Capacitor WebView's storage (including any service worker state) persists across an
  in-place APK update the same way Electron's session does, for the same underlying reason (same app data
  directory, not wiped by an update install). `mobile/android/` doesn't exist yet in this environment (see
  §9), so the equivalent native-side fix can't be added here — but the shape of it is: in
  `MainActivity.java`, compare a stored `SharedPreferences` version marker to a constant on `onCreate()`,
  and if different, call the WebView's cache/service-worker-clearing APIs before loading the page. Do this
  once `cap add android` has been run, using the same version-bump discipline as
  `SHELL_CONTENT_VERSION` above.
