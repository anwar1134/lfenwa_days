"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  FiHome,
  FiBookOpen,
  FiCalendar,
  FiCamera,
  FiTarget,
  FiBook,
  FiDollarSign,
  FiActivity,
  FiCloud,
  FiTrendingUp,
  FiBarChart2,
  FiSettings,
  FiMenu,
  FiX,
  FiSearch,
} from "react-icons/fi";
import type { IconType } from "react-icons";
import { C, SANS } from "./ui";
import { todayStr } from "@/lib/storage";
import type { TabKey } from "@/types/life";
import Today from "./Today";
import MyDay from "./MyDay";
import Calendar from "./Calendar";
import Memories from "./Memories";
import Goals from "./Goals";
import Learning from "./Learning";
import Money from "./Money";
import HealthHabits from "./HealthHabits";
import Mind from "./Mind";
import Insights from "./Insights";
import Settings from "./Settings";
import QuickAdd from "./QuickAdd";
import SearchOverlay from "./Search";

interface NavItem {
  key: TabKey;
  label: string;
  icon: IconType;
}

const NAV_ITEMS: NavItem[] = [
  { key: "today", label: "Today", icon: FiHome },
  { key: "myday", label: "My Day", icon: FiBookOpen },
  { key: "calendar", label: "Calendar", icon: FiCalendar },
  { key: "memories", label: "Memories", icon: FiCamera },
  { key: "goals", label: "Goals", icon: FiTarget },
  { key: "learning", label: "Learning", icon: FiBook },
  { key: "money", label: "Money", icon: FiDollarSign },
  { key: "habits", label: "Health & Habits", icon: FiActivity },
  { key: "mind", label: "Mind", icon: FiCloud },
  { key: "trades", label: "Lfenwa Trades", icon: FiTrendingUp },
  { key: "insights", label: "Insights", icon: FiBarChart2 },
  { key: "settings", label: "Settings", icon: FiSettings },
];

const GLOBAL_CSS = `
  * { box-sizing: border-box; }
  html, body, #root { height: 100%; margin: 0; }
  body { background: ${C.bg}; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-thumb { background: ${C.line}; border-radius: 4px; }
  input, textarea, select, button { font-family: inherit; }
  @media (max-width: 780px) {
    .lfnawa-desktop-rail { display: none !important; }
  }
  @media (min-width: 781px) {
    .lfnawa-mobile-drawer { display: none !important; }
  }
`;

function Brand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 14px 10px" }}>
      <div style={{ width: 26, height: 26, borderRadius: 7, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#191307" }}>L</div>
      <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: 0.3 }}>LFNAWA DAYS</span>
    </div>
  );
}

function NavButton({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "9px 14px",
        background: active ? C.panelRaised : "transparent",
        border: "none",
        borderLeft: `3px solid ${active ? C.accent : "transparent"}`,
        color: active ? C.ink : C.inkDim,
        fontSize: 13,
        cursor: "pointer",
        textAlign: "left",
        ...SANS,
      }}
    >
      <item.icon size={16} color={active ? C.accent : C.inkFaint} />
      {item.label}
    </button>
  );
}

