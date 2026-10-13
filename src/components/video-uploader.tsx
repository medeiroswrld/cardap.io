"use client";
import { useState } from "react";
import type { MediaRow } from "@/lib/connected-types";
import { requestJson } from "@/lib/client-api";
import { Button } from "./ui/button";
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
  const [asset] = useState(uploaded?.id || media[0]?.id || "");
  const [state, setState] = useState(uploaded?.state || media[0]?.state || "");
  async function verify(id = asset) {
    setBusy(true);
    setError("");
    try {
      const result = await requestJson<{ state: string }>(
        `/api/restaurants/${restaurantId}/media`,
        { assetId: id },
        "PATCH",
      );
      setState(result.state);
    } catch {
      setError(
        "Não foi possível confirmar o processamento do vídeo. Tente novamente em instantes.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-stack connected-danger">
      <h3>Vídeo do produto</h3>
      <p className="field-help">
        Vídeo vertical, até 45 segundos e 200 MB. A foto continua aparecendo
        durante o processamento.
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
  const result = await requestJson<{ assetId: string; uploadURL: string }>(
    `/api/restaurants/${restaurantId}/media`,
    { productId },
  );
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(result.uploadURL, {
    method: "POST",
    body: form,
  });
  if (!response.ok)
    throw new Error(
      "O produto foi salvo, mas o envio do vídeo falhou. Tente salvar novamente para reenviar.",
    );
  const status = await requestJson<{ state: string }>(
    `/api/restaurants/${restaurantId}/media`,
    { assetId: result.assetId },
    "PATCH",
  ).catch(() => ({ state: "processing" }));
  return { id: result.assetId, state: status.state };
}
