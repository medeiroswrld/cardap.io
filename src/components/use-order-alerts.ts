"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ALERT_REPEAT_MS, pendingCount, shouldPlayAlert } from "@/lib/order-alerts";
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

// Browsers block audio until a user gesture, so alerts start with "Ativar alertas".
export function useOrderAlerts(orders: RealOrder[]) {
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
  const pending = pendingCount(orders);

  const enable = useCallback(async () => {
    audio.current ??= new AudioContext();
    await audio.current.resume();
    if ("Notification" in window && Notification.permission === "default")
      await Notification.requestPermission();
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

  const check = useCallback(() => {
    const ids = orders.map((o) => o.id);
    if (seen.current === null) {
      seen.current = new Set(ids); // first load is not "new"
      return;
    }
    const fresh = ids.filter((id) => !seen.current!.has(id));
    fresh.forEach((id) => seen.current!.add(id));
    const now = Date.now();
    if (
      enabled &&
      audio.current &&
      shouldPlayAlert({ pending, newOrderIds: fresh, lastPlayedAt: lastPlayed.current, now, muted })
    ) {
      chime(audio.current);
      lastPlayed.current = now;
      if (document.hidden && "Notification" in window && Notification.permission === "granted")
        new Notification(pending ? `${pending} pedido(s) aguardando aceite` : "Novo pedido");
    }
  }, [orders, pending, enabled, muted]);

  useEffect(() => {
    check();
    const timer = setInterval(check, ALERT_REPEAT_MS);
    return () => clearInterval(timer);
  }, [check]);

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) Novo pedido · /, "");
    document.title = pending ? `(${pending}) Novo pedido · ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [pending]);

  return { enabled, muted, enable, toggleMute };
}
