"use client";
import React, { useState } from "react";
import { FiX, FiSearch } from "react-icons/fi";
import { C, fmtDateShort } from "./ui";
import { dbGetAll, readTradesKV } from "@/lib/storage";
import type { TabKey, TradeLike, NoTradeLike, PlaybookEntryLike } from "@/types/life";

function matches(text: unknown, q: string): boolean {
  return !!text && String(text).toLowerCase().includes(q);
}

interface SearchResult {
  type: string;
  date: string | null;
  snippet: string;
  nav?: TabKey;
}

export default function SearchOverlay({
  onClose,
  onOpenDay,
  onNavigate,
}: {
  onClose: () => void;
  onOpenDay: (date: string) => void;
  onNavigate: (tab: TabKey) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function runSearch(q: string) {
    setQuery(q);
    if (!q || q.trim().length < 2) {
      setResults(null);
      return;
    }
    setBusy(true);
    const needle = q.trim().toLowerCase();
    const [days, timeline, achievements, learning, goals, memories, mindEntries, tasks, trades, noTrades, playbook] = await Promise.all([
      dbGetAll("days"),
      dbGetAll("timeline"),
      dbGetAll("achievements"),
      dbGetAll("learning"),
      dbGetAll("goals"),
      dbGetAll("memories"),
      dbGetAll("mindEntries"),
      dbGetAll("tasks"),
      readTradesKV("trades") as Promise<TradeLike[] | null>,
      readTradesKV("notrades") as Promise<NoTradeLike[] | null>,
      readTradesKV("playbook") as Promise<PlaybookEntryLike[] | null>,
    ]);

    const out: SearchResult[] = [];
    days.forEach((d) => matches(d.note, needle) && out.push({ type: "Day note", date: d.date, snippet: d.note || "" }));
    timeline.forEach((t) => (matches(t.activity, needle) || matches(t.note, needle) || matches(t.category, needle)) && out.push({ type: "Timeline", date: t.date, snippet: `${t.activity}${t.note ? " — " + t.note : ""}` }));
    achievements.forEach((a) => matches(a.text, needle) && out.push({ type: "Achievement", date: a.date, snippet: a.text }));
    tasks.forEach((t) => matches(t.text, needle) && out.push({ type: "Task", date: t.date, snippet: t.text }));
    learning.forEach(
      (l) =>
        (matches(l.whatLearned, needle) || matches(l.whatUnderstood, needle) || matches(l.whatConfused, needle) || matches(l.importantIdea, needle)) &&
        out.push({ type: "Learning", date: l.date, snippet: l.whatLearned })
    );
    goals.forEach((g) => (matches(g.title, needle) || matches(g.description, needle) || matches(g.notes, needle)) && out.push({ type: "Goal", date: null, snippet: g.title, nav: "goals" }));
    memories.forEach((m) => matches(m.text, needle) && out.push({ type: "Memory", date: m.date, snippet: m.text || "" }));
    mindEntries.forEach((m) => matches(m.thought, needle) && out.push({ type: "Mind", date: m.date, snippet: m.thought || "" }));
    (trades || []).forEach((t) => (matches(t.notes, needle) || matches(t.setupTags, needle) || matches(t.mistakeTags, needle)) && out.push({ type: "Trading note", date: t.date, snippet: t.notes || "(trade note)", nav: "trades" }));
    (noTrades || []).forEach((t) => matches(t.reason, needle) && out.push({ type: "Trading note", date: t.date, snippet: t.reason || "", nav: "trades" }));
    (playbook || []).forEach((p) => (matches(p.name, needle) || matches(p.description, needle)) && out.push({ type: "Playbook setup", date: null, snippet: p.name || "", nav: "trades" }));

    out.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    setResults(out.slice(0, 100));
    setBusy(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: C.bg, zIndex: 300, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 14, borderBottom: `1px solid ${C.line}` }}>
        <FiSearch color={C.inkDim} />
        <input
          autoFocus
          value={query}
          onChange={(e) => runSearch(e.target.value)}
          placeholder="Search days, notes, memories, learning, goals, trading notes…"
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: C.ink, fontSize: 15 }}
        />
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.inkDim, cursor: "pointer" }}>
          <FiX size={20} />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
        {!results && <div style={{ fontSize: 13, color: C.inkFaint }}>Type at least 2 characters…</div>}
        {results && results.length === 0 && !busy && <div style={{ fontSize: 13, color: C.inkFaint }}>No results for &quot;{query}&quot;.</div>}
        {results?.map((r, i) => (
          <div
            key={i}
            onClick={() => {
              if (r.nav) onNavigate(r.nav);
              else if (r.date) onOpenDay(r.date);
              onClose();
            }}
            style={{ padding: "10px 0", borderBottom: `1px solid ${C.lineSoft}`, cursor: "pointer" }}
          >
            <div style={{ fontSize: 11, color: C.accent, marginBottom: 2 }}>
              {r.type} {r.date ? `· ${fmtDateShort(r.date)}` : ""}
            </div>
            <div style={{ fontSize: 13, color: C.ink }}>{String(r.snippet || "").slice(0, 140)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
