"use client";
import { useEffect } from "react";
import { exportFullBackup } from "@/lib/storage";

/**
 * Mounted once from app/layout.tsx. This replaces the module-level side
 * effects that used to live at the top of app/src/life/entry.jsx:
 *   1. navigator.storage.persist() best-effort request
 *   2. service worker registration (now at an absolute "/sw.js" path,
 *      since this app now has more than one route — a relative path
 *      would register a different scope depending on which page first
 *      loaded it)
 *   3. a one-time reload when a new service worker takes control
 *      mid-session, so an in-progress upgrade always resolves to the
 *      current version instead of leaving a stale React tree on screen
 *   4. window.__lfnawaExportFullBackup — the hook desktop/main.js's
 *      automatic backup timer calls via executeJavaScript(). Unchanged
 *      contract: still resolves to the JSON string of a full backup.
 */
export default function ClientBoot() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (window.navigator && navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      });
      let reloadedForNewWorker = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloadedForNewWorker) return;
        reloadedForNewWorker = true;
        window.location.reload();
      });
    }

    (window as unknown as { __lfnawaExportFullBackup?: () => Promise<string> }).__lfnawaExportFullBackup = () =>
      exportFullBackup().then((data) => JSON.stringify(data));
  }, []);

  return null;
}
