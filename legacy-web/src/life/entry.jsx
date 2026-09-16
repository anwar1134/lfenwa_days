import React from "react";
import { createRoot } from "react-dom/client";
import AppShell from "./AppShell.jsx";
import { exportFullBackup } from "./storage.js";

const root = createRoot(document.getElementById("root"));
root.render(<AppShell />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
  // A new service worker taking control mid-session means the shell
  // (or the embedded Lfenwa Trades) may have just been updated under
  // us. Reload once so the person always sees the current version
  // rather than a stale React tree built from old code — but only
  // once per load, so a second, unrelated controllerchange can never
  // cause a reload loop.
  let reloadedForNewWorker = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadedForNewWorker) return;
    reloadedForNewWorker = true;
    window.location.reload();
  });
}

// Used only by desktop/main.js's automatic backup timer (Electron desktop
// build). Harmless no-op everywhere else (PWA/Android never call it).
window.__lfnawaExportFullBackup = () => exportFullBackup().then((data) => JSON.stringify(data));
