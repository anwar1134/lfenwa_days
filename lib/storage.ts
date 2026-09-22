/* ============================================================
   LFNAWA DAYS — LOCAL-FIRST STORAGE LAYER (TypeScript)
   ============================================================
   A brand-new IndexedDB database, completely separate from the
   existing trading journal's database ("esOrderFlowJournal").
   This is deliberate and important, and UNCHANGED by the Next.js
   migration:

     - Lfenwa Trades keeps using its own untouched database/schema
       (see public/trades/bundle.js) — nothing here ever opens,
       reads, or writes to "esOrderFlowJournal" except the small
       read-only helper at the bottom of this file, used only to
       show trade counts on a Life Day, power search, and fold
       trades into a full backup export. It never mutates that
       database.
     - This file's database ("lfnawaDaysDB") stores everything
       else: days, timeline, tasks, achievements, learning, money,
       habits, goals, memories, mind entries, and settings — plus,
       since DB version 2, the Lfenwa System's profile, quests and
       XP event log (see docs/SYSTEM.md).

   Two separate databases means a bug or migration in one can
   never corrupt or delete data in the other.

   This file is a line-for-line TypeScript port of the original
   app/src/life/storage.js — the logic itself was NOT rewritten,
   only typed. See docs/NEXTJS_MIGRATION.md for the full account.
   ============================================================ */

import type {
  StoreName,
  StoreValueMap,
  HabitEntry,
  LifeBackupPayload,
  ImportResult,
  TradeLike,
  NoTradeLike,
  PlaybookEntryLike,
} from "@/types/life";

const DB_NAME = "lfnawaDaysDB";
// v1 -> v2 (Lfenwa System): PURELY ADDITIVE. The upgrade handler below only
// creates stores that don't exist yet, so every v1 store and every row in it
// is left exactly as it was. All three System stores are added in this ONE
// bump so later System phases never need another schema change.
// Note: an app build that still says DB_VERSION = 1 cannot open a v2 database
// (IndexedDB refuses downgrades) — data is safe, but that older build won't
// start on a profile that has already been upgraded.
const DB_VERSION = 2;

const STORES: Record<StoreName, string> = {
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
  system: "id", // single row {id:"profile", totalXp, stats:{...}} — Lfenwa System profile
  quests: "id", // {id, kind, date, title, status, xpReward, statRewards, completedAt} — System quests
  systemEvents: "id", // {id (idempotency key), date, at, source, label, xp, stats} — System XP log
};

const DATE_INDEXED: StoreName[] = ["timeline", "achievements", "tasks", "learning", "money", "memories", "mindEntries", "quests", "systemEvents"];

// Stores owned by the Lfenwa System. importLifeBackup() treats these specially so
// restoring an OLD backup (which predates them) can never wipe System progress.
const SYSTEM_STORES: StoreName[] = ["system", "quests", "systemEvents"];

let _dbPromise: Promise<IDBDatabase> | null = null;
function openDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      (Object.entries(STORES) as [StoreName, string][]).forEach(([name, keyPath]) => {
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

function tx(storeName: StoreName, mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

export async function dbPut<K extends StoreName>(storeName: K, value: StoreValueMap[K]): Promise<StoreValueMap[K]> {
  const store = await tx(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.put(value);
    req.onsuccess = () => resolve(value);
    req.onerror = () => reject(req.error);
  });
}

export async function dbGet<K extends StoreName>(storeName: K, key: IDBValidKey): Promise<StoreValueMap[K] | null> {
  const store = await tx(storeName, "readonly");
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve((req.result as StoreValueMap[K]) || null);
    req.onerror = () => reject(req.error);
  });
}

export async function dbDelete(storeName: StoreName, key: IDBValidKey): Promise<boolean> {
  const store = await tx(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function dbGetAll<K extends StoreName>(storeName: K): Promise<StoreValueMap[K][]> {
  const store = await tx(storeName, "readonly");
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as StoreValueMap[K][]) || []);
    req.onerror = () => reject(req.error);
  });
}

