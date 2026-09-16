import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import {
  LayoutDashboard, Sunrise, ClipboardCheck, ListChecks, XOctagon,
  CalendarClock, CalendarRange, BarChart3, Search, AlertTriangle,
  BookOpen, Plus, X, Camera, ChevronRight, ChevronLeft, ChevronDown,
  Download, Filter, Trash2, Pencil, ArrowLeft, Menu, Info, Clock,
  CheckCircle2, CircleDot, Save, Settings, Upload, AlertOctagon,
} from "lucide-react";

/* ============================================================
   DESIGN TOKENS
   A dark, instrument-panel palette drawn from the order-flow /
   footprint-chart world the trader actually lives in: deep
   teal-charcoal base, amber accent (POC/VAH marker color),
   desaturated sage/clay for decision-quality (never siren
   green/red). Tabular mono for every number so columns of
   prices, R-multiples and deltas line up like a DOM ladder.
   ============================================================ */
const C = {
  bg: "#0E1416",
  bgAlt: "#0B1012",
  panel: "#141C20",
  panelRaised: "#1B252A",
  line: "#263237",
  lineSoft: "#1D282D",
  ink: "#E7ECEC",
  inkDim: "#8FA0A6",
  inkFaint: "#5B6B70",
  accent: "#D9A548",
  accentDim: "#8A6A32",
  good: "#7DA98B",
  goodDim: "#3C4C42",
  bad: "#C06A5C",
  badDim: "#4C332F",
  warn: "#D9A548",
};

const MONO = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" };
const SANS = { fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" };

/* ============================================================
   CATALOGS
   ============================================================ */
const SETUP_TAGS = [
  "Liquidity sweep", "Stop run", "Absorption", "Exhaustion", "Failed breakout",
  "Reversal", "Breakout", "Retest", "Acceptance", "Rejection", "Delta divergence",
  "Imbalance", "Iceberg", "DOM confirmation", "Footprint confirmation",
  "Volume Profile level", "POC", "VAH", "VAL", "Previous Day High",
  "Previous Day Low", "Overnight High", "Overnight Low", "Other",
];

const MISTAKE_TAGS = [
  "FOMO", "Revenge trading", "Overtrading", "Early entry", "Late entry",
  "Chasing", "Moving stop", "Moving TP", "Oversizing", "Trading bad location",
  "Ignoring higher timeframe", "Ignoring liquidity", "Ignoring order flow",
  "Trading during chop", "Trading outside plan", "Emotional trade",
  "Impulsive trade", "Hesitation", "Taking a setup without confirmation",
];

const NO_TRADE_TAGS = [
  "Hesitation", "Fear", "Unclear setup", "No confirmation", "Bad location",
  "Bad market condition", "Outside trading plan",
];

const MARKET_CONDITIONS = ["Trending", "Ranging", "Choppy", "Transitional"];
const LOCATIONS = ["High of range", "Low of range", "Middle of range", "Important level", "Outside value", "Inside value"];
const VOLATILITIES = ["Low", "Normal", "High"];

const DOM_FLAGS = [
  ["aggressiveBuyers", "Aggressive buyers"], ["aggressiveSellers", "Aggressive sellers"],
  ["pullingLiquidity", "Pulling liquidity"], ["stackingLiquidity", "Stacking liquidity"],
  ["absorption", "Absorption"], ["iceberg", "Iceberg"],
  ["spoofingSuspicion", "Spoofing suspicion"], ["largeOrders", "Large orders"],
];

const FOOTPRINT_FLAGS = [
  ["imbalances", "Imbalances"], ["absorption", "Absorption"], ["exhaustion", "Exhaustion"],
  ["divergence", "Divergence"], ["stackedImbalance", "Stacked imbalance"],
];

const MANAGEMENT_ACTIONS = [
  ["movedStop", "Moved stop"], ["movedTP", "Moved TP"], ["scaledIn", "Scaled in"],
  ["scaledOut", "Scaled out"], ["exitedEarly", "Exited early"],
  ["heldPerPlan", "Held according to plan"], ["emotionalInterference", "Interfered emotionally"],
];

const MANAGEMENT_REASONS = [
  "Fear", "Greed", "FOMO", "Revenge", "Uncertainty", "New information",
  "Valid market structure change", "Valid order-flow change", "Rule violation",
];

const CHECKLIST_ITEMS = [
  "Price is at an important location",
  "Liquidity has been identified",
  "My setup is present",
  "Order flow confirms the idea",
  "Entry trigger is clear",
  "Stop location makes structural sense",
  "Risk is acceptable",
  "Market condition is suitable",
  "I am not chasing",
  "I am not entering because of FOMO",
  "I know exactly what would invalidate the trade",
];

const RATING_KEYS = [
  ["sleep", "Sleep"], ["energy", "Energy"], ["focus", "Focus"], ["stress", "Stress"],
  ["confidence", "Confidence"], ["patience", "Patience"], ["emotionalStability", "Emotional stability"],
];

const SCREENSHOT_SLOTS = [
  ["chartBefore", "Chart — before entry", "before"],
  ["domBefore", "DOM — before entry", "before"],
  ["footprintBefore", "Footprint — before entry", "before"],
  ["chartDuring", "Chart — during trade", "during"],
  ["chartAfter", "Chart — after trade", "after"],
  ["domAfter", "DOM — after trade", "after"],
];

/* ============================================================
   INSTRUMENT CONFIG + CALCULATION ENGINE
   Single source of truth for every tick/point/USD/R number in
   the app. Trade Form, Trade Detail, CSV export, Analytics,
   Dashboard and Weekly Review all read derived numbers from
   calculateTradeMetrics() — nothing recomputes P&L on its own.

   ES: tick 0.25, $12.50/tick ($50/point). MES/NQ/MNQ included so
   adding a new instrument later means editing one object, not
   hunting through components. "Custom" instruments (tickSize/
   tickValue typed by the user) are supported for anything not
   in this registry.
   ============================================================ */
const INSTRUMENTS = {
  ES:  { label: "E-mini S&P 500 (ES)",           tickSize: 0.25, tickValue: 12.5 },
  MES: { label: "Micro E-mini S&P 500 (MES)",    tickSize: 0.25, tickValue: 1.25 },
  NQ:  { label: "E-mini Nasdaq-100 (NQ)",        tickSize: 0.25, tickValue: 5 },
  MNQ: { label: "Micro E-mini Nasdaq-100 (MNQ)", tickSize: 0.25, tickValue: 0.5 },
};
const DEFAULT_INSTRUMENT = "ES";
const UNIT_OPTIONS = [["ticks", "Ticks"], ["points", "Points"], ["usd", "USD"]];

function resolveInstrumentSpec(trade, customRegistry) {
  const raw = (trade.instrument || DEFAULT_INSTRUMENT).toString().toUpperCase().trim();
  if (INSTRUMENTS[raw]) return { key: raw, ...INSTRUMENTS[raw] };
  if (customRegistry && customRegistry[raw]) return { key: raw, ...customRegistry[raw], custom: true };
  const cts = Number(trade.customTickSize);
  const ctv = Number(trade.customTickValue);
  if (cts > 0 && ctv > 0) {
    return { key: trade.instrument || "CUSTOM", label: trade.instrument || "Custom instrument", tickSize: cts, tickValue: ctv, custom: true };
  }
  return { key: "ES", ...INSTRUMENTS.ES, fallback: true };
}

// Integer-safe tick math: convert prices to whole tick units, then
// subtract as integers. This is what avoids "7.999999 ticks" —
// price/tickSize is never used directly as the final tick count.
function priceToTickUnits(price, tickSize) {
  if (price == null || price === "" || isNaN(price) || !tickSize) return null;
  return Math.round(Number(price) / tickSize);
}
function isOnTick(price, tickSize) {
  if (price == null || price === "" || isNaN(price)) return true;
  const ratio = Number(price) / tickSize;
  return Math.abs(ratio - Math.round(ratio)) < 1e-4;
}
function ticksBetween(fromPrice, toPrice, tickSize) {
  const a = priceToTickUnits(fromPrice, tickSize);
  const b = priceToTickUnits(toPrice, tickSize);
  if (a == null || b == null) return null;
  return b - a; // signed, integer, exact
}
function roundTo(n, decimals) {
  if (n == null || isNaN(n)) return n;
  const f = Math.pow(10, decimals);
  return Math.round((n + Number.EPSILON) * f) / f;
}

function calculateTradeMetrics(trade, customRegistry) {
  const spec = resolveInstrumentSpec(trade, customRegistry);
  const { tickSize, tickValue } = spec;
  const dirSign = trade.direction === "short" ? -1 : 1;
  const contracts = Number(trade.contracts ?? trade.size) || 0;

  const entryValid = trade.entryPrice != null && trade.entryPrice !== "" && !isNaN(trade.entryPrice);
  const stopValid = trade.stopPrice != null && trade.stopPrice !== "" && !isNaN(trade.stopPrice);
  const targetValid = trade.targetPrice != null && trade.targetPrice !== "" && !isNaN(trade.targetPrice);

  const priceWarnings = [];
  [["entryPrice", "Entry"], ["stopPrice", "Stop"], ["targetPrice", "Target"]].forEach(([f, label]) => {
    if (trade[f] != null && trade[f] !== "" && !isOnTick(trade[f], tickSize)) {
      priceWarnings.push(`${label} price ${trade[f]} isn't a multiple of the ${spec.key} tick size (${tickSize}) — rounded to the nearest tick for calculation.`);
    }
  });

  let riskTicks = null, riskPoints = null, riskUsd = null;
  if (entryValid && stopValid) {
    riskTicks = Math.abs(ticksBetween(trade.stopPrice, trade.entryPrice, tickSize));
    riskPoints = roundTo(riskTicks * tickSize, 6);
    riskUsd = roundTo(riskTicks * tickValue * contracts, 2);
  }

  let rewardTicks = null, rewardPoints = null, rewardUsd = null, plannedRR = null;
  if (entryValid && targetValid) {
    rewardTicks = Math.abs(ticksBetween(trade.entryPrice, trade.targetPrice, tickSize));
    rewardPoints = roundTo(rewardTicks * tickSize, 6);
    rewardUsd = roundTo(rewardTicks * tickValue * contracts, 2);
    if (riskTicks) plannedRR = roundTo(rewardTicks / riskTicks, 3);
  }

  const exits = Array.isArray(trade.exits)
    ? trade.exits.filter((e) => e && e.price != null && e.price !== "" && !isNaN(e.price) && Number(e.contracts) > 0)
    : [];
  const totalExitContracts = exits.reduce((s, e) => s + Number(e.contracts || 0), 0);

  let resultTicks = null, resultPoints = null, resultUsd = null, resultR = null, avgExitPrice = null, isFullyClosed = false;
  let isLegacyResult = false;

  if (entryValid && exits.length && totalExitContracts > 0) {
    let usdSum = 0, weightedTickSum = 0, priceWeightedSum = 0;
    exits.forEach((e) => {
      const legContracts = Number(e.contracts) || 0;
      const legRawTicks = ticksBetween(trade.entryPrice, e.price, tickSize);
      const legSignedTicks = dirSign * legRawTicks;
      usdSum += legSignedTicks * tickValue * legContracts;
      weightedTickSum += legSignedTicks * legContracts;
      priceWeightedSum += Number(e.price) * legContracts;
      if (!isOnTick(e.price, tickSize)) {
        priceWarnings.push(`Exit price ${e.price} isn't a multiple of the ${spec.key} tick size (${tickSize}) — rounded to the nearest tick for calculation.`);
      }
    });
    resultUsd = roundTo(usdSum, 2);
    resultTicks = roundTo(weightedTickSum / totalExitContracts, 4);
    resultPoints = roundTo(resultTicks * tickSize, 6);
    avgExitPrice = roundTo(priceWeightedSum / totalExitContracts, 6);
    isFullyClosed = contracts > 0 && totalExitContracts >= contracts;
    if (riskTicks && riskTicks > 0) {
      const riskUsdRealized = riskTicks * tickValue * totalExitContracts;
      resultR = riskUsdRealized > 0 ? roundTo(usdSum / riskUsdRealized, 4) : null;
    }
  } else if (trade.legacy) {
    // No usable price data on this record — surface the old
    // manually-entered $/R instead of inventing ticks/points.
    resultUsd = trade.legacyResultUsd ?? null;
    resultR = trade.legacyResultR ?? null;
    isLegacyResult = true;
  }

  return {
    instrumentKey: spec.key, instrumentLabel: spec.label, tickSize, tickValue,
    instrumentFallback: !!spec.fallback, instrumentCustom: !!spec.custom,
    contracts, totalExitContracts, isFullyClosed, avgExitPrice,
    riskTicks, riskPoints, riskUsd,
    rewardTicks, rewardPoints, rewardUsd, plannedRR,
    resultTicks, resultPoints, resultUsd, resultR,
    isLegacyResult, priceWarnings,
  };
}

// Merge computed metrics onto a trade record. Field names
// (resultR, resultUsd, riskUsd, plannedRR…) intentionally match
// the legacy manual fields so every existing consumer in this
// file (stats engine, CSV export, list rows, analytics) keeps
// working — they now just receive computed numbers instead of
// hand-typed ones.
function enrichTrade(t, customRegistry) {
  return { ...t, ...calculateTradeMetrics(t, customRegistry) };
}

// One-time migration for records saved before this engine existed.
// Old shape: single exitPrice + size, and resultUsd/resultR typed
// by hand. New shape: contracts + exits[]. We never invent tick
// data — if there's no price data to derive from, the old $/R is
// preserved and flagged legacy instead of discarded or guessed at.
function migrateTrade(t) {
  if (!t) return t;
  if (Array.isArray(t.exits)) return t; // already migrated
  const next = { ...t };
  if (next.contracts == null) next.contracts = next.size ?? null;
  if (next.exitPrice != null && next.contracts) {
    next.exits = [{ id: uid(), contracts: next.contracts, price: next.exitPrice }];
  } else {
    next.exits = [];
    if (next.resultUsd != null || next.resultR != null) {
      next.legacy = true;
      next.legacyResultUsd = next.resultUsd;
      next.legacyResultR = next.resultR;
    }
  }
  return next;
}

function fmtTicks(n) { if (n === null || n === undefined || isNaN(n)) return "—"; const s = n > 0 ? "+" : ""; return `${s}${roundTo(n, 2)} ${Math.abs(n) === 1 ? "tick" : "ticks"}`; }
function fmtPoints(n) { if (n === null || n === undefined || isNaN(n)) return "—"; const s = n > 0 ? "+" : ""; return `${s}${roundTo(n, 2)} pts`; }
// Big primary number in the user's preferred unit, with the other
// two units as a secondary line — the display pattern from the spec:
// preferred=ticks -> "+24 ticks" big, "+6 pts | +$300" small.
function primaryMetric(ticks, points, usd, unit) {
  if (unit === "usd") return fmtUsdSigned(usd);
  if (unit === "points") return fmtPoints(points);
  return fmtTicks(ticks);
}
function secondaryMetric(ticks, points, usd, unit) {
  if (unit === "usd") return `${fmtTicks(ticks)} · ${fmtPoints(points)}`;
  if (unit === "points") return `${fmtTicks(ticks)} · ${fmtUsdSigned(usd)}`;
  return `${fmtPoints(points)} · ${fmtUsdSigned(usd)}`;
}
function fmtUsdSigned(n) { if (n === null || n === undefined || isNaN(n)) return "—"; const s = n > 0 ? "+" : n < 0 ? "-" : ""; return `${s}$${Math.abs(roundTo(n, 2)).toLocaleString()}`; }

/* ============================================================
   UTILITIES
   ============================================================ */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function todayStr() { const d = new Date(); return d.toISOString().slice(0, 10); }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
function fmtPF(n) { if (n === null || n === undefined || isNaN(n)) return "—"; if (!isFinite(n)) return "∞"; return round2(n); }
function fmtR(n) { if (n === null || n === undefined || isNaN(n)) return "—"; const s = n > 0 ? "+" : ""; return `${s}${round2(n)}R`; }
function fmtUsd(n) { if (n === null || n === undefined || isNaN(n)) return "—"; const s = n > 0 ? "+" : n < 0 ? "-" : ""; return `${s}$${Math.abs(round2(n)).toLocaleString()}`; }
function fmtDateLong(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
function weekKey(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}
function monthKey(dateStr) { return (dateStr || "").slice(0, 7); }
function hourBucket(timeStr) {
  if (!timeStr) return "—";
  const [h] = timeStr.split(":");
  const hh = parseInt(h, 10);
  if (isNaN(hh)) return "—";
  return `${hh.toString().padStart(2, "0")}:00`;
}
function getNYSession() {
  try {
    const now = new Date();
    const nyStr = now.toLocaleString("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit", minute: "2-digit" });
    const [h, m] = nyStr.split(":").map(Number);
    const mins = h * 60 + m;
    if (mins < 8 * 60) return { label: "Overnight", live: false };
    if (mins < 9 * 60 + 30) return { label: "Pre-market", live: false };
    if (mins < 10 * 60 + 30) return { label: "Open — first hour", live: true };
    if (mins < 12 * 60) return { label: "Mid-morning", live: true };
    if (mins < 13 * 60 + 30) return { label: "Lunch chop", live: true };
    if (mins < 15 * 60) return { label: "Afternoon", live: true };
    if (mins < 16 * 60) return { label: "Power hour", live: true };
    return { label: "Closed", live: false };
  } catch (e) { return { label: "NY session", live: false }; }
}
function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function csvEscape(v) {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join("; ") : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCSV(rows, columns) {
  const head = columns.map((c) => csvEscape(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => csvEscape(c.get(r))).join(",")).join("\n");
  return head + "\n" + body;
}
function compressImage(file, maxDim = 640, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
        else if (height >= width && height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("image decode failed"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

/* ============================================================
   STORAGE LAYER
   Two backends behind one API:
   - window.storage  — when running as a Claude.ai artifact
     (per-account, private, syncs across your devices automatically).
   - IndexedDB       — when running as a standalone file / PWA
     with no Claude.ai host (fully offline, local to that browser).
   Detected automatically at call time, so the exact same journal
   code works in both places without a build flag. Four composite
   keys hold everything except images; screenshots live under
   their own per-record key so the core journal stays small.
   ============================================================ */
function hasHostStorage() {
  return typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";
}
const IDB_NAME = "esOrderFlowJournal";
const IDB_STORE = "kv";
let _idbOpenPromise = null;
function openIDB() {
  if (_idbOpenPromise) return _idbOpenPromise;
  _idbOpenPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB unavailable")); return; }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _idbOpenPromise;
}
async function idbGet(key) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(key, value) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
async function idbDelete(key) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
async function idbListKeys(prefix) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).getAllKeys();
    req.onsuccess = () => resolve((req.result || []).filter((k) => !prefix || String(k).startsWith(prefix)));
    req.onerror = () => reject(req.error);
  });
}

async function storageGet(key, fallback) {
  try {
    if (hasHostStorage()) {
      const res = await window.storage.get(key, false);
      if (res && typeof res.value === "string") return JSON.parse(res.value);
      return fallback;
    }
    const raw = await idbGet(key);
    return raw !== undefined && raw !== null ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
async function storageSet(key, value) {
  try {
    const json = JSON.stringify(value);
    if (hasHostStorage()) { await window.storage.set(key, json, false); return true; }
    await idbSet(key, json);
    return true;
  } catch (e) { return false; }
}
async function storageDelete(key) {
  try {
    if (hasHostStorage()) { await window.storage.delete(key, false); return true; }
    await idbDelete(key);
    return true;
  } catch (e) { return false; }
}
async function storageListKeys(prefix) {
  try {
    if (hasHostStorage()) { const r = await window.storage.list(prefix, false); return (r && r.keys) || []; }
    return await idbListKeys(prefix);
  } catch (e) { return []; }
}

const DEFAULT_SETTINGS = { preferredUnit: "ticks", riskPerTradeLimit: null, dailyLossLimit: null, customInstruments: {} };

function useJournalStore() {
  const [loading, setLoading] = useState(true);
  const [trades, setTrades] = useState([]); // raw, as stored
  const [noTrades, setNoTrades] = useState([]);
  const [days, setDays] = useState({});
  const [playbook, setPlaybook] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const loaded = useRef(false);
  const timers = useRef({});

  useEffect(() => {
    (async () => {
      const [t, nt, d, pb, st] = await Promise.all([
        storageGet("trades", []),
        storageGet("notrades", []),
        storageGet("days", {}),
        storageGet("playbook", []),
        storageGet("settings", DEFAULT_SETTINGS),
      ]);
      // Migrate once on load — never mutates on-disk data until the
      // person actually edits/saves, so a read-only session never
      // silently rewrites their history.
      setTrades(t.map(migrateTrade));
      setNoTrades(nt); setDays(d); setPlaybook(pb);
      setSettings({ ...DEFAULT_SETTINGS, ...st });
      loaded.current = true;
      setLoading(false);
    })();
  }, []);

  const scheduleSave = useCallback((key, value) => {
    if (!loaded.current) return;
    clearTimeout(timers.current[key]);
    setSaveState("saving");
    timers.current[key] = setTimeout(async () => {
      const ok = await storageSet(key, value);
      setSaveState(ok ? "saved" : "error");
      if (ok) setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
    }, 600);
  }, []);

  useEffect(() => { scheduleSave("trades", trades); }, [trades, scheduleSave]);
  useEffect(() => { scheduleSave("notrades", noTrades); }, [noTrades, scheduleSave]);
  useEffect(() => { scheduleSave("days", days); }, [days, scheduleSave]);
  useEffect(() => { scheduleSave("playbook", playbook); }, [playbook, scheduleSave]);
  useEffect(() => { scheduleSave("settings", settings); }, [settings, scheduleSave]);

  const updateSettings = useCallback((patch) => setSettings((p) => ({ ...p, ...patch })), []);

  // Every consumer in the app reads trades through this — computed
  // once here via calculateTradeMetrics(), not re-derived per view.
  const enrichedTrades = useMemo(() => trades.map((t) => enrichTrade(t, settings.customInstruments)), [trades, settings.customInstruments]);

  const upsertTrade = useCallback((trade) => {
    setTrades((prev) => {
      const idx = prev.findIndex((t) => t.id === trade.id);
      if (idx === -1) return [trade, ...prev];
      const next = prev.slice(); next[idx] = trade; return next;
    });
  }, []);
  const deleteTrade = useCallback((id) => {
    setTrades((prev) => prev.filter((t) => t.id !== id));
    storageDelete(`shots:trade:${id}`);
  }, []);
  const upsertNoTrade = useCallback((nt) => {
    setNoTrades((prev) => {
      const idx = prev.findIndex((t) => t.id === nt.id);
      if (idx === -1) return [nt, ...prev];
      const next = prev.slice(); next[idx] = nt; return next;
    });
  }, []);
  const deleteNoTrade = useCallback((id) => {
    setNoTrades((prev) => prev.filter((t) => t.id !== id));
    storageDelete(`shots:notrade:${id}`);
  }, []);
  const upsertDay = useCallback((date, patch) => {
    setDays((prev) => ({ ...prev, [date]: { ...(prev[date] || {}), ...patch } }));
  }, []);
  const upsertPlaybook = useCallback((setup) => {
    setPlaybook((prev) => {
      const idx = prev.findIndex((p) => p.id === setup.id);
      if (idx === -1) return [setup, ...prev];
      const next = prev.slice(); next[idx] = setup; return next;
    });
  }, []);
  const deletePlaybook = useCallback((id) => {
    setPlaybook((prev) => prev.filter((p) => p.id !== id));
    storageDelete(`shots:playbook:${id}`);
  }, []);

  // Import a previously exported JSON backup. mode "merge" (default)
  // upserts by id so importing never wipes data already on this
  // device — mode "replace" is an explicit, separately-confirmed
  // destructive action for moving a journal to a fresh machine.
  const importAll = useCallback((payload, mode = "merge") => {
    if (!payload || typeof payload !== "object") return { ok: false, error: "File isn't a recognized journal export." };
    const incomingTrades = Array.isArray(payload.trades) ? payload.trades.map(migrateTrade) : [];
    const incomingNoTrades = Array.isArray(payload.noTrades) ? payload.noTrades : [];
    const incomingDays = payload.days && typeof payload.days === "object" ? payload.days : {};
    const incomingPlaybook = Array.isArray(payload.playbook) ? payload.playbook : [];

    if (mode === "replace") {
      setTrades(incomingTrades); setNoTrades(incomingNoTrades); setDays(incomingDays); setPlaybook(incomingPlaybook);
    } else {
      setTrades((prev) => mergeById(prev, incomingTrades));
      setNoTrades((prev) => mergeById(prev, incomingNoTrades));
      setDays((prev) => ({ ...prev, ...incomingDays }));
      setPlaybook((prev) => mergeById(prev, incomingPlaybook));
    }
    return { ok: true, counts: { trades: incomingTrades.length, noTrades: incomingNoTrades.length, days: Object.keys(incomingDays).length, playbook: incomingPlaybook.length } };
  }, []);

  return {
    loading, saveState, trades: enrichedTrades, noTrades, days, playbook, settings,
    upsertTrade, deleteTrade, upsertNoTrade, deleteNoTrade, upsertDay,
    upsertPlaybook, deletePlaybook, updateSettings, importAll,
  };
}
function mergeById(prev, incoming) {
  const byId = new Map(prev.map((x) => [x.id, x]));
  incoming.forEach((x) => { if (x && x.id) byId.set(x.id, x); });
  return Array.from(byId.values());
}

/* ============================================================
   STAT ENGINE
   ============================================================ */
function outcomeOf(t) { if (t.resultR > 0) return "win"; if (t.resultR < 0) return "loss"; return "breakeven"; }
function decisionQualityOf(t) { return t.followedRules === "no" ? "bad" : "good"; }
function outcomeQualityOf(t) { return (t.resultR || 0) >= 0 ? "good" : "bad"; }
function quadrantOf(t) {
  const dq = decisionQualityOf(t), oq = outcomeQualityOf(t);
  if (dq === "good" && oq === "good") return "Great trade";
  if (dq === "good" && oq === "bad") return "Good loss";
  if (dq === "bad" && oq === "good") return "Lucky win";
  return "Bad trade";
}

function computeStats(trades) {
  const n = trades.length;
  if (n === 0) return { n: 0 };
  const wins = trades.filter((t) => t.resultR > 0);
  const losses = trades.filter((t) => t.resultR < 0);
  const be = trades.filter((t) => t.resultR === 0);
  const totalR = trades.reduce((s, t) => s + (t.resultR || 0), 0);
  const grossWin = wins.reduce((s, t) => s + t.resultR, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.resultR, 0));
  const avgWinner = wins.length ? grossWin / wins.length : 0;
  const avgLoser = losses.length ? -grossLoss / losses.length : 0;
  let running = 0, peak = 0, maxDD = 0;
  trades.slice().reverse().forEach((t) => {
    running += t.resultR || 0;
    peak = Math.max(peak, running);
    maxDD = Math.min(maxDD, running - peak);
  });
  // ES tick/point/USD aggregates. Only over trades with a computed
  // result — open trades and legacy $-only rows can't contribute
  // ticks/points, so they're excluded from those particular averages
  // rather than counted as zero.
  const withTicks = trades.filter((t) => t.resultTicks != null);
  const withUsd = trades.filter((t) => t.resultUsd != null);
  const totalTicks = withTicks.reduce((s, t) => s + t.resultTicks, 0);
  const totalPoints = withTicks.reduce((s, t) => s + t.resultPoints, 0);
  const totalUsd = withUsd.reduce((s, t) => s + t.resultUsd, 0);
  return {
    n, wins: wins.length, losses: losses.length, breakeven: be.length,
    winRate: n ? wins.length / n : 0,
    avgR: n ? totalR / n : 0,
    totalR, avgWinner, avgLoser,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0),
    maxDrawdownR: maxDD,
    expectancy: n ? totalR / n : 0,
    avgTicks: withTicks.length ? totalTicks / withTicks.length : null,
    avgPoints: withTicks.length ? totalPoints / withTicks.length : null,
    avgUsd: withUsd.length ? totalUsd / withUsd.length : null,
    totalTicks, totalPoints, totalUsd,
  };
}

function groupStats(trades, keyFn) {
  const map = new Map();
  trades.forEach((t) => {
    const k = keyFn(t);
    if (k === undefined || k === null || k === "") return;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(t);
  });
  const rows = [];
  map.forEach((arr, k) => rows.push({ key: k, ...computeStats(arr) }));
  return rows.sort((a, b) => b.avgR - a.avgR);
}

function bucketBySetupTag(trades) {
  const map = new Map();
  trades.forEach((t) => (t.setupTags || []).forEach((tag) => {
    if (!map.has(tag)) map.set(tag, []);
    map.get(tag).push(t);
  }));
  const rows = [];
  map.forEach((arr, tag) => rows.push({ key: tag, ...computeStats(arr) }));
  return rows.sort((a, b) => b.avgR - a.avgR);
}

function computeMatrix(trades) {
  const m = { "Great trade": 0, "Good loss": 0, "Lucky win": 0, "Bad trade": 0 };
  trades.forEach((t) => { m[quadrantOf(t)]++; });
  return m;
}

function computeMistakeStats(trades) {
  const map = new Map();
  MISTAKE_TAGS.forEach((m) => map.set(m, { key: m, count: 0, totalR: 0, tradeCount: 0 }));
  trades.forEach((t) => (t.mistakes || []).forEach((m) => {
    if (!map.has(m)) map.set(m, { key: m, count: 0, totalR: 0, tradeCount: 0 });
    const row = map.get(m);
    row.count++; row.totalR += (t.resultR || 0); row.tradeCount++;
  }));
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

function applyFilters(trades, f) {
  return trades.filter((t) => {
    if (f.from && t.date < f.from) return false;
    if (f.to && t.date > f.to) return false;
    if (f.direction && f.direction !== "any" && t.direction !== f.direction) return false;
    if (f.result && f.result !== "any") {
      const o = outcomeOf(t);
      if (f.result !== o) return false;
    }
    if (f.condition && f.condition !== "any" && (t.context && t.context.condition) !== f.condition) return false;
    if (f.location && f.location !== "any" && (t.context && t.context.location) !== f.location) return false;
    if (f.mistake && f.mistake !== "any" && !(t.mistakes || []).includes(f.mistake)) return false;
    if (f.tags && f.tags.length && !f.tags.every((tag) => (t.setupTags || []).includes(tag))) return false;
    if (f.timeFrom && (t.time || "") < f.timeFrom) return false;
    if (f.timeTo && (t.time || "") > f.timeTo) return false;
    if (f.text) {
      const hay = [
        t.whyEntered, t.orderFlow && t.orderFlow.interpretation, t.orderFlow && t.orderFlow.invalidation,
        t.exitAnalysis && t.exitAnalysis.replayNote, t.instrument,
      ].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(f.text.toLowerCase())) return false;
    }
    return true;
  });
}

function sampleTier(n) {
  if (n < 15) return { tier: "insufficient", label: "Insufficient data" };
  if (n < 50) return { tier: "limited", label: "Limited sample — interpret cautiously" };
  return { tier: "solid", label: "Meaningful sample size" };
}

/* ============================================================
   UI ATOMS
   ============================================================ */
function Panel({ title, icon: Icon, right, children, style }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, ...style }}>
      {title && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {Icon && <Icon size={14} color={C.inkDim} />}
            <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: 0.2 }}>{title}</span>
          </div>
          {right}
        </div>
      )}
      <div style={{ padding: 14 }}>{children}</div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: C.inkDim, marginBottom: 5 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

