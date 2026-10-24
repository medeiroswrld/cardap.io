"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { pendingCount, shouldPlayAlert } from "@/lib/order-alerts";
import type { RealOrder } from "@/lib/connected-types";

const MUTE_KEY = "gestao:alertas:mudo";

function chime(context: AudioContext) {
  const now = context.currentTime;
  for (const [offset, frequency] of [[0, 880], [0.18, 1175]] as const) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.16);
    osc.connect(gain).connect(context.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.18);
  }
}

// Prefer an existing service worker registration (required on Android Chrome);
// never registers one. Any failure is swallowed: alerts must not break the board.
function notify(title: string) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
  } catch {
    return;
  }
  const fallback = () => {
    try {
      new Notification(title);
    } catch {}
  };
  const workers = navigator.serviceWorker;
  if (!workers) return fallback();
  workers
    .getRegistration()
    .then((registration) =>
      registration ? registration.showNotification(title) : fallback(),
    )
    .catch(fallback);
}

// Checks often so the repeat follows ALERT_REPEAT_MS closely; the rule itself is pure.
const TICK_MS = 1000;

// Browsers block audio until a user gesture, so alerts start with "Ativar alertas".
// `orders` is undefined until the first load, so existing orders never chime as new.
export function useOrderAlerts(orders: RealOrder[] | undefined) {
  const audio = useRef<AudioContext | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const lastPlayed = useRef<number | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const pending = orders ? pendingCount(orders) : 0;
  const live = useRef({ pending, enabled, muted });
  // Declared first so the effects below always read this render's values.
  useEffect(() => {
    live.current = { pending, enabled, muted };
  }, [pending, enabled, muted]);

  const play = useCallback((fresh: string[]) => {
    const { pending, enabled, muted } = live.current;
    const now = Date.now();
    if (
      !enabled ||
      !shouldPlayAlert({ pending, newOrderIds: fresh, lastPlayedAt: lastPlayed.current, now, muted })
    )
      return;
    lastPlayed.current = now;
    if (audio.current)
      try {
        chime(audio.current);
      } catch {}
    if (document.hidden) notify(pending ? `${pending} pedido(s) aguardando aceite` : "Novo pedido");
  }, []);

  // New data: only ids not seen before count as new orders.
  useEffect(() => {
    if (!orders) return;
    const ids = orders.map((o) => o.id);
    if (seen.current === null) {
      seen.current = new Set(ids); // first load is not "new"
      return;
    }
    const fresh = ids.filter((id) => !seen.current!.has(id));
    fresh.forEach((id) => seen.current!.add(id));
    if (fresh.length) play(fresh);
  }, [orders, play]);

  // One timer for the whole session; data refreshes do not reset the cadence.
  useEffect(() => {
    const timer = setInterval(() => play([]), TICK_MS);
    return () => clearInterval(timer);
  }, [play]);

  // Runs inside the click: permission is requested before any await, and a
  // failure in one part (audio or notifications) still enables the other.
  const enable = useCallback(() => {
    try {
      if ("Notification" in window && Notification.permission === "default")
        Promise.resolve(Notification.requestPermission()).catch(() => {});
    } catch {}
    try {
      audio.current ??= new AudioContext();
      audio.current.resume().catch(() => {});
    } catch {}
    setEnabled(true);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((value) => {
      try {
        localStorage.setItem(MUTE_KEY, value ? "0" : "1");
      } catch {}
      return !value;
    });
  }, []);

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) Novo pedido · /, "");
    document.title = pending ? `(${pending}) Novo pedido · ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [pending]);

  return { enabled, muted, enable, toggleMute };
}
