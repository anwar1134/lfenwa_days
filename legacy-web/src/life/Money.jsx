import React, { useEffect, useState, useCallback } from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { C, Panel, Field, TextInput, NumberInput, SelectInput, Segmented, StatTile, ConfirmDelete, primaryBtn, ghostBtn, fmtDateShort } from "./ui.jsx";
import { dbGetAll, dbPut, dbDelete, uid, todayStr } from "./storage.js";

const CATEGORIES = ["Food", "Transport", "Housing", "Shopping", "Health", "Entertainment", "Bills", "Income", "Other"];

export default function Money() {
  const [items, setItems] = useState([]);
  const [adding, setAdding] = useState(false);
  const [defaultCurrency, setDefaultCurrency] = useState("DH");

  const reload = useCallback(async () => {
    const rows = await dbGetAll("money");
    rows.sort((a, b) => (b.date + (b.id || "")).localeCompare(a.date + (a.id || "")));
    setItems(rows);
    const settings = await import("./storage.js").then((m) => m.dbGet("settings", "app"));
    if (settings?.defaultCurrency) setDefaultCurrency(settings.defaultCurrency);
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  const today = todayStr();
  const month = today.slice(0, 7);
  const todayItems = items.filter((i) => i.date === today);
  const monthItems = items.filter((i) => i.date.startsWith(month));
  const sum = (arr, type) => arr.filter((i) => i.type === type).reduce((s, i) => s + Number(i.amount || 0), 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.ink }}>Money</div>
        <button onClick={() => setAdding((s) => !s)} style={{ ...primaryBtn, padding: "7px 12px", display: "flex", alignItems: "center", gap: 6 }}>
          <FiPlus /> Add
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <StatTile label="Today income" value={`${sum(todayItems, "income").toLocaleString()} ${defaultCurrency}`} tone="good" />
        <StatTile label="Today expense" value={`${sum(todayItems, "expense").toLocaleString()} ${defaultCurrency}`} tone="bad" />
        <StatTile label="Month net" value={`${(sum(monthItems, "income") - sum(monthItems, "expense")).toLocaleString()} ${defaultCurrency}`} />
      </div>

      {adding && (
        <Panel title="New transaction">
          <MoneyForm defaultCurrency={defaultCurrency} onDone={() => { setAdding(false); reload(); }} />
        </Panel>
      )}

      <Panel title="All transactions">
        {items.length === 0 && <div style={{ fontSize: 13, color: C.inkFaint }}>No transactions yet.</div>}
        {items.map((i) => (
          <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
            <div>
              <div style={{ fontSize: 13, color: C.ink }}>
                {i.category} {i.note ? `· ${i.note}` : ""}
              </div>
              <div style={{ fontSize: 11, color: C.inkFaint }}>{fmtDateShort(i.date)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: i.type === "income" ? C.good : C.bad, fontFamily: "ui-monospace" }}>
                {i.type === "income" ? "+" : "-"}
                {Number(i.amount).toLocaleString()} {i.currency}
              </span>
              <button onClick={async () => { await dbDelete("money", i.id); reload(); }} style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer" }}>
                <FiTrash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function MoneyForm({ defaultCurrency, onDone }) {
  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [category, setCategory] = useState("Food");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayStr());
  return (
    <div>
      <Field label="Type">
        <Segmented value={type} onChange={setType} options={[{ value: "expense", label: "Expense" }, { value: "income", label: "Income" }]} />
      </Field>
      <Field label="Amount">
        <NumberInput value={amount} onChange={setAmount} placeholder="0" />
      </Field>
      <Field label="Currency">
        <TextInput value={currency} onChange={setCurrency} />
      </Field>
      <Field label="Category">
        <SelectInput value={category} onChange={setCategory} options={CATEGORIES} />
      </Field>
      <Field label="Date">
        <TextInput type="date" value={date} onChange={setDate} mono />
      </Field>
      <Field label="Note (optional)">
        <TextInput value={note} onChange={setNote} />
      </Field>
      <button
        disabled={!amount}
        onClick={async () => {
          await dbPut("money", { id: uid(), date, type, amount: Number(amount), currency, category, note: note.trim() });
          onDone();
        }}
        style={{ ...primaryBtn, width: "100%" }}
      >
        Save
      </button>
    </div>
  );
}
