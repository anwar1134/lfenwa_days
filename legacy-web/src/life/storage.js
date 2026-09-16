/* ============================================================
   LFNAWA DAYS — LOCAL-FIRST STORAGE LAYER
   ============================================================
   A brand-new IndexedDB database, completely separate from the
   existing trading journal's database ("esOrderFlowJournal").
   This is deliberate and important:

     - Lfenwa Trades keeps using its own untouched database/schema
       (see app/www/trades/bundle.js) — nothing here ever opens,
       reads, or writes to "esOrderFlowJournal" except the small
       read-only helper at the bottom of this file, used only to
       show trade counts on a Life Day and to fold trades into a
       full backup export. It never mutates that database.
     - This file's database ("lfnawaDaysDB") stores everything
       else: days, timeline, tasks, achievements, learning, money,
       habits, goals, memories, mind entries, and settings.

   Two separate databases means a bug or migration in one can
   never corrupt or delete data in the other — the safest possible
   arrangement given PART 18/24's "must not lose existing trading
   data" requirement.
   ============================================================ */

const DB_NAME = "lfnawaDaysDB";
const DB_VERSION = 1;

const STORES = {
  days: "date", // {date, wakeTime, sleepTime, location, note, metrics:{...}, review:{...}}
  timeline: "id", // {id, date, time, activity, category, note}
  achievements: "id", // {id, date, text}
  tasks: "id", // {id, date, text, status, completedAt}
  learning: "id", // {id, date, whatLearned, whatUnderstood, whatConfused, importantIdea, resource}
  money: "id", // {id, date, type, amount, currency, category, note}
  habits: "id", // {id, name, emoji, color, createdAt, archived}
  habitEntries: "id", // {id (`${habitId}:${date}`), habitId, date, done}
  goals: "id", // {id, title, description, category, startDate, targetDate, progress, status, milestones:[], notes}
  memories: "id", // {id, date, type, text, attachmentId, createdAt}
  attachments: "id", // {id, mime, dataUrl, filename}
  mindEntries: "id", // {id, date, time, mood, energy, stress, focus, thought}
  settings: "id", // single row {id:"app", ...}
};

const DATE_INDEXED = ["timeline", "achievements", "tasks", "learning", "money", "memories", "mindEntries"];

let _dbPromise = null;
function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB unavailable")); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      Object.entries(STORES).forEach(([name, keyPath]) => {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath });
          if (DATE_INDEXED.includes(name)) store.createIndex("by_date", "date", { unique: false });
          if (name === "habitEntries") store.createIndex("by_habit", "habitId", { unique: false });
        }
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

export async function dbPut(storeName, value) {
  const store = await tx(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.put(value);
    req.onsuccess = () => resolve(value);
    req.onerror = () => reject(req.error);
  });
}

