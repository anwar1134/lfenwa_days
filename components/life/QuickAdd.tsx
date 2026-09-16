"use client";
import React, { useState, useEffect } from "react";
import { FiX, FiSun, FiActivity, FiCamera, FiDollarSign, FiBookOpen, FiTarget, FiTrendingUp, FiCheck } from "react-icons/fi";
import type { IconType } from "react-icons";
import { C, Field, TextInput, TextArea, NumberInput, SelectInput, RatingScale, Segmented, primaryBtn } from "./ui";
import { dbPut, dbGet, dbGetAll, uid, todayStr, compressImage } from "@/lib/storage";
import type { TabKey, DayMetrics, MoneyType, Goal } from "@/types/life";

const TIMELINE_CATEGORIES = ["Work/Study", "Exercise", "Family", "Social", "Rest", "Chore", "Person", "Event", "Conversation", "Moment", "Other"];
const MONEY_CATEGORIES = ["Food", "Transport", "Housing", "Shopping", "Health", "Entertainment", "Bills", "Income", "Other"];

type QuickAddType = "daily" | "activity" | "memory" | "expense" | "learning" | "goal" | "trade";

const OPTIONS: { key: QuickAddType; label: string; icon: IconType; desc: string }[] = [
  { key: "daily", label: "Daily entry", icon: FiSun, desc: "Mood, energy, focus, sleep" },
  { key: "activity", label: "Activity", icon: FiActivity, desc: "Add to today's timeline" },
  { key: "memory", label: "Memory", icon: FiCamera, desc: "Photo, note, voice, or file" },
  { key: "expense", label: "Expense / Income", icon: FiDollarSign, desc: "Log a transaction" },
  { key: "learning", label: "Learning", icon: FiBookOpen, desc: "What you learned today" },
  { key: "goal", label: "Goal progress", icon: FiTarget, desc: "Update progress on a goal" },
  { key: "trade", label: "Trade", icon: FiTrendingUp, desc: "Opens Lfenwa Trades" },
];

export default function QuickAdd({
  onClose,
  onNavigate,
  defaultType,
}: {
  onClose: () => void;
  onNavigate: (tab: TabKey) => void;
  defaultType?: QuickAddType;
}) {
  const [type, setType] = useState<QuickAddType | null>(defaultType || null);

  useEffect(() => {
    if (type === "trade") {
      onNavigate("trades");
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto", padding: 18 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{type ? OPTIONS.find((o) => o.key === type)?.label : "Add"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.inkDim, cursor: "pointer" }}>
            <FiX size={20} />
          </button>
        </div>

        {!type && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {OPTIONS.map((o) => (
              <button
                key={o.key}
                onClick={() => setType(o.key)}
                style={{
                  background: C.panelRaised,
                  border: `1px solid ${C.line}`,
                  borderRadius: 12,
                  padding: 14,
                  textAlign: "left",
                  cursor: "pointer",
                  color: C.ink,
                }}
              >
                <o.icon color={C.accent} size={20} />
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8 }}>{o.label}</div>
                <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 2 }}>{o.desc}</div>
              </button>
            ))}
          </div>
        )}

        {type === "daily" && <DailyForm onDone={onClose} />}
        {type === "activity" && <ActivityForm onDone={onClose} />}
        {type === "memory" && <MemoryForm onDone={onClose} />}
        {type === "expense" && <MoneyForm onDone={onClose} />}
        {type === "learning" && <LearningForm onDone={onClose} />}
        {type === "goal" && <GoalProgressForm onDone={onClose} />}
      </div>
    </div>
  );
}

function SaveRow({ onSave, disabled }: { onSave: () => void; disabled?: boolean }) {
  return (
    <button onClick={onSave} disabled={disabled} style={{ ...primaryBtn, width: "100%", marginTop: 4, opacity: disabled ? 0.5 : 1 }}>
      <FiCheck style={{ verticalAlign: -2, marginRight: 6 }} /> Save
    </button>
  );
}

