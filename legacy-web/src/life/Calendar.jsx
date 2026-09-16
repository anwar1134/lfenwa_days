import React, { useEffect, useState, useCallback } from "react";
import { FiChevronLeft, FiChevronRight, FiX } from "react-icons/fi";
import { C, Panel, fmtDateLong, primaryBtn, ghostBtn } from "./ui.jsx";
import { dbGetAll, dbGet, getTradesForDate, todayStr } from "./storage.js";

function monthLabel(y, m) {
  return new Date(y, m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
function daysInMonth(y, m) {
  return new Date(y, m + 1, 0).getDate();
}
function pad(n) {
  return String(n).padStart(2, "0");
}

export default function Calendar({ onOpenDay }) {
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [markedDates, setMarkedDates] = useState(new Set());
  const [popup, setPopup] = useState(null); // date string
  const [loading, setLoading] = useState(true);

  const loadMonthData = useCallback(async () => {
    setLoading(true);
    const stores = ["days", "timeline", "achievements", "tasks", "learning", "money", "memories", "mindEntries"];
    const sets = await Promise.all(stores.map((s) => dbGetAll(s)));
    const marks = new Set();
    sets.forEach((rows) => rows.forEach((r) => r.date && marks.add(r.date)));
    // Trades (read-only) too, so trading days show a dot as well.
    const { readTradesKV } = await import("./storage.js");
    const trades = (await readTradesKV("trades")) || [];
    trades.forEach((t) => t.date && marks.add(t.date));
    setMarkedDates(marks);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadMonthData();
  }, [loadMonthData]);

  const { y, m } = cursor;
  const first = new Date(y, m, 1);
  const startWeekday = (first.getDay() + 6) % 7; // Monday-first
  const total = daysInMonth(y, m);
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(`${y}-${pad(m + 1)}-${pad(d)}`);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>Calendar</div>
      </div>
      <Panel>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <button onClick={() => setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }))} style={{ ...ghostBtn, padding: "5px 9px" }}>
            <FiChevronLeft />
          </button>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{monthLabel(y, m)}</div>
          <button onClick={() => setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }))} style={{ ...ghostBtn, padding: "5px 9px" }}>
            <FiChevronRight />
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, fontSize: 10, color: C.inkFaint, marginBottom: 4, textAlign: "center" }}>
          {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {cells.map((date, i) => {
            if (!date) return <div key={i} />;
            const isToday = date === todayStr();
            const hasData = markedDates.has(date);
            return (
              <button
                key={date}
                onClick={() => setPopup(date)}
                style={{
                  aspectRatio: "1",
                  borderRadius: 8,
                  border: `1px solid ${isToday ? C.accent : C.line}`,
                  background: isToday ? C.accentDim : C.bgAlt,
                  color: C.ink,
                  fontSize: 12,
                  cursor: "pointer",
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {Number(date.slice(-2))}
                {hasData && <span style={{ position: "absolute", bottom: 4, width: 4, height: 4, borderRadius: 2, background: C.accent }} />}
              </button>
            );
          })}
        </div>
        {loading && <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 8 }}>Loading month data…</div>}
      </Panel>

      {popup && <DaySummaryPopup date={popup} onClose={() => setPopup(null)} onOpenDay={onOpenDay} />}
    </div>
  );
}

function DaySummaryPopup({ date, onClose, onOpenDay }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    (async () => {
      const [day, trades] = await Promise.all([dbGet("days", date), getTradesForDate(date)]);
      setData({ day: day || {}, trades });
    })();
  }, [date]);
  const m = data?.day?.metrics || {};
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, color: C.ink }}>{fmtDateLong(date)}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.inkDim, cursor: "pointer" }}>
            <FiX />
          </button>
        </div>
        {!data ? (
          <div style={{ color: C.inkDim, fontSize: 13 }}>Loading…</div>
        ) : (
          <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.9 }}>
            <div>Mood: {m.mood ?? "—"}/10 · Energy: {m.energy ?? "—"}/10</div>
            <div>Sleep: {data.day.sleepHours ?? "—"}h</div>
            <div>Trades: {data.trades.length}</div>
          </div>
        )}
        <button
          onClick={() => {
            onOpenDay(date);
            onClose();
          }}
          style={{ ...primaryBtn, width: "100%", marginTop: 14 }}
        >
          Open full day
        </button>
      </div>
    </div>
  );
}
