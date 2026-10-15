"use client";
import { useEffect, useRef, useState } from "react";
import { ImageIcon, Pause, Play, Volume2, VolumeX } from "lucide-react";
import type { Product } from "@/lib/types";
import { resolveDemoVideo } from "@/lib/demo-media";
import { useVideoObservation } from "./use-video-observation";
import { usePhotoObservation } from "./use-photo-observation";
export function ProductMedia({
  product,
  preview = false,
  autoPlay = false,
  suspended = false,
}: {
  product: Product;
  preview?: boolean;
  autoPlay?: boolean;
  suspended?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const photoRef = useRef<HTMLImageElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);
  const loadVideo = useRef<(() => void) | null>(null);
  const shouldPlay = useRef(false);
  const manualPause = useRef(false);
  const lastActive = useRef(autoPlay);
  useVideoObservation(ref, product, preview);
  usePhotoObservation(
    photoRef,
    product,
    preview || suspended || Boolean(product.video && !failed),
  );
  useEffect(() => {
    const video = ref.current;
    if (!video || !product.video) return;
    let cleanup = () => {};
    let disposed = false;
    if (
      product.video.includes(".m3u8") &&
      !video.canPlayType("application/vnd.apple.mpegurl")
    ) {
      import("hls.js")
        .then(({ default: Hls }) => {
          if (disposed) return;
          if (!Hls.isSupported()) {
            setFailed(true);
            return;
          }
          const hls = new Hls({ maxBufferLength: 15, autoStartLoad: false });
          hls.loadSource(product.video!);
          hls.attachMedia(video);
          loadVideo.current = () => hls.startLoad();
          if (shouldPlay.current && !document.hidden) {
            hls.startLoad();
            void video.play().catch(() => {});
          }
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) setFailed(true);
          });
          const start = () => hls.startLoad();
          video.addEventListener("play", start);
          cleanup = () => {
            video.removeEventListener("play", start);
            hls.destroy();
            loadVideo.current = null;
          };
        })
        .catch(() => setFailed(true));
    } else if (product.video.startsWith("demo-media:")) {
      void resolveDemoVideo(product.video)
        .then((url) => {
          if (disposed) {
            URL.revokeObjectURL(url);
            return;
          }
          video.src = url;
          if (shouldPlay.current && !document.hidden)
            void video.play().catch(() => {});
          cleanup = () => URL.revokeObjectURL(url);
        })
        .catch(() => {
          if (!disposed) setFailed(true);
        });
    } else video.src = product.video;
    return () => {
      disposed = true;
      cleanup();
    };
  }, [product.video]);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (lastActive.current !== autoPlay) manualPause.current = false;
    lastActive.current = autoPlay;
    shouldPlay.current =
      autoPlay &&
      !suspended &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sync = () => {
      if (shouldPlay.current && !manualPause.current && !document.hidden) {
        loadVideo.current?.();
        void video.play().catch(() => {});
      } else video.pause();
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [autoPlay, suspended, product.video]);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const visible = () => {
      if (document.hidden) video.pause();
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || entries[0].intersectionRatio < 0.5)
          video.pause();
      },
      { threshold: [0, 0.5] },
    );
    observer.observe(video);
    document.addEventListener("visibilitychange", visible);
    const pauseOthers = (e: Event) => {
      if (e.target !== video) video.pause();
    };
    document.addEventListener("play", pauseOthers, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", visible);
      document.removeEventListener("play", pauseOthers, true);
    };
  }, [product.video]);
  return (
    <div className="product-media">
      {product.video && !failed ? (
        <>
          <video
            ref={ref}
            poster={product.image}
            playsInline
            muted={muted}
            preload="none"
            loop={autoPlay}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onError={() => setFailed(true)}
          />
          <div className="media-controls">
            <button
              aria-label={playing ? "Pausar vídeo" : "Reproduzir vídeo"}
              onClick={() => {
                if (playing) {
                  manualPause.current = true;
                  ref.current?.pause();
                } else {
                  manualPause.current = false;
                  loadVideo.current?.();
                  void ref.current?.play().catch(() => {});
                }
              }}
            >
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button
              aria-label={muted ? "Ativar som" : "Desativar som"}
              onClick={() => setMuted(!muted)}
            >
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          </div>
        </>
      ) : (
        <img
          ref={photoRef}
          src={product.image || "/images/placeholder.svg"}
          alt={product.name}
          loading={product.featured ? "eager" : "lazy"}
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = "/images/placeholder.svg";
          }}
        />
      )}
      {!product.video && (
        <span className="photo-label">
          <ImageIcon size={13} />
          Foto do produto
        </span>
      )}
      {failed && (
        <span className="photo-label">Vídeo indisponível • exibindo foto</span>
      )}
      {preview && <span className="preview-badge">Prévia</span>}
    </div>
  );
}