export async function dbGetByDate<K extends StoreName>(storeName: K, date: string): Promise<StoreValueMap[K][]> {
  const store = await tx(storeName, "readonly");
  return new Promise((resolve, reject) => {
    const idx = store.index("by_date");
    const req = idx.getAll(date);
    req.onsuccess = () => resolve((req.result as StoreValueMap[K][]) || []);
    req.onerror = () => reject(req.error);
  });
}

export async function dbGetByHabit(habitId: string): Promise<HabitEntry[]> {
  const store = await tx("habitEntries", "readonly");
  return new Promise((resolve, reject) => {
    const idx = store.index("by_habit");
    const req = idx.getAll(habitId);
    req.onsuccess = () => resolve((req.result as HabitEntry[]) || []);
    req.onerror = () => reject(req.error);
  });
}

/* ---------- multi-store transactions ----------
   The single-store helpers above open a fresh transaction per call, which is
   right for almost everything. The Lfenwa System needs the opposite in one
   place: "record the XP event AND update the profile" must succeed or fail
   TOGETHER (and check for a duplicate event in the same breath), so it uses
   one transaction spanning several stores. Only await IDB requests (via
   idbReq) inside `work` — awaiting anything else lets the transaction close. */
export function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function dbTransaction<T>(storeNames: StoreName[], mode: IDBTransactionMode, work: (t: IDBTransaction) => Promise<T>): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    const workDone = (async () => work(t))();
    workDone.catch((err) => {
      try {
        t.abort(); // roll back anything `work` already wrote
      } catch {
        /* transaction already finished */
      }
      reject(err);
    });
    t.oncomplete = () => {
      workDone.then(resolve, reject);
    };
    t.onabort = () => reject(t.error || new Error("IndexedDB transaction aborted"));
  });
}

export async function dbClearAll(only?: StoreName[]): Promise<void> {
  const db = await openDB();
  const names = only ?? (Object.keys(STORES) as StoreName[]);
  await Promise.all(
    names.map(
      (name) =>
        new Promise<boolean>((resolve, reject) => {
          const req = db.transaction(name, "readwrite").objectStore(name).clear();
          req.onsuccess = () => resolve(true);
          req.onerror = () => reject(req.error);
        })
    )
  );
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ---------- image compression (mirrors the trading journal's
   own compressImage helper, kept independent on purpose) ---------- */
export function compressImage(file: File, maxDim = 1024, quality = 0.72): Promise<string> {
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
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ============================================================
   READ-ONLY BRIDGE INTO THE EXISTING TRADES DATABASE
   Never opens it for writing. Used only to:
     1. show a trade count / quick summary on a given Life Day
     2. include trades in a combined backup export
     3. power search across trading notes
   ============================================================ */
const TRADES_DB_NAME = "esOrderFlowJournal";
const TRADES_STORE = "kv";

export async function readTradesKV(key: string): Promise<unknown> {
  // CRITICAL: indexedDB.open(name) — even with no version argument — CREATES
  // the database if it doesn't exist yet, and does so with zero object
  // stores (no onupgradeneeded handler here to create one). If Lfenwa
  // Trades' own bundle.js hasn't been opened yet in this browser profile
  // (e.g. brand-new install, user hasn't tapped the Trades tab yet), an
  // earlier, cruder version of this function would silently create an
  // empty "esOrderFlowJournal" at version 1 — and then Lfenwa Trades'
  // own indexedDB.open(name, 1) call would see "already at version 1"
  // and skip onupgradeneeded, permanently starting the journal with no
  // "kv" store at all.
  //
  // The fix: check whether the database already exists first, and if it
  // doesn't, don't touch it at all — return "no data yet" instead. Only
  // Lfenwa Trades' own code is ever allowed to create that database.
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    if (typeof indexedDB.databases !== "function") {
      resolve(null); // can't safely check — refuse to risk creating it
      return;
    }
    indexedDB
      .databases()
      .then((dbs) => {
        if (!dbs.some((d) => d.name === TRADES_DB_NAME)) {
          resolve(null);
          return;
        }
        const req = indexedDB.open(TRADES_DB_NAME);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(TRADES_STORE)) {
            db.close();
            resolve(null);
            return;
          }
          const r = db.transaction(TRADES_STORE, "readonly").objectStore(TRADES_STORE).get(key);
          r.onsuccess = () => {
            db.close();
            resolve(r.result != null ? JSON.parse(r.result) : null);
          };
          r.onerror = () => {
            db.close();
            resolve(null);
          };
        };
        req.onerror = () => resolve(null);
      })
      .catch(() => resolve(null));
  });
}

