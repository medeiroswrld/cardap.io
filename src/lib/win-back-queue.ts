// Win-back "send the next one" queue: remembers, per device, who was already called.
// Pure helpers so the queue rules are testable without a browser.

export type ContactedLog = Record<string, string>; // contact id -> day (YYYY-MM-DD) it was called

export const RECENT_DAYS = 7;
const KEEP_DAYS = 60;

function dayNumber(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

export function storageKey(restaurantId: string) {
  return `fomeplay:winback:${restaurantId}`;
}

export function parseLog(raw: string | null): ContactedLog {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const log: ContactedLog = {};
    for (const [id, day] of Object.entries(value)) {
      if (typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)) log[id] = day;
    }
    return log;
  } catch {
    return {};
  }
}

// Called within the last RECENT_DAYS days (today included).
export function contactedRecently(log: ContactedLog, id: string, today: string): boolean {
  const day = log[id];
  if (!day) return false;
  const diff = dayNumber(today) - dayNumber(day);
  return diff >= 0 && diff < RECENT_DAYS;
}

export function markContacted(log: ContactedLog, id: string, today: string): ContactedLog {
  const next: ContactedLog = {};
  for (const [key, day] of Object.entries(log)) {
    if (dayNumber(today) - dayNumber(day) < KEEP_DAYS) next[key] = day;
  }
  next[id] = today;
  return next;
}

// Index of the next row to call, skipping people called recently and those skipped in this session.
export function nextInQueue(
  ids: string[],
  log: ContactedLog,
  skipped: ReadonlySet<string>,
  today: string,
): number {
  return ids.findIndex((id) => !skipped.has(id) && !contactedRecently(log, id, today));
}