const inputBase = {
  width: "100%", background: C.bgAlt, border: `1px solid ${C.line}`, borderRadius: 4,
  color: C.ink, fontSize: 13, padding: "8px 10px", outline: "none", boxSizing: "border-box",
};

function TextInput({ value, onChange, placeholder, mono, type = "text" }) {
  return (
    <input
      type={type} value={value === undefined || value === null ? "" : value}
      onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      style={{ ...inputBase, ...(mono ? MONO : SANS) }}
      onFocus={(e) => (e.target.style.borderColor = C.accentDim)}
      onBlur={(e) => (e.target.style.borderColor = C.line)}
    />
  );
}

function NumberInput({ value, onChange, placeholder, step }) {
  return (
    <input
      type="number" step={step || "any"} value={value === undefined || value === null ? "" : value}
      onChange={(e) => onChange(e.target.value === "" ? null : parseFloat(e.target.value))}
      placeholder={placeholder} style={{ ...inputBase, ...MONO }}
      onFocus={(e) => (e.target.style.borderColor = C.accentDim)}
      onBlur={(e) => (e.target.style.borderColor = C.line)}
    />
  );
}

function TextArea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea
      value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      style={{ ...inputBase, ...SANS, resize: "vertical", lineHeight: 1.5, fontFamily: SANS.fontFamily }}
      onFocus={(e) => (e.target.style.borderColor = C.accentDim)}
      onBlur={(e) => (e.target.style.borderColor = C.line)}
    />
  );
}

function SelectInput({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value || ""} onChange={(e) => onChange(e.target.value)}
      style={{ ...inputBase, appearance: "none" }}
    >
      <option value="">{placeholder || "Select…"}</option>
      {options.map((o) => (<option key={o} value={o}>{o}</option>))}
    </select>
  );
}

function Segmented({ value, onChange, options }) {
  // options: [{value,label}]
  return (
    <div style={{ display: "flex", border: `1px solid ${C.line}`, borderRadius: 4, overflow: "hidden", width: "fit-content" }}>
      {options.map((o, i) => {
        const active = value === o.value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)}
            style={{
              padding: "7px 14px", fontSize: 12.5, fontWeight: 500, cursor: "pointer",
              border: "none", borderRight: i < options.length - 1 ? `1px solid ${C.line}` : "none",
              background: active ? C.accent : "transparent", color: active ? "#1A1408" : C.inkDim,
            }}>{o.label}</button>
        );
      })}
    </div>
  );
}

function YesNoUnsure({ value, onChange, labels }) {
  const L = labels || { yes: "Yes", no: "No", unsure: "Unsure" };
  return <Segmented value={value} onChange={onChange} options={[
    { value: "yes", label: L.yes }, { value: "no", label: L.no }, { value: "unsure", label: L.unsure },
  ]} />;
}

function RatingRow({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
        const active = value >= n;
        return (
          <button key={n} onClick={() => onChange(n)} title={String(n)}
            style={{
              width: 22, height: 22, borderRadius: 3, fontSize: 10, cursor: "pointer",
              border: `1px solid ${active ? C.accent : C.line}`,
              background: active ? C.accent : "transparent", color: active ? "#1A1408" : C.inkFaint,
              ...MONO,
            }}>{n}</button>
        );
      })}
    </div>
  );
}

function normalizeItems(items) {
  return items.map((it) => Array.isArray(it) ? { key: it[0], label: it[1] } : { key: it, label: it });
}

function ChipMultiSelect({ items, value, onChange, allowCustom }) {
  const norm = normalizeItems(items);
  const selected = value || [];
  const extras = selected.filter((v) => !norm.some((n) => n.key === v));
  const [draft, setDraft] = useState("");
  function toggle(key) {
    if (selected.includes(key)) onChange(selected.filter((k) => k !== key));
    else onChange([...selected, key]);
  }
  function addCustom() {
    const v = draft.trim();
    if (v && !selected.includes(v)) onChange([...selected, v]);
    setDraft("");
  }
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {norm.map((it) => {
          const active = selected.includes(it.key);
          return (
            <button key={it.key} onClick={() => toggle(it.key)}
              style={{
                padding: "5px 10px", fontSize: 12, borderRadius: 999, cursor: "pointer",
                border: `1px solid ${active ? C.accent : C.line}`,
                background: active ? C.accentDim : "transparent",
                color: active ? C.accent : C.inkDim,
              }}>{it.label}</button>
          );
        })}
        {extras.map((v) => (
          <button key={v} onClick={() => toggle(v)}
            style={{ padding: "5px 10px", fontSize: 12, borderRadius: 999, cursor: "pointer", border: `1px solid ${C.accent}`, background: C.accentDim, color: C.accent }}>
            {v} ✕
          </button>
        ))}
      </div>
      {allowCustom && (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }}
            placeholder="Add custom tag…" style={{ ...inputBase, ...SANS, width: 180, padding: "5px 8px", fontSize: 12 }} />
          <button onClick={addCustom} style={{ ...ghostBtn, padding: "5px 10px" }}>Add</button>
        </div>
      )}
    </div>
  );
}

const primaryBtn = {
  background: C.accent, color: "#1A1408", border: "none", borderRadius: 4,
  padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
};
const ghostBtn = {
  background: "transparent", color: C.inkDim, border: `1px solid ${C.line}`, borderRadius: 4,
  padding: "9px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
};
const dangerBtn = {
  background: "transparent", color: C.bad, border: `1px solid ${C.badDim}`, borderRadius: 4,
  padding: "7px 12px", fontSize: 12, fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
};

function Badge({ tone = "neutral", children }) {
  const map = {
    good: { bg: C.goodDim, fg: C.good }, bad: { bg: C.badDim, fg: C.bad },
    warn: { bg: "#3A2E12", fg: C.accent }, neutral: { bg: C.panelRaised, fg: C.inkDim },
  };
  const s = map[tone] || map.neutral;
  return <span style={{ background: s.bg, color: s.fg, fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>{children}</span>;
}

function StatTile({ label, value, sub, tone }) {
  const color = tone === "good" ? C.good : tone === "bad" ? C.bad : C.ink;
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: C.inkDim, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color, ...MONO }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function SaveIndicator({ state }) {
  if (state === "idle") return <span style={{ fontSize: 11, color: C.inkFaint }}>All changes saved</span>;
  if (state === "saving") return <span style={{ fontSize: 11, color: C.inkFaint }}>Saving…</span>;
  if (state === "saved") return <span style={{ fontSize: 11, color: C.good, display: "flex", alignItems: "center", gap: 4 }}><CheckCircle2 size={12} /> Saved</span>;
  return <span style={{ fontSize: 11, color: C.bad }}>Couldn't save — check connection</span>;
}

function EmptyState({ icon: Icon, title, message, actionLabel, onAction }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 20px", color: C.inkDim }}>
      {Icon && <Icon size={28} color={C.inkFaint} style={{ marginBottom: 10 }} />}
      <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>{title}</div>
      {message && <div style={{ fontSize: 12.5, marginBottom: 14, maxWidth: 380, marginLeft: "auto", marginRight: "auto" }}>{message}</div>}
      {actionLabel && <button style={primaryBtn} onClick={onAction}><Plus size={14} />{actionLabel}</button>}
    </div>
  );
}

function ConfirmDelete({ onConfirm, label }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) return <button style={dangerBtn} onClick={() => setConfirming(true)}><Trash2 size={12} />{label || "Delete"}</button>;
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <span style={{ fontSize: 12, color: C.bad }}>Delete permanently?</span>
      <button style={{ ...dangerBtn, background: C.badDim }} onClick={onConfirm}>Yes, delete</button>
      <button style={ghostBtn} onClick={() => setConfirming(false)}>Cancel</button>
    </span>
  );
}

