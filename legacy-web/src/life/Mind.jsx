import React, { useEffect, useState, useCallback } from "react";
import { FiTrash2 } from "react-icons/fi";
import { C, Panel, Field, TextArea, RatingScale, MiniLineChart, primaryBtn, fmtDateShort } from "./ui.jsx";
import { dbGetAll, dbPut, dbDelete, uid, todayStr } from "./storage.js";

export default function Mind() {
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState({ mood: null, energy: null, stress: null, focus: null, thought: "" });

  const reload = useCallback(async () => {
    const rows = await dbGetAll("mindEntries");
    rows.sort((a, b) => (b.date + b.time || "").localeCompare(a.date + a.time || ""));
    setEntries(rows);
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  async function save() {
    if (form.mood == null && form.energy == null && form.stress == null && form.focus == null && !form.thought.trim()) return;
    await dbPut("mindEntries", { id: uid(), date: todayStr(), time: new Date().toTimeString().slice(0, 5), ...form });
    setForm({ mood: null, energy: null, stress: null, focus: null, thought: "" });
    reload();
  }

  const last14 = [...entries]
    .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")))
    .slice(-14)
    .filter((e) => e.mood != null);

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, color: C.ink, marginBottom: 14 }}>Mind</div>

      <Panel title="Mood trend (last entries)">
        <MiniLineChart points={last14.map((e) => e.mood)} />
      </Panel>

      <Panel title="New entry">
        <Field label="Mood">
          <RatingScale value={form.mood} onChange={(v) => setForm((p) => ({ ...p, mood: v }))} />
        </Field>
        <Field label="Energy">
          <RatingScale value={form.energy} onChange={(v) => setForm((p) => ({ ...p, energy: v }))} />
        </Field>
        <Field label="Stress">
          <RatingScale value={form.stress} onChange={(v) => setForm((p) => ({ ...p, stress: v }))} />
        </Field>
        <Field label="Focus">
          <RatingScale value={form.focus} onChange={(v) => setForm((p) => ({ ...p, focus: v }))} />
        </Field>
        <Field label="Thoughts">
          <TextArea value={form.thought} onChange={(v) => setForm((p) => ({ ...p, thought: v }))} rows={4} placeholder="Anything on your mind…" />
        </Field>
        <button onClick={save} style={{ ...primaryBtn, width: "100%" }}>
          Save
        </button>
      </Panel>

      <Panel title="Past entries">
        {entries.length === 0 && <div style={{ fontSize: 13, color: C.inkFaint }}>Nothing yet.</div>}
        {entries.map((e) => (
          <div key={e.id} style={{ padding: "8px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: C.inkFaint }}>
                {fmtDateShort(e.date)} {e.time}
              </span>
              <button onClick={async () => { await dbDelete("mindEntries", e.id); reload(); }} style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer" }}>
                <FiTrash2 size={12} />
              </button>
            </div>
            <div style={{ fontSize: 12, color: C.inkDim, marginTop: 2 }}>
              {e.mood != null && `Mood ${e.mood}`} {e.energy != null && `· Energy ${e.energy}`} {e.stress != null && `· Stress ${e.stress}`} {e.focus != null && `· Focus ${e.focus}`}
            </div>
            {e.thought && <div style={{ fontSize: 13, color: C.ink, marginTop: 4 }}>{e.thought}</div>}
          </div>
        ))}
      </Panel>
    </div>
  );
}
