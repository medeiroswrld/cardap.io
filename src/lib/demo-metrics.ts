import { useMemo, useSyncExternalStore } from "react";

const KEY = "brasa:demo:video-views:v1";
const EVENT = "brasa:demo-metrics";
export type DemoVideoView = {
  id: string;
  productId: string;
  version: string;
  createdAt: string;
  watched: number;
  coverage: number;
  qualified: boolean;
};

function snapshot() {
  try {
    return localStorage.getItem(KEY) || "[]";
  } catch {
    return "[]";
  }
}
function parse(raw: string): DemoVideoView[] {
  try {
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
function subscribe(changed: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) changed();
  };
  window.addEventListener(EVENT, changed);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(EVENT, changed);
    window.removeEventListener("storage", storage);
  };
}
export function recordDemoView(view: DemoVideoView) {
  const cutoff = Date.now() - 30 * 86400000;
  const rows = parse(snapshot()).filter(
    (row) => row.id !== view.id && Date.parse(row.createdAt) >= cutoff,
  );
  localStorage.setItem(KEY, JSON.stringify([...rows, view].slice(-10000)));
  window.dispatchEvent(new Event(EVENT));
}
export function useDemoViews() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "[]");
  return useMemo(() => parse(raw), [raw]);
}
