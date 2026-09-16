import React, { useEffect, useState, useCallback } from "react";
import { C, Panel, Segmented, StatTile, MiniLineChart } from "./ui.jsx";
import { dbGetAll, readTradesKV, todayStr } from "./storage.js";

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function avg(arr) {
  const nums = arr.filter((n) => typeof n === "number" && !isNaN(n));
  if (!nums.length) return null;
  return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 10) / 10;
}

export default function Insights() {
  const [range, setRange] = useState("week"); // week | month | year
  const [data, setData] = useState(null);

  const reload = useCallback(async () => {
    const [days, money, habits, habitEntries, tasks, trades] = await Promise.all([
      dbGetAll("days"),
      dbGetAll("money"),
      dbGetAll("habits"),
      dbGetAll("habitEntries"),
      dbGetAll("tasks"),
      readTradesKV("trades"),
    ]);
    setData({ days, money, habits: habits.filter((h) => !h.archived), habitEntries, tasks, trades: trades || [] });
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  if (!data) return <div style={{ color: C.inkDim }}>Loading…</div>;

  const rangeDays = range === "week" ? 7 : range === "month" ? 30 : 365;
  const cutoff = daysAgo(rangeDays);
  const inRange = (d) => d >= cutoff;

  const daysInRange = data.days.filter((d) => inRange(d.date));
  const moodAvg = avg(daysInRange.map((d) => d.metrics?.mood));
  const energyAvg = avg(daysInRange.map((d) => d.metrics?.energy));
  const productivityAvg = avg(daysInRange.map((d) => d.metrics?.productivity));
  const sleepAvg = avg(daysInRange.map((d) => d.sleepHours));

  const moneyInRange = data.money.filter((m) => inRange(m.date));
  const income = moneyInRange.filter((m) => m.type === "income").reduce((s, m) => s + Number(m.amount || 0), 0);
  const expense = moneyInRange.filter((m) => m.type === "expense").reduce((s, m) => s + Number(m.amount || 0), 0);

  const habitEntriesInRange = data.habitEntries.filter((e) => inRange(e.date) && e.done);
  const habitPossible = data.habits.length * rangeDays;
  const habitCompletion = habitPossible ? Math.round((habitEntriesInRange.length / habitPossible) * 100) : 0;

  const tradesInRange = data.trades.filter((t) => inRange(t.date));

  const moodSeries = [...daysInRange]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => d.metrics?.mood)
    .filter((v) => typeof v === "number");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>Insights</div>
        <Segmented value={range} onChange={setRange} options={[{ value: "week", label: "Week" }, { value: "month", label: "Month" }, { value: "year", label: "Year" }]} />
      </div>

      <Panel title="Wellbeing">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <StatTile label="Avg mood" value={moodAvg ?? "—"} />
          <StatTile label="Avg energy" value={energyAvg ?? "—"} />
          <StatTile label="Avg productivity" value={productivityAvg ?? "—"} />
          <StatTile label="Avg sleep" value={sleepAvg != null ? `${sleepAvg}h` : "—"} />
        </div>
        <MiniLineChart points={moodSeries} />
        <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 6 }}>{daysInRange.length} day{daysInRange.length === 1 ? "" : "s"} logged in this range. Trends shown as-is — not a claim of cause and effect.</div>
      </Panel>

      <Panel title="Habits">
        <StatTile label="Completion" value={`${habitCompletion}%`} sub={`${data.habits.length} active habit${data.habits.length === 1 ? "" : "s"}`} />
      </Panel>

      <Panel title="Money">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <StatTile label="Income" value={income.toLocaleString()} tone="good" />
          <StatTile label="Expense" value={expense.toLocaleString()} tone="bad" />
          <StatTile label="Net" value={(income - expense).toLocaleString()} />
        </div>
      </Panel>

      <Panel title="Trading">
        <StatTile label="Trades logged" value={tradesInRange.length} sub="via Lfenwa Trades" />
      </Panel>
    </div>
  );
}
