"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, Trash2 } from "lucide-react";
import { requestJson } from "@/lib/client-api";
import { money } from "@/lib/utils";
import { monthOptions } from "@/lib/results-report";
import { BUILTIN_ORIGINS, originLabel, originLink, type OriginReportRow, type OriginRow } from "@/lib/origins";
import { Button } from "./ui/button";

type Save = (body: unknown) => Promise<void>;

export function OriginsPanel({
  restaurantId,
  slug,
  timezone,
  origins,
  save,
  busy,
}: {
  restaurantId: string;
  slug: string;
  timezone: string;
  origins: OriginRow[];
  save: Save;
  busy: boolean;
}) {
  const [options] = useState(() => monthOptions(new Date(), timezone));
  const [month, setMonth] = useState(options[0].value);
  const [report, setReport] = useState<OriginReportRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [formError, setFormError] = useState("");
  const [note, setNote] = useState("");
  const latest = useRef(0);

  const load = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const data = await requestJson<OriginReportRow[]>(
        `/api/restaurants/${restaurantId}/origin-report?month=${month}`,
      );
      if (id === latest.current) setReport(data);
    } catch {
      if (id === latest.current) setError("Não foi possível carregar o relatório. Tente novamente.");
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [restaurantId, month]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function copy(slugValue: string, label: string) {
    try {
      await navigator.clipboard.writeText(originLink(slug, slugValue));
      setNote(`Link de ${label} copiado.`);
    } catch {
      setNote("Não foi possível copiar. Tente de novo.");
    }
  }
  async function downloadQr(slugValue: string) {
    try {
      const url = await QRCode.toDataURL(originLink(slug, slugValue), {
        width: 600,
        margin: 3,
        color: { dark: "#251c1a", light: "#ffffff" },
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = `origem-${slugValue}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setNote("Não foi possível gerar o QR.");
    }
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return setFormError("Digite um nome para a origem.");
    setFormError("");
    try {
      await save({ action: "save_origin", name: clean });
      setName("");
    } catch (err) {
      setFormError((err as Error).message);
    }
  }
  async function remove(o: OriginRow) {
    if (!window.confirm(`Apagar a origem "${o.name}"? Os pedidos já feitos aparecem como "Origem apagada".`)) return;
    setFormError("");
    try {
      await save({ action: "delete_origin", id: o.id });
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  const rows: { slug: string; name: string; custom: OriginRow | null }[] = [
    ...BUILTIN_ORIGINS.map((o) => ({ ...o, custom: null })),
    ...origins.map((o) => ({ slug: o.slug, name: o.name, custom: o })),
  ];

  return (
    <div className="form-stack">
      <section className="admin-panel connected-panel form-stack" aria-labelledby="origins-title">
        <h2 id="origins-title">De onde vêm seus pedidos</h2>
        <p className="field-help">
          Use um link ou QR diferente em cada lugar (embalagem, Instagram, panfleto) e veja qual traz mais pedidos.
        </p>
        <ul className="coupon-list">
          <li className="coupon-row">
            <div className="coupon-main">
              <strong>Mesa</strong>
              <span className="status-pill tone-neutral">automática</span>
            </div>
            <p className="field-help">Todo pedido feito pelo QR da mesa entra aqui sozinho.</p>
          </li>
          {rows.map((o) => (
            <li key={o.slug} className="coupon-row">
              <div className="coupon-main">
                <strong>{o.name}</strong>
              </div>
              <code className="origin-link">{originLink(slug, o.slug)}</code>
              <div className="coupon-actions">
                <Button variant="outline" size="sm" onClick={() => void copy(o.slug, o.name)}>
                  <Copy size={15} /> Copiar link
                </Button>
                <Button variant="outline" size="sm" onClick={() => void downloadQr(o.slug)}>
                  <Download size={15} /> Baixar QR
                </Button>
                {o.custom && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => o.custom && void remove(o.custom)}
                    aria-label={`Apagar origem ${o.name}`}
                  >
                    <Trash2 size={15} /> Apagar
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {note && (
          <p role="status" className="field-help">
            {note}
          </p>
        )}
        <form className="origin-new" onSubmit={(e) => void add(e)}>
          <label className="form-label">
            Nova origem
            <input
              value={name}
              maxLength={40}
              placeholder="Ex.: Panfleto da praça"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={busy}>
            Criar origem
          </Button>
        </form>
        {formError && (
          <p role="alert" className="form-error">
            {formError}
          </p>
        )}
      </section>
      <section className="admin-panel connected-panel form-stack" aria-labelledby="origin-report-title">
        <div className="connected-toolbar">
          <h2 id="origin-report-title">Pedidos por origem</h2>
          <label className="form-label inline-label">
            Mês
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {loading && <p role="status">Carregando relatório…</p>}
        {error && (
          <p role="alert" className="form-error">
            {error}{" "}
            <Button type="button" variant="ghost" onClick={() => void load()}>
              Tentar novamente
            </Button>
          </p>
        )}
        {report && !loading && report.length === 0 && (
          <p className="notice small">Ainda sem pedidos entregues neste mês.</p>
        )}
        {report && !loading && report.length > 0 && (
          <div className="crm-table-wrap">
            <table className="overview-table">
              <thead>
                <tr>
                  <th>Origem</th>
                  <th>Pedidos</th>
                  <th>Total vendido</th>
                </tr>
              </thead>
              <tbody>
                {report.map((r) => (
                  <tr key={r.origin}>
                    <td>{originLabel(r.origin, origins)}</td>
                    <td>{r.orders}</td>
                    <td>{money(r.total_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
