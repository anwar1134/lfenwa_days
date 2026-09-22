/* Shared helpers for the Lfenwa System tests. Run them with tests/system/run.sh.
   These tests run with tsx against an in-memory IndexedDB (fake-indexeddb);
   neither is a project dependency — run.sh installs them into a temp dir. */
import assert from "node:assert/strict";

export const P = (v: unknown) => JSON.stringify(v);

/**
 * Tiny test runner: prints PASS/FAIL per case and a summary. `done()` waits for
 * every case to finish, and exits 1 on any failure OR if no test ran at all
 * (so a mistake that skips the tests can never look like a pass).
 */
export function createRunner(label: string) {
  let pass = 0;
  let fail = 0;
  const running: Promise<void>[] = [];
  return {
    t(name: string, fn: () => void | Promise<void>): Promise<void> {
      const p = (async () => {
        try {
          await fn();
          pass++;
          console.log("PASS", name);
        } catch (e) {
          fail++;
          console.log("FAIL", name, "\n   ", (e as Error).message.split("\n").slice(0, 3).join(" | "));
        }
      })();
      running.push(p);
      return p;
    },
    async done() {
      await Promise.all(running);
      console.log(`[${label}] ${pass} passed, ${fail} failed`);
      if (pass + fail === 0) {
        console.log(`[${label}] ERROR: no tests ran`);
        process.exit(1);
      }
      process.exit(fail ? 1 : 0);
    },
  };
}

/* ---- the ORIGINAL (pre-System) v1 database layout, transcribed from the untouched lib/storage.ts ---- */
export const V1_STORES: Record<string, string> = { days: "date", timeline: "id", achievements: "id", tasks: "id", learning: "id", money: "id", habits: "id", habitEntries: "id", goals: "id", memories: "id", attachments: "id", mindEntries: "id", settings: "id" };
export const V1_DATE = ["timeline", "achievements", "tasks", "learning", "money", "memories", "mindEntries"];
export const NEW_STORES = ["system", "quests", "systemEvents"];

export function rawOpen(name: string, version: number, upgrade?: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(name, version);
    r.onupgradeneeded = () => upgrade?.(r.result);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export function rawPutAll(db: IDBDatabase, store: string, rows: unknown[]): Promise<void> {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, "readwrite");
    rows.forEach((r) => tx.objectStore(store).put(r));
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

/** Create a v1 lfnawaDaysDB (13 stores) filled with realistic user data; returns the rows written. */
export async function makeV1WithData(today = "2026-09-19") {
  const db = await rawOpen("lfnawaDaysDB", 1, (d) => {
    for (const [name, kp] of Object.entries(V1_STORES)) {
      const s = d.createObjectStore(name, { keyPath: kp });
      if (V1_DATE.includes(name)) s.createIndex("by_date", "date", { unique: false });
      if (name === "habitEntries") s.createIndex("by_habit", "habitId", { unique: false });
    }
  });
  const data: Record<string, unknown[]> = {
    days: [{ date: "2026-09-18", wakeTime: "07:00", sleepHours: 7, note: "n", metrics: { mood: 8, energy: 6 }, review: { best: "x", rating: 9 } }],
    tasks: [{ id: "t1", date: today, text: "Write report", status: "done", completedAt: 1758230000000 }, { id: "t2", date: today, text: "Gym", status: "pending" }, { id: "t3", date: "2026-09-18", text: "Old", status: "postponed" }],
    habits: [{ id: "h1", name: "Exercise", createdAt: 1, archived: false }, { id: "h2", name: "Study", createdAt: 2, archived: true }],
    habitEntries: [{ id: "h1:2026-09-18", habitId: "h1", date: "2026-09-18", done: true }, { id: "h1:" + today, habitId: "h1", date: today, done: false }],
    money: [{ id: "m1", date: today, type: "expense", amount: 42.5, currency: "DH", category: "Food", note: "lunch" }],
    goals: [{ id: "g1", title: "Learn", category: "Learning", progress: 40, status: "active", milestones: [{ id: "ms", text: "a", done: true }] }],
    learning: [{ id: "l1", date: today, whatLearned: "TEMI basics" }],
    memories: [{ id: "mem1", date: today, type: "text", text: "nice", attachmentId: null, createdAt: 5 }],
    attachments: [{ id: "a1", mime: "image/jpeg", dataUrl: "data:image/jpeg;base64,AAAA", filename: "p.jpg" }],
    settings: [{ id: "app", defaultCurrency: "MAD" }],
    timeline: [{ id: "tl1", date: today, time: "09:00", activity: "Study", category: "Work/Study" }],
    achievements: [{ id: "ac1", date: today, text: "Shipped it" }],
    mindEntries: [{ id: "me1", date: today, time: "10:00", mood: 7, thought: "ok" }],
  };
  for (const [s, rows] of Object.entries(data)) await rawPutAll(db, s, rows);
  db.close();
  return data;
}

export async function dbList() {
  return (await indexedDB.databases()).map((d) => `${d.name}@${d.version}`).sort();
}

/** Assert every row in every original store equals what was written (used after upgrades / System activity). */
export async function assertOriginalDataIntact(storage: { dbGetAll: (n: never) => Promise<unknown[]> }, before: Record<string, unknown[]>) {
  for (const [name, rows] of Object.entries(before)) {
    const after = await storage.dbGetAll(name as never);
    assert.equal(after.length, rows.length, `${name}: row count`);
    const key = V1_STORES[name];
    const byKey = (a: unknown[]) => Object.fromEntries((a as Record<string, unknown>[]).map((r) => [String(r[key]), P(r)]));
    assert.deepEqual(byKey(after), byKey(rows), `${name}: contents`);
  }
}
