"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { todayStr } from "@/lib/storage";
import { getSnapshot, subscribeToSystemChanges } from "@/lib/system/store";
import type { SystemSnapshot } from "@/types/system";

/**
 * View-state for the System: loads a snapshot and keeps it fresh (System changes in this
 * tab or another, window focus). It contains NO game rules — everything shown is read from
 * lib/system/store.
 */
export function useSystemSnapshot() {
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++seq.current; // ignore out-of-order responses
    try {
      const s = await getSnapshot(todayStr());
      if (mine !== seq.current) return;
      setSnapshot(s);
      setError(null);
    } catch (e) {
      if (mine !== seq.current) return;
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }, []);

  useEffect(() => {
    reload();
    const off = subscribeToSystemChanges(reload);
    const onFocus = () => reload();
    window.addEventListener("focus", onFocus);
    return () => {
      off();
      window.removeEventListener("focus", onFocus);
    };
  }, [reload]);

  return { snapshot, error, reload };
}
