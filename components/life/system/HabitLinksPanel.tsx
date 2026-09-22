"use client";
import React, { useCallback, useEffect, useState } from "react";
import { C, Panel, SelectInput } from "../ui";
import { HABIT_CATEGORIES } from "@/lib/system/config";
import { linkHabit, listLinkableHabits } from "@/lib/system/integrations";
import type { HabitCategory } from "@/types/system";

const NONE = "";

/**
 * Habits earn XP ONLY when you link them here. A habit is never linked by its name —
 * "Exercise" is not assumed to be a workout. Linking today's already-ticked habit counts
 * (it is inside the eligibility window).
 */
export default function HabitLinksPanel({ links }: { links: Record<string, HabitCategory> }) {
  const [habits, setHabits] = useState<Array<{ id: string; name: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setHabits(await listLinkableHabits());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }, []);
  useEffect(() => {
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  async function onChange(habitId: string, value: string) {
    try {
      await linkHabit(habitId, (value || null) as HabitCategory | null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  return (
    <Panel title="Habit links">
      <div style={{ fontSize: 12, color: C.inkDim, marginBottom: 10, lineHeight: 1.6 }}>A habit earns XP only when you link it to what it trains. Names are never guessed.</div>
      {error && <div style={{ fontSize: 12, color: C.bad, marginBottom: 8 }}>{error}</div>}
      {habits === null ? (
        <div style={{ fontSize: 13, color: C.inkFaint }}>Loading…</div>
      ) : habits.length === 0 ? (
        <div style={{ fontSize: 13, color: C.inkFaint }}>No habits yet. Add some in Health &amp; Habits, then link them here.</div>
      ) : (
        habits.map((h) => (
          <div key={h.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
            <div style={{ fontSize: 14, color: C.ink, minWidth: 0, overflowWrap: "anywhere" }}>{h.name}</div>
            <div style={{ flex: "0 0 160px" }}>
              <SelectInput
                value={links[h.id] ?? NONE}
                onChange={(v) => onChange(h.id, v)}
                options={[{ value: NONE, label: "Not linked (no XP)" }, ...HABIT_CATEGORIES.map((c) => ({ value: c.id, label: `${c.label} — ${c.hint}` }))]}
              />
            </div>
          </div>
        ))
      )}
    </Panel>
  );
}
