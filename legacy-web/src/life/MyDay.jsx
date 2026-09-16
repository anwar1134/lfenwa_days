import React, { useEffect, useState, useCallback } from "react";
import { FiChevronLeft, FiChevronRight, FiTrash2, FiPlus, FiTrendingUp } from "react-icons/fi";
import { C, Panel, Field, TextInput, TextArea, NumberInput, SelectInput, Segmented, RatingScale, ConfirmDelete, primaryBtn, ghostBtn, fmtDateLong, StatTile } from "./ui.jsx";
import { dbGet, dbPut, dbGetByDate, dbDelete, uid, todayStr, getTradesForDate } from "./storage.js";

const SUBTABS = ["Basic", "Metrics", "Timeline", "Tasks", "Achievements", "Learning", "Review"];
const TIMELINE_CATEGORIES = ["Work/Study", "Exercise", "Family", "Social", "Rest", "Chore", "Person", "Event", "Conversation", "Moment", "Other"];

function DateNav({ date, setDate }) {
  function shift(days) {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().slice(0, 10));
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <button onClick={() => shift(-1)} style={{ ...ghostBtn, padding: "6px 9px" }}>
        <FiChevronLeft />
      </button>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ background: C.bgAlt, border: `1px solid ${C.line}`, borderRadius: 8, color: C.ink, padding: "7px 9px", fontSize: 13 }} />
      <button onClick={() => shift(1)} style={{ ...ghostBtn, padding: "6px 9px" }}>
        <FiChevronRight />
      </button>
      {date !== todayStr() && (
        <button onClick={() => setDate(todayStr())} style={{ ...ghostBtn, padding: "6px 10px", fontSize: 12 }}>
          Today
        </button>
      )}
    </div>
  );
}

export default function MyDay({ date, setDate }) {
  const [sub, setSub] = useState("Basic");
  const [day, setDay] = useState({ date });
  const [timeline, setTimeline] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [learning, setLearning] = useState([]);
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const [d, tl, tk, ac, lr, trd] = await Promise.all([
      dbGet("days", date),
      dbGetByDate("timeline", date),
      dbGetByDate("tasks", date),
      dbGetByDate("achievements", date),
      dbGetByDate("learning", date),
      getTradesForDate(date),
    ]);
    setDay(d || { date });
    setTimeline(tl.sort((a, b) => (a.time || "").localeCompare(b.time || "")));
    setTasks(tk);
    setAchievements(ac);
    setLearning(lr);
    setTrades(trd);
    setLoading(false);
  }, [date]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function saveDay(patch) {
    const next = { ...day, ...patch, date };
    setDay(next);
    await dbPut("days", next);
  }

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>My Day</div>
        <div style={{ fontSize: 13, color: C.inkDim, marginBottom: 8 }}>{fmtDateLong(date)}</div>
        <DateNav date={date} setDate={setDate} />
      </div>

      <div style={{ marginBottom: 14, overflowX: "auto" }}>
        <Segmented value={sub} onChange={setSub} options={SUBTABS} />
      </div>

      {loading ? (
        <div style={{ color: C.inkDim }}>Loading…</div>
      ) : (
        <>
          {sub === "Basic" && <BasicInfo day={day} onSave={saveDay} trades={trades} />}
          {sub === "Metrics" && <Metrics day={day} onSave={saveDay} />}
          {sub === "Timeline" && <Timeline date={date} items={timeline} reload={reload} />}
          {sub === "Tasks" && <Tasks date={date} items={tasks} reload={reload} />}
          {sub === "Achievements" && <Achievements date={date} items={achievements} reload={reload} />}
          {sub === "Learning" && <Learning date={date} items={learning} reload={reload} />}
          {sub === "Review" && <Review day={day} onSave={saveDay} />}
        </>
      )}
    </div>
  );
}

function BasicInfo({ day, onSave, trades }) {
  return (
    <div>
      {trades.length > 0 && (
        <Panel title="Trading" style={{ background: C.panelRaised }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.ink }}>
            <FiTrendingUp color={C.accent} /> {trades.length} trade{trades.length === 1 ? "" : "s"} logged in Lfenwa Trades on this date.
          </div>
        </Panel>
      )}
      <Panel title="Basic information">
        <Field label="Wake-up time">
          <TextInput type="time" value={day.wakeTime} onChange={(v) => onSave({ wakeTime: v })} mono />
        </Field>
        <Field label="Sleep time">
          <TextInput type="time" value={day.sleepTime} onChange={(v) => onSave({ sleepTime: v })} mono />
        </Field>
        <Field label="Hours slept">
          <NumberInput value={day.sleepHours} onChange={(v) => onSave({ sleepHours: v })} step="0.5" placeholder="7" />
        </Field>
        <Field label="Location (optional)">
          <TextInput value={day.location} onChange={(v) => onSave({ location: v })} placeholder="Optional" />
        </Field>
        <Field label="General note">
          <TextArea value={day.note} onChange={(v) => onSave({ note: v })} rows={3} />
        </Field>
      </Panel>
    </div>
  );
}

