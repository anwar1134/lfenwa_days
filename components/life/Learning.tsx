"use client";
import React, { useEffect, useState, useCallback } from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { C, Panel, Field, TextInput, TextArea, primaryBtn, fmtDateShort } from "./ui";
import { dbGetAll, dbPut, dbDelete, uid, todayStr } from "@/lib/storage";
import type { LearningEntry } from "@/types/life";

export default function Learning() {
  const [items, setItems] = useState<LearningEntry[]>([]);
  const [adding, setAdding] = useState(false);

  const reload = useCallback(async () => {
    const rows = await dbGetAll("learning");
    rows.sort((a, b) => b.date.localeCompare(a.date));
    setItems(rows);
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>Learning</div>
        <button onClick={() => setAdding((s) => !s)} style={{ ...primaryBtn, padding: "7px 12px", display: "flex", alignItems: "center", gap: 6 }}>
          <FiPlus /> Add
        </button>
      </div>
      {adding && (
        <Panel>
          <LearningForm onDone={() => { setAdding(false); reload(); }} />
        </Panel>
      )}
      {items.length === 0 && !adding && (
        <Panel>
          <div style={{ fontSize: 13, color: C.inkFaint }}>Nothing logged yet. Learning entries are optional — add one whenever something clicks.</div>
        </Panel>
      )}
      {items.map((l) => (
        <Panel key={l.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 11, color: C.inkFaint, marginBottom: 4 }}>{fmtDateShort(l.date)}</div>
              <div style={{ fontSize: 13, color: C.ink }}>{l.whatLearned}</div>
              {l.whatUnderstood && <div style={{ fontSize: 12, color: C.inkDim, marginTop: 4 }}>Understood: {l.whatUnderstood}</div>}
              {l.whatConfused && <div style={{ fontSize: 12, color: C.inkDim, marginTop: 2 }}>Still unclear: {l.whatConfused}</div>}
              {l.importantIdea && <div style={{ fontSize: 12, color: C.accent, marginTop: 4 }}>💡 {l.importantIdea}</div>}
              {l.resource && <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 2 }}>{l.resource}</div>}
            </div>
            <button onClick={async () => { await dbDelete("learning", l.id); reload(); }} style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer" }}>
              <FiTrash2 size={14} />
            </button>
          </div>
        </Panel>
      ))}
    </div>
  );
}

type LearningFormState = { whatLearned: string; whatUnderstood: string; whatConfused: string; importantIdea: string; resource: string };

function LearningForm({ onDone }: { onDone: () => void }) {
  const [date, setDate] = useState(todayStr());
  const [form, setForm] = useState<LearningFormState>({ whatLearned: "", whatUnderstood: "", whatConfused: "", importantIdea: "", resource: "" });
  function set<K extends keyof LearningFormState>(k: K, v: LearningFormState[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }
  async function save() {
    if (!form.whatLearned.trim()) return;
    await dbPut("learning", { id: uid(), date, ...form });
    onDone();
  }
  return (
    <div>
      <Field label="Date">
        <TextInput type="date" value={date} onChange={setDate} mono />
      </Field>
      <Field label="What I learned">
        <TextArea value={form.whatLearned} onChange={(v) => set("whatLearned", v)} rows={2} />
      </Field>
      <Field label="What I understood">
        <TextArea value={form.whatUnderstood} onChange={(v) => set("whatUnderstood", v)} rows={2} />
      </Field>
      <Field label="What I still don't understand">
        <TextArea value={form.whatConfused} onChange={(v) => set("whatConfused", v)} rows={2} />
      </Field>
      <Field label="Important idea">
        <TextInput value={form.importantIdea} onChange={(v) => set("importantIdea", v)} />
      </Field>
      <Field label="Resource / reference">
        <TextInput value={form.resource} onChange={(v) => set("resource", v)} />
      </Field>
      <button disabled={!form.whatLearned.trim()} onClick={save} style={{ ...primaryBtn, width: "100%" }}>
        Save
      </button>
    </div>
  );
}
