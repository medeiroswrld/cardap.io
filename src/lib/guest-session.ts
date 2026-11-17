import { requestJson } from "./client-api";
const pending = new Map<string, Promise<unknown>>();
// The server keeps a guest session for 12 hours (cookie guest_<id>). Remember a
// successful creation for 30 minutes so photo views, cart events and orders do
// not POST /session again on every call (the server rate-limits sessions per IP).
const REMEMBER_MS = 30 * 60 * 1000;
const created = new Map<string, number>();

export async function ensureGuestSession(id: string, now = Date.now()) {
  const at = created.get(id);
  if (at !== undefined && now - at < REMEMBER_MS) return;
  let request = pending.get(id);
  if (!request) {
    request = requestJson(`/api/restaurants/${id}/session`, {})
      .then((result) => {
        created.set(id, Date.now());
        return result;
      })
      .finally(() => pending.delete(id));
    pending.set(id, request);
  }
  await request;
}

// Call when an API answers that the guest session expired, so the next call recreates it.
export function forgetGuestSession(id: string) {
  created.delete(id);
}
