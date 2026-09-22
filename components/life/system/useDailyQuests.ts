"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { summarizeQuests } from "@/lib/system/engine";
import { completeQuest, ensureDailyQuests, getXpForDate } from "@/lib/system/store";
import type { CompleteQuestResult, QuestSummary, SystemQuest } from "@/types/system";

/**
 * View-state for a day's quests. It contains NO game rules: generation,
 * completion and rewards all happen inside lib/system/store.ts. This hook only
 * loads, calls those functions, and remembers what to show. Today and the System
 * screen both use it (via DailyQuestsPanel), so there is one UI path to the
 * same service.
 */
export function useDailyQuests(date: string, onChange?: () => void) {
  const [quests, setQuests] = useState<SystemQuest[] | null>(null);
  const [xpToday, setXpToday] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<CompleteQuestResult | null>(null);

  // Synchronous guard: two taps in the same frame must not start two completions.
  const inFlight = useRef(false);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const reload = useCallback(async () => {
    try {
      const list = await ensureDailyQuests(date);
      const xp = await getXpForDate(date);
      setQuests(list);
      setXpToday(xp);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }, [date]);

  useEffect(() => {
    reload();
  }, [reload]);
  useEffect(() => {
    const onFocus = () => reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  const complete = useCallback(
    async (questId: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusyId(questId);
      try {
        const result = await completeQuest(questId);
        setLastResult(result);
        await reload();
        onChangeRef.current?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        inFlight.current = false;
        setBusyId(null);
      }
    },
    [reload]
  );

  const summary: QuestSummary = summarizeQuests(quests ?? []);
  return { quests, summary, xpToday, error, busyId, lastResult, complete, reload };
}