export async function dbGet(storeName, key) {
  const store = await tx(storeName, "readonly");
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function dbDelete(storeName, key) {
  const store = await tx(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function dbGetAll(storeName) {
  const store = await tx(storeName, "readonly");
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function dbGetByDate(storeName, date) {
  const store = await tx(storeName, "readonly");
  return new Promise((resolve, reject) => {
    const idx = store.index("by_date");
    const req = idx.getAll(date);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function dbGetByHabit(habitId) {
  const store = await tx("habitEntries", "readonly");
  return new Promise((resolve, reject) => {
    const idx = store.index("by_habit");
    const req = idx.getAll(habitId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function dbClearAll() {
  const db = await openDB();
  const names = Object.keys(STORES);
  await Promise.all(
    names.map(
      (name) =>
        new Promise((resolve, reject) => {
          const req = db.transaction(name, "readwrite").objectStore(name).clear();
          req.onsuccess = () => resolve(true);
          req.onerror = () => reject(req.error);
        })
    )
  );
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/* ---------- image compression (mirrors the trading journal's
   own compressImage helper, kept independent on purpose) ---------- */
export function compressImage(file, maxDim = 1024, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ============================================================
   READ-ONLY BRIDGE INTO THE EXISTING TRADES DATABASE
   Never opens it for writing. Used only to:
     1. show a trade count / quick summary on a given Life Day
     2. include trades in a combined backup export (Part 25)
   ============================================================ */
const TRADES_DB_NAME = "esOrderFlowJournal";
const TRADES_STORE = "kv";

export async function readTradesKV(key) {
  // CRITICAL: indexedDB.open(name) — even with no version argument — CREATES
  // the database if it doesn't exist yet, and does so with zero object
  // stores (no onupgradeneeded handler here to create one). If Lfenwa
  // Trades' own bundle.js hasn't been opened yet in this browser profile
  // (e.g. brand-new install, user hasn't tapped the Trades tab yet), an
  // earlier, cruder version of this function would silently create an
  // empty "esOrderFlowJournal" at version 1 — and then Lfenwa Trades'
  // own indexedDB.open(name, 1) call would see "already at version 1"
  // and skip onupgradeneeded, permanently starting the journal with no
  // "kv" store at all. Caught by the automated test suite before it
  // could ever reach a real device — see docs/ARCHITECTURE.md.
  //
  // The fix: check whether the database already exists first, and if it
  // doesn't, don't touch it at all — return "no data yet" instead. Only
  // Lfenwa Trades' own code is ever allowed to create that database.
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") { resolve(null); return; }
    if (typeof indexedDB.databases !== "function") { resolve(null); return; } // can't safely check — refuse to risk creating it
    indexedDB
      .databases()
      .then((dbs) => {
        if (!dbs.some((d) => d.name === TRADES_DB_NAME)) { resolve(null); return; }
        const req = indexedDB.open(TRADES_DB_NAME);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(TRADES_STORE)) { db.close(); resolve(null); return; }
          const r = db.transaction(TRADES_STORE, "readonly").objectStore(TRADES_STORE).get(key);
          r.onsuccess = () => { db.close(); resolve(r.result != null ? JSON.parse(r.result) : null); };
          r.onerror = () => { db.close(); resolve(null); };
        };
        req.onerror = () => resolve(null);
      })
      .catch(() => resolve(null));
  });
}

export async function getTradesForDate(date) {
  const trades = (await readTradesKV("trades")) || [];
  return trades.filter((t) => t.date === date);
}

export async function getTradeCountsByDate() {
  const trades = (await readTradesKV("trades")) || [];
  const map = {};
  trades.forEach((t) => { map[t.date] = (map[t.date] || 0) + 1; });
  return map;
}

/* ============================================================
   BACKUP / RESTORE (Part 25)
   ============================================================ */
export async function exportFullBackup() {
  const names = Object.keys(STORES);
  const data = {};
  for (const name of names) data[name] = await dbGetAll(name);
  // Fold in the trading journal (read-only) so ONE backup file covers the whole app.
  const tradesPayload = {
    trades: (await readTradesKV("trades")) || [],
    noTrades: (await readTradesKV("notrades")) || [],
    days: (await readTradesKV("days")) || {},
    playbook: (await readTradesKV("playbook")) || [],
    settings: (await readTradesKV("settings")) || {},
  };
  return {
    schema: 1,
    app: "Lfnawa Days",
    exportedAt: new Date().toISOString(),
    life: data,
    trades: tradesPayload,
  };
}

// Import never touches the trades database — a trades backup/restore
// stays inside Lfenwa Trades' own Settings screen, unchanged from
// before. This keeps the one destructive-import code path scoped to
// data this file actually owns.
export async function importLifeBackup(payload, mode = "merge") {
  if (!payload || typeof payload !== "object" || !payload.life) {
    return { ok: false, error: "This doesn't look like a Lfnawa Days backup file." };
  }
  const names = Object.keys(STORES);
  let counts = {};
  if (mode === "replace") await dbClearAll();
  for (const name of names) {
    const incoming = Array.isArray(payload.life[name]) ? payload.life[name] : [];
    for (const item of incoming) {
      if (mode === "merge") {
        // upsert by primary key — never wipes what's already on this device
        await dbPut(name, item);
      } else {
        await dbPut(name, item);
      }
    }
    counts[name] = incoming.length;
  }
  return { ok: true, counts };
}

export function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