function DailyForm({ onDone }: { onDone: () => void }) {
  const date = todayStr();
  const [m, setM] = useState<DayMetrics>({ mood: null, energy: null, focus: null, motivation: null, stress: null, productivity: null });
  const [sleepHours, setSleepHours] = useState<number | "">("");
  async function save() {
    const existing = (await dbGet("days", date)) || { date };
    await dbPut("days", { ...existing, date, sleepHours: sleepHours === "" ? existing.sleepHours : sleepHours, metrics: { ...(existing.metrics || {}), ...m } });
    onDone();
  }
  const rows: [string, keyof DayMetrics][] = [
    ["Mood", "mood"],
    ["Energy", "energy"],
    ["Focus", "focus"],
    ["Motivation", "motivation"],
    ["Stress", "stress"],
    ["Productivity", "productivity"],
  ];
  return (
    <div>
      {rows.map(([label, key]) => (
        <Field key={key} label={label}>
          <RatingScale value={m[key]} onChange={(v) => setM((p) => ({ ...p, [key]: v }))} />
        </Field>
      ))}
      <Field label="Sleep (hours)">
        <NumberInput value={sleepHours} onChange={setSleepHours} placeholder="7" step="0.5" />
      </Field>
      <SaveRow onSave={save} />
    </div>
  );
}

function ActivityForm({ onDone }: { onDone: () => void }) {
  const date = todayStr();
  const [time, setTime] = useState(new Date().toTimeString().slice(0, 5));
  const [activity, setActivity] = useState("");
  const [category, setCategory] = useState("Work/Study");
  const [note, setNote] = useState("");
  async function save() {
    if (!activity.trim()) return;
    await dbPut("timeline", { id: uid(), date, time, activity: activity.trim(), category, note: note.trim() });
    onDone();
  }
  return (
    <div>
      <Field label="Time">
        <TextInput type="time" value={time} onChange={setTime} mono />
      </Field>
      <Field label="Activity">
        <TextInput value={activity} onChange={setActivity} placeholder="e.g. Studied React, Gym, Lunch with family" />
      </Field>
      <Field label="Category">
        <SelectInput value={category} onChange={setCategory} options={TIMELINE_CATEGORIES} />
      </Field>
      <Field label="Note (optional)">
        <TextArea value={note} onChange={setNote} rows={2} />
      </Field>
      <SaveRow onSave={save} disabled={!activity.trim()} />
    </div>
  );
}

function MemoryForm({ onDone }: { onDone: () => void }) {
  const date = todayStr();
  const [kind, setKind] = useState<"text" | "photo" | "file">("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    let attachmentId: string | null = null;
    if (file && kind === "photo") {
      const dataUrl = await compressImage(file);
      attachmentId = uid();
      await dbPut("attachments", { id: attachmentId, mime: "image/jpeg", dataUrl, filename: file.name });
    } else if (file) {
      const dataUrl = await new Promise<string>((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.readAsDataURL(file);
      });
      attachmentId = uid();
      await dbPut("attachments", { id: attachmentId, mime: file.type, dataUrl, filename: file.name });
    }
    await dbPut("memories", { id: uid(), date, type: kind, text: text.trim(), attachmentId, createdAt: Date.now() });
    setBusy(false);
    onDone();
  }
  return (
    <div>
      <Field label="Type">
        <Segmented value={kind} onChange={(v) => setKind(v as typeof kind)} options={[{ value: "text", label: "Text" }, { value: "photo", label: "Photo" }, { value: "file", label: "File" }]} />
      </Field>
      {(kind === "photo" || kind === "file") && (
        <Field label={kind === "photo" ? "Choose photo" : "Choose file"}>
          <input type="file" accept={kind === "photo" ? "image/*" : undefined} capture={kind === "photo" ? "environment" : undefined} onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ color: C.inkDim, fontSize: 13 }} />
        </Field>
      )}
      <Field label="Note">
        <TextArea value={text} onChange={setText} placeholder="What made this worth remembering?" rows={3} />
      </Field>
      <SaveRow onSave={save} disabled={busy || (kind !== "text" && !file)} />
    </div>
  );
}