function QuadrantMini({ matrix }) {
  const total = Object.values(matrix).reduce((a, b) => a + b, 0) || 1;
  const cells = [
    { key: "Great trade", tone: "good", desc: "Good decision, good outcome" },
    { key: "Good loss", tone: "good", desc: "Good decision, bad outcome" },
    { key: "Lucky win", tone: "bad", desc: "Bad decision, good outcome" },
    { key: "Bad trade", tone: "bad", desc: "Bad decision, bad outcome" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {cells.map((c) => (
        <div key={c.key} style={{
          border: `1px solid ${c.tone === "good" ? C.goodDim : C.badDim}`,
          background: c.tone === "good" ? "rgba(125,169,139,0.07)" : "rgba(192,106,92,0.07)",
          borderRadius: 6, padding: "10px 12px",
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: c.tone === "good" ? C.good : C.bad }}>{c.key}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.ink, ...MONO, marginTop: 2 }}>{matrix[c.key]}</div>
          <div style={{ fontSize: 10.5, color: C.inkFaint, marginTop: 2 }}>{c.desc} · {Math.round((matrix[c.key] / total) * 100)}%</div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   NAVIGATION
   ============================================================ */
const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "prep", label: "Daily Prep", icon: Sunrise },
  { key: "verdict", label: "Trade / No-Trade", icon: ClipboardCheck },
  { key: "trades", label: "Trades", icon: ListChecks },
  { key: "notrades", label: "No-Trades", icon: XOctagon },
  { key: "dailyreview", label: "Daily Review", icon: CalendarClock },
  { key: "weeklyreview", label: "Weekly Review", icon: CalendarRange },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "edge", label: "Edge Discovery", icon: Search },
  { key: "mistakes", label: "Mistakes", icon: AlertTriangle },
  { key: "playbook", label: "Playbook", icon: BookOpen },
  { key: "settings", label: "Settings", icon: Settings },
];

function NavRail({ tab, setTab, mobileOpen, setMobileOpen }) {
  return (
    <>
      <div className="hidden md:flex" style={{ flexDirection: "column", width: 200, flexShrink: 0, background: C.bgAlt, borderRight: `1px solid ${C.line}`, height: "100%", padding: "14px 8px" }}>
        <Brand />
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV_ITEMS.map((it) => (
            <NavButton key={it.key} item={it} active={tab === it.key} onClick={() => setTab(it.key)} />
          ))}
        </div>
      </div>
      {mobileOpen && (
        <div className="md:hidden" style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.6)" }} onClick={() => setMobileOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 230, height: "100%", background: C.bgAlt, borderRight: `1px solid ${C.line}`, padding: 14 }}>
            <Brand />
            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 2 }}>
              {NAV_ITEMS.map((it) => (
                <NavButton key={it.key} item={it} active={tab === it.key} onClick={() => { setTab(it.key); setMobileOpen(false); }} />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Brand() {
  return (
    <div style={{ padding: "4px 8px", display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 8, height: 8, borderRadius: 2, background: C.accent }} />
      <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: 0.3 }}>LFENWA TRADES</span>
    </div>
  );
}

function NavButton({ item, active, onClick }) {
  const Icon = item.icon;
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 5,
      border: "none", cursor: "pointer", textAlign: "left",
      background: active ? C.panelRaised : "transparent",
      color: active ? C.ink : C.inkDim, fontSize: 12.5, fontWeight: active ? 600 : 500,
      borderLeft: active ? `2px solid ${C.accent}` : "2px solid transparent",
    }}>
      <Icon size={15} color={active ? C.accent : C.inkFaint} />
      {item.label}
    </button>
  );
}

function TopBar({ title, subtitle, saveState, onMenu, right }) {
  const session = useMemo(() => getNYSession(), []);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: `1px solid ${C.line}`, background: C.bg, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button className="md:hidden" onClick={onMenu} style={{ background: "transparent", border: "none", color: C.ink, cursor: "pointer" }}><Menu size={20} /></button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11.5, color: C.inkFaint }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 11.5, color: session.live ? C.good : C.inkFaint, display: "flex", alignItems: "center", gap: 5 }}>
          <CircleDot size={10} />{session.label}
        </span>
        <SaveIndicator state={saveState} />
      </div>
      {right}
    </div>
  );
}

/* ============================================================
   EXPORT HELPERS
   ============================================================ */
// Full backup: journal data + settings + every screenshot blob, so
// moving to a new PC (Part 21/13) doesn't leave images behind.
// Large if you have many screenshots — that's the JPEG thumbnails,
// not a bug.
async function exportAllJSON(store) {
  const shotKeys = await storageListKeys("shots:");
  const screenshots = {};
  for (const k of shotKeys) {
    const v = await storageGet(k, null);
    if (v) screenshots[k] = v;
  }
  const payload = {
    schema: 2, exportedAt: new Date().toISOString(),
    trades: store.trades, noTrades: store.noTrades, days: store.days,
    playbook: store.playbook, settings: store.settings, screenshots,
  };
  downloadFile(`trading-journal-export-${todayStr()}.json`, JSON.stringify(payload), "application/json");
  return payload;
}
async function restoreScreenshots(screenshots) {
  if (!screenshots || typeof screenshots !== "object") return 0;
  const entries = Object.entries(screenshots);
  for (const [key, value] of entries) await storageSet(key, value);
  return entries.length;
}
function parseImportFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => { try { resolve(JSON.parse(e.target.result)); } catch (err) { reject(new Error("That file isn't valid JSON.")); } };
    reader.onerror = () => reject(new Error("Couldn't read the file."));
    reader.readAsText(file);
  });
}
function exportTradesCSV(trades) {
  const cols = [
    { label: "Date", get: (t) => t.date }, { label: "Time", get: (t) => t.time },
    { label: "Instrument", get: (t) => t.instrumentKey || t.instrument }, { label: "Direction", get: (t) => t.direction },
    { label: "Entry", get: (t) => t.entryPrice }, { label: "Stop", get: (t) => t.stopPrice },
    { label: "Target", get: (t) => t.targetPrice },
    { label: "Exits", get: (t) => (t.exits || []).map((e) => `${e.contracts}@${e.price}`).join("; ") },
    { label: "Avg exit", get: (t) => t.avgExitPrice },
    { label: "Contracts", get: (t) => t.contracts },
    { label: "Risk (ticks)", get: (t) => t.riskTicks }, { label: "Risk (points)", get: (t) => t.riskPoints }, { label: "Risk $", get: (t) => t.riskUsd },
    { label: "Planned R:R", get: (t) => t.plannedRR },
    { label: "Result (ticks)", get: (t) => t.resultTicks }, { label: "Result (points)", get: (t) => t.resultPoints },
    { label: "Result $", get: (t) => t.resultUsd },
    { label: "Result R", get: (t) => t.resultR }, { label: "Outcome", get: (t) => outcomeOf(t) },
    { label: "Legacy entry", get: (t) => (t.isLegacyResult ? "yes" : "") },
    { label: "Setup tags", get: (t) => (t.setupTags || []).join("; ") },
    { label: "Market condition", get: (t) => t.context && t.context.condition },
    { label: "Location", get: (t) => t.context && t.context.location },
    { label: "Followed rules", get: (t) => t.followedRules },
    { label: "Decision quality", get: (t) => decisionQualityOf(t) },
    { label: "Mistakes", get: (t) => (t.mistakes || []).join("; ") },
    { label: "Checklist score", get: (t) => t.checklist ? `${Object.values(t.checklist).filter(Boolean).length}/${CHECKLIST_ITEMS.length}` : "" },
    { label: "Why entered", get: (t) => t.whyEntered },
  ];
  downloadFile(`trades-export-${todayStr()}.csv`, toCSV(trades, cols), "text/csv");
}

/* ============================================================
   SCREENSHOT MANAGER (self-contained; own storage key)
   ============================================================ */
function ScreenshotManager({ entityType, entityId, slots }) {
  const storageKey = `shots:${entityType}:${entityId}`;
  const [shots, setShots] = useState(null); // {slotKey: [{id,caption,dataUrl}]}
  const [busy, setBusy] = useState(false);

  useEffect(() => { let alive = true; (async () => { const v = await storageGet(storageKey, {}); if (alive) setShots(v); })(); return () => { alive = false; }; }, [storageKey]);

  async function persist(next) { setShots(next); await storageSet(storageKey, next); }

  async function handleFiles(slotKey, files) {
    setBusy(true);
    const next = { ...(shots || {}) };
    const arr = next[slotKey] ? next[slotKey].slice() : [];
    for (const file of Array.from(files)) {
      try {
        const dataUrl = await compressImage(file);
        arr.push({ id: uid(), caption: "", dataUrl });
      } catch (e) { /* skip unreadable file */ }
    }
    next[slotKey] = arr;
    await persist(next);
    setBusy(false);
  }
  function setCaption(slotKey, id, caption) {
    const next = { ...(shots || {}) };
    next[slotKey] = (next[slotKey] || []).map((s) => (s.id === id ? { ...s, caption } : s));
    persist(next);
  }
  function removeShot(slotKey, id) {
    const next = { ...(shots || {}) };
    next[slotKey] = (next[slotKey] || []).filter((s) => s.id !== id);
    persist(next);
  }

  if (shots === null) return <div style={{ fontSize: 12, color: C.inkFaint }}>Loading screenshots…</div>;

  const groups = {};
  slots.forEach(([key, label, group]) => { (groups[group || "all"] = groups[group || "all"] || []).push([key, label]); });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {Object.entries(groups).map(([group, keys]) => (
        <div key={group}>
          {Object.keys(groups).length > 1 && <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>{group}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
            {keys.map(([slotKey, label]) => (
              <div key={slotKey} style={{ border: `1px dashed ${C.line}`, borderRadius: 6, padding: 8 }}>
                <div style={{ fontSize: 11, color: C.inkDim, marginBottom: 6 }}>{label}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                  {(shots[slotKey] || []).map((s) => (
                    <div key={s.id} style={{ position: "relative", width: 70 }}>
                      <img src={s.dataUrl} alt={label} style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 4, border: `1px solid ${C.line}` }} />
                      <button onClick={() => removeShot(slotKey, s.id)} style={{ position: "absolute", top: -6, right: -6, background: C.bad, border: "none", borderRadius: "50%", width: 16, height: 16, color: "#fff", fontSize: 9, cursor: "pointer", lineHeight: "16px" }}>✕</button>
                      <input value={s.caption} onChange={(e) => setCaption(slotKey, s.id, e.target.value)} placeholder="caption"
                        style={{ width: 70, fontSize: 9, marginTop: 3, background: C.bgAlt, border: `1px solid ${C.line}`, borderRadius: 3, color: C.ink, padding: "2px 3px" }} />
                    </div>
                  ))}
                </div>
                <label style={{ fontSize: 11, color: C.accent, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Camera size={12} /> {busy ? "Uploading…" : "Add image"}
                  <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => e.target.files.length && handleFiles(slotKey, e.target.files)} />
                </label>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function DashboardView({ store, selectedDate, goTo }) {
  const { trades, noTrades, days } = store;
  const today = todayStr();
  const todaysTrades = useMemo(() => trades.filter((t) => t.date === today), [trades, today]);
  const wk = weekKey(today);
  const weekTrades = useMemo(() => trades.filter((t) => weekKey(t.date) === wk), [trades, wk]);
  const weekNoTrades = useMemo(() => noTrades.filter((t) => weekKey(t.date) === wk), [noTrades, wk]);
  const todayStats = computeStats(todaysTrades);
  const weekStats = computeStats(weekTrades);
  const allStats = computeStats(trades);
  const matrix = computeMatrix(trades);
  const mistakeStats = computeMistakeStats(trades).filter((m) => m.count > 0);
  const bestMistake = mistakeStats[0];
  const setupStats = bucketBySetupTag(trades).filter((s) => s.n >= 3);
  const bestSetup = setupStats[0];
  const worstSetup = setupStats[setupStats.length - 1];
  const todayDay = days[today] || {};
  const verdict = computeVerdict(todayDay);
  const ruleViolationsToday = todaysTrades.filter((t) => t.followedRules === "no").length;
  const equityData = useMemo(() => {
    let running = 0;
    return trades.slice().reverse().map((t, i) => { running += (t.resultR || 0); return { i, r: round2(running) }; });
  }, [trades]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <VerdictChip verdict={verdict} onClick={() => goTo("verdict")} />
        <div style={{ display: "flex", gap: 8 }}>
          <button style={ghostBtn} onClick={() => goTo("trades", { mode: "form", id: null })}><Plus size={13} /> New trade</button>
          <button style={ghostBtn} onClick={() => goTo("notrades", { mode: "form", id: null })}><Plus size={13} /> No-trade</button>
        </div>
      </div>

      <Panel title="Today">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px,1fr))", gap: 10 }}>
          <StatTile label="Trades" value={todaysTrades.length} />
          <StatTile label="Daily R" value={fmtR(todayStats.totalR)} tone={todayStats.totalR > 0 ? "good" : todayStats.totalR < 0 ? "bad" : undefined} />
          <StatTile label="Rule violations" value={ruleViolationsToday} tone={ruleViolationsToday > 0 ? "bad" : "good"} />
          <StatTile label="Process score" value={todayDay.dailyReview && todayDay.dailyReview.scores ? `${avgScore(todayDay.dailyReview.scores)}/10` : "Pending"} />
          <StatTile label="Last trade" value={todaysTrades[0] ? fmtR(todaysTrades[0].resultR) : "—"} sub={todaysTrades[0] ? `${todaysTrades[0].time || ""} · ${(todaysTrades[0].setupTags||[])[0] || ""}` : "No trades yet"} />
          <StatTile label="Daily $" value={fmtUsd(todayStats.totalUsd)} tone={todayStats.totalUsd > 0 ? "good" : todayStats.totalUsd < 0 ? "bad" : undefined} />
        </div>
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 14 }} className="grid-stack">
        <Panel title="This week">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px,1fr))", gap: 10 }}>
            <StatTile label="R" value={fmtR(weekStats.totalR)} tone={weekStats.totalR > 0 ? "good" : weekStats.totalR < 0 ? "bad" : undefined} />
            <StatTile label="$" value={fmtUsd(weekStats.totalUsd)} tone={weekStats.totalUsd > 0 ? "good" : weekStats.totalUsd < 0 ? "bad" : undefined} />
            <StatTile label="Win rate" value={weekStats.n ? `${Math.round(weekStats.winRate * 100)}%` : "—"} />
            <StatTile label="Trades" value={weekStats.n} />
            <StatTile label="No-trades" value={weekNoTrades.length} />
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: C.inkDim }}>
            Most common mistake this period: <strong style={{ color: C.ink }}>{bestMistake ? `${bestMistake.key} (${bestMistake.count}×)` : "None logged yet"}</strong>
          </div>
        </Panel>

        <Panel title="Long term">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px,1fr))", gap: 10 }}>
            <StatTile label="Expectancy" value={fmtR(allStats.expectancy)} />
            <StatTile label="Best setup" value={bestSetup ? bestSetup.key : "—"} sub={bestSetup ? fmtR(bestSetup.avgR) + " avg" : "3+ trades needed"} />
            <StatTile label="Worst setup" value={worstSetup && worstSetup !== bestSetup ? worstSetup.key : "—"} sub={worstSetup && worstSetup !== bestSetup ? fmtR(worstSetup.avgR) + " avg" : ""} />
          </div>
        </Panel>
      </div>

      <Panel title="Decision quality vs outcome — the core question" icon={Info}>
        <QuadrantMini matrix={matrix} />
        <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 10 }}>
          A losing trade with a followed process is a good loss. A winning trade taken by breaking rules is a bad trade. This app scores that split, not just P&L.
        </div>
      </Panel>

      {equityData.length > 1 && (
        <Panel title="Equity curve (cumulative R)">
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={equityData}>
                <CartesianGrid stroke={C.lineSoft} vertical={false} />
                <XAxis dataKey="i" tick={{ fill: C.inkFaint, fontSize: 10 }} axisLine={{ stroke: C.line }} tickLine={false} hide />
                <YAxis tick={{ fill: C.inkFaint, fontSize: 10 }} axisLine={{ stroke: C.line }} tickLine={false} width={40} />
                <ReferenceLine y={0} stroke={C.line} />
                <Tooltip contentStyle={{ background: C.panelRaised, border: `1px solid ${C.line}`, fontSize: 12 }} labelFormatter={() => ""} formatter={(v) => [fmtR(v), "Cumulative R"]} />
                <Line type="monotone" dataKey="r" stroke={C.accent} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}
    </div>
  );
}

