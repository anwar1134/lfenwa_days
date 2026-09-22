/* Date helpers on the app's existing convention: YYYY-MM-DD strings computed in UTC
   (lib/storage.ts todayStr()). Pure, timezone-free. */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDate(date: string): boolean {
  const m = typeof date === "string" ? DATE_RE.exec(date) : null;
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** `date` shifted by `days` (negative = earlier). Throws on an invalid date. */
export function addDays(date: string, days: number): string {
  if (!isValidDate(date)) throw new Error(`Invalid date "${date}"`);
  const m = DATE_RE.exec(date)!;
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return t.toISOString().slice(0, 10);
}

/** The UTC date of an epoch-ms timestamp — the same convention as todayStr(). */
export function dateOfTimestamp(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** [today - daysBack … today], oldest first. */
export function recentDates(today: string, daysBack: number): string[] {
  const out: string[] = [];
  for (let i = daysBack; i >= 0; i--) out.push(addDays(today, -i));
  return out;
}

/**
 * An event may earn XP only if its date is today or at most `daysBack` days
 * before it. Future dates and anything older (or malformed) are NOT eligible.
 * Eligibility affects only rewards — the event is still recorded as a fact.
 */
export function isEligibleDate(eventDate: string, today: string, daysBack: number): boolean {
  if (!isValidDate(eventDate) || !isValidDate(today)) return false;
  return eventDate <= today && eventDate >= addDays(today, -Math.max(0, Math.floor(daysBack)));
}
