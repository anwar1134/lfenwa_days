# Build — full commands for every platform

## 0. Prerequisites (one time)

```bash
# Node 22 LTS (Node 18 is too old for Capacitor 8 / electron-builder v27+)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22 && nvm use 22
node -v && npm -v
```

```bash
cd Lfnawa-Days
npm run setup:desktop     # = npm install --prefix desktop
```

**Note on what's already built for you**: this delivery ships with
`app/life-bundle.js` and `app/trades/bundle.js` **already compiled** —
you don't need Node, React, or esbuild installed just to run the app
(desktop or Android). You only need `app/`'s own `npm install` if you
want to *modify* the source in `app/src/life/` and rebuild:

```bash
cd app
npm install               # react, react-dom, react-icons, esbuild
npm run build              # -> writes app/life-bundle.js
```

This never touches `app/trades/` — Lfenwa Trades is not rebuilt by this
step or by anything else in this project; see `docs/ARCHITECTURE.md` §8.1.

**Before your first build**, open `desktop/package.json` and replace both
`TODO_REPLACE_WITH_YOUR_EMAIL@example.com` placeholders (`build.author`
and `build.linux.maintainer`) with a real email address — Debian requires
a valid Maintainer field for the `.deb`, and it's better than a fake one
in the installer/About metadata.

---

## 1. Linux — .deb + .AppImage

```bash
cd desktop
npm run dist:linux
```
Output in `desktop/release/`:
- `Lfnawa Days-<version>.AppImage`
- `lfnawa-days-desktop_<version>_amd64.deb`

**Install the `.deb`** (adds an Applications Menu entry automatically):
```bash
sudo apt install ./release/lfnawa-days-desktop_*.deb
```

**Run the `.AppImage` directly** (no install):
```bash
chmod +x "release/Lfnawa Days-"*.AppImage
"./release/Lfnawa Days-"*.AppImage
```
> An automatic Applications Menu entry for the AppImage itself needs
> `appimaged` or `AppImageLauncher` installed on the system. Without them,
> the AppImage still runs fine, just without a menu icon. The `.deb` is
> the reliable path to "Applications Menu, no Terminal", as required.

---

## 2. Windows — installer .exe + portable .exe

### Option A: from the same Linux machine (via Wine)
```bash
sudo apt install wine
cd desktop
npm run dist:win
```
Output:
- `desktop/release/Lfnawa Days Setup <version>.exe` (NSIS installer, Start Menu shortcut)
- `desktop/release/Lfnawa-Days-Portable-<version>.exe` (no install needed)

### Option B (more reliable): build on real Windows, or via CI
If `wine` gives trouble (happens occasionally with some electron-builder
versions), the fully reliable alternative:
1. A real Windows machine: same `npm install` + `npm run dist:win` (no
   wine needed at all).
2. **GitHub Actions** (free for public repos): a `windows-latest` runner
   builds natively, no wine involved. Example workflow
   (`.github/workflows/build-windows.yml`):
   ```yaml
   name: build-windows
   on: workflow_dispatch
   jobs:
     build:
       runs-on: windows-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 22 }
         - run: npm install --prefix desktop
         - run: npm run dist:win --prefix desktop
         - uses: actions/upload-artifact@v4
           with: { name: windows-build, path: desktop/release/*.exe }
   ```

---

## 3. Android — .apk

### 3.1 Tooling (one time)
- Install **Android Studio** (latest stable) — brings the JDK and Android
  SDK Capacitor 8 needs.
- After installing, open it once to finish installing the SDK/Platform
  Tools/Build Tools.

### 3.2 Generate the Android project (one time, needs internet)
```bash
cd mobile
npm install
npx cap init "Lfnawa Days" "com.lfnawadays.app" --web-dir www
node sync-www.js
npx cap add android
npx cap sync android
```
> `npx cap init` will ask questions if `capacitor.config.json` already
> exists with different values — confirm you're keeping the same values
> already in it (`appId: com.lfnawadays.app`, `webDir: www`); don't let
> it change them.

### 3.3 Generate the icons (optional but recommended)
```bash
npm install --save-dev @capacitor/assets   # or: cd mobile && npm i -D @capacitor/assets
npx capacitor-assets generate --android --iconBackgroundColor "#0E1416" --iconBackgroundColorDark "#0E1416"
```
This reads `mobile/resources/icon.png`, `icon-foreground.png`, and
`icon-background.png` (already included in this delivery — same design as
`app/icons/icon-512.png`, split for Android's adaptive icon format; see
`mobile/resources/README.md`) and writes every density into
`mobile/android/app/src/main/res/`.

### 3.4 Build a debug APK (installs directly, no Play Store)
```bash
cd mobile
npm run sync              # node sync-www.js + cap sync android — always before building
npm run build:android:debug
```
Output: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`

Copy it to the phone (USB or any method), enable "Install from unknown
sources", and install it. Or directly via `adb` (if USB debugging is
enabled on the phone):
```bash
adb install mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

