"use client";
import { useEffect, useState } from "react";
import { requestJson } from "@/lib/client-api";
import type { Workspace } from "@/lib/connected-types";

export function PhotoMetrics({
  data,
  days,
  now,
}: {
  data: Workspace;
  days: number;
  now: number;
}) {
  const [associations, setAssociations] = useState<
    {
      product_id: string;
      photo_url: string;
      viewer_sessions: number;
      cart_sessions: number;
      order_sessions: number;
    }[]
  >([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    requestJson<typeof associations>(
      `/api/restaurants/${data.restaurant.id}/photo-associations?days=${days}`,
    )
      .then((rows) => {
        if (active) {
          setAssociations(rows);
          setError(false);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [data.restaurant.id, data.photoMetrics, days]);
  const views = (data.photoMetrics || []).filter(
    (v) => new Date(v.created_at).getTime() >= now - days * 86400000,
  );
  const groups = Array.from(
    new Set(views.map((v) => JSON.stringify([v.product_id, v.photo_url]))),
  ).map((key) => {
    const [product, photo] = JSON.parse(key) as [string, string];
    const rows = views.filter(
      (v) => v.product_id === product && v.photo_url === photo,
    );
    return { key, product, photo, rows };
  });
  const seconds = views.reduce((sum, v) => sum + Number(v.visible_seconds), 0);
  return (
    <section aria-labelledby="photo-metrics-title">
      <h2 id="photo-metrics-title">Fotos</h2>
      <div className="connected-stats">
        {[
          [
            "Visualizações qualificadas de fotos",
            String(views.filter((v) => v.qualified).length),
          ],
          ["Tempo visível das fotos", `${Math.round(seconds)} s`],
          [
            "Tempo médio por visualização",
            `${views.length ? (seconds / views.length).toFixed(1) : "0"} s`,
          ],
        ].map(([label, value]) => (
          <div className="admin-panel connected-stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p className="field-help">
        Conta após 1 segundo com pelo menos metade da foto visível e a aba
        ativa. Fotos não carregadas, imagens de exemplo, capas de vídeos e
        acessos da equipe autenticada não contam. Cada visita ao painel da foto
        é uma observação; uma pessoa pode gerar várias. Limite: 10.000
        observações.
      </p>
      {!views.length ? (
        <div className="empty-state">
          <h3>Ainda sem visualizações de fotos.</h3>
          <p>
            Adicione uma foto e abra o cardápio em uma janela anônima. As
            métricas são atualizadas a cada 15 segundos.
          </p>
        </div>
      ) : (
        <div className="admin-panel connected-table-wrap">
          <table className="connected-table">
            <thead>
              <tr>
                <th>Produto / foto</th>
                <th>Visualizações qualificadas</th>
                <th>Tempo médio visível</th>
                <th>Sacola / pedidos associados</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const association = associations.find(
                  (a) => a.product_id === g.product && a.photo_url === g.photo,
                );
                return (
                  <tr key={g.key}>
                    <td>
                      {data.products.find((p) => p.id === g.product)?.name ||
                        "Produto arquivado"}
                      <small>
                        {data.products.find((p) => p.id === g.product)
                          ?.photo_url === g.photo
                          ? "Foto atual"
                          : "Foto anterior"}
                      </small>
                    </td>
                    <td>{g.rows.filter((v) => v.qualified).length}</td>
                    <td>
                      {(
                        g.rows.reduce(
                          (sum, v) => sum + Number(v.visible_seconds),
                          0,
                        ) / g.rows.length
                      ).toFixed(1)}{" "}
                      s
                    </td>
                    <td>
                      {error || !association ? (
                        "—"
                      ) : (
                        <>
                          {association.cart_sessions} /{" "}
                          {association.order_sessions}
                          <small>
                            de {association.viewer_sessions} sessões com foto
                          </small>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          Não foi possível atualizar as associações das fotos. Atualize os dados
          para tentar novamente.
        </p>
      )}
      <p className="field-help">
        Sacola e pedidos: sessões distintas que visualizaram a foto e
        adicionaram ou pediram o mesmo produto no período. Inclui pedidos
        cancelados; não demonstra que a foto causou a compra. Dados estimados
        pelo navegador.
      </p>
    </section>
  );
}