function avgScore(scores) {
  const vals = Object.values(scores).filter((v) => typeof v === "number");
  if (!vals.length) return "—";
  return round2(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/* ============================================================
   TRADE / NO-TRADE VERDICT ENGINE
   ============================================================ */
function computeVerdict(dayRecord) {
  const q = (dayRecord && dayRecord.tradeNoTrade) || {};
  if (q.sleep == null && q.energy == null && q.focus == null) {
    return { color: "gray", label: "Not checked in", reasons: ["Fill in the Trade / No-Trade check-in for today."] };
  }
  const red = [];
  const yellow = [];
  if (q.sleep != null && q.sleep <= 3) red.push("Sleep is very low (" + q.sleep + "/10)");
  if (q.energy != null && q.energy <= 3) red.push("Energy is very low (" + q.energy + "/10)");
  if (q.focus != null && q.focus <= 3) red.push("Focus is very low (" + q.focus + "/10)");
  if (q.emotional != null && q.emotional <= 3) red.push("Emotional state is unstable (" + q.emotional + "/10)");
  if (q.riskOk === "no") red.push("Risk condition is not acceptable today");
  if (q.sleep != null && q.sleep > 3 && q.sleep <= 6) yellow.push("Sleep is below your best (" + q.sleep + "/10)");
  if (q.energy != null && q.energy > 3 && q.energy <= 6) yellow.push("Energy is moderate (" + q.energy + "/10)");
  if (q.focus != null && q.focus > 3 && q.focus <= 6) yellow.push("Focus is moderate (" + q.focus + "/10)");
  if (q.emotional != null && q.emotional > 3 && q.emotional <= 6) yellow.push("Emotional state is moderate (" + q.emotional + "/10)");
  if (q.marketCondition === "Choppy") yellow.push("Market condition is choppy");
  if (q.news === "yes") yellow.push("Important news is scheduled");
  if (q.news === "unsure") yellow.push("Not sure whether important news is scheduled");
  if (q.riskOk === "unsure") yellow.push("Risk condition is uncertain");
  if (red.length) return { color: "red", label: "Do not trade", reasons: red };
  if (yellow.length) return { color: "yellow", label: "A+ setups only", reasons: yellow };
  return { color: "green", label: "Conditions acceptable", reasons: ["Sleep, energy, focus and emotional state are all solid.", "No choppy conditions or major news flagged."] };
}

function VerdictChip({ verdict, onClick }) {
  const map = {
    green: { bg: "rgba(125,169,139,0.12)", fg: C.good, border: C.goodDim },
    yellow: { bg: "rgba(217,165,72,0.12)", fg: C.accent, border: C.accentDim },
    red: { bg: "rgba(192,106,92,0.12)", fg: C.bad, border: C.badDim },
    gray: { bg: C.panel, fg: C.inkDim, border: C.line },
  };
  const s = map[verdict.color];
  return (
    <button onClick={onClick} style={{ background: s.bg, color: s.fg, border: `1px solid ${s.border}`, borderRadius: 6, padding: "9px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, textAlign: "left" }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: s.fg, flexShrink: 0 }} />
      <span>
        <div style={{ fontSize: 12, fontWeight: 700 }}>{verdict.label}</div>
        <div style={{ fontSize: 10.5, color: C.inkFaint }}>Trade / No-Trade for today · click for detail</div>
      </span>
    </button>
  );
}

/* ============================================================
   DATE NAV (shared by Daily Prep / Verdict / Daily Review)
   ============================================================ */
function DateNav({ date, setDate }) {
  function shift(days) { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() + days); setDate(d.toISOString().slice(0, 10)); }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <button style={ghostBtn} onClick={() => shift(-1)}><ChevronLeft size={14} /></button>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...inputBase, ...MONO, width: 165 }} />
      <button style={ghostBtn} onClick={() => shift(1)}><ChevronRight size={14} /></button>
      {date !== todayStr() && <button style={ghostBtn} onClick={() => setDate(todayStr())}>Today</button>}
      <span style={{ fontSize: 12.5, color: C.inkDim }}>{fmtDateLong(date)}</span>
    </div>
  );
}

/* ============================================================
   DAILY PREP
   ============================================================ */
function DailyPrepView({ date, setDate, dayRecord, onSave }) {
  const pm = dayRecord.premarket || {};
  const ms = dayRecord.mentalState || {};
  const setPm = (k, v) => onSave({ premarket: { ...pm, [k]: v } });
  const setMs = (k, v) => onSave({ mentalState: { ...ms, [k]: v } });

  return (
    <div>
      <DateNav date={date} setDate={setDate} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="grid-stack">
        <Panel title="Pre-market">
          <Field label="Trading session">
            <SelectInput value={pm.session} onChange={(v) => setPm("session", v)} options={["Overnight", "NY Pre-market", "NY Open (9:30–10:30)", "NY Morning", "Lunch", "NY Afternoon", "Power Hour"]} />
          </Field>
          <Field label="Instrument"><TextInput value={pm.instrument ?? "ES"} onChange={(v) => setPm("instrument", v)} mono /></Field>
          <Field label="Market bias"><Segmented value={pm.bias} onChange={(v) => setPm("bias", v)} options={[{ value: "Bullish", label: "Bullish" }, { value: "Bearish", label: "Bearish" }, { value: "Neutral", label: "Neutral" }]} /></Field>
          <Field label="Higher timeframe context"><TextArea value={pm.htfContext} onChange={(v) => setPm("htfContext", v)} rows={2} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Previous Day High"><NumberInput value={pm.pdh} onChange={(v) => setPm("pdh", v)} /></Field>
            <Field label="Previous Day Low"><NumberInput value={pm.pdl} onChange={(v) => setPm("pdl", v)} /></Field>
            <Field label="Previous Day Close"><NumberInput value={pm.pdc} onChange={(v) => setPm("pdc", v)} /></Field>
            <Field label="Overnight High"><NumberInput value={pm.onh} onChange={(v) => setPm("onh", v)} /></Field>
            <Field label="Overnight Low"><NumberInput value={pm.onl} onChange={(v) => setPm("onl", v)} /></Field>
          </div>
          <Field label="Important levels"><TextArea value={pm.levels} onChange={(v) => setPm("levels", v)} rows={2} /></Field>
          <Field label="Key liquidity areas"><TextArea value={pm.liquidityAreas} onChange={(v) => setPm("liquidityAreas", v)} rows={2} /></Field>
          <Field label="Volume Profile information"><TextArea value={pm.volumeProfile} onChange={(v) => setPm("volumeProfile", v)} rows={2} /></Field>
          <Field label="Expected scenarios — “If X happens, I will look for Y”"><TextArea value={pm.scenarios} onChange={(v) => setPm("scenarios", v)} rows={2} /></Field>
          <Field label="“If X happens, I will NOT trade”"><TextArea value={pm.avoidScenarios} onChange={(v) => setPm("avoidScenarios", v)} rows={2} /></Field>
        </Panel>

        <Panel title="Mental state before trading">
          {RATING_KEYS.map(([k, label]) => (
            <Field key={k} label={label}><RatingRow value={ms[k]} onChange={(v) => setMs(k, v)} /></Field>
          ))}
          <Field label="How am I feeling today?"><TextArea value={ms.feelingText} onChange={(v) => setMs("feelingText", v)} rows={3} /></Field>
          <Field label="Am I in a state where I should trade today?">
            <YesNoUnsure value={ms.shouldTrade} onChange={(v) => setMs("shouldTrade", v)} />
          </Field>
          {ms.shouldTrade === "no" && (
            <div style={{ background: "rgba(192,106,92,0.1)", border: `1px solid ${C.badDim}`, borderRadius: 6, padding: 12, marginTop: 4, display: "flex", gap: 8, alignItems: "flex-start" }}>
              <AlertTriangle size={15} color={C.bad} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 12.5, color: C.bad }}>You flagged yourself as not ready to trade today. Consider staying out of the market, or restrict yourself to A+ setups only.</span>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ============================================================
   TRADE / NO-TRADE VERDICT PAGE
   ============================================================ */
function TradeNoTradeView({ date, setDate, dayRecord, onSave }) {
  const q = dayRecord.tradeNoTrade || {};
  const ms = dayRecord.mentalState || {};
  const setQ = (k, v) => onSave({ tradeNoTrade: { ...q, [k]: v } });
  const verdict = computeVerdict(dayRecord);
  const colorMap = { green: C.good, yellow: C.accent, red: C.bad, gray: C.inkDim };
  const canCopy = ms.sleep != null || ms.energy != null || ms.focus != null;

  return (
    <div>
      <DateNav date={date} setDate={setDate} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="grid-stack">
        <Panel title="Session check-in" right={canCopy && (
          <button style={{ ...ghostBtn, padding: "5px 9px", fontSize: 11 }} onClick={() => onSave({ tradeNoTrade: { ...q, sleep: ms.sleep, energy: ms.energy, focus: ms.focus, emotional: ms.emotionalStability } })}>Copy from Daily Prep</button>
        )}>
          <Field label="Sleep"><RatingRow value={q.sleep} onChange={(v) => setQ("sleep", v)} /></Field>
          <Field label="Energy"><RatingRow value={q.energy} onChange={(v) => setQ("energy", v)} /></Field>
          <Field label="Focus"><RatingRow value={q.focus} onChange={(v) => setQ("focus", v)} /></Field>
          <Field label="Emotional state"><RatingRow value={q.emotional} onChange={(v) => setQ("emotional", v)} /></Field>
          <Field label="Market condition"><SelectInput value={q.marketCondition} onChange={(v) => setQ("marketCondition", v)} options={MARKET_CONDITIONS} /></Field>
          <Field label="Important news today?"><YesNoUnsure labels={{ yes: "Yes", no: "No", unsure: "Not sure" }} value={q.news} onChange={(v) => setQ("news", v)} /></Field>
          <Field label="Risk condition acceptable? (sizing, daily loss limit, account state)"><YesNoUnsure value={q.riskOk} onChange={(v) => setQ("riskOk", v)} /></Field>
          <Field label="My planned setups today"><TextArea value={q.plannedSetups} onChange={(v) => setQ("plannedSetups", v)} rows={2} /></Field>
        </Panel>

        <div>
          <Panel title="Verdict">
            <div style={{ textAlign: "center", padding: "10px 0 16px" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: colorMap[verdict.color], margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#0E1416" }}>
                {verdict.color.toUpperCase()}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{verdict.label}</div>
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: C.inkDim, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Why</div>
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
              {verdict.reasons.map((r, i) => <li key={i} style={{ fontSize: 12.5, color: C.inkDim }}>{r}</li>)}
            </ul>
            <div style={{ marginTop: 14, fontSize: 11, color: C.inkFaint, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
              This is a decision-discipline tool built from your own inputs — it is not financial advice and does not predict the market.
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   FILTER BAR (shared: Trades list, Analytics, Edge Discovery)
   ============================================================ */
function defaultFilters() {
  return { from: "", to: "", direction: "any", result: "any", condition: "any", location: "any", mistake: "any", tags: [], timeFrom: "", timeTo: "", text: "" };
}
function FilterBar({ filters, setFilters, emphasizeTags }) {
  const set = (k, v) => setFilters({ ...filters, [k]: v });
  const active = JSON.stringify(filters) !== JSON.stringify(defaultFilters());
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 12, marginBottom: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
        <div><div style={{ fontSize: 10.5, color: C.inkFaint, marginBottom: 3 }}>From</div><input type="date" value={filters.from} onChange={(e) => set("from", e.target.value)} style={{ ...inputBase, ...MONO, width: 140, padding: "6px 8px" }} /></div>
        <div><div style={{ fontSize: 10.5, color: C.inkFaint, marginBottom: 3 }}>To</div><input type="date" value={filters.to} onChange={(e) => set("to", e.target.value)} style={{ ...inputBase, ...MONO, width: 140, padding: "6px 8px" }} /></div>
        <div><div style={{ fontSize: 10.5, color: C.inkFaint, marginBottom: 3 }}>Time from</div><input type="time" value={filters.timeFrom} onChange={(e) => set("timeFrom", e.target.value)} style={{ ...inputBase, ...MONO, width: 100, padding: "6px 8px" }} /></div>
        <div><div style={{ fontSize: 10.5, color: C.inkFaint, marginBottom: 3 }}>Time to</div><input type="time" value={filters.timeTo} onChange={(e) => set("timeTo", e.target.value)} style={{ ...inputBase, ...MONO, width: 100, padding: "6px 8px" }} /></div>
        <MiniSelect label="Direction" value={filters.direction} onChange={(v) => set("direction", v)} options={["any", "long", "short"]} />
        <MiniSelect label="Result" value={filters.result} onChange={(v) => set("result", v)} options={["any", "win", "loss", "breakeven"]} />
        <MiniSelect label="Condition" value={filters.condition} onChange={(v) => set("condition", v)} options={["any", ...MARKET_CONDITIONS]} />
        <MiniSelect label="Location" value={filters.location} onChange={(v) => set("location", v)} options={["any", ...LOCATIONS]} />
        <MiniSelect label="Mistake" value={filters.mistake} onChange={(v) => set("mistake", v)} options={["any", ...MISTAKE_TAGS]} />
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 10.5, color: C.inkFaint, marginBottom: 3 }}>Search notes</div>
          <input value={filters.text} onChange={(e) => set("text", e.target.value)} placeholder="e.g. absorption, iceberg…" style={{ ...inputBase, padding: "6px 8px" }} />
        </div>
        {active && <button style={{ ...ghostBtn, padding: "6px 10px" }} onClick={() => setFilters(defaultFilters())}><X size={12} /> Clear</button>}
      </div>
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 10.5, color: C.inkFaint, marginBottom: 5 }}>{emphasizeTags ? "Setup tags (combine to test a specific combo — AND logic)" : "Setup tags"}</div>
        <ChipMultiSelect items={SETUP_TAGS} value={filters.tags} onChange={(v) => set("tags", v)} />
      </div>
    </div>
  );
}
function MiniSelect({ label, value, onChange, options }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: C.inkFaint, marginBottom: 3 }}>{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputBase, padding: "6px 8px", width: 130 }}>
        {options.map((o) => <option key={o} value={o}>{o === "any" ? "Any" : o}</option>)}
      </select>
    </div>
  );
}

/* ============================================================
   TRADES — LIST
   ============================================================ */
function TradesListView({ trades, onOpenNew, onOpenDetail, onOpenEdit, onDelete, unit }) {
  const [filters, setFilters] = useState(defaultFilters());
  const filtered = useMemo(() => applyFilters(trades, filters).sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || ""))), [trades, filters]);

  if (trades.length === 0) {
    return <EmptyState icon={ListChecks} title="No trades logged yet" message="Every trade — winner, loser, or breakeven — gets a full record: setup, order flow, checklist, management, and exit." actionLabel="Log your first trade" onAction={onOpenNew} />;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 12.5, color: C.inkDim }}>{filtered.length} of {trades.length} trades</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={ghostBtn} onClick={() => exportTradesCSV(filtered)}><Download size={13} /> CSV</button>
          <button style={primaryBtn} onClick={onOpenNew}><Plus size={14} /> New trade</button>
        </div>
      </div>
      <FilterBar filters={filters} setFilters={setFilters} />
      {filtered.length === 0 ? (
        <EmptyState icon={Filter} title="No trades match these filters" actionLabel={null} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map((t) => <TradeRow key={t.id} t={t} onOpenDetail={onOpenDetail} onOpenEdit={onOpenEdit} onDelete={onDelete} unit={unit} />)}
        </div>
      )}
    </div>
  );
}

function TradeRow({ t, onOpenDetail, onOpenEdit, onDelete, unit }) {
  const dq = decisionQualityOf(t);
  const oc = outcomeOf(t);
  const tone = oc === "win" ? "good" : oc === "loss" ? "bad" : "neutral";
  return (
    <div onClick={() => onOpenDetail(t.id)} style={{ display: "flex", alignItems: "center", gap: 12, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: "10px 14px", cursor: "pointer" }}>
      <div style={{ width: 100, flexShrink: 0 }}>
        <div style={{ fontSize: 12, ...MONO, color: C.ink }}>{t.date}</div>
        <div style={{ fontSize: 10.5, ...MONO, color: C.inkFaint }}>{t.time}</div>
      </div>
      <Badge tone={t.direction === "long" ? "good" : "bad"}>{t.direction === "long" ? "LONG" : "SHORT"}</Badge>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {(t.setupTags || []).slice(0, 3).join(", ") || "No setup tags"}{(t.setupTags || []).length > 3 ? ` +${t.setupTags.length - 3}` : ""}
        </div>
        <div style={{ fontSize: 10.5, color: C.inkFaint }}>{t.instrumentKey || t.instrument} · {(t.context && t.context.condition) || "condition n/a"}{t.isLegacyResult ? " · legacy" : ""}</div>
      </div>
      <Badge tone={dq === "good" ? "good" : "bad"}>{quadrantOf(t)}</Badge>
      <div style={{ width: 92, textAlign: "right" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: tone === "good" ? C.good : tone === "bad" ? C.bad : C.inkDim, ...MONO }}>{fmtR(t.resultR)}</div>
        {!t.isLegacyResult && <div style={{ fontSize: 9.5, color: C.inkFaint, ...MONO }}>{primaryMetric(t.resultTicks, t.resultPoints, t.resultUsd, unit)}</div>}
      </div>
      <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
        <button style={{ ...ghostBtn, padding: "5px 8px" }} onClick={() => onOpenEdit(t.id)}><Pencil size={12} /></button>
        <button style={{ ...dangerBtn, padding: "5px 8px" }} onClick={() => onDelete(t.id)}><Trash2 size={12} /></button>
      </div>
    </div>
  );
}

/* ============================================================
   TRADES — FORM
   ============================================================ */
function blankTrade() {
  return {
    id: uid(), date: todayStr(), time: "", instrument: "ES", direction: "long",
    entryPrice: null, stopPrice: null, targetPrice: null,
    contracts: 1, exits: [], customTickSize: null, customTickValue: null,
    setupTags: [],
    context: { htfTrend: "", intradayTrend: "", condition: "", location: "", volatility: "", liquidityCondition: "", newsEvent: "", timeSinceOpen: "" },
    orderFlow: {
      dom: { whatISaw: "", bidBehavior: "", askBehavior: "", flags: [], speedOfTape: "", liquidityReaction: "" },
      footprint: { delta: null, volume: null, bidVolume: null, askVolume: null, flags: [], pocMovement: "" },
      interpretation: "", invalidation: "",
    },
    whyEntered: "", followedRules: null,
    checklist: {},
    management: { actions: [], reasons: [] },
    exitAnalysis: { whyExit: "", wasPlanned: null, reachedTarget: null, invalidatedThesis: null, stopCorrectlyPlaced: null, ratings: {}, replayNote: "" },
    mistakes: [], notes: "",
  };
}

const TRADE_SUBTABS = ["Basics", "Context", "Order Flow", "Checklist", "Management", "Exit", "Mistakes", "Screenshots"];

