"use client";
import { useState } from "react";
import { Button } from "../ui/button";
import { requestJson } from "@/lib/client-api";
import { money } from "@/lib/utils";
import {
  CRM_SEGMENTS,
  campaignLink,
  customersCsv,
  fillCampaignMessage,
  segmentLabel,
  segmentNames,
  type CampaignRow,
  type CrmSegment,
} from "@/lib/crm";

export function CampaignPanel({ restaurantId }: { restaurantId: string }) {
  const [segment, setSegment] = useState<CrmSegment | "">("sumido");
  const [tag, setTag] = useState("");
  const [message, setMessage] = useState("Oi {nome}! Estamos com saudade. Que tal pedir hoje?");
  const [rows, setRows] = useState<CampaignRow[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function build() {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({ segment, tag: tag.trim() });
      setRows(await requestJson<CampaignRow[]>(`/api/restaurants/${restaurantId}/crm/campaign?${params}`));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!rows) return;
    const blob = new Blob([customersCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campanha-${segment || "etiqueta"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="admin-panel connected-panel form-stack" aria-labelledby="campaign-title">
      <h2 id="campaign-title">Campanha no WhatsApp</h2>
      <p className="notice small">
        Somente clientes que autorizaram receber ofertas aparecem aqui. Nada é enviado automaticamente: cada botão abre
        uma conversa com a mensagem pronta.
      </p>
      <div className="crm-filters">
        <label className="form-label">
          Segmento
          <select value={segment} onChange={(e) => setSegment(e.target.value as CrmSegment | "")}>
            <option value="">Qualquer segmento</option>
            {CRM_SEGMENTS.map((s) => (
              <option key={s} value={s}>
                {segmentNames[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="form-label">
          Etiqueta (opcional)
          <input maxLength={30} value={tag} onChange={(e) => setTag(e.target.value)} />
        </label>
      </div>
      <label className="form-label">
        Mensagem ({message.length}/1000) — use {"{nome}"} para o primeiro nome
        <textarea maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
      <Button disabled={busy || (!segment && !tag.trim())} onClick={() => void build()}>
        {busy ? "Montando lista…" : "Montar lista"}
      </Button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {rows && (
        <>
          <p role="status">
            {rows.length} cliente(s) na lista{rows.length === 1000 ? " (limite de 1.000)" : ""}.
          </p>
          <Button variant="outline" disabled={!rows.length} onClick={download}>
            Exportar CSV
          </Button>
          <ul className="crm-campaign-list">
            {rows.map((r) => (
              <li key={r.id}>
                <span>
                  <strong>{r.name}</strong> · {segmentLabel[r.segment]} · {money(Number(r.spent_cents))}
                </span>
                <Button asChild variant="outline">
                  <a
                    href={campaignLink(r.phone, fillCampaignMessage(message, r.name))}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Abrir no WhatsApp: ${r.name}`}
                  >
                    Abrir no WhatsApp
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
