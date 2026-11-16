"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { requestJson } from "@/lib/client-api";
import { money } from "@/lib/utils";
import { monthOptions, savingsText, variation, type ResultsReport } from "@/lib/results-report";
import { Button } from "./ui/button";

export function ResultsReportPanel({
  restaurantId,
  restaurantName,
  timezone,
  logoUrl,
}: {
  restaurantId: string;
  restaurantName: string;
  timezone: string;
  logoUrl?: string;
}) {
  const [options] = useState(() => monthOptions(new Date(), timezone));
  const [month, setMonth] = useState(options[0].value);
  const [report, setReport] = useState<ResultsReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);
  const load = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const data = await requestJson<ResultsReport>(`/api/restaurants/${restaurantId}/results?month=${month}`);
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
  const label = options.find((o) => o.value === month)?.label ?? month;
  return (
    <section className="results-report">
      <div className="connected-toolbar results-toolbar">
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
        <Button variant="outline" disabled={!report} onClick={() => window.print()}>
          <Printer size={17} /> Baixar PDF
        </Button>
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
      {report && !loading && (
        <div className="results-print">
          <header className="results-header">
            {logoUrl && <img className="brand-logo" src={logoUrl} alt="" />}
            <strong>{restaurantName}</strong>
            <span>Relatório de resultados · {label}</span>
            <small>Fome Play · Amply</small>
          </header>
          <div className="results-grid">
            <article className="admin-panel results-card">
              <h3>Pedidos pelo cardápio</h3>
              <p className="results-big">{report.orders.count}</p>
              <p>
                {money(report.orders.revenue_cents)} · ticket médio {money(report.orders.average_cents)}
              </p>
              <p className="field-help">
                Mesa {report.orders.by_fulfillment.mesa.count} · Retirada {report.orders.by_fulfillment.retirada.count} ·
                Entrega {report.orders.by_fulfillment.entrega.count}
              </p>
              <p className="field-help">
                {month === options[0].value
                  ? "Mês em andamento: a comparação com o mês anterior aparece quando o mês fechar."
                  : `Faturamento vs. mês anterior: ${variation(report.orders.revenue_cents, report.previous.revenue_cents)}`}
              </p>
            </article>
            <article className="admin-panel results-card results-highlight">
              <h3>Economia com o iFood</h3>
              <p className="results-big">{money(report.ifood.saved_cents)}</p>
              <p>{savingsText(report.ifood.base_cents, report.fee_percent, report.ifood.saved_cents)}</p>
              <p className="field-help">Conta só pedidos de retirada e entrega; pedidos na mesa não entram.</p>
            </article>
            <article className="admin-panel results-card">
              <h3>Clientes</h3>
              <p className="results-big">{report.customers.total}</p>
              <p>
                {report.customers.new} novos · {report.customers.returning} voltaram ·{" "}
                {report.customers.reactivated} reativados
              </p>
              <p className="field-help">Reativados: voltaram depois de 30 dias ou mais sem pedir.</p>
            </article>
          </div>
          <div className="results-grid">
            <article className="admin-panel results-card">
              <h3>Pratos mais pedidos</h3>
              {report.top_quantity.length ? (
                <ol>
                  {report.top_quantity.map((d) => (
                    <li key={d.product_id}>
                      {d.name} · {d.quantity} un.
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="field-help">Sem pedidos entregues neste mês.</p>
              )}
            </article>
            <article className="admin-panel results-card">
              <h3>Pratos que mais faturaram</h3>
              {report.top_revenue.length ? (
                <ol>
                  {report.top_revenue.map((d) => (
                    <li key={d.product_id}>
                      {d.name} · {money(d.revenue_cents)}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="field-help">Sem pedidos entregues neste mês.</p>
              )}
            </article>
            <article className="admin-panel results-card">
              <h3>Vídeos que mais venderam</h3>
              {report.top_videos.length ? (
                <ol>
                  {report.top_videos.map((v) => (
                    <li key={v.product_id}>
                      {v.name} · {v.adds} {v.adds === 1 ? "pessoa colocou" : "pessoas colocaram"} na sacola ·{" "}
                      {v.qualified_views} viram o vídeo
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="field-help">Ainda sem vídeos assistidos neste mês.</p>
              )}
            </article>
          </div>
        </div>
      )}
    </section>
  );
}
