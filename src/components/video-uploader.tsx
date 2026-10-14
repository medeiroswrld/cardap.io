"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaRow } from "@/lib/connected-types";
import { requestJson } from "@/lib/client-api";
import { Button } from "./ui/button";
import { browserClient } from "@/lib/supabase/browser";
import { VIDEO_BUCKET, VIDEO_MAX_BYTES, VIDEO_TYPES } from "@/lib/video-config";
import { validateVideo } from "./media-picker";
export function VideoUploader({
  restaurantId,
  media,
  uploaded,
}: {
  restaurantId: string;
  media: MediaRow[];
  uploaded?: { id: string; state: string } | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const asset = uploaded?.id || media[0]?.id || "";
  const serverState =
    media.find((row) => row.id === asset)?.state || uploaded?.state || "";
  const [checked, setChecked] = useState<{ id: string; state: string } | null>(
    null,
  );
  const state = ["ready", "failed"].includes(serverState)
    ? serverState
    : checked?.id === asset
      ? checked.state
      : serverState;
  const inFlight = useRef(false);
  const verify = useCallback(async () => {
    if (!asset || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await requestJson<{ state: string }>(
        `/api/restaurants/${restaurantId}/media`,
        { assetId: asset },
        "PATCH",
      );
      setChecked({ id: asset, state: result.state });
    } catch (err) {
      setError(
        (err as Error).message ||
          "Não foi possível confirmar o processamento do vídeo. Tente novamente.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [asset, restaurantId]);
  useEffect(() => {
    if (!asset || ["ready", "failed"].includes(state) || error) return;
    const timer = setInterval(() => {
      if (!document.hidden) void verify();
    }, 5000);
    return () => clearInterval(timer);
  }, [asset, state, error, verify]);
  return (
    <div className="form-stack connected-danger">
      <h3>Vídeo do produto</h3>
      <p className="field-help">
        Vídeo vertical MP4 (H.264) ou WebM, até 45 segundos e 20 MB. A foto
        continua aparecendo até o envio terminar. Mantenha esta tela aberta até
        a confirmação.
      </p>
      {state && (
        <p role="status">
          {
            {
              uploading: "Envio iniciado",
              processing: "Processando vídeo",
              ready: "Vídeo pronto para o cardápio",
              failed: "O vídeo falhou ou excede 45 segundos",
            }[state]
          }
        </p>
      )}
      {asset && state !== "ready" && (
        <Button variant="outline" disabled={busy} onClick={() => void verify()}>
          {busy ? "Aguarde…" : "Verificar processamento"}
        </Button>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}

export async function uploadProductVideo(
  restaurantId: string,
  productId: string,
  file: File,
) {
  if (
    !VIDEO_TYPES.includes(file.type as (typeof VIDEO_TYPES)[number]) ||
    file.size > VIDEO_MAX_BYTES ||
    file.size === 0
  )
    throw new Error("Escolha um vídeo MP4 ou WebM de até 20 MB.");
  const duration = await validateVideo(file);
  const result = await requestJson<{
    assetId: string;
    path: string;
    token: string;
  }>(`/api/restaurants/${restaurantId}/media`, {
    productId,
    contentType: file.type,
    size: file.size,
    duration,
  });
  const { error } = await browserClient()
    .storage.from(VIDEO_BUCKET)
    .uploadToSignedUrl(result.path, result.token, file, {
      contentType: file.type,
      cacheControl: "3600",
    });
  if (error)
    throw new Error(
      "O produto foi salvo, mas o envio do vídeo falhou. Tente salvar novamente para reenviar.",
    );
  const status = await requestJson<{ state: string }>(
    `/api/restaurants/${restaurantId}/media`,
    { assetId: result.assetId },
    "PATCH",
  );
  return { id: result.assetId, state: status.state };
}