function MoneyForm({ onDone }: { onDone: () => void }) {
  const date = todayStr();
  const [type, setType] = useState<MoneyType>("expense");
  const [amount, setAmount] = useState<number | "">("");
  const [currency, setCurrency] = useState("DH");
  const [category, setCategory] = useState("Food");
  const [note, setNote] = useState("");
  async function save() {
    if (!amount) return;
    await dbPut("money", { id: uid(), date, type, amount: Number(amount), currency, category, note: note.trim() });
    onDone();
  }
  return (
    <div>
      <Field label="Type">
        <Segmented value={type} onChange={(v) => setType(v as MoneyType)} options={[{ value: "expense", label: "Expense" }, { value: "income", label: "Income" }]} />
      </Field>
      <Field label="Amount">
        <NumberInput value={amount} onChange={setAmount} placeholder="0" />
      </Field>
      <Field label="Currency">
        <TextInput value={currency} onChange={setCurrency} placeholder="DH" />
      </Field>
      <Field label="Category">
        <SelectInput value={category} onChange={setCategory} options={MONEY_CATEGORIES} />
      </Field>
      <Field label="Note (optional)">
        <TextInput value={note} onChange={setNote} />
      </Field>
      <SaveRow onSave={save} disabled={!amount} />
    </div>
  );
}

function LearningForm({ onDone }: { onDone: () => void }) {
  const date = todayStr();
  const [whatLearned, setWhatLearned] = useState("");
  const [whatUnderstood, setWhatUnderstood] = useState("");
  const [whatConfused, setWhatConfused] = useState("");
  const [importantIdea, setImportantIdea] = useState("");
  const [resource, setResource] = useState("");
  async function save() {
    if (!whatLearned.trim()) return;
    await dbPut("learning", { id: uid(), date, whatLearned: whatLearned.trim(), whatUnderstood: whatUnderstood.trim(), whatConfused: whatConfused.trim(), importantIdea: importantIdea.trim(), resource: resource.trim() });
    onDone();
  }
  return (
    <div>
      <Field label="What I learned">
        <TextArea value={whatLearned} onChange={setWhatLearned} rows={2} />
      </Field>
      <Field label="What I understood">
        <TextArea value={whatUnderstood} onChange={setWhatUnderstood} rows={2} />
      </Field>
      <Field label="What I still don't understand">
        <TextArea value={whatConfused} onChange={setWhatConfused} rows={2} />
      </Field>
      <Field label="Important idea">
        <TextInput value={importantIdea} onChange={setImportantIdea} />
      </Field>
      <Field label="Resource / reference">
        <TextInput value={resource} onChange={setResource} placeholder="Book, course, URL…" />
      </Field>
      <SaveRow onSave={save} disabled={!whatLearned.trim()} />
    </div>
  );
}

function GoalProgressForm({ onDone }: { onDone: () => void }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalId, setGoalId] = useState("");
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    dbGetAll("goals").then((g) => {
      setGoals(g.filter((x) => x.status !== "done"));
    });
  }, []);
  useEffect(() => {
    const g = goals.find((x) => x.id === goalId);
    if (g) setProgress(g.progress || 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalId]);
  async function save() {
    const g = goals.find((x) => x.id === goalId);
    if (!g) return;
    await dbPut("goals", { ...g, progress: Number(progress), status: Number(progress) >= 100 ? "done" : g.status });
    onDone();
  }
  if (goals.length === 0) return <div style={{ fontSize: 13, color: C.inkFaint }}>No active goals yet. Create one in the Goals tab first.</div>;
  return (
    <div>
      <Field label="Goal">
        <SelectInput value={goalId} onChange={setGoalId} options={goals.map((g) => ({ value: g.id, label: g.title }))} placeholder="Choose a goal…" />
      </Field>
      {goalId && (
        <Field label={`Progress: ${progress}%`}>
          <input type="range" min={0} max={100} value={progress} onChange={(e) => setProgress(Number(e.target.value))} style={{ width: "100%" }} />
        </Field>
      )}
      <SaveRow onSave={save} disabled={!goalId} />
    </div>
  );
}