export async function getTradesForDate(date: string): Promise<TradeLike[]> {
  const trades = ((await readTradesKV("trades")) as TradeLike[] | null) || [];
  return trades.filter((t) => t.date === date);
}

export async function getTradeCountsByDate(): Promise<Record<string, number>> {
  const trades = ((await readTradesKV("trades")) as TradeLike[] | null) || [];
  const map: Record<string, number> = {};
  trades.forEach((t) => {
    map[t.date] = (map[t.date] || 0) + 1;
  });
  return map;
}

/* ============================================================
   BACKUP / RESTORE
   ============================================================ */
export async function exportFullBackup(): Promise<LifeBackupPayload> {
  const names = Object.keys(STORES) as StoreName[];
  const data = {} as { [K in StoreName]: StoreValueMap[K][] };
  for (const name of names) {
    (data as Record<StoreName, unknown>)[name] = await dbGetAll(name);
  }
  // Fold in the trading journal (read-only) so ONE backup file covers the whole app.
  const tradesPayload = {
    trades: ((await readTradesKV("trades")) as TradeLike[] | null) || [],
    noTrades: ((await readTradesKV("notrades")) as NoTradeLike[] | null) || [],
    days: ((await readTradesKV("days")) as Record<string, unknown> | null) || {},
    playbook: ((await readTradesKV("playbook")) as PlaybookEntryLike[] | null) || [],
    settings: ((await readTradesKV("settings")) as Record<string, unknown> | null) || {},
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
export async function importLifeBackup(payload: unknown, mode: "merge" | "replace" = "merge"): Promise<ImportResult> {
  if (!payload || typeof payload !== "object" || !("life" in payload)) {
    return { ok: false, error: "This doesn't look like a Lfnawa Days backup file." };
  }
  const life = (payload as { life: Record<string, unknown> }).life;
  const names = Object.keys(STORES) as StoreName[];
  const counts: Partial<Record<StoreName, number>> = {};
  if (mode === "replace") {
    // A backup made before the Lfenwa System existed has no System stores.
    // "Replace" must not silently erase System progress just because the
    // backup predates it, so only clear a System store if the backup
    // actually carries it. Every pre-existing store behaves exactly as before.
    await dbClearAll(names.filter((n) => !SYSTEM_STORES.includes(n) || Array.isArray(life[n])));
  }
  for (const name of names) {
    const incoming = Array.isArray(life[name]) ? (life[name] as StoreValueMap[typeof name][]) : [];
    for (const item of incoming) {
      // Merge must never LOWER System progress. The profile is a single row of running
      // totals, so upserting an older backup's row would roll XP/stats back below what
      // the XP log still records. Keep whichever profile has more XP (a malformed
      // incoming profile never wins). Replace mode cleared the store above, so it is
      // unaffected.
      if (name === "system" && mode === "merge") {
        const current = await dbGet("system", "profile");
        const incomingXp = Number((item as StoreValueMap["system"]).totalXp);
        if (current && !(incomingXp >= current.totalXp)) continue;
      }
      // upsert by primary key — never wipes what's already on this device
      await dbPut(name, item);
    }
    counts[name] = incoming.length;
  }
  return { ok: true, counts };
}

export function downloadFile(filename: string, content: string, mime: string): void {
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