function Metrics({ day, onSave }) {
  const m = day.metrics || {};
  function set(key, v) {
    onSave({ metrics: { ...m, [key]: v } });
  }
  const rows = [
    ["Mood", "mood"],
    ["Energy", "energy"],
    ["Focus", "focus"],
    ["Motivation", "motivation"],
    ["Stress", "stress"],
    ["Productivity", "productivity"],
  ];
  return (
    <Panel title="Daily metrics">
      {rows.map(([label, key]) => (
        <Field key={key} label={label}>
          <RatingScale value={m[key]} onChange={(v) => set(key, v)} />
        </Field>
      ))}
    </Panel>
  );
}

function Timeline({ date, items, reload }) {
  const [adding, setAdding] = useState(false);
  return (
    <Panel title="Timeline" right={<button onClick={() => setAdding((s) => !s)} style={{ ...ghostBtn, padding: "5px 9px" }}><FiPlus /></button>}>
      {adding && <TimelineForm date={date} onDone={() => { setAdding(false); reload(); }} />}
      {items.length === 0 && !adding && <div style={{ fontSize: 13, color: C.inkFaint }}>Nothing logged yet.</div>}
      {items.map((it) => (
        <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
          <div>
            <span style={{ ...{ fontFamily: "ui-monospace" }, color: C.accent, marginRight: 8 }}>{it.time || "—"}</span>
            <span style={{ color: C.ink }}>{it.activity}</span>
            <span style={{ color: C.inkFaint, fontSize: 11, marginLeft: 6 }}>{it.category}</span>
            {it.note && <div style={{ fontSize: 12, color: C.inkDim, marginTop: 2 }}>{it.note}</div>}
          </div>
          <button onClick={async () => { await dbDelete("timeline", it.id); reload(); }} style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer" }}>
            <FiTrash2 size={14} />
          </button>
        </div>
      ))}
    </Panel>
  );
}
function TimelineForm({ date, onDone }) {
  const [time, setTime] = useState(new Date().toTimeString().slice(0, 5));
  const [activity, setActivity] = useState("");
  const [category, setCategory] = useState("Work/Study");
  const [note, setNote] = useState("");
  return (
    <div style={{ marginBottom: 12, padding: 10, background: C.bgAlt, borderRadius: 8 }}>
      <Field label="Time">
        <TextInput type="time" value={time} onChange={setTime} mono />
      </Field>
      <Field label="Activity">
        <TextInput value={activity} onChange={setActivity} placeholder="What happened?" />
      </Field>
      <Field label="Category">
        <SelectInput value={category} onChange={setCategory} options={TIMELINE_CATEGORIES} />
      </Field>
      <Field label="Note">
        <TextArea value={note} onChange={setNote} rows={2} />
      </Field>
      <button
        disabled={!activity.trim()}
        onClick={async () => {
          await dbPut("timeline", { id: uid(), date, time, activity: activity.trim(), category, note: note.trim() });
          onDone();
        }}
        style={{ ...primaryBtn, width: "100%" }}
      >
        Add
      </button>
    </div>
  );
}

function Achievements({ date, items, reload }) {
  const [text, setText] = useState("");
  return (
    <Panel title="Achievements">
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <TextInput value={text} onChange={setText} placeholder="What did you accomplish?" />
        </div>
        <button
          disabled={!text.trim()}
          onClick={async () => {
            await dbPut("achievements", { id: uid(), date, text: text.trim() });
            setText("");
            reload();
          }}
          style={primaryBtn}
        >
          Add
        </button>
      </div>
      {items.length === 0 && <div style={{ fontSize: 13, color: C.inkFaint }}>Nothing yet.</div>}
      {items.map((a) => (
        <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
          <span style={{ color: C.ink, fontSize: 13 }}>✓ {a.text}</span>
          <button onClick={async () => { await dbDelete("achievements", a.id); reload(); }} style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer" }}>
            <FiTrash2 size={13} />
          </button>
        </div>
      ))}
    </Panel>
  );
}

