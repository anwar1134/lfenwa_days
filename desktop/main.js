const { app, BrowserWindow, Menu, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { startStableServer } = require("./server");
const { buildMenu } = require("./menu");

const APP_NAME = "Lfnawa Days";

// The product's previous names, most recent first. Electron derives the
// userData directory purely from the app name (see app.setName() below),
// so renaming the app on its own would make Electron look at a
// brand-new, empty folder on next launch -- and the journal's actual
// IndexedDB data lives inside that folder. We keep this list only to
// locate and migrate the most recent one forward, once; we never write
// to any of them again. See migrateLegacyUserDataIfNeeded() below.
const LEGACY_APP_NAMES = ["Fenwa Trades", "ES Order Flow Journal"];

app.setName(APP_NAME);
// Safe to change from the old "com.fenwatrades.app": this id only
// affects Windows taskbar grouping / jump lists / notifications, not
// where any data is stored, and no installer was ever actually shipped
// under the old id (see docs/ARCHITECTURE.md).
if (process.platform === "win32") app.setAppUserModelId("com.lfnawadays.app");

// Resolve the static site directory: alongside desktop/ in dev, inside
// resources/ once packaged (see the "extraResources" entry in
// package.json's build config).
//
// NEXT.JS MIGRATION: this used to point at "../app" (the hand-written
// static site). The app is now a Next.js project built with
// `output: "export"` (see ../next.config.ts), so the equivalent
// directory of ready-to-serve static files is "../out", produced by
// `npm run build` (= `next build`) from the repo root. Nothing else
// about how Electron serves it changed — desktop/server.js still just
// serves a folder of static files, unaware of Next.js either way. See
// docs/NEXTJS_MIGRATION.md.
const APP_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "app")
  : path.join(__dirname, "..", "out");

const USER_DATA_DIR = app.getPath("userData");
const BACKUPS_DIR = path.join(USER_DATA_DIR, "backups");
const PORT_FILE = path.join(USER_DATA_DIR, "server-port.json");
const MAX_BACKUPS = 30;
const BACKUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// Bump this string whenever a shipped update changes the served
// index.html, public/sw.js's precache list, or anything else a stale
// Service Worker registration or Cache Storage entry could pin in
// place. On a version change (including "never recorded before" --
// first launch of this build), the window's session has its Service
// Workers and Cache Storage cleared *before* the first navigation, so
// this Electron window can never get permanently stuck serving an old
// cached shell the way a plain browser tab could be without a manual
// hard-refresh. This intentionally does NOT touch IndexedDB,
// localStorage, or any other storage type -- only the two mechanisms
// that cache *code* rather than *data*. See docs/ARCHITECTURE.md §10.
//
// Bumped to "-3" for the Next.js migration: the served HTML/JS/service
// worker all changed shape (Next.js output instead of the hand-written
// static site), so any existing installed copy of this app must clear
// its old cached shell exactly once, the same way the "-2" bump did for
// the previous Lfnawa Days integration pass. IndexedDB (both
// lfnawaDaysDB and esOrderFlowJournal) is completely unaffected.
const SHELL_CONTENT_VERSION = "lfnawa-days-shell-3";
const SHELL_VERSION_FILE = path.join(USER_DATA_DIR, "shell-content-version.txt");

async function clearStaleServiceWorkerStateIfVersionChanged(win) {
  let recorded = "";
  try {
    recorded = fs.readFileSync(SHELL_VERSION_FILE, "utf8").trim();
  } catch (e) {
    // No file yet -- treat exactly like a version change (see above).
  }
  if (recorded === SHELL_CONTENT_VERSION) return;
  try {
    await win.webContents.session.clearStorageData({ storages: ["serviceworkers", "cachestorage"] });
  } catch (e) {
    console.error("Service worker / cache cleanup failed (non-fatal):", e);
  }
  try {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
    fs.writeFileSync(SHELL_VERSION_FILE, SHELL_CONTENT_VERSION, "utf8");
  } catch (e) {
    console.error("Could not record shell content version (non-fatal):", e);
  }
}

let mainWindow = null;
let backupTimer = null;

