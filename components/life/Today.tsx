"use client";
import React, { useEffect, useState, useCallback } from "react";
import { FiPlus, FiCamera, FiTrendingUp } from "react-icons/fi";
import { C, Panel, StatTile, fmtDateLong, primaryBtn } from "./ui";
import { dbGetByDate, dbGet, getTradesForDate, todayStr } from "@/lib/storage";
import TodayProgressCard from "./system/TodayProgressCard";
import type { DayRecord, Achievement, TaskEntry, Memory, MoneyEntry, TradeLike, TabKey } from "@/types/life";

export default function Today({ onNavigate, onQuickAdd }: { onNavigate: (tab: TabKey) => void; onQuickAdd: () => void }) {
  const date = todayStr();
  const [day, setDay] = useState<DayRecord | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [tasks, setTasks] = useState<TaskEntry[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [money, setMoney] = useState<MoneyEntry[]>([]);
  const [trades, setTrades] = useState<TradeLike[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [d, ach, tsk, mem, mny, trd] = await Promise.all([
      dbGet("days", date),
      dbGetByDate("achievements", date),
      dbGetByDate("tasks", date),
      dbGetByDate("memories", date),
      dbGetByDate("money", date),
      getTradesForDate(date),
    ]);
    setDay(d);
    setAchievements(ach);
    setTasks(tsk);
    setMemories(mem);
    setMoney(mny);
    setTrades(trd);
    setLoading(false);
  }, [date]);

  useEffect(() => {
    reload();
  }, [reload]);
  // Refresh when returning from Quick Add / other tabs.
  useEffect(() => {
    const onFocus = () => reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  const metrics = day?.metrics || {};
  const income = money.filter((m) => m.type === "income").reduce((s, m) => s + Number(m.amount || 0), 0);
  const expense = money.filter((m) => m.type === "expense").reduce((s, m) => s + Number(m.amount || 0), 0);
  const currency = money[0]?.currency || "DH";
  const net = income - expense;
  const doneTasks = tasks.filter((t) => t.status === "done").length;

  if (loading) return <div style={{ color: C.inkDim, padding: 20 }}>Loading…</div>;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>Today</div>
        <div style={{ fontSize: 13, color: C.inkDim }}>{fmtDateLong(date)}</div>
      </div>

      <button
        onClick={() => onQuickAdd()}
        style={{ ...primaryBtn, width: "100%", padding: "13px 14px", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16 }}
      >
        <FiPlus size={18} /> Add
      </button>

      <Panel title="How today is going" right={<button onClick={() => onNavigate("myday")} style={{ background: "none", border: "none", color: C.accent, fontSize: 12, cursor: "pointer" }}>Open My Day →</button>}>
        {metrics.mood == null ? (
          <div style={{ fontSize: 13, color: C.inkFaint }}>No check-in yet today. Tap Add → Daily entry to log mood, energy, focus and sleep (2–5 min).</div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <StatTile label="Mood" value={`${metrics.mood}/10`} />
            <StatTile label="Energy" value={`${metrics.energy ?? "—"}/10`} />
            <StatTile label="Focus" value={`${metrics.focus ?? "—"}/10`} />
            <StatTile label="Sleep" value={day?.sleepHours != null && day.sleepHours !== "" ? `${day.sleepHours}h` : "—"} />
          </div>
        )}
      </Panel>

      <Panel title="Today's progress">
        <div style={{ fontSize: 13, color: C.inkDim, marginBottom: 8 }}>
          {doneTasks}/{tasks.length || 0} tasks done · {achievements.length} achievement{achievements.length === 1 ? "" : "s"}
        </div>
        {achievements.slice(0, 4).map((a) => (
          <div key={a.id} style={{ fontSize: 13, color: C.ink, padding: "4px 0" }}>
            ✓ {a.text}
          </div>
        ))}
        {tasks.filter((t) => t.status === "done").slice(0, 4).map((t) => (
          <div key={t.id} style={{ fontSize: 13, color: C.ink, padding: "4px 0" }}>
            ✓ {t.text}
          </div>
        ))}
        {achievements.length === 0 && tasks.length === 0 && <div style={{ fontSize: 13, color: C.inkFaint }}>Nothing logged yet.</div>}
      </Panel>

      <TodayProgressCard onOpenSystem={() => onNavigate("system")} />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 140px" }}>
          <Panel title="Memories" style={{ marginBottom: 10, cursor: "pointer" }}>
            <div onClick={() => onNavigate("memories")} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <FiCamera color={C.accent} />
              <span style={{ fontSize: 18, fontWeight: 700, fontFamily: "ui-monospace" }}>{memories.length}</span>
            </div>
          </Panel>
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <Panel title="Money" style={{ marginBottom: 10, cursor: "pointer" }}>
            <div onClick={() => onNavigate("money")} style={{ fontSize: 15, fontWeight: 700, color: net < 0 ? C.bad : C.good }}>
              {net >= 0 ? "+" : ""}
              {net.toLocaleString()} {currency}
            </div>
          </Panel>
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <Panel title="Trading" style={{ marginBottom: 10, cursor: "pointer" }}>
            <div onClick={() => onNavigate("trades")} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <FiTrendingUp color={C.accent} />
              <span style={{ fontSize: 18, fontWeight: 700 }}>{trades.length}</span>
              <span style={{ fontSize: 12, color: C.inkDim }}>{trades.length === 1 ? "trade" : "trades"}</span>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