function NavRail({ tab, setTab, mobileOpen, setMobileOpen }: { tab: TabKey; setTab: (t: TabKey) => void; mobileOpen: boolean; setMobileOpen: (v: boolean) => void }) {
  return (
    <>
      <div className="lfnawa-desktop-rail" style={{ width: 200, background: C.bgAlt, borderRight: `1px solid ${C.line}`, flexShrink: 0, overflowY: "auto" }}>
        <Brand />
        {NAV_ITEMS.map((it) => (
          <NavButton key={it.key} item={it} active={tab === it.key} onClick={() => setTab(it.key)} />
        ))}
      </div>
      {mobileOpen && (
        <div className="lfnawa-mobile-drawer" onClick={() => setMobileOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 150 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 230, height: "100%", background: C.bgAlt, borderRight: `1px solid ${C.line}`, overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Brand />
              <button onClick={() => setMobileOpen(false)} style={{ background: "none", border: "none", color: C.inkDim, marginRight: 10, cursor: "pointer" }}>
                <FiX size={18} />
              </button>
            </div>
            {NAV_ITEMS.map((it) => (
              <NavButton
                key={it.key}
                item={it}
                active={tab === it.key}
                onClick={() => {
                  setTab(it.key);
                  setMobileOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function TopBar({ title, onMenu, onSearch }: { title: string; onMenu: () => void; onSearch: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.line}`, background: C.bg }}>
      <button className="lfnawa-mobile-drawer" onClick={onMenu} style={{ background: "none", border: "none", color: C.ink, cursor: "pointer" }}>
        <FiMenu size={20} />
      </button>
      <div style={{ flex: 1, fontSize: 15, fontWeight: 700, color: C.ink }}>{title}</div>
      <button onClick={onSearch} style={{ background: "none", border: "none", color: C.inkDim, cursor: "pointer" }}>
        <FiSearch size={18} />
      </button>
    </div>
  );
}

// window.Capacitor is provided at runtime by the Capacitor native
// shell only; typed loosely and guarded, exactly like the original
// AppShell.jsx and capacitor-bridge.js.
interface CapacitorBackButtonListener {
  remove?: () => void;
}
interface CapacitorAppPlugin {
  addListener?: (event: "backButton", cb: () => void) => CapacitorBackButtonListener;
  exitApp?: () => void;
}
declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      Plugins?: { App?: CapacitorAppPlugin };
    };
  }
}

export default function AppShell({ initialTab = "today" }: { initialTab?: TabKey }) {
  const [tab, setTabRaw] = useState<TabKey>(initialTab);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [quickAdd, setQuickAdd] = useState(false);
  const [search, setSearch] = useState(false);
  const tabHistory = useRef<TabKey[]>([initialTab]);

  const setTab = useCallback((next: TabKey) => {
    setTabRaw((cur) => {
      if (cur !== next) tabHistory.current.push(next);
      return next;
    });
  }, []);

  function openDay(date: string) {
    setSelectedDate(date);
    setTab("myday");
  }

  // Android hardware back button. No-op everywhere except inside the
  // Capacitor Android shell — guarded, same pattern as
  // public/trades/capacitor-bridge.js. Unchanged from the original
  // AppShell.jsx: still governed by this in-memory tab-history stack,
  // not by browser/Next.js routing, since a hardware back-press has no
  // relationship to the URL in a single-page app like this one.
  useEffect(() => {
    if (typeof window === "undefined" || !window.Capacitor?.isNativePlatform?.()) return;
    const Plugins = window.Capacitor.Plugins || {};
    const AppPlugin = Plugins.App;
    if (!AppPlugin?.addListener) return;
    let lastBackPress = 0;
    const sub = AppPlugin.addListener("backButton", () => {
      if (search) { setSearch(false); return; }
      if (quickAdd) { setQuickAdd(false); return; }
      tabHistory.current.pop();
      const prev = tabHistory.current[tabHistory.current.length - 1];
      if (prev && prev !== tab) { setTabRaw(prev); return; }
      if (tab !== "today") { setTabRaw("today"); tabHistory.current = ["today"]; return; }
      const now = Date.now();
      if (now - lastBackPress < 2000) { AppPlugin.exitApp?.(); return; }
      lastBackPress = now;
    });
    return () => sub?.remove?.();
  }, [tab, quickAdd, search]);

  const activeItem = NAV_ITEMS.find((i) => i.key === tab);

  return (
    <div style={{ height: "100vh", width: "100%", display: "flex", background: C.bg, color: C.ink, ...SANS }}>
      <style>{GLOBAL_CSS}</style>
      <NavRail tab={tab} setTab={setTab} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, height: "100%" }}>
        <TopBar title={activeItem?.label || ""} onMenu={() => setMobileOpen(true)} onSearch={() => setSearch(true)} />
        <div style={{ flex: 1, overflowY: tab === "trades" ? "hidden" : "auto", padding: tab === "trades" ? 0 : "16px 16px 80px" }}>
          {tab === "today" && <Today onNavigate={setTab} onQuickAdd={() => setQuickAdd(true)} />}
          {tab === "myday" && <MyDay date={selectedDate} setDate={setSelectedDate} />}
          {tab === "calendar" && <Calendar onOpenDay={openDay} />}
          {tab === "memories" && <Memories />}
          {tab === "goals" && <Goals />}
          {tab === "learning" && <Learning />}
          {tab === "money" && <Money />}
          {tab === "habits" && <HealthHabits />}
          {tab === "mind" && <Mind />}
          {tab === "insights" && <Insights />}
          {tab === "settings" && <Settings onNavigate={setTab} />}
          {tab === "trades" && (
            // Absolute path (not "./trades/index.html"): this shell can now be
            // entered from several real Next.js routes (/, /today, /trades, ...),
            // so a relative src would resolve against the CURRENT route and
            // break from anywhere but "/". See docs/NEXTJS_MIGRATION.md.
            <iframe
              title="Lfenwa Trades"
              src="/trades/index.html"
              style={{ width: "100%", height: "100%", border: "none", display: "block" }}
            />
          )}
        </div>
      </div>

      {tab !== "today" && tab !== "trades" && (
        <button
          onClick={() => setQuickAdd(true)}
          aria-label="Add"
          style={{
            position: "fixed",
            right: 20,
            bottom: 20,
            width: 52,
            height: 52,
            borderRadius: 26,
            background: C.accent,
            color: "#191307",
            border: "none",
            fontSize: 26,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 6px 18px rgba(0,0,0,.4)",
            zIndex: 120,
          }}
        >
          +
        </button>
      )}

      {quickAdd && <QuickAdd onClose={() => setQuickAdd(false)} onNavigate={setTab} />}
      {search && <SearchOverlay onClose={() => setSearch(false)} onOpenDay={openDay} onNavigate={setTab} />}
    </div>
  );
}