// Repeatable exit legs — one row per fill. A single row is a normal
// full exit; more than one row is a partial exit (Part 12).
function ExitsEditor({ exits, contracts, tickSize, onChange }) {
  const list = Array.isArray(exits) ? exits : [];
  const totalExited = list.reduce((s, e) => s + (Number(e.contracts) || 0), 0);
  const update = (i, patch) => { const next = list.slice(); next[i] = { ...next[i], ...patch }; onChange(next); };
  const add = () => {
    const remaining = Math.max(0, (Number(contracts) || 0) - totalExited);
    onChange([...list, { id: uid(), contracts: remaining || 1, price: null }]);
  };
  const remove = (i) => onChange(list.filter((_, idx) => idx !== i));
  return (
    <div>
      {list.map((e, i) => (
        <div key={e.id || i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
          <div style={{ width: 100 }}><NumberInput value={e.contracts} onChange={(v) => update(i, { contracts: v })} placeholder="Contracts" step={1} /></div>
          <div style={{ flex: 1 }}><NumberInput value={e.price} onChange={(v) => update(i, { price: v })} placeholder="Exit price" step={tickSize} /></div>
          <button onClick={() => remove(i)} style={{ ...ghostBtn, padding: "7px 9px" }} title="Remove"><X size={13} /></button>
        </div>
      ))}
      <button onClick={add} style={{ ...ghostBtn, padding: "6px 10px", fontSize: 12 }}><Plus size={12} /> {list.length ? "Add another exit (partial)" : "Add exit"}</button>
      {!!contracts && (
        <div style={{ fontSize: 11, color: totalExited > contracts ? C.bad : C.inkFaint, marginTop: 6 }}>
          {totalExited} / {contracts} contracts exited{totalExited > contracts ? " — exceeds position size" : totalExited > 0 && totalExited < contracts ? " (position still partially open)" : ""}
        </div>
      )}
    </div>
  );
}

// Risk / Reward / Result — always read from calculateTradeMetrics(),
// never re-derived locally. `unit` controls which figure is the big
// primary number; the other two units always show underneath, and
// R-multiple is always shown independent of the chosen unit.
function MetricsPanel({ metrics, unit }) {
  const rows = [
    { label: "Risk", ticks: metrics.riskTicks, points: metrics.riskPoints, usd: metrics.riskUsd, tone: metrics.riskUsd ? "bad" : "neutral" },
    { label: "Reward (planned)", ticks: metrics.rewardTicks, points: metrics.rewardPoints, usd: metrics.rewardUsd, tone: metrics.rewardUsd ? "good" : "neutral" },
    { label: "Result", ticks: metrics.resultTicks, points: metrics.resultPoints, usd: metrics.resultUsd, tone: metrics.resultUsd > 0 ? "good" : metrics.resultUsd < 0 ? "bad" : "neutral" },
  ];
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: "10px 12px", background: C.bgAlt }}>
            <div style={{ fontSize: 11, color: C.inkDim }}>{r.label}</div>
            <div style={{ fontSize: 17, fontWeight: 700, ...MONO, color: r.tone === "good" ? C.good : r.tone === "bad" ? C.bad : C.ink }}>
              {primaryMetric(r.ticks, r.points, r.usd, unit)}
            </div>
            <div style={{ fontSize: 11, color: C.inkFaint, ...MONO }}>{secondaryMetric(r.ticks, r.points, r.usd, unit)}</div>
          </div>
        ))}
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: "10px 12px", background: C.bgAlt }}>
          <div style={{ fontSize: 11, color: C.inkDim }}>R-multiple</div>
          <div style={{ fontSize: 17, fontWeight: 700, ...MONO, color: metrics.resultR > 0 ? C.good : metrics.resultR < 0 ? C.bad : C.ink }}>{fmtR(metrics.resultR)}</div>
          <div style={{ fontSize: 11, color: C.inkFaint }}>Planned R:R {metrics.plannedRR != null ? `1 : ${roundTo(metrics.plannedRR, 2)}` : "—"}</div>
        </div>
      </div>
      {metrics.isLegacyResult && (
        <div style={{ marginTop: 8 }}><Badge tone="neutral">Legacy entry — manual $/R kept as-is, no price data to compute ticks</Badge></div>
      )}
      {metrics.priceWarnings.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
          {metrics.priceWarnings.map((w, i) => (
            <div key={i} style={{ fontSize: 11.5, color: C.warn, display: "flex", gap: 5, alignItems: "flex-start" }}>
              <AlertTriangle size={12} style={{ marginTop: 1, flexShrink: 0 }} /><span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TradeFormView({ initial, onSave, onCancel, onDelete, settings, todaysTrades }) {
  const [trade, setTrade] = useState(() => initial ? JSON.parse(JSON.stringify(initial)) : blankTrade());
  const [sub, setSub] = useState("Basics");
  const isEditing = !!initial;

  const set = (patch) => setTrade((p) => ({ ...p, ...patch }));
  const setCtx = (k, v) => setTrade((p) => ({ ...p, context: { ...p.context, [k]: v } }));
  const setDom = (k, v) => setTrade((p) => ({ ...p, orderFlow: { ...p.orderFlow, dom: { ...p.orderFlow.dom, [k]: v } } }));
  const setFp = (k, v) => setTrade((p) => ({ ...p, orderFlow: { ...p.orderFlow, footprint: { ...p.orderFlow.footprint, [k]: v } } }));
  const setOF = (k, v) => setTrade((p) => ({ ...p, orderFlow: { ...p.orderFlow, [k]: v } }));
  const setChecklist = (idx, v) => setTrade((p) => ({ ...p, checklist: { ...p.checklist, [idx]: v } }));
  const setMgmt = (k, v) => setTrade((p) => ({ ...p, management: { ...p.management, [k]: v } }));
  const setExit = (k, v) => setTrade((p) => ({ ...p, exitAnalysis: { ...p.exitAnalysis, [k]: v } }));
  const setExitRating = (k, v) => setTrade((p) => ({ ...p, exitAnalysis: { ...p.exitAnalysis, ratings: { ...p.exitAnalysis.ratings, [k]: v } } }));

  const checklistScore = Object.values(trade.checklist || {}).filter(Boolean).length;
  const metrics = useMemo(() => calculateTradeMetrics(trade, settings && settings.customInstruments), [trade, settings]);
  const quadrant = metrics.resultR != null && trade.followedRules ? quadrantOf({ ...trade, resultR: metrics.resultR }) : null;
  const preferredUnit = (settings && settings.preferredUnit) || "ticks";

  const riskLimit = settings && settings.riskPerTradeLimit;
  const dailyLimit = settings && settings.dailyLossLimit;
  const overPerTrade = riskLimit && metrics.riskUsd != null && metrics.riskUsd > riskLimit;
  const todaysRiskSoFar = (todaysTrades || []).filter((t) => t.id !== trade.id).reduce((s, t) => s + (t.riskUsd || 0), 0);
  const overDaily = dailyLimit && metrics.riskUsd != null && (todaysRiskSoFar + metrics.riskUsd) > dailyLimit;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div>
          <button style={{ ...ghostBtn, padding: "5px 9px", marginBottom: 8 }} onClick={onCancel}><ArrowLeft size={13} /> Back</button>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{isEditing ? "Edit trade" : "New trade"}</div>
          <div style={{ fontSize: 11, color: C.inkFaint, ...MONO }}>ID {trade.id}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {quadrant && <Badge tone={quadrant.includes("Bad") || quadrant.includes("Lucky") ? "bad" : "good"}>{quadrant}</Badge>}
          {isEditing && <ConfirmDelete onConfirm={() => onDelete(trade.id)} label="Delete trade" />}
          <button style={primaryBtn} onClick={() => onSave(trade)}><Save size={13} /> Save trade</button>
        </div>
      </div>

      {(overPerTrade || overDaily) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14, padding: "10px 12px", borderRadius: 6, border: `1px solid ${C.badDim}`, background: "rgba(192,106,92,0.08)" }}>
          {overPerTrade && <div style={{ fontSize: 12.5, color: C.bad, display: "flex", gap: 6, alignItems: "center" }}><AlertOctagon size={14} /> Risk exceeds your per-trade limit (${riskLimit.toLocaleString()}).</div>}
          {overDaily && <div style={{ fontSize: 12.5, color: C.bad, display: "flex", gap: 6, alignItems: "center" }}><AlertOctagon size={14} /> Adding this trade would push today's total risk past your daily plan (${dailyLimit.toLocaleString()}).</div>}
        </div>
      )}

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 14, borderBottom: `1px solid ${C.line}`, paddingBottom: 10 }}>
        {TRADE_SUBTABS.map((s) => (
          <button key={s} onClick={() => setSub(s)} style={{
            padding: "6px 12px", fontSize: 12, borderRadius: 999, cursor: "pointer",
            border: `1px solid ${sub === s ? C.accent : C.line}`,
            background: sub === s ? C.accentDim : "transparent", color: sub === s ? C.accent : C.inkDim, fontWeight: sub === s ? 700 : 500,
          }}>{s}{s === "Checklist" ? ` (${checklistScore}/${CHECKLIST_ITEMS.length})` : ""}</button>
        ))}
      </div>

      {sub === "Basics" && (
        <>
          <Panel title="Basic information">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12 }}>
              <Field label="Date"><input type="date" value={trade.date} onChange={(e) => set({ date: e.target.value })} style={{ ...inputBase, ...MONO }} /></Field>
              <Field label="Time"><input type="time" value={trade.time} onChange={(e) => set({ time: e.target.value })} style={{ ...inputBase, ...MONO }} /></Field>
              <Field label="Instrument">
                <select
                  value={INSTRUMENTS[(trade.instrument || "").toUpperCase()] || (settings && settings.customInstruments && settings.customInstruments[(trade.instrument || "").toUpperCase()]) ? trade.instrument.toUpperCase() : "CUSTOM"}
                  onChange={(e) => {
                    if (e.target.value === "CUSTOM") set({ instrument: "", customTickSize: trade.customTickSize || 0.25, customTickValue: trade.customTickValue || 1 });
                    else set({ instrument: e.target.value, customTickSize: null, customTickValue: null });
                  }}
                  style={{ ...inputBase, appearance: "none", ...MONO }}
                >
                  {Object.keys(INSTRUMENTS).map((k) => <option key={k} value={k}>{k} — {INSTRUMENTS[k].label}</option>)}
                  {settings && settings.customInstruments && Object.keys(settings.customInstruments).map((k) => (
                    <option key={k} value={k}>{k} — {settings.customInstruments[k].label || "Saved custom instrument"}</option>
                  ))}
                  <option value="CUSTOM">One-off custom instrument…</option>
                </select>
              </Field>
              <Field label="Direction"><Segmented value={trade.direction} onChange={(v) => set({ direction: v })} options={[{ value: "long", label: "Long" }, { value: "short", label: "Short" }]} /></Field>
            </div>

            {!(INSTRUMENTS[(trade.instrument || "").toUpperCase()] || (settings && settings.customInstruments && settings.customInstruments[(trade.instrument || "").toUpperCase()])) && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginTop: 4 }}>
                <Field label="Custom symbol"><TextInput value={trade.instrument} onChange={(v) => set({ instrument: v })} mono placeholder="e.g. CL, GC, YM" /></Field>
                <Field label="Tick size"><NumberInput value={trade.customTickSize} onChange={(v) => set({ customTickSize: v })} step="any" /></Field>
                <Field label="Tick value ($ per contract)"><NumberInput value={trade.customTickValue} onChange={(v) => set({ customTickValue: v })} step="any" /></Field>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 12, marginTop: 4 }}>
              <Field label="Entry price"><NumberInput value={trade.entryPrice} onChange={(v) => set({ entryPrice: v })} step={metrics.tickSize} /></Field>
              <Field label="Stop loss"><NumberInput value={trade.stopPrice} onChange={(v) => set({ stopPrice: v })} step={metrics.tickSize} /></Field>
              <Field label="Take profit (planned)"><NumberInput value={trade.targetPrice} onChange={(v) => set({ targetPrice: v })} step={metrics.tickSize} /></Field>
              <Field label="Contracts"><NumberInput value={trade.contracts} onChange={(v) => set({ contracts: v })} step={1} /></Field>
            </div>

            <Field label="Exit(s)" hint="One row per fill. Add more than one row for a partial exit — the engine weights the result by how many contracts closed at each price.">
              <ExitsEditor exits={trade.exits} contracts={trade.contracts} tickSize={metrics.tickSize} onChange={(v) => set({ exits: v })} />
            </Field>

            <div style={{ marginTop: 6, marginBottom: 4, fontSize: 11, color: C.inkDim, textTransform: "uppercase", letterSpacing: 0.5 }}>Computed — ticks / points / USD, one engine, always in sync</div>
            <MetricsPanel metrics={metrics} unit={preferredUnit} />

            <Field label="Setup tags" hint="Select every pattern that applied — combinations matter for Edge Discovery later." >
              <div style={{ marginTop: 12 }}>
                <ChipMultiSelect items={SETUP_TAGS} value={trade.setupTags} onChange={(v) => set({ setupTags: v })} allowCustom />
              </div>
            </Field>
          </Panel>
        </>
      )}

      {sub === "Context" && (
        <Panel title="Market context">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Higher timeframe trend"><TextInput value={trade.context.htfTrend} onChange={(v) => setCtx("htfTrend", v)} /></Field>
            <Field label="Intraday trend"><TextInput value={trade.context.intradayTrend} onChange={(v) => setCtx("intradayTrend", v)} /></Field>
            <Field label="Market condition"><SelectInput value={trade.context.condition} onChange={(v) => setCtx("condition", v)} options={MARKET_CONDITIONS} /></Field>
            <Field label="Location"><SelectInput value={trade.context.location} onChange={(v) => setCtx("location", v)} options={LOCATIONS} /></Field>
            <Field label="Volatility"><SelectInput value={trade.context.volatility} onChange={(v) => setCtx("volatility", v)} options={VOLATILITIES} /></Field>
            <Field label="Time since NY open"><TextInput value={trade.context.timeSinceOpen} onChange={(v) => setCtx("timeSinceOpen", v)} placeholder="e.g. 22 min" /></Field>
          </div>
          <Field label="Liquidity condition"><TextArea value={trade.context.liquidityCondition} onChange={(v) => setCtx("liquidityCondition", v)} rows={2} /></Field>
          <Field label="Important news / event"><TextArea value={trade.context.newsEvent} onChange={(v) => setCtx("newsEvent", v)} rows={2} /></Field>
        </Panel>
      )}

      {sub === "Order Flow" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Panel title="DOM">
            <Field label="What did I see?"><TextArea value={trade.orderFlow.dom.whatISaw} onChange={(v) => setDom("whatISaw", v)} rows={2} /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Bid behavior"><TextInput value={trade.orderFlow.dom.bidBehavior} onChange={(v) => setDom("bidBehavior", v)} /></Field>
              <Field label="Ask behavior"><TextInput value={trade.orderFlow.dom.askBehavior} onChange={(v) => setDom("askBehavior", v)} /></Field>
            </div>
            <Field label="Observed"><ChipMultiSelect items={DOM_FLAGS} value={trade.orderFlow.dom.flags} onChange={(v) => setDom("flags", v)} /></Field>
            <Field label="Speed of tape"><Segmented value={trade.orderFlow.dom.speedOfTape} onChange={(v) => setDom("speedOfTape", v)} options={[{ value: "slow", label: "Slow" }, { value: "normal", label: "Normal" }, { value: "fast", label: "Fast" }]} /></Field>
            <Field label="Liquidity reaction"><TextArea value={trade.orderFlow.dom.liquidityReaction} onChange={(v) => setDom("liquidityReaction", v)} rows={2} /></Field>
          </Panel>
          <Panel title="Footprint">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
              <Field label="Delta"><NumberInput value={trade.orderFlow.footprint.delta} onChange={(v) => setFp("delta", v)} /></Field>
              <Field label="Volume"><NumberInput value={trade.orderFlow.footprint.volume} onChange={(v) => setFp("volume", v)} /></Field>
              <Field label="Bid volume"><NumberInput value={trade.orderFlow.footprint.bidVolume} onChange={(v) => setFp("bidVolume", v)} /></Field>
              <Field label="Ask volume"><NumberInput value={trade.orderFlow.footprint.askVolume} onChange={(v) => setFp("askVolume", v)} /></Field>
            </div>
            <Field label="Observed"><ChipMultiSelect items={FOOTPRINT_FLAGS} value={trade.orderFlow.footprint.flags} onChange={(v) => setFp("flags", v)} /></Field>
            <Field label="POC movement"><Segmented value={trade.orderFlow.footprint.pocMovement} onChange={(v) => setFp("pocMovement", v)} options={[{ value: "up", label: "Up" }, { value: "down", label: "Down" }, { value: "flat", label: "Flat" }]} /></Field>
          </Panel>
          <Panel title="Interpretation">
            <Field label="What was the order flow telling me?"><TextArea value={trade.orderFlow.interpretation} onChange={(v) => setOF("interpretation", v)} rows={3} /></Field>
            <Field label="What would invalidate my idea?"><TextArea value={trade.orderFlow.invalidation} onChange={(v) => setOF("invalidation", v)} rows={2} /></Field>
          </Panel>
        </div>
      )}

      {sub === "Checklist" && (
        <Panel title="Entry decision" right={<Badge tone={checklistScore >= 9 ? "good" : checklistScore >= 6 ? "warn" : "bad"}>Setup quality {checklistScore}/{CHECKLIST_ITEMS.length}</Badge>}>
          <Field label="Why did I enter?"><TextArea value={trade.whyEntered} onChange={(v) => set({ whyEntered: v })} rows={3} /></Field>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "14px 0" }}>
            {CHECKLIST_ITEMS.map((item, idx) => {
              const checked = !!trade.checklist[idx];
              return (
                <button key={idx} onClick={() => setChecklist(idx, !checked)} style={{
                  display: "flex", alignItems: "center", gap: 10, textAlign: "left", cursor: "pointer",
                  background: checked ? "rgba(125,169,139,0.07)" : C.bgAlt, border: `1px solid ${checked ? C.goodDim : C.line}`,
                  borderRadius: 5, padding: "9px 12px",
                }}>
                  <span style={{
                    width: 16, height: 16, borderRadius: 3, flexShrink: 0, border: `1px solid ${checked ? C.good : C.inkFaint}`,
                    background: checked ? C.good : "transparent", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{checked && <CheckCircle2 size={12} color="#0E1416" />}</span>
                  <span style={{ fontSize: 12.5, color: checked ? C.ink : C.inkDim }}>{item}</span>
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: C.inkFaint, marginBottom: 12 }}>A high score doesn't replace real reasoning above — it's a discipline check, not a green light on its own.</div>
          <Field label="Did I follow my rules on this trade?"><YesNoUnsure labels={{ yes: "Yes", no: "No", unsure: "Partially" }} value={trade.followedRules} onChange={(v) => set({ followedRules: v })} /></Field>
        </Panel>
      )}

      {sub === "Management" && (
        <Panel title="Trade management">
          <Field label="What happened during the trade?"><ChipMultiSelect items={MANAGEMENT_ACTIONS} value={trade.management.actions} onChange={(v) => setMgmt("actions", v)} /></Field>
          <Field label="If I interfered, why?"><ChipMultiSelect items={MANAGEMENT_REASONS} value={trade.management.reasons} onChange={(v) => setMgmt("reasons", v)} /></Field>
        </Panel>
      )}

      {sub === "Exit" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Panel title="Technical">
            <Field label="Why did I exit?"><TextArea value={trade.exitAnalysis.whyExit} onChange={(v) => setExit("whyExit", v)} rows={2} /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Was the exit planned?"><YesNoUnsure value={trade.exitAnalysis.wasPlanned} onChange={(v) => setExit("wasPlanned", v)} /></Field>
              <Field label="Did the market reach my target?"><YesNoUnsure value={trade.exitAnalysis.reachedTarget} onChange={(v) => setExit("reachedTarget", v)} /></Field>
              <Field label="Did the market invalidate the thesis?"><YesNoUnsure value={trade.exitAnalysis.invalidatedThesis} onChange={(v) => setExit("invalidatedThesis", v)} /></Field>
              <Field label="Was my stop correctly placed?"><YesNoUnsure value={trade.exitAnalysis.stopCorrectlyPlaced} onChange={(v) => setExit("stopCorrectlyPlaced", v)} /></Field>
            </div>
          </Panel>
          <Panel title="Execution (1–10)">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[["entryExecution", "Entry execution"], ["stopPlacement", "Stop placement"], ["tradeManagement", "Trade management"], ["exitExecution", "Exit execution"], ["discipline", "Discipline"]].map(([k, label]) => (
                <Field key={k} label={label}><RatingRow value={trade.exitAnalysis.ratings[k]} onChange={(v) => setExitRating(k, v)} /></Field>
              ))}
            </div>
            <Field label="What would I do differently if I could replay this trade?"><TextArea value={trade.exitAnalysis.replayNote} onChange={(v) => setExit("replayNote", v)} rows={3} /></Field>
          </Panel>
        </div>
      )}

      {sub === "Mistakes" && (
        <Panel title="Mistake tracking">
          <Field label="Mistakes made on this trade (leave empty if none)"><ChipMultiSelect items={MISTAKE_TAGS} value={trade.mistakes} onChange={(v) => set({ mistakes: v })} allowCustom /></Field>
          <Field label="Additional notes"><TextArea value={trade.notes} onChange={(v) => set({ notes: v })} rows={3} /></Field>
        </Panel>
      )}

      {sub === "Screenshots" && (
        <Panel title="Screenshots — before → during → after">
          <ScreenshotManager entityType="trade" entityId={trade.id} slots={SCREENSHOT_SLOTS} />
        </Panel>
      )}
    </div>
  );
}

