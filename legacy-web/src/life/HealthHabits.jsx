import React, { useEffect, useState, useCallback } from "react";
import { FiPlus, FiTrash2, FiCheck } from "react-icons/fi";
import { C, Panel, Field, TextInput, ConfirmDelete, primaryBtn, ghostBtn, StatTile } from "./ui.jsx";
import { dbGetAll, dbPut, dbDelete, dbGetByHabit, uid, todayStr } from "./storage.js";

function lastNDates(n) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() - 1);
  }
  return out;
}

export default function HealthHabits() {
  const [habits, setHabits] = useState([]);
  const [entriesByHabit, setEntriesByHabit] = useState({});
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const today = todayStr();

  const reload = useCallback(async () => {
    let hs = await dbGetAll("habits");
    hs = hs.filter((h) => !h.archived);
    if (hs.length === 0) {
      // Seed a few sensible real habits so the tab isn't an empty shell on first run.
      const seed = ["Exercise", "Study", "Drink water", "Sleep early"].map((n) => ({ id: uid(), name: n, createdAt: Date.now(), archived: false }));
      for (const h of seed) await dbPut("habits", h);
      hs = seed;
    }
    setHabits(hs);
    const map = {};
    for (const h of hs) map[h.id] = await dbGetByHabit(h.id);
    setEntriesByHabit(map);
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  async function toggle(habit, date) {
    const id = `${habit.id}:${date}`;
    const existing = entriesByHabit[habit.id]?.find((e) => e.date === date);
    await dbPut("habitEntries", { id, habitId: habit.id, date, done: !existing?.done });
    reload();
  }

  function streak(habit) {
    const entries = entriesByHabit[habit.id] || [];
    const doneDates = new Set(entries.filter((e) => e.done).map((e) => e.date));
    let s = 0;
    const dates = lastNDates(365);
    for (const d of dates) {
      if (doneDates.has(d)) s++;
      else break;
    }
    return s;
  }
  function completion(habit, days) {
    const entries = entriesByHabit[habit.id] || [];
    const doneDates = new Set(entries.filter((e) => e.done).map((e) => e.date));
    const dates = lastNDates(days);
    const done = dates.filter((d) => doneDates.has(d)).length;
    return Math.round((done / days) * 100);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>Health & Habits</div>
        <button onClick={() => setAdding((s) => !s)} style={{ ...primaryBtn, padding: "7px 12px", display: "flex", alignItems: "center", gap: 6 }}>
          <FiPlus /> New habit
        </button>
      </div>

      {adding && (
        <Panel>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <TextInput value={name} onChange={setName} placeholder="e.g. Reading, No sugar, Meditate" />
            </div>
            <button
              disabled={!name.trim()}
              onClick={async () => {
                await dbPut("habits", { id: uid(), name: name.trim(), createdAt: Date.now(), archived: false });
                setName("");
                setAdding(false);
                reload();
              }}
              style={primaryBtn}
            >
              Create
            </button>
          </div>
        </Panel>
      )}

      <Panel title="Today">
        {habits.map((h) => {
          const doneToday = entriesByHabit[h.id]?.find((e) => e.date === today)?.done;
          return (
            <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
              <span style={{ fontSize: 14, color: C.ink }}>{h.name}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: C.inkFaint }}>{streak(h)}🔥</span>
                <button
                  onClick={() => toggle(h, today)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    border: `1px solid ${doneToday ? C.good : C.line}`,
                    background: doneToday ? C.goodDim : C.bgAlt,
                    color: doneToday ? C.good : C.inkFaint,
                    cursor: "pointer",
                  }}
                >
                  <FiCheck />
                </button>
                <button
                  onClick={async () => {
                    await dbPut("habits", { ...h, archived: true });
                    reload();
                  }}
                  style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer" }}
                >
                  <FiTrash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </Panel>

      <Panel title="Completion">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {habits.map((h) => (
            <div key={h.id}>
              <div style={{ fontSize: 12, color: C.inkDim, marginBottom: 4 }}>{h.name}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <StatTile label="Week" value={`${completion(h, 7)}%`} />
                <StatTile label="Month" value={`${completion(h, 30)}%`} />
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
