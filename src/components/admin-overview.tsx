"use client";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { requestJson } from "@/lib/client-api";
import { money } from "@/lib/utils";
import { fulfillmentLabel, statusLabel, statusTone } from "@/lib/order-flow";
import { monthOptions, type ResultsReport } from "@/lib/results-report";
import { matchesQuery, recentOrders } from "@/lib/overview";
import type { Workspace } from "@/lib/connected-types";
import { Button } from "./ui/button";

export function AdminOverview({
  data,
  owner,
  onOpenOrders,
}: {
  data: Workspace;
  owner: boolean;
  onOpenOrders: () => void;
}) {
  const [query, setQuery] = useState("");
  const [top, setTop] = useState<ResultsReport["top_quantity"]>([]);
  useEffect(() => {
    if (!owner) return;
    const month = monthOptions(new Date(), data.restaurant.timezone)[0].value;
    requestJson<ResultsReport>(`/api/restaurants/${data.restaurant.id}/results?month=${month}`)
      .then((r) => setTop(r.top_quantity))
      .catch(() => setTop([]));
  }, [owner, data.restaurant.id, data.restaurant.timezone]);

  const open = data.orders.filter((o) => ["recebido", "em_preparo", "pronto", "saiu_para_entrega"].includes(o.status)).length;
  const delivered = data.orders.filter((o) => o.status === "entregue");
  const recent = useMemo(
    () =>
      recentOrders(data.orders, 8).filter((o) =>
        matchesQuery(
          `#${o.number} ${o.customer_name ?? ""} ${o.order_items.map((i) => i.product_name).join(" ")}`,
          query,
        ),
      ),
    [data.orders, query],
  );
  const latest = recentOrders(data.orders, 1)[0];
  const dishes = top
    .map((d) => ({ ...d, product: data.products.find((p) => p.id === d.product_id) }))
    .filter((d) => matchesQuery(d.name, query))
    .slice(0, 6);

  return (
    <div className="overview">
      <div className="overview-main">
        <label className="overview-search">
          <Search size={17} />
          <input
            type="search"
            placeholder="Buscar pedido, cliente ou prato"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar pedido, cliente ou prato"
          />
        </label>
        <div className="connected-stats">
          <div className="admin-panel connected-stat"><span>Pedidos em aberto</span><strong>{open}</strong></div>
          <div className="admin-panel connected-stat"><span>Pedidos entregues</span><strong>{delivered.length}</strong></div>
          <div className="admin-panel connected-stat"><span>Total entregue</span><strong>{money(delivered.reduce((s, o) => s + o.total_cents, 0))}</strong></div>
        </div>
        {owner && (
          <section>
            <h2 className="overview-title">Pratos mais pedidos</h2>
            <p className="field-help">Neste mês, só pedidos entregues.</p>
            {dishes.length ? (
              <div className="overview-dishes">
                {dishes.map((d) => (
                  <article key={d.product_id} className="admin-panel overview-dish">
                    {d.product?.photo_url ? <img src={d.product.photo_url} alt="" /> : <div className="overview-dish-placeholder" />}
                    <strong>{d.name}</strong>
                    <span>{d.product ? money(d.product.price_cents) : ""}</span>
                    <small>{d.quantity} vendidos</small>
                  </article>
                ))}
              </div>
            ) : (
              <p className="field-help">Ainda sem pedidos entregues neste mês.</p>
            )}
          </section>
        )}
        <section className="admin-panel overview-table-panel">
          <h2 className="overview-title">Últimos pedidos</h2>
          {recent.length ? (
            <table className="overview-table">
              <thead>
                <tr><th>Pedido</th><th>Cliente</th><th>Tipo</th><th>Valor</th><th>Status</th></tr>
              </thead>
              <tbody>
                {recent.map((o) => (
                  <tr key={o.id}>
                    <td>#{o.number}</td>
                    <td>{o.customer_name || "—"}</td>
                    <td>{fulfillmentLabel({ fulfillment: o.fulfillment, table: o.dining_tables?.number, zone: o.order_addresses?.zone_name })}</td>
                    <td>{money(o.total_cents)}</td>
                    <td><span className={`status-pill tone-${statusTone(o.status)}`}>{statusLabel(o.status, o.fulfillment)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="field-help">{query ? "Nenhum pedido encontrado." : "Os pedidos aparecem aqui assim que chegarem."}</p>
          )}
        </section>
      </div>
      <aside className="admin-panel overview-latest">
        <h2 className="overview-title">Pedido mais recente</h2>
        {latest ? (
          <>
            <p><strong>#{latest.number}</strong> · {fulfillmentLabel({ fulfillment: latest.fulfillment, table: latest.dining_tables?.number, zone: latest.order_addresses?.zone_name })}</p>
            {latest.order_addresses && (
              <p className="field-help">{latest.order_addresses.street}, {latest.order_addresses.number} · {latest.order_addresses.zone_name}</p>
            )}
            <ul className="overview-items">
              {latest.order_items.map((i) => (
                <li key={i.id}><span>{i.quantity}× {i.product_name}</span><span>{money(i.quantity * i.unit_price_cents)}</span></li>
              ))}
            </ul>
            <div className="overview-total"><span>Total</span><strong>{money(latest.total_cents)}</strong></div>
            <span className={`status-pill tone-${statusTone(latest.status)}`}>{statusLabel(latest.status, latest.fulfillment)}</span>
          </>
        ) : (
          <p className="field-help">Nenhum pedido ainda.</p>
        )}
        <Button onClick={onOpenOrders}>Ver pedidos</Button>
      </aside>
    </div>
  );
}