function Tasks({ date, items, reload }) {
  const [text, setText] = useState("");
  async function add() {
    if (!text.trim()) return;
    await dbPut("tasks", { id: uid(), date, text: text.trim(), status: "pending" });
    setText("");
    reload();
  }
  async function setStatus(t, status) {
    await dbPut("tasks", { ...t, status, completedAt: status === "done" ? Date.now() : null });
    reload();
  }
  const planned = items.length;
  const done = items.filter((t) => t.status === "done").length;
  const postponed = items.filter((t) => t.status === "postponed").length;
  return (
    <Panel title="Tasks" right={<span style={{ fontSize: 12, color: C.inkDim }}>{done}/{planned} done{postponed ? ` · ${postponed} postponed` : ""}</span>}>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <TextInput value={text} onChange={setText} placeholder="What did you plan to do?" />
        </div>
        <button disabled={!text.trim()} onClick={add} style={primaryBtn}>
          Plan
        </button>
      </div>
      {items.length === 0 && <div style={{ fontSize: 13, color: C.inkFaint }}>Nothing planned yet.</div>}
      {items.map((t) => (
        <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
          <span style={{ color: t.status === "done" ? C.good : C.ink, fontSize: 13, textDecoration: t.status === "postponed" ? "line-through" : "none" }}>{t.text}</span>
          <div style={{ display: "flex", gap: 4 }}>
            {["pending", "done", "postponed"].map((s) => (
              <button
                key={s}
                onClick={() => setStatus(t, s)}
                style={{ fontSize: 11, padding: "3px 7px", borderRadius: 6, border: `1px solid ${t.status === s ? C.accent : C.line}`, background: t.status === s ? C.accentDim : "transparent", color: t.status === s ? C.ink : C.inkFaint, cursor: "pointer" }}
              >
                {s}
              </button>
            ))}
            <button onClick={async () => { await dbDelete("tasks", t.id); reload(); }} style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer" }}>
              <FiTrash2 size={13} />
            </button>
          </div>
        </div>
      ))}
    </Panel>
  );
}

function Learning({ date, items, reload }) {
  const [adding, setAdding] = useState(items.length === 0);
  const [form, setForm] = useState({ whatLearned: "", whatUnderstood: "", whatConfused: "", importantIdea: "", resource: "" });
  async function save() {
    if (!form.whatLearned.trim()) return;
    await dbPut("learning", { id: uid(), date, ...form });
    setForm({ whatLearned: "", whatUnderstood: "", whatConfused: "", importantIdea: "", resource: "" });
    setAdding(false);
    reload();
  }
  return (
    <Panel title="Learning" right={<button onClick={() => setAdding((s) => !s)} style={{ ...ghostBtn, padding: "5px 9px" }}><FiPlus /></button>}>
      {adding && (
        <div style={{ marginBottom: 12, padding: 10, background: C.bgAlt, borderRadius: 8 }}>
          <Field label="What I learned">
            <TextArea value={form.whatLearned} onChange={(v) => setForm((p) => ({ ...p, whatLearned: v }))} rows={2} />
          </Field>
          <Field label="What I understood">
            <TextArea value={form.whatUnderstood} onChange={(v) => setForm((p) => ({ ...p, whatUnderstood: v }))} rows={2} />
          </Field>
          <Field label="What I still don't understand">
            <TextArea value={form.whatConfused} onChange={(v) => setForm((p) => ({ ...p, whatConfused: v }))} rows={2} />
          </Field>
          <Field label="Important idea">
            <TextInput value={form.importantIdea} onChange={(v) => setForm((p) => ({ ...p, importantIdea: v }))} />
          </Field>
          <Field label="Resource / reference">
            <TextInput value={form.resource} onChange={(v) => setForm((p) => ({ ...p, resource: v }))} />
          </Field>
          <button disabled={!form.whatLearned.trim()} onClick={save} style={{ ...primaryBtn, width: "100%" }}>
            Add
          </button>
        </div>
      )}
      {items.length === 0 && !adding && <div style={{ fontSize: 13, color: C.inkFaint }}>Optional — nothing logged yet.</div>}
      {items.map((l) => (
        <div key={l.id} style={{ padding: "8px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
          <div style={{ fontSize: 13, color: C.ink }}>{l.whatLearned}</div>
          {l.importantIdea && <div style={{ fontSize: 12, color: C.accent, marginTop: 2 }}>💡 {l.importantIdea}</div>}
          {l.resource && <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 2 }}>{l.resource}</div>}
          <button onClick={async () => { await dbDelete("learning", l.id); reload(); }} style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer", fontSize: 11, marginTop: 4 }}>
            <FiTrash2 size={12} style={{ verticalAlign: -1 }} /> remove
          </button>
        </div>
      ))}
    </Panel>
  );
}

function Review({ day, onSave }) {
  const r = day.review || {};
  function set(key, v) {
    onSave({ review: { ...r, [key]: v } });
  }
  return (
    <Panel title="End of day review (optional)">
      <Field label="Best thing today">
        <TextInput value={r.best} onChange={(v) => set("best", v)} />
      </Field>
      <Field label="Worst thing today">
        <TextInput value={r.worst} onChange={(v) => set("worst", v)} />
      </Field>
      <Field label="What I learned">
        <TextInput value={r.learned} onChange={(v) => set("learned", v)} />
      </Field>
      <Field label="What I would change">
        <TextInput value={r.change} onChange={(v) => set("change", v)} />
      </Field>
      <Field label="Tomorrow's priority">
        <TextInput value={r.tomorrowPriority} onChange={(v) => set("tomorrowPriority", v)} />
      </Field>
      <Field label={`Day rating: ${r.rating ?? "—"}/10`}>
        <RatingScale value={r.rating} onChange={(v) => set("rating", v)} />
      </Field>
    </Panel>
  );
}
