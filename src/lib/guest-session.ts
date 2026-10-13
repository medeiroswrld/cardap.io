import { requestJson } from "./client-api";
const pending = new Map<string, Promise<unknown>>();
export async function ensureGuestSession(id: string) {
  let request = pending.get(id);
  if (!request) {
    request = requestJson(`/api/restaurants/${id}/session`, {}).finally(() =>
      pending.delete(id),
    );
    pending.set(id, request);
  }
  await request;
}