/* ============================================================
   TRADES — DETAIL / REPLAY
   Reconstructs the decision in sequence rather than dumping a
   flat form: context → screenshot → reasoning → entry → order
   flow → management → exit → result → mistakes → lesson.
   ============================================================ */
function ReplayStep({ n, title, children }) {
  return (
    <div style={{ display: "flex", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: C.panelRaised, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, ...MONO, color: C.accent }}>{n}</div>
        <div style={{ flex: 1, width: 1, background: C.line, marginTop: 4 }} />
      </div>
      <div style={{ paddingBottom: 22, flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>{title}</div>
        <div style={{ fontSize: 13, color: C.inkDim, lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  );
}
function KV({ label, value }) {
  return <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
    <span style={{ color: C.inkFaint, fontSize: 11.5 }}>{label}</span><span style={{ color: C.ink, fontSize: 12, ...MONO }}>{value ?? "—"}</span>
  </div>;
}

function TradeDetailView({ trade: t, onEdit, onBack, onDelete, unit }) {
  const quadrant = t.resultR != null && t.followedRules ? quadrantOf(t) : "Incomplete";
  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div>
          <button style={{ ...ghostBtn, padding: "5px 9px", marginBottom: 8 }} onClick={onBack}><ArrowLeft size={13} /> Back to trades</button>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>{t.instrumentKey || t.instrument} · {t.direction === "long" ? "Long" : "Short"} · {fmtDateLong(t.date)} {t.time}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Badge tone={quadrant.includes("Bad") || quadrant.includes("Lucky") ? "bad" : quadrant === "Incomplete" ? "neutral" : "good"}>{quadrant}</Badge>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: t.resultR > 0 ? C.good : t.resultR < 0 ? C.bad : C.inkDim, ...MONO }}>{fmtR(t.resultR)}</div>
            {!t.isLegacyResult && <div style={{ fontSize: 11, color: C.inkFaint, ...MONO }}>{primaryMetric(t.resultTicks, t.resultPoints, t.resultUsd, unit)}</div>}
          </div>
          <button style={ghostBtn} onClick={() => onEdit(t.id)}><Pencil size={13} /> Edit</button>
          <ConfirmDelete onConfirm={() => onDelete(t.id)} />
        </div>
      </div>

      <ReplayStep n={1} title="Context">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {(t.setupTags || []).map((s) => <Badge key={s}>{s}</Badge>)}
        </div>
        <KV label="Higher timeframe trend" value={t.context && t.context.htfTrend} />
        <KV label="Intraday trend" value={t.context && t.context.intradayTrend} />
        <KV label="Condition" value={t.context && t.context.condition} />
        <KV label="Location" value={t.context && t.context.location} />
        <KV label="Volatility" value={t.context && t.context.volatility} />
      </ReplayStep>

      <ReplayStep n={2} title="Screenshot before entry">
        <ScreenshotManager entityType="trade" entityId={t.id} slots={SCREENSHOT_SLOTS.filter(s => s[2] === "before")} />
      </ReplayStep>

      <ReplayStep n={3} title="Reasoning — why did I enter?">
        <p style={{ margin: 0 }}>{t.whyEntered || "No reasoning recorded."}</p>
      </ReplayStep>

      <ReplayStep n={4} title="Entry">
        <KV label="Entry" value={t.entryPrice} /><KV label="Stop" value={t.stopPrice} /><KV label="Target" value={t.targetPrice} />
        <KV label="Contracts" value={t.contracts} />
        <KV label="Risk" value={t.riskTicks != null ? `${fmtTicks(t.riskTicks)} · ${fmtPoints(t.riskPoints)} · ${fmtUsd(t.riskUsd)}` : "—"} />
        <KV label="Planned R:R" value={t.plannedRR != null ? `1 : ${roundTo(t.plannedRR, 2)}` : "—"} />
        <div style={{ marginTop: 8 }}>Checklist: <strong style={{ color: C.ink }}>{Object.values(t.checklist || {}).filter(Boolean).length}/{CHECKLIST_ITEMS.length}</strong> · Followed rules: <strong style={{ color: C.ink }}>{t.followedRules || "not set"}</strong></div>
      </ReplayStep>

      <ReplayStep n={5} title="DOM / Footprint observations">
        <p style={{ margin: "0 0 6px" }}>{t.orderFlow && t.orderFlow.interpretation}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {t.orderFlow && (t.orderFlow.dom.flags || []).map((f) => <Badge key={"d" + f} tone="warn">{(DOM_FLAGS.find(x => x[0] === f) || [f, f])[1]}</Badge>)}
          {t.orderFlow && (t.orderFlow.footprint.flags || []).map((f) => <Badge key={"f" + f} tone="warn">{(FOOTPRINT_FLAGS.find(x => x[0] === f) || [f, f])[1]}</Badge>)}
        </div>
        {t.orderFlow && t.orderFlow.invalidation && <div style={{ marginTop: 8, fontSize: 12 }}><em>Invalidation: {t.orderFlow.invalidation}</em></div>}
      </ReplayStep>

      <ReplayStep n={6} title="Management">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {t.management && (t.management.actions || []).map((a) => <Badge key={a}>{(MANAGEMENT_ACTIONS.find(x => x[0] === a) || [a, a])[1]}</Badge>)}
        </div>
        {t.management && t.management.reasons && t.management.reasons.length > 0 && <div style={{ marginTop: 6, fontSize: 12 }}>Reasons: {t.management.reasons.join(", ")}</div>}
      </ReplayStep>

      <ReplayStep n={7} title="Exit">
        <p style={{ margin: "0 0 6px" }}>{t.exitAnalysis && t.exitAnalysis.whyExit}</p>
        <ScreenshotManager entityType="trade" entityId={t.id} slots={SCREENSHOT_SLOTS.filter(s => s[2] === "after" || s[2] === "during")} />
      </ReplayStep>

      <ReplayStep n={8} title="Result">
        {t.isLegacyResult ? (
          <>
            <div style={{ marginBottom: 8 }}><Badge tone="neutral">Legacy entry — logged before the tick engine, no price data on file</Badge></div>
            <KV label="Result $" value={fmtUsd(t.resultUsd)} /><KV label="Result R" value={fmtR(t.resultR)} />
          </>
        ) : (
          <>
            <KV label="Exits" value={(t.exits || []).length ? t.exits.map((e) => `${e.contracts}@${e.price}`).join(", ") : "not exited"} />
            <KV label="Avg exit price" value={t.avgExitPrice} />
            <KV label="Result" value={t.resultTicks != null ? `${fmtTicks(t.resultTicks)} · ${fmtPoints(t.resultPoints)} · ${fmtUsd(t.resultUsd)}` : "open / not exited"} />
            <KV label="Result R" value={fmtR(t.resultR)} />
            {!t.isFullyClosed && (t.exits || []).length > 0 && <div style={{ fontSize: 11.5, color: C.warn, marginTop: 4 }}>Position not fully closed — result reflects the {t.totalExitContracts} contract(s) exited so far.</div>}
          </>
        )}
      </ReplayStep>

      <ReplayStep n={9} title="Mistakes">
        {(t.mistakes || []).length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{t.mistakes.map((m) => <Badge key={m} tone="bad">{m}</Badge>)}</div> : "None logged."}
      </ReplayStep>

      <ReplayStep n={10} title="Lesson">
        <p style={{ margin: 0 }}>{(t.exitAnalysis && t.exitAnalysis.replayNote) || "No replay note recorded."}</p>
      </ReplayStep>
    </div>
  );
}

/* ============================================================
   NO-TRADES
   ============================================================ */
function blankNoTrade() {
  return {
    id: uid(), date: todayStr(), time: "", instrument: "ES", location: "",
    whatHappened: "", setupSeen: "", whyConsidered: "", whyNotEntered: "", whatHappenedAfter: "",
    wasStayingOutCorrect: null, wouldTakeAgain: null, categories: [],
  };
}
function noTradeLabel(nt) {
  if (nt.wasStayingOutCorrect === "yes") return { label: "Correctly avoided", tone: "good" };
  if (nt.wasStayingOutCorrect === "no") return { label: "Missed a good trade", tone: "bad" };
  return { label: "Unclear", tone: "neutral" };
}

function NoTradesListView({ noTrades, onOpenNew, onOpenEdit, onDelete }) {
  if (noTrades.length === 0) {
    return <EmptyState icon={XOctagon} title="No missed-trade entries yet" message="This is the most important habit in the whole journal: log what you saw and chose not to take, so you can tell a correct no-trade from a costly hesitation." actionLabel="Log a no-trade" onAction={onOpenNew} />;
  }
  const correct = noTrades.filter((n) => n.wasStayingOutCorrect === "yes").length;
  const missed = noTrades.filter((n) => n.wasStayingOutCorrect === "no").length;
  const sorted = noTrades.slice().sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")));
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 14 }}>
        <StatTile label="Correctly avoided" value={correct} tone="good" />
        <StatTile label="Missed good trades" value={missed} tone="bad" />
        <StatTile label="Total logged" value={noTrades.length} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button style={primaryBtn} onClick={onOpenNew}><Plus size={14} /> Log a no-trade</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sorted.map((nt) => {
          const l = noTradeLabel(nt);
          return (
            <div key={nt.id} onClick={() => onOpenEdit(nt.id)} style={{ display: "flex", alignItems: "center", gap: 12, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: "10px 14px", cursor: "pointer" }}>
              <div style={{ width: 100 }}><div style={{ fontSize: 12, ...MONO, color: C.ink }}>{nt.date}</div><div style={{ fontSize: 10.5, ...MONO, color: C.inkFaint }}>{nt.time}</div></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nt.setupSeen || "No setup description"}</div>
                <div style={{ fontSize: 10.5, color: C.inkFaint }}>{nt.location || "location n/a"}</div>
              </div>
              <Badge tone={l.tone}>{l.label}</Badge>
              <div onClick={(e) => e.stopPropagation()}><button style={{ ...dangerBtn, padding: "5px 8px" }} onClick={() => onDelete(nt.id)}><Trash2 size={12} /></button></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NoTradeFormView({ initial, onSave, onCancel, onDelete }) {
  const [nt, setNt] = useState(() => initial ? JSON.parse(JSON.stringify(initial)) : blankNoTrade());
  const set = (patch) => setNt((p) => ({ ...p, ...patch }));
  const isEditing = !!initial;
  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <button style={{ ...ghostBtn, padding: "5px 9px" }} onClick={onCancel}><ArrowLeft size={13} /> Back</button>
        <div style={{ display: "flex", gap: 8 }}>
          {isEditing && <ConfirmDelete onConfirm={() => onDelete(nt.id)} />}
          <button style={primaryBtn} onClick={() => onSave(nt)}><Save size={13} /> Save</button>
        </div>
      </div>
      <Panel title={isEditing ? "Edit no-trade" : "New no-trade"}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12 }}>
          <Field label="Date"><input type="date" value={nt.date} onChange={(e) => set({ date: e.target.value })} style={{ ...inputBase, ...MONO }} /></Field>
          <Field label="Time"><input type="time" value={nt.time} onChange={(e) => set({ time: e.target.value })} style={{ ...inputBase, ...MONO }} /></Field>
          <Field label="Instrument"><TextInput value={nt.instrument} onChange={(v) => set({ instrument: v })} mono /></Field>
          <Field label="Location"><SelectInput value={nt.location} onChange={(v) => set({ location: v })} options={LOCATIONS} /></Field>
        </div>
        <Field label="What happened?"><TextArea value={nt.whatHappened} onChange={(v) => set({ whatHappened: v })} rows={2} /></Field>
        <Field label="What setup I saw"><TextArea value={nt.setupSeen} onChange={(v) => set({ setupSeen: v })} rows={2} /></Field>
        <Field label="Why I considered entering"><TextArea value={nt.whyConsidered} onChange={(v) => set({ whyConsidered: v })} rows={2} /></Field>
        <Field label="Why I did not enter"><TextArea value={nt.whyNotEntered} onChange={(v) => set({ whyNotEntered: v })} rows={2} /></Field>
        <Field label="What happened afterward"><TextArea value={nt.whatHappenedAfter} onChange={(v) => set({ whatHappenedAfter: v })} rows={2} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Was staying out correct?"><YesNoUnsure value={nt.wasStayingOutCorrect} onChange={(v) => set({ wasStayingOutCorrect: v })} /></Field>
          <Field label="Would I take it again?"><YesNoUnsure value={nt.wouldTakeAgain} onChange={(v) => set({ wouldTakeAgain: v })} /></Field>
        </div>
        <Field label="Categories"><ChipMultiSelect items={NO_TRADE_TAGS} value={nt.categories} onChange={(v) => set({ categories: v })} /></Field>
        <Field label="Screenshot"><ScreenshotManager entityType="notrade" entityId={nt.id} slots={[["shot", "Screenshot", "all"]]} /></Field>
      </Panel>
    </div>
  );
}

/* ============================================================
   DAILY REVIEW
   ============================================================ */
const DAILY_REVIEW_QUESTIONS = [
  ["followedPlan", "Did I follow my plan?"],
  ["validSetupsOnly", "Did I trade only valid setups?"],
  ["respectedRisk", "Did I respect my risk?"],
  ["overtraded", "Did I overtrade?"],
  ["badTrades", "Did I take trades I shouldn't have?"],
  ["avoidedGood", "Did I avoid trades I should have taken?"],
];
const DAILY_SCORE_KEYS = [["process", "Process"], ["discipline", "Discipline"], ["execution", "Execution"], ["decisionMaking", "Decision-making"], ["emotionalControl", "Emotional control"]];

function DailyReviewView({ date, setDate, dayRecord, onSave, todaysTrades, todaysNoTrades }) {
  const dr = dayRecord.dailyReview || {};
  const set = (patch) => onSave({ dailyReview: { ...dr, ...patch } });
  const setScore = (k, v) => set({ scores: { ...(dr.scores || {}), [k]: v } });
  const stats = computeStats(todaysTrades);

  return (
    <div>
      <DateNav date={date} setDate={setDate} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10, marginBottom: 14 }}>
        <StatTile label="Trades" value={todaysTrades.length} />
        <StatTile label="No-trades" value={todaysNoTrades.length} />
        <StatTile label="Day R" value={fmtR(stats.totalR)} tone={stats.totalR > 0 ? "good" : stats.totalR < 0 ? "bad" : undefined} />
        <StatTile label="Day $" value={fmtUsd(stats.totalUsd)} tone={stats.totalUsd > 0 ? "good" : stats.totalUsd < 0 ? "bad" : undefined} />
      </div>
      <div style={{ background: "rgba(217,165,72,0.08)", border: `1px solid ${C.accentDim}`, borderRadius: 6, padding: 10, marginBottom: 14, fontSize: 12, color: C.accent }}>
        Judge the day by process, not P&amp;L. A losing day with perfect execution can be a good trading day; a profitable day built on broken rules can be a bad one.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="grid-stack">
        <Panel title="Review questions">
          {DAILY_REVIEW_QUESTIONS.map(([k, label]) => (
            <Field key={k} label={label}><YesNoUnsure value={dr[k]} onChange={(v) => set({ [k]: v })} /></Field>
          ))}
          <Field label="What did I execute well?"><TextArea value={dr.executedWell} onChange={(v) => set({ executedWell: v })} rows={2} /></Field>
          <Field label="What was my biggest mistake?"><TextArea value={dr.biggestMistake} onChange={(v) => set({ biggestMistake: v })} rows={2} /></Field>
          <Field label="What did I learn about the market?"><TextArea value={dr.learnedMarket} onChange={(v) => set({ learnedMarket: v })} rows={2} /></Field>
          <Field label="What did I learn about myself?"><TextArea value={dr.learnedSelf} onChange={(v) => set({ learnedSelf: v })} rows={2} /></Field>
          <Field label="Should I change anything tomorrow?"><TextArea value={dr.changeTomorrow} onChange={(v) => set({ changeTomorrow: v })} rows={2} /></Field>
        </Panel>
        <Panel title="Daily score">
          {DAILY_SCORE_KEYS.map(([k, label]) => (
            <Field key={k} label={label}><RatingRow value={(dr.scores || {})[k]} onChange={(v) => setScore(k, v)} /></Field>
          ))}
        </Panel>
      </div>
    </div>
  );
}

/* ============================================================
   WEEKLY REVIEW
   ============================================================ */
function pickBestWorstDecision(trades) {
  const scored = trades.map((t) => ({ t, score: Object.values(t.checklist || {}).filter(Boolean).length, violated: t.followedRules === "no" }));
  if (!scored.length) return { best: null, worst: null };
  const best = scored.filter((s) => !s.violated).sort((a, b) => b.score - a.score)[0] || scored[0];
  const worst = scored.filter((s) => s.violated).sort((a, b) => a.t.resultR - b.t.resultR)[0] || scored.sort((a, b) => a.score - b.score)[0];
  return { best: best && best.t, worst: worst && worst.t };
}

