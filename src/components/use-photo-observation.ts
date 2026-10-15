"use client";
import { useEffect } from "react";
import type { Product } from "@/lib/types";
import { ensureGuestSession } from "@/lib/guest-session";

export function usePhotoObservation(
  ref: React.RefObject<HTMLImageElement | null>,
  product: Product,
  disabled: boolean,
) {
  const restaurant = product.photoAnalytics?.restaurantId;
  const photo = product.photoAnalytics?.url;
  useEffect(() => {
    const img = ref.current;
    if (!img || !restaurant || !photo || disabled) return;
    let visible = false;
    let seconds = 0;
    let sent = 0;
    let at = performance.now();
    let sequence = 0;
    let sending = false;
    const id = crypto.randomUUID();
    const sample = () => {
      const now = performance.now();
      const delta = (now - at) / 1000;
      if (
        visible &&
        !document.hidden &&
        img.complete &&
        img.naturalWidth > 0 &&
        img.getAttribute("src") === photo &&
        delta <= 1
      )
        seconds = Math.min(3600, seconds + delta);
      at = now;
    };
    const flush = async () => {
      if (seconds < 1 || seconds <= sent || sending) return;
      sending = true;
      // Keep retries within the server's elapsed-time limit after network loss.
      const measured = Math.min(seconds, sent + 5);
      try {
        await ensureGuestSession(restaurant);
        const response = await fetch(
          `/api/restaurants/${restaurant}/photo-views`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            keepalive: true,
            body: JSON.stringify({
              id,
              product_id: product.id,
              photo_url: photo,
              sequence: ++sequence,
              visible_seconds: measured,
            }),
          },
        );
        if (response.ok) sent = measured;
      } catch {
        /* Analytics must not interrupt the menu. */
      } finally {
        sending = false;
      }
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        sample();
        visible = entry.intersectionRatio >= 0.5;
        if (!visible) void flush();
      },
      { threshold: [0, 0.5] },
    );
    observer.observe(img);
    const sampler = setInterval(sample, 250);
    const timer = setInterval(() => void flush(), 3000);
    const visibility = () => {
      sample();
      if (document.hidden) void flush();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      sample();
      clearInterval(sampler);
      clearInterval(timer);
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      void flush();
    };
  }, [ref, restaurant, photo, product.id, disabled]);
}
