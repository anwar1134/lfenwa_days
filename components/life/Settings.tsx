"use client";
import React, { useEffect, useState, useRef } from "react";
import { FiDownload, FiUpload, FiTrendingUp } from "react-icons/fi";
import { C, Panel, Field, TextInput, primaryBtn, ghostBtn, dangerBtn } from "./ui";
import { dbGet, dbPut, exportFullBackup, importLifeBackup, downloadFile } from "@/lib/storage";
import type { TabKey } from "@/types/life";

export default function Settings({ onNavigate }: { onNavigate: (tab: TabKey) => void }) {
  const [currency, setCurrency] = useState("DH");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState("");
  const [pendingImport, setPendingImport] = useState<{ payload: unknown } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    dbGet("settings", "app").then((s) => {
      if (s?.defaultCurrency) setCurrency(s.defaultCurrency);
      if (s?.displayName) setDisplayName(s.displayName);
    });
  }, []);

  async function saveCurrency(v: string) {
    setCurrency(v);
    const existing = (await dbGet("settings", "app")) || { id: "app" as const };
    await dbPut("settings", { ...existing, id: "app", defaultCurrency: v });
  }

  async function saveName(v: string) {
    setDisplayName(v);
    const existing = (await dbGet("settings", "app")) || { id: "app" as const };
    await dbPut("settings", { ...existing, id: "app", displayName: v });
  }

  async function doExport() {
    setStatus("Preparing backup…");
    const backup = await exportFullBackup();
    const json = JSON.stringify(backup, null, 2);
    downloadFile(`lfnawa-days-backup-${new Date().toISOString().slice(0, 10)}.json`, json, "application/json");
    setStatus(`Exported ${new Date().toLocaleTimeString()}.`);
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result as string);
        setPendingImport({ payload });
      } catch {
        setStatus("That file isn't valid JSON.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function confirmImport(mode: "merge" | "replace") {
    if (!pendingImport) return;
    const res = await importLifeBackup(pendingImport.payload, mode);
    setPendingImport(null);
    if (res.ok) {
      setStatus(`Imported: ${Object.entries(res.counts || {}).map(([k, v]) => `${k} ${v}`).join(", ")}.`);
    } else {
      setStatus(res.error || "Import failed.");
    }
  }

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, color: C.ink, marginBottom: 14 }}>Settings</div>

      <Panel title="Preferences">
        <Field label="Your name" hint="Shown in the greeting on Today.">
          <TextInput value={displayName} onChange={saveName} placeholder="Your name" />
        </Field>
        <Field label="Default currency">
          <TextInput value={currency} onChange={saveCurrency} placeholder="DH" />
        </Field>
      </Panel>

      <Panel title="Backup & restore">
        <div style={{ fontSize: 12, color: C.inkDim, marginBottom: 10 }}>
          One backup file covers your whole Lfenwa Days journal — days, timeline, tasks, achievements, learning, money, habits, goals, memories, mind entries, Lfenwa System progress — plus your Lfenwa Trades trades, no-trade days, playbook and settings (read-only copy, folded in for convenience).
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={doExport} style={{ ...primaryBtn, display: "flex", alignItems: "center", gap: 6 }}>
            <FiDownload /> Export backup
          </button>
          <button onClick={() => fileRef.current?.click()} style={{ ...ghostBtn, display: "flex", alignItems: "center", gap: 6 }}>
            <FiUpload /> Import backup
          </button>
          <input ref={fileRef} type="file" accept="application/json" onChange={onFilePicked} style={{ display: "none" }} />
        </div>
        {status && <div style={{ fontSize: 12, color: C.inkDim, marginTop: 10 }}>{status}</div>}
      </Panel>

      <Panel title="Lfenwa Trades">
        <div style={{ fontSize: 12, color: C.inkDim, marginBottom: 10 }}>Trading data has its own Export/Import inside Lfenwa Trades&apos; own Settings screen (unchanged).</div>
        <button onClick={() => onNavigate("trades")} style={{ ...ghostBtn, display: "flex", alignItems: "center", gap: 6 }}>
          <FiTrendingUp /> Open Lfenwa Trades
        </button>
      </Panel>

      <Panel title="About">
        <div style={{ fontSize: 12, color: C.inkDim, lineHeight: 1.7 }}>
          Lfenwa Days — offline-first, local, private. Your data stays on this device unless you export it yourself. No account required, no analytics, no cloud sync.
        </div>
      </Panel>

      {pendingImport && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(16,32,58,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, maxWidth: 380 }}>
            <div style={{ fontWeight: 700, color: C.ink, marginBottom: 10 }}>Import backup</div>
            <div style={{ fontSize: 13, color: C.inkDim, marginBottom: 14 }}>
              <b>Merge</b> adds/updates entries by id without deleting anything already on this device (safe, recommended). <b>Replace</b> clears your current Lfenwa Days data first — this cannot be undone.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => confirmImport("merge")} style={primaryBtn}>
                Merge (safe)
              </button>
              <button onClick={() => confirmImport("replace")} style={dangerBtn}>
                Replace everything
              </button>
              <button onClick={() => setPendingImport(null)} style={ghostBtn}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