function WeeklyReviewView({ trades, noTrades, days, upsertDay }) {
  const weeks = useMemo(() => {
    const set = new Set(trades.map((t) => weekKey(t.date)).concat(noTrades.map((n) => weekKey(n.date))));
    set.add(weekKey(todayStr()));
    return Array.from(set).sort().reverse();
  }, [trades, noTrades]);
  const [wk, setWk] = useState(weeks[0]);
  useEffect(() => { if (!weeks.includes(wk)) setWk(weeks[0]); }, [weeks]); // eslint-disable-line

  const weekTrades = trades.filter((t) => weekKey(t.date) === wk);
  const weekNoTrades = noTrades.filter((n) => weekKey(n.date) === wk);
  const stats = computeStats(weekTrades);
  const setupRows = bucketBySetupTag(weekTrades);
  const timeRows = groupStats(weekTrades, (t) => hourBucket(t.time));
  const condRows = groupStats(weekTrades, (t) => t.context && t.context.condition);
  const mistakeRows = computeMistakeStats(weekTrades).filter((m) => m.count > 0);
  const { best, worst } = pickBestWorstDecision(weekTrades);
  const correct = weekNoTrades.filter((n) => n.wasStayingOutCorrect === "yes").length;
  const missed = weekNoTrades.filter((n) => n.wasStayingOutCorrect === "no").length;
  const reflectionKey = "week:" + wk;
  const reflection = (days[reflectionKey] || {}).reflection || "";

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10.5, color: C.inkFaint, marginBottom: 4 }}>Week starting (Mon)</div>
        <select value={wk} onChange={(e) => setWk(e.target.value)} style={{ ...inputBase, ...MONO, width: 200 }}>
          {weeks.map((w) => <option key={w} value={w}>{w}</option>)}
        </select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10, marginBottom: 14 }}>
        <StatTile label="Trades" value={stats.n || 0} /><StatTile label="No-trades" value={weekNoTrades.length} />
        <StatTile label="Win rate" value={stats.n ? `${Math.round(stats.winRate * 100)}%` : "—"} />
        <StatTile label="Avg R" value={fmtR(stats.avgR)} /><StatTile label="Total R" value={fmtR(stats.totalR)} tone={stats.totalR > 0 ? "good" : stats.totalR < 0 ? "bad" : undefined} />
        <StatTile label="Avg winner" value={fmtR(stats.avgWinner)} tone="good" /><StatTile label="Avg loser" value={fmtR(stats.avgLoser)} tone="bad" />
        <StatTile label="Profit factor" value={fmtPF(stats.profitFactor)} /><StatTile label="Max drawdown" value={fmtR(stats.maxDrawdownR)} tone="bad" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }} className="grid-stack">
        <Panel title="Setup performance"><RankTable rows={setupRows} empty="No tagged setups this week." /></Panel>
        <Panel title="Time of day"><RankTable rows={timeRows} empty="No trades this week." /></Panel>
        <Panel title="Market condition"><RankTable rows={condRows} empty="No context recorded this week." /></Panel>
        <Panel title="Mistakes"><RankTable rows={mistakeRows.map(m => ({ key: m.key, n: m.count, avgR: m.totalR }))} avgLabel="Total R" empty="No mistakes logged — good week." /></Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }} className="grid-stack">
        <Panel title="Best decision this week">{best ? <MiniTradeCard t={best} /> : <span style={{ fontSize: 12, color: C.inkFaint }}>Not enough data.</span>}</Panel>
        <Panel title="Worst decision this week">{worst ? <MiniTradeCard t={worst} /> : <span style={{ fontSize: 12, color: C.inkFaint }}>Not enough data.</span>}</Panel>
      </div>

      <Panel title="Trades I should have taken vs. correctly avoided">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <StatTile label="Correctly avoided" value={correct} tone="good" />
          <StatTile label="Missed good trades" value={missed} tone="bad" />
        </div>
      </Panel>

      <div style={{ marginTop: 14 }}>
        <Panel title="Weekly reflection">
          <TextArea value={reflection} onChange={(v) => upsertDay(reflectionKey, { reflection: v })} rows={3} placeholder="Anything this week's numbers don't capture?" />
        </Panel>
      </div>
    </div>
  );
}

function RankTable({ rows, empty, avgLabel }) {
  if (!rows || !rows.length) return <div style={{ fontSize: 12, color: C.inkFaint }}>{empty}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", fontSize: 10.5, color: C.inkFaint, borderBottom: `1px solid ${C.line}`, paddingBottom: 6, marginBottom: 4 }}>
        <span style={{ flex: 1 }}>Name</span><span style={{ width: 40, textAlign: "right" }}>N</span><span style={{ width: 70, textAlign: "right" }}>{avgLabel || "Avg R"}</span>
      </div>
      {rows.slice(0, 8).map((r) => (
        <div key={r.key} style={{ display: "flex", padding: "5px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
          <span style={{ flex: 1, fontSize: 12, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.key}</span>
          <span style={{ width: 40, textAlign: "right", fontSize: 12, ...MONO, color: C.inkDim }}>{r.n}</span>
          <span style={{ width: 70, textAlign: "right", fontSize: 12, ...MONO, color: (r.avgR || 0) > 0 ? C.good : (r.avgR || 0) < 0 ? C.bad : C.inkDim }}>{fmtR(r.avgR)}</span>
        </div>
      ))}
    </div>
  );
}

function MiniTradeCard({ t }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, ...MONO, color: C.inkDim }}>{t.date} {t.time}</span>
        <span style={{ fontSize: 13, fontWeight: 700, ...MONO, color: t.resultR > 0 ? C.good : t.resultR < 0 ? C.bad : C.inkDim }}>{fmtR(t.resultR)}</span>
      </div>
      <div style={{ fontSize: 12, color: C.ink, marginBottom: 4 }}>{(t.setupTags || []).join(", ") || "No tags"}</div>
      <div style={{ fontSize: 11.5, color: C.inkFaint }}>{t.whyEntered}</div>
    </div>
  );
}

/* ============================================================
   ANALYTICS
   ============================================================ */
function ChartCard({ title, children, height = 200 }) {
  return (
    <Panel title={title}>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </Panel>
  );
}
function signColor(v) { return v > 0 ? C.good : v < 0 ? C.bad : C.inkFaint; }