### 3.5 Build a signed release APK (production-grade)
```bash
# 1) create a keystore (one time, keep it somewhere safe — if you lose it
#    you can never update this exact app again)
keytool -genkeypair -v -keystore lfnawa-days.keystore \
  -alias lfnawadays -keyalg RSA -keysize 2048 -validity 10000

# 2) add to mobile/android/keystore.properties (new file, do NOT commit it):
#    storePassword=<...>
#    keyPassword=<...>
#    keyAlias=lfnawadays
#    storeFile=../../lfnawa-days.keystore

# 3) edit mobile/android/app/build.gradle to read keystore.properties and
#    use it in signingConfigs.release (Capacitor docs: "Deploying to Google Play")

cd mobile/android
./gradlew assembleRelease
# output: app/build/outputs/apk/release/app-release.apk
```

---

## 4. Rebuilding after any future change in `app/`

```bash
# Desktop: no sync step needed — main.js reads app/ directly (dev) or
# resources/app (packaged)
npm run start:desktop        # instant test

# Mobile: always sync manually before building
cd mobile && npm run sync && npm run build:android:debug
```

## 5. Common troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| `npm run dist:win` fails with a wine error | Old/incomplete wine version | Try `sudo apt install wine64 wine32`, or use GitHub Actions (§2, Option B) |
| `.deb` build says "Maintainer email invalid" | `build.author`/`build.linux.maintainer` still has a placeholder | Edit `desktop/package.json` — see the prerequisites note above |
| Capacitor `cap sync` says "Node version not supported" | Node < 20 | `nvm use 22` |
| Debug APK won't install | "Install unknown apps" not enabled, or a different app is already installed under the same `applicationId` with a different signature | Enable the permission, or `adb uninstall com.lfnawadays.app` first |
| Export Backup does nothing in the APK | `@capacitor/filesystem`/`@capacitor/share` not installed, or `cap sync` wasn't run after `npm install` | `cd mobile && npm install && npx cap sync android` |
| Electron shows "Running on a different local address than usual" | Something else on the computer is using Lfnawa Days' usual port; see `docs/ARCHITECTURE.md` §3.2 | Nothing is lost. Close whichever other program is using that port (or restart your computer), then quit and reopen Lfnawa Days — it retries the usual address automatically on every launch. If you need your data immediately, Import the most recent file from `backups/` |
| Upgrading from an old "Fenwa Trades" or "ES Order Flow Journal" desktop install and don't see your data | The one-time migration (see `docs/ARCHITECTURE.md` §3.1 and §8) only runs if the new `Lfnawa Days` user-data folder is still empty | Check `~/.config/Fenwa Trades/backups/` or `~/.config/ES Order Flow Journal/backups/` (Linux; `%APPDATA%` equivalents on Windows) for a recent auto-backup and Import it manually via Settings; also check whether Lfnawa Days had already been launched once before (which would have created an empty folder, blocking the automatic migration) |
| Lfenwa Trades tab shows blank / doesn't load | Rare WebView same-origin/iframe quirk on some Android versions | Confirm `mobile/capacitor.config.json` still has `"androidScheme": "https"` and wasn't changed; check `adb logcat` for a CSP or mixed-content error while opening the tab |
| A brand-new phone install shows 0 trades even though you expect old ones | This is almost certainly correct, not a bug — Lfenwa Trades' data lives in that *phone's* browser storage; installing a new APK on a different phone starts empty by design (this is app storage, not synced). Use Settings → Export backup on the old phone/computer, then Import on the new one | See `docs/ARCHITECTURE.md` §8.2 and §25 of the brief ("move your complete journal to another phone") |

---

## 6. First-run test checklist (do this once, on a real device)

1. **Fresh install**: install the APK, open it, create a My Day entry (any tab), force-close the app from
   Android's recent-apps screen, reopen it, confirm the entry is still there.
2. **Daily journal**: create a day, edit it, add a timeline entry, a memory (photo), an expense, a
   learning entry, and toggle a habit — all from a phone, none of this needs a keyboard shortcut.
3. **Calendar**: tap a date with data, confirm the summary popup shows real numbers, tap "Open full day".
4. **Lfenwa Trades**: open the tab, create a trade, check Analytics/Dashboard still compute correctly,
   confirm a trade created before this update (if migrating from an existing Fenwa Trades APK on the same
   phone) is still there.
5. **Backup**: Settings → Export backup, confirm a `.json` file is shareable/saveable via Android's share
   sheet (this is what `capacitor-bridge.js` enables); Import it back (Merge) and confirm nothing doubled.
6. **Offline**: turn on Airplane Mode, confirm the whole app (including Lfenwa Trades) still opens and
   works — this was verified in a headless browser during development (see `docs/ARCHITECTURE.md` §8.6),
   but a real-device pass is worth the two minutes it takes.
7. **Back button**: from a few different tabs, press the Android back button and confirm it steps back
   sensibly instead of exiting the app immediately.
