"use client";
import { useContext, useEffect } from "react";
import { DemoContext } from "./demo-provider";
import { recordDemoView } from "@/lib/demo-metrics";
import type { Product } from "@/lib/types";
import { ensureGuestSession } from "@/lib/guest-session";
import {
  mergeSegments,
  observationDelta,
  type Segment,
} from "@/lib/video-observation";
export function useVideoObservation(
  ref: React.RefObject<HTMLVideoElement | null>,
  product: Product,
  preview: boolean,
) {
  const meta = product.analytics;
  const demo = useContext(DemoContext)?.mode === "demo";
  useEffect(() => {
    const video = ref.current;
    if (!video || (!meta && !demo) || preview || !product.video) return;
    let visible = false;
    let blocked = false;
    let watched = 0;
    let lastWatched = 0;
    let segments: Segment[] = [];
    let previous = video.currentTime;
    let at = performance.now();
    let sequence = 0;
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    let sending = false;
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0].intersectionRatio >= 0.5;
      },
      { threshold: [0, 0.5] },
    );
    observer.observe(video);
    async function flush() {
      if (watched <= lastWatched || sending) return;
      sending = true;
      const measured = watched;
      try {
        if (demo) {
          const covered = segments.reduce(
            (total, [start, end]) => total + end - start,
            0,
          );
          recordDemoView({
            id,
            createdAt,
            productId: product.id,
            version: product.video!,
            watched: measured,
            coverage:
              Number.isFinite(video!.duration) && video!.duration > 0
                ? Math.min(1, covered / video!.duration)
                : 0,
            qualified: measured >= 1,
          });
          lastWatched = measured;
          return;
        }
        await ensureGuestSession(meta!.restaurantId);
        const response = await fetch(
          `/api/restaurants/${meta!.restaurantId}/views`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            keepalive: true,
            body: JSON.stringify({
              id,
              media_id: meta!.mediaId,
              version: meta!.version,
              product_id: product.id,
              position: meta!.position,
              sequence: ++sequence,
              watched_seconds: measured,
              segments,
            }),
          },
        );
        if (response.ok) lastWatched = measured;
      } catch {
        /* Observation loss must not interrupt ordering. */
      } finally {
        sending = false;
      }
    }
    const sample = (finishing = false) => {
      const now = performance.now();
      const elapsed = (now - at) / 1000;
      const current = video!.currentTime;
      if (
        visible &&
        !document.hidden &&
        (finishing || (!video!.paused && !video!.ended)) &&
        !video!.seeking &&
        !blocked &&
        video!.readyState >= 3
      ) {
        const wrapped =
          video!.loop && Number.isFinite(video!.duration) && current < previous;
        const endpoint = wrapped ? video!.duration + current : current;
        const delta = observationDelta(
          previous,
          endpoint,
          elapsed,
          video!.playbackRate,
        );
        if (delta > 0) {
          watched = Math.min(3600, watched + delta);
          const observed: Segment[] = wrapped
            ? [
                [previous, video!.duration],
                [0, current],
              ]
            : [[previous, current]];
          segments = mergeSegments([...segments, ...observed]).slice(0, 180);
        }
      }
      previous = current;
      at = now;
    };
    const sampler = setInterval(sample, 250);
    const finish = () => {
      sample(true);
      void flush();
    };
    const waiting = () => {
      blocked = true;
    };
    const playing = () => {
      blocked = false;
      previous = video!.currentTime;
      at = performance.now();
    };
    const hidden = () => {
      if (document.hidden) void flush();
    };
    const timer = setInterval(() => void flush(), 5000);
    video.addEventListener("waiting", waiting);
    video.addEventListener("playing", playing);
    video.addEventListener("pause", finish);
    video.addEventListener("ended", finish);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      clearInterval(sampler);
      clearInterval(timer);
      observer.disconnect();
      video.removeEventListener("waiting", waiting);
      video.removeEventListener("playing", playing);
      video.removeEventListener("pause", finish);
      video.removeEventListener("ended", finish);
      document.removeEventListener("visibilitychange", hidden);
      void flush();
    };
  }, [ref, product.id, product.video, meta, preview, demo]);
}
