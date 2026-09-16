"use client";
import React, { useEffect, useState, useCallback } from "react";
import { FiPlus, FiArrowLeft } from "react-icons/fi";
import { C, Panel, Field, TextInput, TextArea, SelectInput, Badge, ConfirmDelete, primaryBtn, ghostBtn } from "./ui";
import { dbGetAll, dbPut, dbDelete, uid, todayStr } from "@/lib/storage";
import type { Goal, GoalStatus, Milestone } from "@/types/life";

const CATEGORIES = ["Career", "Health", "Learning", "Finance", "Relationships", "Personal", "Other"];
const STATUSES: GoalStatus[] = ["active", "paused", "done"];

function ProgressBar({ value }: { value: number }) {
  return (
    <div style={{ background: C.bgAlt, borderRadius: 999, height: 8, overflow: "hidden" }}>
      <div style={{ width: `${value}%`, background: C.accent, height: "100%" }} />
    </div>
  );
}

export default function Goals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [route, setRoute] = useState<{ mode: "list" | "form"; id: string | null }>({ mode: "list", id: null });

  const reload = useCallback(async () => {
    const rows = await dbGetAll("goals");
    rows.sort((a, b) => Number(a.status === "done") - Number(b.status === "done"));
    setGoals(rows);
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  if (route.mode === "form") {
    const g = route.id ? goals.find((x) => x.id === route.id) : null;
    return (
      <GoalForm
        initial={g || null}
        onDone={() => {
          setRoute({ mode: "list", id: null });
          reload();
        }}
        onCancel={() => setRoute({ mode: "list", id: null })}
      />
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>Goals</div>
        <button onClick={() => setRoute({ mode: "form", id: null })} style={{ ...primaryBtn, padding: "7px 12px", display: "flex", alignItems: "center", gap: 6 }}>
          <FiPlus /> New goal
        </button>
      </div>
      {goals.length === 0 && (
        <Panel>
          <div style={{ fontSize: 13, color: C.inkFaint }}>No goals yet. Create your first one.</div>
        </Panel>
      )}
      {goals.map((g) => (
        <Panel key={g.id} style={{ cursor: "pointer" }}>
          <div onClick={() => setRoute({ mode: "form", id: g.id })}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{g.title}</div>
              <Badge tone={g.status === "done" ? "good" : "neutral"}>{g.status}</Badge>
            </div>
            <div style={{ fontSize: 12, color: C.inkDim, marginBottom: 8 }}>{g.category} {g.targetDate ? `· target ${g.targetDate}` : ""}</div>
            <ProgressBar value={g.progress || 0} />
            <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 4 }}>{g.progress || 0}%</div>
          </div>
        </Panel>
      ))}
    </div>
  );
}

function GoalForm({ initial, onDone, onCancel }: { initial: Goal | null; onDone: () => void; onCancel: () => void }) {
  const [g, setG] = useState<Goal>(
    initial || { id: uid(), title: "", description: "", category: "Personal", startDate: todayStr(), targetDate: "", progress: 0, status: "active", milestones: [], notes: "" }
  );
  const [milestoneText, setMilestoneText] = useState("");
  function set<K extends keyof Goal>(k: K, v: Goal[K]) {
    setG((p) => ({ ...p, [k]: v }));
  }
  async function save() {
    if (!g.title.trim()) return;
    await dbPut("goals", g);
    onDone();
  }
  function addMilestone() {
    if (!milestoneText.trim()) return;
    set("milestones", [...(g.milestones || []), { id: uid(), text: milestoneText.trim(), done: false }]);
    setMilestoneText("");
  }
  function toggleMilestone(id: string) {
    set("milestones", g.milestones.map((m: Milestone) => (m.id === id ? { ...m, done: !m.done } : m)));
  }
  return (
    <div>
      <button onClick={onCancel} style={{ ...ghostBtn, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
        <FiArrowLeft /> Back
      </button>
      <Panel title={initial ? "Edit goal" : "New goal"}>
        <Field label="Title">
          <TextInput value={g.title} onChange={(v) => set("title", v)} placeholder="e.g. Learn programming" />
        </Field>
        <Field label="Description">
          <TextArea value={g.description} onChange={(v) => set("description", v)} rows={2} />
        </Field>
        <Field label="Category">
          <SelectInput value={g.category} onChange={(v) => set("category", v)} options={CATEGORIES} />
        </Field>
        <Field label="Start date">
          <TextInput type="date" value={g.startDate} onChange={(v) => set("startDate", v)} mono />
        </Field>
        <Field label="Target date">
          <TextInput type="date" value={g.targetDate} onChange={(v) => set("targetDate", v)} mono />
        </Field>
        <Field label={`Progress: ${g.progress}%`}>
          <input type="range" min={0} max={100} value={g.progress} onChange={(e) => set("progress", Number(e.target.value))} style={{ width: "100%" }} />
        </Field>
        <Field label="Status">
          <SelectInput value={g.status} onChange={(v) => set("status", v as GoalStatus)} options={STATUSES} />
        </Field>
        <Field label="Milestones">
          {(g.milestones || []).map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
              <input type="checkbox" checked={m.done} onChange={() => toggleMilestone(m.id)} />
              <span style={{ fontSize: 13, color: m.done ? C.inkFaint : C.ink, textDecoration: m.done ? "line-through" : "none" }}>{m.text}</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <div style={{ flex: 1 }}>
              <TextInput value={milestoneText} onChange={setMilestoneText} placeholder="Add a milestone" />
            </div>
            <button onClick={addMilestone} style={ghostBtn}>
              Add
            </button>
          </div>
        </Field>
        <Field label="Notes">
          <TextArea value={g.notes} onChange={(v) => set("notes", v)} rows={2} />
        </Field>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button onClick={save} style={primaryBtn}>
            Save
          </button>
          {initial && (
            <ConfirmDelete
              onConfirm={async () => {
                await dbDelete("goals", g.id);
                onDone();
              }}
            />
          )}
        </div>
      </Panel>
    </div>
  );
}
