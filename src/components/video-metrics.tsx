"use client";
import { useEffect, useState } from "react";
import { requestJson } from "@/lib/client-api";
import { BarChart3 } from "lucide-react";
import type { Workspace } from "@/lib/connected-types";
import { PhotoMetrics } from "./photo-metrics";
export function VideoMetrics({ data }: { data: Workspace }) {
  const [days, setDays] = useState(30);
  const [associations, setAssociations] = useState<
    {
      product_id: string;
      media_version: string;
      viewer_sessions: number;
      cart_sessions: number;
      order_sessions: number;
    }[]
  >([]);
  const [associationError, setAssociationError] = useState("");
  useEffect(() => {
    let active = true;
    requestJson<typeof associations>(
      `/api/restaurants/${data.restaurant.id}/associations?days=${days}`,
    )
      .then((rows) => {
        if (active) {
          setAssociations(rows);
          setAssociationError("");
        }
      })
      .catch(() => {
        if (active)
          setAssociationError(
            "Não foi possível atualizar as associações. Troque o período ou recarregue para tentar novamente.",
          );
      });
    return () => {
      active = false;
    };
  }, [data.restaurant.id, data.metrics, days]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  const views = data.metrics.filter(
    (v) => new Date(v.created_at).getTime() >= now - days * 86400000,
  );
  const qualified = views.filter((v) => v.qualified);
  const groups = Array.from(
    new Set(views.map((v) => v.product_id + ":" + v.media_version)),
  ).map((key) => {
    const [product, version] = key.split(":");
    const rows = views.filter(
      (v) => v.product_id === product && v.media_version === version,
    );
    const valid = rows.filter((v) => v.qualified);
    return { key, product, version, rows, valid };
  });
  return (
    <>
      <div className="connected-toolbar">
        <p>
          Fotos e vídeos do cardápio. Atualização automática a cada 15 segundos.
        </p>
        <label className="form-label">
          Período
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
          </select>
        </label>
      </div>
      <PhotoMetrics data={data} days={days} now={now} />
      <h2>Vídeos</h2>
      <div className="connected-stats">
        {[
          ["Sessões observadas", String(views.length)],
          ["Visualizações qualificadas", String(qualified.length)],
          [
            "Tempo assistido",
            `${Math.round(views.reduce((s, v) => s + Number(v.watched_seconds), 0))} s`,
          ],
        ].map(([label, value]) => (
          <div className="admin-panel connected-stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p className="field-help">
        Qualificada: pelo menos 1 segundo reproduzido com metade do painel
        visível. Conclusão: 90% dos trechos distintos, entre sessões
        qualificadas. Limite da consulta: 10.000 sessões. Fotos e prévias da
        equipe são excluídas.
      </p>
      {!views.length ? (
        <div className="empty-state">
          <BarChart3 />
          <h2>Ainda sem visualizações de vídeo.</h2>
          <p>
            As reproduções aparecerão aqui quando seus vídeos estiverem prontos
            e forem assistidos no cardápio público. Acessos da equipe
            autenticada não contam; para testar como cliente, use uma janela
            anônima.
          </p>
        </div>
      ) : (
        <div className="admin-panel connected-table-wrap">
          <table className="connected-table">
            <thead>
              <tr>
                <th>Produto / versão</th>
                <th>Sessões / qualificadas</th>
                <th>Cobertura média</th>
                <th>Conclusão</th>
                <th>Sacola / pedidos associados</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.key}>
                  <td>
                    {data.products.find((p) => p.id === g.product)?.name ||
                      "Produto arquivado"}
                    <small>Versão {g.version.slice(0, 8)}</small>
                  </td>
                  <td>
                    {g.rows.length} / {g.valid.length}
                    {g.valid.length < 30 && <small>Amostra pequena</small>}
                  </td>
                  <td>
                    {g.valid.length
                      ? Math.round(
                          (g.valid.reduce((s, v) => s + Number(v.coverage), 0) *
                            100) /
                            g.valid.length,
                        )
                      : 0}
                    %
                  </td>
                  <td>
                    {g.valid.length
                      ? Math.round(
                          (g.valid.filter((v) => Number(v.coverage) >= 0.9)
                            .length *
                            100) /
                            g.valid.length,
                        )
                      : 0}
                    %<small>de {g.valid.length} qualificadas</small>
                  </td>
                  <td>
                    {associationError
                      ? "—"
                      : (() => {
                          const a = associations.find(
                            (a) =>
                              a.product_id === g.product &&
                              a.media_version === g.version,
                          );
                          return a ? (
                            <>
                              {a.cart_sessions} / {a.order_sessions}
                              <small>
                                de {a.viewer_sessions} sessões com vídeo
                              </small>
                            </>
                          ) : (
                            "—"
                          );
                        })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {associationError && (
        <p role="alert" className="form-error">
          {associationError}
        </p>
      )}
      <p className="field-help">
        Associações contam sessões distintas com vídeo qualificado e o mesmo
        produto na sacola ou em pedido persistido, no período selecionado.
        Inclui pedidos posteriormente cancelados. Não define a ordem das ações
        nem atribui a compra ao vídeo.
      </p>
      <p className="notice">
        Estimativas do navegador, sujeitas a perda e bloqueio. Esses dados
        descrevem reproduções; não demonstram que um vídeo causou uma venda.
      </p>
    </>
  );
}