function AnalyticsView({ trades }) {
  const [filters, setFilters] = useState(defaultFilters());
  const filtered = useMemo(() => applyFilters(trades, filters), [trades, filters]);
  const stats = computeStats(filtered);

  const equityData = useMemo(() => {
    let running = 0;
    return filtered.slice().sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || ""))).map((t, i) => { running += (t.resultR || 0); return { i: i + 1, r: round2(running) }; });
  }, [filtered]);

  const perTradeData = useMemo(() => filtered.slice().sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || ""))).map((t, i) => ({ i: i + 1, r: t.resultR || 0 })), [filtered]);

  const dailyData = useMemo(() => {
    const map = new Map();
    filtered.forEach((t) => map.set(t.date, (map.get(t.date) || 0) + (t.resultR || 0)));
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([date, r]) => ({ date: date.slice(5), r: round2(r) }));
  }, [filtered]);

  const drawdownData = useMemo(() => {
    let running = 0, peak = 0;
    return filtered.slice().sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || ""))).map((t, i) => {
      running += (t.resultR || 0); peak = Math.max(peak, running);
      return { i: i + 1, dd: round2(running - peak) };
    });
  }, [filtered]);

  const setupRows = bucketBySetupTag(filtered).slice(0, 10);
  const timeRows = groupStats(filtered, (t) => hourBucket(t.time)).sort((a, b) => a.key.localeCompare(b.key));
  const condRows = groupStats(filtered, (t) => t.context && t.context.condition);
  const mistakeRows = computeMistakeStats(filtered).filter((m) => m.count > 0).slice(0, 10);
  const longStats = computeStats(filtered.filter((t) => t.direction === "long"));
  const shortStats = computeStats(filtered.filter((t) => t.direction === "short"));

  return (
    <div>
      <FilterBar filters={filters} setFilters={setFilters} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 12.5, color: C.inkDim }}>{filtered.length} trades in view</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={ghostBtn} onClick={() => exportTradesCSV(filtered)}><Download size={13} /> CSV</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 10, marginBottom: 14 }}>
        <StatTile label="Win rate" value={filtered.length ? `${Math.round(stats.winRate * 100)}%` : "—"} />
        <StatTile label="Avg R" value={fmtR(stats.avgR)} /><StatTile label="Total R" value={fmtR(stats.totalR)} tone={stats.totalR > 0 ? "good" : stats.totalR < 0 ? "bad" : undefined} />
        <StatTile label="Total $" value={fmtUsd(stats.totalUsd)} tone={stats.totalUsd > 0 ? "good" : stats.totalUsd < 0 ? "bad" : undefined} />
        <StatTile label="Avg ticks" value={stats.avgTicks != null ? roundTo(stats.avgTicks, 1) : "—"} />
        <StatTile label="Profit factor" value={fmtPF(stats.profitFactor)} />
        <StatTile label="Max drawdown" value={fmtR(stats.maxDrawdownR)} tone="bad" />
        <StatTile label="Long avg R" value={fmtR(longStats.avgR)} /><StatTile label="Short avg R" value={fmtR(shortStats.avgR)} />
      </div>

      {filtered.length === 0 ? <EmptyState icon={BarChart3} title="No trades match this filter" /> : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="grid-stack">
          <ChartCard title="Equity curve (cumulative R)">
            <LineChart data={equityData}><CartesianGrid stroke={C.lineSoft} vertical={false} /><XAxis dataKey="i" hide /><YAxis tick={{ fill: C.inkFaint, fontSize: 10 }} width={36} axisLine={{ stroke: C.line }} tickLine={false} /><ReferenceLine y={0} stroke={C.line} /><Tooltip contentStyle={{ background: C.panelRaised, border: `1px solid ${C.line}`, fontSize: 12 }} formatter={(v) => [fmtR(v), "Cum. R"]} /><Line type="monotone" dataKey="r" stroke={C.accent} strokeWidth={2} dot={false} /></LineChart>
          </ChartCard>
          <ChartCard title="R per trade">
            <BarChart data={perTradeData}><CartesianGrid stroke={C.lineSoft} vertical={false} /><XAxis dataKey="i" hide /><YAxis tick={{ fill: C.inkFaint, fontSize: 10 }} width={36} axisLine={{ stroke: C.line }} tickLine={false} /><ReferenceLine y={0} stroke={C.line} /><Tooltip contentStyle={{ background: C.panelRaised, border: `1px solid ${C.line}`, fontSize: 12 }} formatter={(v) => [fmtR(v), "R"]} /><Bar dataKey="r">{perTradeData.map((d, i) => <Cell key={i} fill={signColor(d.r)} />)}</Bar></BarChart>
          </ChartCard>
          <ChartCard title="Daily R">
            <BarChart data={dailyData}><CartesianGrid stroke={C.lineSoft} vertical={false} /><XAxis dataKey="date" tick={{ fill: C.inkFaint, fontSize: 10 }} axisLine={{ stroke: C.line }} tickLine={false} /><YAxis tick={{ fill: C.inkFaint, fontSize: 10 }} width={36} axisLine={{ stroke: C.line }} tickLine={false} /><ReferenceLine y={0} stroke={C.line} /><Tooltip contentStyle={{ background: C.panelRaised, border: `1px solid ${C.line}`, fontSize: 12 }} formatter={(v) => [fmtR(v), "R"]} /><Bar dataKey="r">{dailyData.map((d, i) => <Cell key={i} fill={signColor(d.r)} />)}</Bar></BarChart>
          </ChartCard>
          <ChartCard title="Drawdown (running, R)">
            <AreaChart data={drawdownData}><CartesianGrid stroke={C.lineSoft} vertical={false} /><XAxis dataKey="i" hide /><YAxis tick={{ fill: C.inkFaint, fontSize: 10 }} width={36} axisLine={{ stroke: C.line }} tickLine={false} /><Tooltip contentStyle={{ background: C.panelRaised, border: `1px solid ${C.line}`, fontSize: 12 }} formatter={(v) => [fmtR(v), "Drawdown"]} /><Area type="monotone" dataKey="dd" stroke={C.bad} fill={C.badDim} /></AreaChart>
          </ChartCard>
          <ChartCard title="Setup performance (avg R)">
            <BarChart data={setupRows} layout="vertical" margin={{ left: 10 }}><CartesianGrid stroke={C.lineSoft} horizontal={false} /><XAxis type="number" tick={{ fill: C.inkFaint, fontSize: 10 }} axisLine={{ stroke: C.line }} tickLine={false} /><YAxis type="category" dataKey="key" width={110} tick={{ fill: C.inkDim, fontSize: 10 }} axisLine={{ stroke: C.line }} tickLine={false} /><ReferenceLine x={0} stroke={C.line} /><Tooltip contentStyle={{ background: C.panelRaised, border: `1px solid ${C.line}`, fontSize: 12 }} formatter={(v) => [fmtR(v), "Avg R"]} /><Bar dataKey="avgR">{setupRows.map((d, i) => <Cell key={i} fill={signColor(d.avgR)} />)}</Bar></BarChart>
          </ChartCard>
          <ChartCard title="Time-of-day performance (avg R)">
            <BarChart data={timeRows}><CartesianGrid stroke={C.lineSoft} vertical={false} /><XAxis dataKey="key" tick={{ fill: C.inkFaint, fontSize: 9 }} axisLine={{ stroke: C.line }} tickLine={false} /><YAxis tick={{ fill: C.inkFaint, fontSize: 10 }} width={36} axisLine={{ stroke: C.line }} tickLine={false} /><ReferenceLine y={0} stroke={C.line} /><Tooltip contentStyle={{ background: C.panelRaised, border: `1px solid ${C.line}`, fontSize: 12 }} formatter={(v) => [fmtR(v), "Avg R"]} /><Bar dataKey="avgR">{timeRows.map((d, i) => <Cell key={i} fill={signColor(d.avgR)} />)}</Bar></BarChart>
          </ChartCard>
          <ChartCard title="Market condition performance (avg R)">
            <BarChart data={condRows}><CartesianGrid stroke={C.lineSoft} vertical={false} /><XAxis dataKey="key" tick={{ fill: C.inkFaint, fontSize: 10 }} axisLine={{ stroke: C.line }} tickLine={false} /><YAxis tick={{ fill: C.inkFaint, fontSize: 10 }} width={36} axisLine={{ stroke: C.line }} tickLine={false} /><ReferenceLine y={0} stroke={C.line} /><Tooltip contentStyle={{ background: C.panelRaised, border: `1px solid ${C.line}`, fontSize: 12 }} formatter={(v) => [fmtR(v), "Avg R"]} /><Bar dataKey="avgR">{condRows.map((d, i) => <Cell key={i} fill={signColor(d.avgR)} />)}</Bar></BarChart>
          </ChartCard>
          <ChartCard title="Mistake frequency">
            <BarChart data={mistakeRows} layout="vertical" margin={{ left: 10 }}><CartesianGrid stroke={C.lineSoft} horizontal={false} /><XAxis type="number" tick={{ fill: C.inkFaint, fontSize: 10 }} axisLine={{ stroke: C.line }} tickLine={false} /><YAxis type="category" dataKey="key" width={130} tick={{ fill: C.inkDim, fontSize: 9.5 }} axisLine={{ stroke: C.line }} tickLine={false} /><Tooltip contentStyle={{ background: C.panelRaised, border: `1px solid ${C.line}`, fontSize: 12 }} formatter={(v) => [v, "Count"]} /><Bar dataKey="count" fill={C.accent} /></BarChart>
          </ChartCard>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   EDGE DISCOVERY
   ============================================================ */
function maxLosingStreak(trades) {
  const sorted = trades.slice().sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
  let cur = 0, max = 0;
  sorted.forEach((t) => { if ((t.resultR || 0) < 0) { cur++; max = Math.max(max, cur); } else cur = 0; });
  return max;
}

function EdgeDiscoveryView({ trades }) {
  const [filters, setFilters] = useState(defaultFilters());
  const filtered = useMemo(() => applyFilters(trades, filters), [trades, filters]);
  const stats = computeStats(filtered);
  const tier = sampleTier(filtered.length);
  const condRows = groupStats(filtered, (t) => t.context && t.context.condition);
  const timeRows = groupStats(filtered, (t) => hourBucket(t.time));
  const bestCond = condRows[0], worstCond = condRows[condRows.length - 1];
  const bestTime = timeRows.slice().sort((a, b) => b.avgR - a.avgR)[0];
  const worstTime = timeRows.slice().sort((a, b) => a.avgR - b.avgR)[0];
  const streak = maxLosingStreak(filtered);
  const tierTone = tier.tier === "solid" ? "good" : tier.tier === "limited" ? "warn" : "bad";

  return (
    <div>
      <div style={{ fontSize: 12.5, color: C.inkDim, marginBottom: 12, maxWidth: 640 }}>
        Combine setup tags to test a specific idea — e.g. "Liquidity sweep + Absorption + Footprint confirmation at VAL" — then read the sample size before believing the numbers.
      </div>
      <FilterBar filters={filters} setFilters={setFilters} emphasizeTags />

      <div style={{ background: tierTone === "good" ? "rgba(125,169,139,0.1)" : tierTone === "bad" ? "rgba(192,106,92,0.1)" : "rgba(217,165,72,0.1)", border: `1px solid ${tierTone === "good" ? C.goodDim : tierTone === "bad" ? C.badDim : C.accentDim}`, borderRadius: 6, padding: 12, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Sample size: {filtered.length} trades — {tier.label}</div>
          <div style={{ fontSize: 11.5, color: C.inkFaint }}>{tier.tier === "insufficient" ? "Under 15 trades — treat any edge here as a hypothesis, not a conclusion." : tier.tier === "limited" ? "15–49 trades — a pattern is forming; keep collecting before sizing up." : "50+ trades — reasonably meaningful evidence for this combination."}</div>
        </div>
      </div>

      {filtered.length === 0 ? <EmptyState icon={Search} title="No trades match this combination" /> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 14 }}>
            <StatTile label="Occurrences" value={filtered.length} />
            <StatTile label="Win rate" value={`${Math.round(stats.winRate * 100)}%`} />
            <StatTile label="Avg R" value={fmtR(stats.avgR)} />
            <StatTile label="Expectancy" value={fmtR(stats.expectancy)} />
            <StatTile label="Profit factor" value={fmtPF(stats.profitFactor)} />
            <StatTile label="Avg winner" value={fmtR(stats.avgWinner)} tone="good" />
            <StatTile label="Avg loser" value={fmtR(stats.avgLoser)} tone="bad" />
            <StatTile label="Max losing streak" value={streak} tone={streak >= 3 ? "bad" : undefined} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="grid-stack">
            <Panel title="Best / worst condition">
              <KV label="Best condition" value={bestCond ? `${bestCond.key} (${fmtR(bestCond.avgR)})` : "—"} />
              <KV label="Worst condition" value={worstCond && worstCond !== bestCond ? `${worstCond.key} (${fmtR(worstCond.avgR)})` : "—"} />
            </Panel>
            <Panel title="Best / worst time">
              <KV label="Best time" value={bestTime ? `${bestTime.key} (${fmtR(bestTime.avgR)})` : "—"} />
              <KV label="Worst time" value={worstTime && worstTime !== bestTime ? `${worstTime.key} (${fmtR(worstTime.avgR)})` : "—"} />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
   MISTAKES
   ============================================================ */
function tallyCategories(items, key, catalog) {
  const map = new Map(catalog.map((c) => [c, 0]));
  items.forEach((it) => (it[key] || []).forEach((c) => map.set(c, (map.get(c) || 0) + 1)));
  return Array.from(map.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

function MistakesView({ trades, noTrades }) {
  const rows = computeMistakeStats(trades);
  const withData = rows.filter((r) => r.count > 0);
  const topByCount = withData[0];
  const topByCost = withData.slice().sort((a, b) => a.totalR - b.totalR)[0];
  const ntRows = tallyCategories(noTrades, "categories", NO_TRADE_TAGS).filter((r) => r.count > 0);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <StatTile label="Most frequent mistake" value={topByCount ? topByCount.key : "None yet"} sub={topByCount ? `${topByCount.count}× this journal` : ""} tone={topByCount ? "bad" : undefined} />
        <StatTile label="Most expensive mistake" value={topByCost && topByCost.totalR < 0 ? topByCost.key : "None yet"} sub={topByCost && topByCost.totalR < 0 ? `${fmtR(topByCost.totalR)} total` : ""} tone={topByCost && topByCost.totalR < 0 ? "bad" : undefined} />
      </div>

      <Panel title="Trade mistakes">
        {withData.length === 0 ? <div style={{ fontSize: 12, color: C.inkFaint }}>No mistakes tagged yet — keep it that way.</div> : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 10.5, color: C.inkFaint, borderBottom: `1px solid ${C.line}`, paddingBottom: 6, marginBottom: 4 }}>
              <span style={{ flex: 1 }}>Mistake</span><span style={{ width: 70, textAlign: "right" }}>Count</span><span style={{ width: 90, textAlign: "right" }}>Total R impact</span>
            </div>
            {withData.map((r) => (
              <div key={r.key} style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
                <span style={{ flex: 1, fontSize: 12.5, color: C.ink }}>{r.key}</span>
                <span style={{ width: 70, textAlign: "right", fontSize: 12, ...MONO, color: C.inkDim }}>{r.count}×</span>
                <span style={{ width: 90, textAlign: "right", fontSize: 12, ...MONO, color: r.totalR < 0 ? C.bad : C.inkDim }}>{fmtR(r.totalR)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div style={{ height: 14 }} />
      <Panel title="No-trade patterns">
        {ntRows.length === 0 ? <div style={{ fontSize: 12, color: C.inkFaint }}>No categorized no-trades yet.</div> : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {ntRows.map((r) => <Badge key={r.key} tone="warn">{r.key} · {r.count}×</Badge>)}
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ============================================================
   PLAYBOOK
   ============================================================ */
function blankPlaybookSetup() {
  return { id: uid(), name: "", marketContext: "", location: "", preconditions: "", domNeeds: "", footprintNeeds: "", entryTrigger: "", stopLocation: "", target: "", invalidations: "", examples: "", nonExamples: "" };
}

function PlaybookListView({ playbook, onOpenNew, onOpenEdit, onDelete }) {
  if (playbook.length === 0) {
    return <EmptyState icon={BookOpen} title="Your playbook is empty" message="Turn your best repeating setups into reference templates: context, DOM/footprint requirements, entry trigger, stop, target, and what would invalidate it." actionLabel="Create a setup" onAction={onOpenNew} />;
  }
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button style={primaryBtn} onClick={onOpenNew}><Plus size={14} /> New setup</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
        {playbook.map((p) => (
          <div key={p.id} onClick={() => onOpenEdit(p.id)} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 14, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{p.name || "Untitled setup"}</div>
              <div onClick={(e) => e.stopPropagation()}><button style={{ ...dangerBtn, padding: "4px 7px" }} onClick={() => onDelete(p.id)}><Trash2 size={11} /></button></div>
            </div>
            <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 6, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.entryTrigger || p.marketContext || "No description yet."}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const PLAYBOOK_FIELDS = [
  ["marketContext", "Market context"], ["location", "Location"], ["preconditions", "Preconditions"],
  ["domNeeds", "What I need to see on DOM"], ["footprintNeeds", "What I need to see on Footprint"],
  ["entryTrigger", "Entry trigger"], ["stopLocation", "Stop location"], ["target", "Target"],
  ["invalidations", "Invalidations"], ["examples", "Examples"], ["nonExamples", "Non-examples"],
];

function PlaybookFormView({ initial, onSave, onCancel, onDelete }) {
  const [p, setP] = useState(() => initial ? JSON.parse(JSON.stringify(initial)) : blankPlaybookSetup());
  const set = (patch) => setP((prev) => ({ ...prev, ...patch }));
  const isEditing = !!initial;
  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <button style={{ ...ghostBtn, padding: "5px 9px" }} onClick={onCancel}><ArrowLeft size={13} /> Back</button>
        <div style={{ display: "flex", gap: 8 }}>
          {isEditing && <ConfirmDelete onConfirm={() => onDelete(p.id)} />}
          <button style={primaryBtn} onClick={() => onSave(p)}><Save size={13} /> Save setup</button>
        </div>
      </div>
      <Panel title={isEditing ? "Edit setup" : "New setup"}>
        <Field label="Setup name"><TextInput value={p.name} onChange={(v) => set({ name: v })} placeholder="e.g. Liquidity Sweep + Absorption Reversal" /></Field>
        {PLAYBOOK_FIELDS.map(([k, label]) => (
          <Field key={k} label={label}><TextArea value={p[k]} onChange={(v) => set({ [k]: v })} rows={2} /></Field>
        ))}
        <Field label="Reference screenshots"><ScreenshotManager entityType="playbook" entityId={p.id} slots={[["shot", "Example", "all"]]} /></Field>
      </Panel>
    </div>
  );
}

/* ============================================================
   SETTINGS
   ============================================================ */
function blankCustomInstrument() { return { symbol: "", label: "", tickSize: "", tickValue: "" }; }

function SettingsView({ store }) {
  const { settings, updateSettings, trades, noTrades, days, playbook, importAll } = store;
  const [draft, setDraft] = useState(blankCustomInstrument());
  const [importMsg, setImportMsg] = useState(null);
  const [importMode, setImportMode] = useState("merge");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const customList = Object.entries(settings.customInstruments || {});

  function addCustomInstrument() {
    const sym = (draft.symbol || "").toUpperCase().trim();
    const ts = Number(draft.tickSize), tv = Number(draft.tickValue);
    if (!sym || INSTRUMENTS[sym] || !(ts > 0) || !(tv > 0)) return;
    updateSettings({ customInstruments: { ...(settings.customInstruments || {}), [sym]: { label: draft.label || sym, tickSize: ts, tickValue: tv } } });
    setDraft(blankCustomInstrument());
  }
  function removeCustomInstrument(sym) {
    const next = { ...(settings.customInstruments || {}) };
    delete next[sym];
    updateSettings({ customInstruments: next });
  }

  async function handleExport() {
    setBusy(true);
    try { await exportAllJSON(store); } finally { setBusy(false); }
  }
  async function handleImportFile(file) {
    if (!file) return;
    setBusy(true); setImportMsg(null);
    try {
      const payload = await parseImportFile(file);
      const shotCount = await restoreScreenshots(payload.screenshots);
      const res = importAll(payload, importMode);
      if (res.ok) {
        setImportMsg(`Imported ${res.counts.trades} trades, ${res.counts.noTrades} no-trades, ${res.counts.days} daily records, ${res.counts.playbook} playbook entries, ${shotCount} screenshots (${importMode === "replace" ? "replaced everything" : "merged by id"}).`);
      } else {
        setImportMsg(res.error);
      }
    } catch (e) {
      setImportMsg(e.message || "Import failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 16 }}>
      <Panel title="Display">
        <Field label="Primary unit" hint="The big number on trade rows, trade detail, and the trade form. The other two units always show underneath — R-multiple is always shown regardless of this setting.">
          <Segmented value={settings.preferredUnit} onChange={(v) => updateSettings({ preferredUnit: v })} options={UNIT_OPTIONS.map(([value, label]) => ({ value, label }))} />
        </Field>
      </Panel>

      <Panel title="Risk management" icon={AlertOctagon}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
          <Field label="Per-trade risk limit ($)" hint="Warn on the trade form if a single trade's risk exceeds this.">
            <NumberInput value={settings.riskPerTradeLimit} onChange={(v) => updateSettings({ riskPerTradeLimit: v })} placeholder="e.g. 300" />
          </Field>
          <Field label="Daily loss limit ($)" hint="Warn if today's total planned risk would exceed this.">
            <NumberInput value={settings.dailyLossLimit} onChange={(v) => updateSettings({ dailyLossLimit: v })} placeholder="e.g. 900" />
          </Field>
        </div>
      </Panel>

      <Panel title="Instruments">
        <div style={{ fontSize: 12, color: C.inkDim, marginBottom: 10 }}>
          Built in: {Object.keys(INSTRUMENTS).map((k) => `${k} ($${INSTRUMENTS[k].tickValue}/tick)`).join(" · ")}
        </div>
        {customList.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {customList.map(([sym, spec]) => (
              <div key={sym} style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${C.line}`, borderRadius: 6, padding: "8px 10px" }}>
                <div style={{ ...MONO, fontSize: 12.5, color: C.ink, width: 60 }}>{sym}</div>
                <div style={{ flex: 1, fontSize: 12, color: C.inkDim }}>{spec.label} · tick {spec.tickSize} · ${spec.tickValue}/tick</div>
                <button style={{ ...dangerBtn, padding: "5px 8px" }} onClick={() => removeCustomInstrument(sym)}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 10, alignItems: "end" }}>
          <Field label="Symbol"><TextInput value={draft.symbol} onChange={(v) => setDraft((d) => ({ ...d, symbol: v }))} mono placeholder="CL" /></Field>
          <Field label="Name"><TextInput value={draft.label} onChange={(v) => setDraft((d) => ({ ...d, label: v }))} placeholder="Crude Oil" /></Field>
          <Field label="Tick size"><NumberInput value={draft.tickSize} onChange={(v) => setDraft((d) => ({ ...d, tickSize: v }))} step="any" /></Field>
          <Field label="Tick value ($)"><NumberInput value={draft.tickValue} onChange={(v) => setDraft((d) => ({ ...d, tickValue: v }))} step="any" /></Field>
          <button style={primaryBtn} onClick={addCustomInstrument}><Plus size={13} /> Add</button>
        </div>
      </Panel>

      <Panel title="Backup / restore" icon={Download}>
        <div style={{ fontSize: 12, color: C.inkDim, marginBottom: 12 }}>
          Export is a complete backup — trades, no-trades, daily records, playbook, settings and every screenshot. Use it to move the journal to a new computer, or as a periodic local backup.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <button style={primaryBtn} onClick={handleExport} disabled={busy}><Download size={13} /> Export full backup (JSON)</button>
          <button style={ghostBtn} onClick={() => exportTradesCSV(trades)}><Download size={13} /> Export trades (CSV)</button>
        </div>
        <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
          <Field label="Import mode" hint={importMode === "merge" ? "Safe default — upserts by id, never deletes what's already here." : "Danger — replaces trades, no-trades, days and playbook entirely with the file's contents."}>
            <Segmented value={importMode} onChange={setImportMode} options={[{ value: "merge", label: "Merge" }, { value: "replace", label: "Replace all" }]} />
          </Field>
          <input ref={fileRef} type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => handleImportFile(e.target.files[0])} />
          <button style={importMode === "replace" ? dangerBtn : ghostBtn} onClick={() => fileRef.current && fileRef.current.click()} disabled={busy}>
            <Upload size={13} /> {busy ? "Working…" : "Import backup JSON"}
          </button>
          {importMsg && <div style={{ fontSize: 12, color: C.inkDim, marginTop: 8 }}>{importMsg}</div>}
        </div>
      </Panel>

      <Panel title="This device">
        <div style={{ fontSize: 12, color: C.inkDim, lineHeight: 1.6 }}>
          Storage backend: <strong style={{ color: C.ink }}>{hasHostStorage() ? "Claude.ai account storage (synced across your devices automatically)" : "Local IndexedDB (this browser only — export regularly if you use more than one device or browser)"}</strong>.<br />
          {trades.length} trades · {noTrades.length} no-trades · {Object.keys(days).length} daily records · {playbook.length} playbook setups.
        </div>
      </Panel>
    </div>
  );
}

/* ============================================================
   APP SHELL
   ============================================================ */
const TAB_META = {
  dashboard: { title: "Dashboard", subtitle: "Decision quality over P&L" },
  prep: { title: "Daily Prep", subtitle: "Pre-market plan and mental state" },
  verdict: { title: "Trade / No-Trade", subtitle: "A decision-discipline check — not a prediction" },
  trades: { title: "Trades", subtitle: "Every trade, in full" },
  notrades: { title: "No-Trades", subtitle: "What you saw and chose not to take" },
  dailyreview: { title: "Daily Review", subtitle: "Process over outcome" },
  weeklyreview: { title: "Weekly Review", subtitle: "Automatic weekly statistics" },
  analytics: { title: "Analytics", subtitle: "Filter, chart, and slice your history" },
  edge: { title: "Edge Discovery", subtitle: "Does this setup actually have an edge?" },
  mistakes: { title: "Mistakes", subtitle: "Your recurring patterns, tracked" },
  playbook: { title: "Playbook", subtitle: "Your reference library" },
  settings: { title: "Settings", subtitle: "Units, risk limits, instruments, and backup" },
};

const GLOBAL_CSS = `
  *,*::before,*::after{box-sizing:border-box;}
  html,body{margin:0;padding:0;background:${C.bg};}
  ::-webkit-scrollbar{width:9px;height:9px;}
  ::-webkit-scrollbar-track{background:${C.bgAlt};}
  ::-webkit-scrollbar-thumb{background:${C.line};border-radius:5px;}
  select{color-scheme:dark;}
  input::placeholder,textarea::placeholder{color:${C.inkFaint};}
  :focus-visible{outline:2px solid ${C.accent};outline-offset:1px;}
  @media (max-width:780px){.grid-stack{grid-template-columns:1fr !important;}}
  @media (prefers-reduced-motion:reduce){*{transition:none !important;animation:none !important;}}
`;

function App() {
  const store = useJournalStore();
  const [tab, setTabRaw] = useState("dashboard");
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [tradeRoute, setTradeRoute] = useState({ mode: "list", id: null });
  const [noTradeRoute, setNoTradeRoute] = useState({ mode: "list", id: null });
  const [playbookRoute, setPlaybookRoute] = useState({ mode: "list", id: null });
  const [mobileOpen, setMobileOpen] = useState(false);

  function handleNavClick(key) {
    setTabRaw(key); setMobileOpen(false);
    setTradeRoute({ mode: "list", id: null });
    setNoTradeRoute({ mode: "list", id: null });
    setPlaybookRoute({ mode: "list", id: null });
  }
  function goTo(key, opts) {
    setTabRaw(key);
    if (key === "trades" && opts) setTradeRoute({ mode: opts.mode || "list", id: opts.id ?? null });
    if (key === "notrades" && opts) setNoTradeRoute({ mode: opts.mode || "list", id: opts.id ?? null });
  }

  useEffect(() => {
    function onKey(e) {
      const tag = (document.activeElement && document.activeElement.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "n" && tab === "trades" && tradeRoute.mode === "list") { setTradeRoute({ mode: "form", id: null }); }
      if (e.key === "Escape") { setTradeRoute({ mode: "list", id: null }); setNoTradeRoute({ mode: "list", id: null }); setPlaybookRoute({ mode: "list", id: null }); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, tradeRoute.mode]);

  if (store.loading) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, color: C.inkDim, ...SANS, fontSize: 13 }}>
        Loading your journal…
      </div>
    );
  }

  const dayRecord = store.days[selectedDate] || {};
  const meta = TAB_META[tab];

  let body = null;
  if (tab === "dashboard") body = <DashboardView store={store} selectedDate={selectedDate} goTo={goTo} />;
  else if (tab === "prep") body = <DailyPrepView date={selectedDate} setDate={setSelectedDate} dayRecord={dayRecord} onSave={(patch) => store.upsertDay(selectedDate, patch)} />;
  else if (tab === "verdict") body = <TradeNoTradeView date={selectedDate} setDate={setSelectedDate} dayRecord={dayRecord} onSave={(patch) => store.upsertDay(selectedDate, patch)} />;
  else if (tab === "trades") {
    if (tradeRoute.mode === "form") {
      const initial = tradeRoute.id ? store.trades.find((t) => t.id === tradeRoute.id) : null;
      const formDate = initial ? initial.date : selectedDate;
      body = <TradeFormView initial={initial} settings={store.settings} todaysTrades={store.trades.filter((t) => t.date === formDate)} onSave={(t) => { store.upsertTrade(t); setTradeRoute({ mode: "detail", id: t.id }); }} onCancel={() => setTradeRoute({ mode: "list", id: null })} onDelete={(id) => { store.deleteTrade(id); setTradeRoute({ mode: "list", id: null }); }} />;
    } else if (tradeRoute.mode === "detail") {
      const t = store.trades.find((x) => x.id === tradeRoute.id);
      body = t ? <TradeDetailView trade={t} unit={store.settings.preferredUnit} onEdit={(id) => setTradeRoute({ mode: "form", id })} onBack={() => setTradeRoute({ mode: "list", id: null })} onDelete={(id) => { store.deleteTrade(id); setTradeRoute({ mode: "list", id: null }); }} /> : <EmptyState icon={ListChecks} title="Trade not found" />;
    } else {
      body = <TradesListView trades={store.trades} unit={store.settings.preferredUnit} onOpenNew={() => setTradeRoute({ mode: "form", id: null })} onOpenDetail={(id) => setTradeRoute({ mode: "detail", id })} onOpenEdit={(id) => setTradeRoute({ mode: "form", id })} onDelete={(id) => store.deleteTrade(id)} />;
    }
  } else if (tab === "notrades") {
    if (noTradeRoute.mode === "form") {
      const initial = noTradeRoute.id ? store.noTrades.find((t) => t.id === noTradeRoute.id) : null;
      body = <NoTradeFormView initial={initial} onSave={(nt) => { store.upsertNoTrade(nt); setNoTradeRoute({ mode: "list", id: null }); }} onCancel={() => setNoTradeRoute({ mode: "list", id: null })} onDelete={(id) => { store.deleteNoTrade(id); setNoTradeRoute({ mode: "list", id: null }); }} />;
    } else {
      body = <NoTradesListView noTrades={store.noTrades} onOpenNew={() => setNoTradeRoute({ mode: "form", id: null })} onOpenEdit={(id) => setNoTradeRoute({ mode: "form", id })} onDelete={(id) => store.deleteNoTrade(id)} />;
    }
  } else if (tab === "dailyreview") {
    body = <DailyReviewView date={selectedDate} setDate={setSelectedDate} dayRecord={dayRecord} onSave={(patch) => store.upsertDay(selectedDate, patch)} todaysTrades={store.trades.filter((t) => t.date === selectedDate)} todaysNoTrades={store.noTrades.filter((n) => n.date === selectedDate)} />;
  } else if (tab === "weeklyreview") {
    body = <WeeklyReviewView trades={store.trades} noTrades={store.noTrades} days={store.days} upsertDay={store.upsertDay} />;
  } else if (tab === "analytics") {
    body = <AnalyticsView trades={store.trades} />;
  } else if (tab === "edge") {
    body = <EdgeDiscoveryView trades={store.trades} />;
  } else if (tab === "mistakes") {
    body = <MistakesView trades={store.trades} noTrades={store.noTrades} />;
  } else if (tab === "playbook") {
    if (playbookRoute.mode === "form") {
      const initial = playbookRoute.id ? store.playbook.find((p) => p.id === playbookRoute.id) : null;
      body = <PlaybookFormView initial={initial} onSave={(p) => { store.upsertPlaybook(p); setPlaybookRoute({ mode: "list", id: null }); }} onCancel={() => setPlaybookRoute({ mode: "list", id: null })} onDelete={(id) => { store.deletePlaybook(id); setPlaybookRoute({ mode: "list", id: null }); }} />;
    } else {
      body = <PlaybookListView playbook={store.playbook} onOpenNew={() => setPlaybookRoute({ mode: "form", id: null })} onOpenEdit={(id) => setPlaybookRoute({ mode: "form", id })} onDelete={(id) => store.deletePlaybook(id)} />;
    }
  } else if (tab === "settings") {
    body = <SettingsView store={store} />;
  }

  return (
    <div style={{ height: "100vh", width: "100%", display: "flex", background: C.bg, color: C.ink, ...SANS }}>
      <style>{GLOBAL_CSS}</style>
      <NavRail tab={tab} setTab={handleNavClick} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, height: "100%" }}>
        <TopBar
          title={meta.title} subtitle={meta.subtitle} saveState={store.saveState} onMenu={() => setMobileOpen(true)}
          right={<button onClick={() => exportAllJSON(store)} title="Export everything as JSON" style={{ ...ghostBtn, padding: "6px 10px", marginLeft: 10 }}><Download size={13} /></button>}
        />
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px 60px" }}>
          {body}
        </div>
      </div>
    </div>
  );
}

export default App;

