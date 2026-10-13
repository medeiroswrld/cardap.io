"use client";
import { useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { resolveDemoVideo } from "@/lib/demo-media";

export function MediaPicker({
  photo,
  video,
  file,
  disabled,
  demo = false,
  onSelect,
  onChecking,
}: {
  photo?: string | null;
  video?: string | null;
  file: File | null;
  disabled?: boolean;
  demo?: boolean;
  onSelect: (file: File) => void;
  onChecking?: (checking: boolean) => void;
}) {
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const isVideo = file ? file.type.startsWith("video/") : Boolean(video);
  useEffect(() => {
    let disposed = false;
    let url = "";
    const load = async () => {
      try {
        url = file
          ? URL.createObjectURL(file)
          : video
            ? await resolveDemoVideo(video)
            : photo || "";
        if (!disposed) setSource(url);
        else if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      } catch {
        if (!disposed) setSource("");
      }
    };
    void load();
    return () => {
      disposed = true;
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    };
  }, [file, photo, video]);
  return (
    <div className="media-picker">
      {source &&
        (isVideo ? (
          <video
            key={source}
            src={source}
            poster={photo || undefined}
            controls
            playsInline
            preload="metadata"
            aria-label="Prévia do vídeo escolhido"
          />
        ) : (
          <img src={source} alt="Foto escolhida" />
        ))}
      <label className="button button-outline upload-button">
        <Upload size={17} />
        {checking ? "Conferindo arquivo…" : "Escolher foto ou vídeo"}
        <input
          type="file"
          aria-label="Escolher foto ou vídeo"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
          disabled={disabled || checking}
          onChange={async (e) => {
            const selected = e.target.files?.[0];
            e.target.value = "";
            if (!selected) return;
            setError("");
            setChecking(true);
            onChecking?.(true);
            try {
              const videoFile = [
                "video/mp4",
                "video/quicktime",
                "video/webm",
              ].includes(selected.type);
              if (
                !videoFile &&
                !["image/jpeg", "image/png", "image/webp"].includes(
                  selected.type,
                )
              )
                throw new Error("Escolha JPG, PNG, WebP, MP4, MOV ou WebM.");
              const max = videoFile ? 200 : demo ? 1 : 5;
              if (selected.size > max * 1024 * 1024)
                throw new Error(
                  `Escolha ${videoFile ? "um vídeo" : "uma foto"} de até ${max} MB.`,
                );
              if (videoFile) await validateVideo(selected);
              onSelect(selected);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setChecking(false);
              onChecking?.(false);
            }
          }}
        />
      </label>
      {file && (
        <p className="field-help" role="status">
          {file.name} · Selecionado para salvar
        </p>
      )}
      <p className="field-help">
        Fotos JPG, PNG ou WebP até {demo ? 1 : 5} MB. Vídeos MP4, MOV ou WebM
        até 45 segundos e 200 MB.
      </p>
      {demo && (
        <p className="field-help">
          Nesta demonstração, os arquivos ficam somente neste navegador.
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}

async function validateVideo(file: File) {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error("Não foi possível ler o vídeo. Tente outro arquivo."),
          ),
        15000,
      );
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        clearTimeout(timer);
        if (
          Number.isFinite(video.duration) &&
          video.duration > 0 &&
          video.duration <= 45
        )
          resolve();
        else reject(new Error("Escolha um vídeo de até 45 segundos."));
      };
      video.onerror = () => {
        clearTimeout(timer);
        reject(
          new Error(
            "Não foi possível abrir este vídeo. Tente MP4 ou WebM compatível com seu navegador.",
          ),
        );
      };
      video.src = url;
    });
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