// ---------------------------------------------------------------------
// One-time migration: carry an existing "Fenwa Trades" (or, failing
// that, the original "ES Order Flow Journal") user data folder forward
// to the new "Lfnawa Days" one, so a rename never looks like data loss.
// This is pure fs copying -- it does not touch, parse, or reinterpret
// any of the journal's own data.
// ---------------------------------------------------------------------
function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    // Never carry over a stale single-instance lock from the old
    // install -- Electron recreates these itself as needed.
    if (["SingletonLock", "SingletonSocket", "SingletonCookie"].includes(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function migrateLegacyUserDataIfNeeded() {
  try {
    const newDirHasData = fs.existsSync(USER_DATA_DIR) && fs.readdirSync(USER_DATA_DIR).length > 0;
    if (newDirHasData) return false;
    for (const legacyName of LEGACY_APP_NAMES) {
      const legacyDir = path.join(path.dirname(USER_DATA_DIR), legacyName);
      if (fs.existsSync(legacyDir)) {
        copyDirRecursive(legacyDir, USER_DATA_DIR);
        fs.writeFileSync(
          path.join(USER_DATA_DIR, ".migrated-from-" + legacyName.toLowerCase().replace(/[^a-z0-9]+/g, "-")),
          `Migrated from "${legacyDir}" on ${new Date().toISOString()}\n`,
          "utf8"
        );
        return true;
      }
    }
  } catch (e) {
    // Non-fatal by design: worst case the old folder is simply left in
    // place untouched, and the user can restore via Import using a file
    // from its backups/ subfolder.
    console.error("Legacy user-data migration failed:", e);
  }
  return false;
}

const migratedFromLegacy = migrateLegacyUserDataIfNeeded();

function readRememberedPort() {
  try {
    const raw = fs.readFileSync(PORT_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && Number.isInteger(parsed.port)) return parsed.port;
  } catch (e) {
    /* first launch, or file missing/corrupt — fall back to default */
  }
  return null;
}

function rememberPort(port) {
  try {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
    fs.writeFileSync(PORT_FILE, JSON.stringify({ port }), "utf8");
  } catch (e) {
    /* non-fatal — worst case we retry the default port next launch */
  }
}

// Calls the same exportFullBackup() the in-app Settings screen's "Export
// backup" button uses (app/src/life/storage.js), via a small global hook
// entry.jsx exposes on window. Reusing it (rather than re-implementing
// IndexedDB reads here) means there is exactly one place that knows the
// backup's shape, and this script can never drift out of sync with it.
// Falls back to "no data yet" if the hook isn't present for any reason
// (e.g. an old build) rather than throwing.
const SNAPSHOT_SCRIPT = `
(function () {
  return new Promise(function (resolve) {
    try {
      if (typeof window.__lfnawaExportFullBackup === "function") {
        window.__lfnawaExportFullBackup().then(resolve).catch(function (e) {
          resolve(JSON.stringify({ __error: String(e && e.message || e) }));
        });
      } else {
        resolve(JSON.stringify({ __error: "export hook not available yet" }));
      }
    } catch (e) {
      resolve(JSON.stringify({ __error: String(e && e.message || e) }));
    }
  });
})()
`;

async function runBackupNow() {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error("Window not ready");
  const json = await mainWindow.webContents.executeJavaScript(SNAPSHOT_SCRIPT);
  const parsed = JSON.parse(json);
  if (parsed && parsed.__error) throw new Error(parsed.__error);

  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(BACKUPS_DIR, `auto-backup-${stamp}.json`);
  fs.writeFileSync(filePath, json, "utf8");
  rotateBackups();
  return { filePath };
}

function rotateBackups() {
  try {
    const files = fs
      .readdirSync(BACKUPS_DIR)
      .filter((f) => f.startsWith("auto-backup-") && f.endsWith(".json"))
      .map((f) => ({ f, t: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    files.slice(MAX_BACKUPS).forEach(({ f }) => {
      try {
        fs.unlinkSync(path.join(BACKUPS_DIR, f));
      } catch (e) {
        /* ignore */
      }
    });
  } catch (e) {
    /* backups dir may not exist yet on first run — fine */
  }
}

// ---------------------------------------------------------------------
// Optional "Start Lfnawa Days with system" toggle (desktop only).
// Off by default; the person switches it on from the File menu. Uses
// Electron's own login-item registration (Windows Registry Run key /
// macOS Login Items / Linux XDG autostart entry) -- nothing custom or
// faked. Most meaningful for an installed build; in an unpackaged dev
// run it still works, but points at the dev Electron binary.
// ---------------------------------------------------------------------
function getAutoLaunchEnabled() {
  try {
    return !!app.getLoginItemSettings().openAtLogin;
  } catch (e) {
    return false;
  }
}

function setAutoLaunchEnabled(enabled) {
  app.setLoginItemSettings({ openAtLogin: !!enabled });
}

async function createWindow() {
  const preferredPort = readRememberedPort();
  const { port, homePort, isFallback } = await startStableServer(APP_DIR, preferredPort || undefined);
  // Only persist the port when it's the real home port. A fallback is
  // meant to be temporary -- persisting it would make the *next*
  // launch prefer the fallback too, permanently drifting away from the
  // origin the journal's existing data actually lives under the first
  // time something else briefly holds the home port. See
  // docs/ARCHITECTURE.md "Stable origin" for the full reasoning.
  if (!isFallback) rememberPort(port);

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0E1416",
    autoHideMenuBar: false,
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  Menu_setApplicationMenu();

  await clearStaleServiceWorkerStateIfVersionChanged(mainWindow);
  await mainWindow.loadURL(`http://127.0.0.1:${port}/index.html`);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (migratedFromLegacy) {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        dialog.showMessageBox(mainWindow, {
          type: "info",
          title: "Data carried over",
          message: "Lfnawa Days found your existing Lfenwa Trades journal and carried its data over automatically.",
          detail: "Your trades, no-trade days, playbook, settings and screenshots are all here — nothing was lost in the rename.",
        });
      }
    }, 1200);
  }

  if (isFallback) {
    // Never stay silent about this: the journal is running on a
    // different local address than usual, which means it cannot see
    // whatever data exists under the usual one. Nothing has been
    // touched, deleted, or migrated -- it's just not visible from
    // here. See docs/ARCHITECTURE.md "Stable origin" for why an
    // automatic cross-origin data copy isn't possible.
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        dialog.showMessageBox(mainWindow, {
          type: "warning",
          title: "Running on a different local address than usual",
          message: `Lfnawa Days usually runs at 127.0.0.1:${homePort}, but that address was already in use by something else on this computer, so it's using 127.0.0.1:${port} instead this time.`,
          detail:
            "Your existing journal is safe and untouched -- it's just not visible from this address. " +
            `Close whatever else might be using port ${homePort} (or restart your computer), then quit and ` +
            "reopen Lfnawa Days to return to your usual journal. If you need it now, restore your most " +
            "recent file from File \u2192 Open Backups Folder using Settings \u2192 Import backup JSON.",
        });
      }
    }, 2600);
  }

  // First automatic backup shortly after launch (gives the renderer
  // time to finish its initial load from storage), then on an interval,
  // then once more right before quitting.
  setTimeout(() => runBackupNow().catch(() => {}), 20 * 1000);
  backupTimer = setInterval(() => runBackupNow().catch(() => {}), BACKUP_INTERVAL_MS);
}

function Menu_setApplicationMenu() {
  Menu.setApplicationMenu(
    buildMenu({
      getWindow: () => mainWindow,
      userDataDir: USER_DATA_DIR,
      backupsDir: BACKUPS_DIR,
      runBackupNow,
      appVersion: app.getVersion(),
      getAutoLaunchEnabled,
      setAutoLaunchEnabled,
    })
  );
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(createWindow);

  app.on("window-all-closed", () => {
    if (backupTimer) clearInterval(backupTimer);
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  let quitting = false;
  app.on("before-quit", (event) => {
    if (quitting) return;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    event.preventDefault();
    quitting = true;
    runBackupNow()
      .catch(() => {})
      .finally(() => app.quit());
  });
}
