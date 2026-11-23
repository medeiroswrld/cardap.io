"use client";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { requestJson } from "@/lib/client-api";
import { money } from "@/lib/utils";
import { fulfillmentLabel, statusLabel, statusTone } from "@/lib/order-flow";
import {
  PERIOD_PRESETS,
  presetRange,
  rangeProblem,
  shortDay,
  todayIn,
  type PeriodPreset,
  type PeriodSummary,
} from "@/lib/period";
import type { Bills } from "@/lib/finance";
import { matchesQuery, recentOrders } from "@/lib/overview";
import type { Workspace } from "@/lib/connected-types";
import { Button } from "./ui/button";

export function AdminOverview({
  data,
  owner,
  onOpenOrders,
  onOpenBills,
}: {
  data: Workspace;
  owner: boolean;
  onOpenOrders: () => void;
  onOpenBills?: () => void;
}) {
  const [dueState, setDueState] = useState<{ key: string; count: number } | null>(null);
  const [query, setQuery] = useState("");
  const restaurantId = data.restaurant.id;
  const timezone = data.restaurant.timezone;
  const presetKey = `overview:${restaurantId}:period`;
  const [preset, setPreset] = useState<PeriodPreset>("7d");
  const [custom, setCustom] = useState(() => presetRange("7d", todayIn(timezone)));
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = localStorage.getItem(presetKey);
        if (saved && saved !== "personalizado" && PERIOD_PRESETS.some((p) => p.value === saved))
          setPreset(saved as PeriodPreset);
      } catch {}
    });
  }, [presetKey]);
  function choose(next: PeriodPreset) {
    setPreset(next);
    try {
      localStorage.setItem(presetKey, next);
    } catch {}
  }
  const today = todayIn(timezone);
  const range = preset === "personalizado" ? custom : presetRange(preset, today);
  const problem = rangeProblem(range.from, range.to, today);
  // A new delivered order changes the totals: refetch when the loaded list changes.
  const deliveredKey = data.orders
    .filter((o) => o.status === "entregue")
    .map((o) => o.id)
    .join(",");
  const [period, setPeriod] = useState<{
    key: string;
    status: "error" | "ready";
    summary: PeriodSummary | null;
  } | null>(null);
  const periodKey = `${restaurantId}|${range.from}|${range.to}`;
  useEffect(() => {
    if (problem) return;
    let cancelled = false;
    requestJson<PeriodSummary>(`/api/restaurants/${restaurantId}/period?from=${range.from}&to=${range.to}`)
      .then((s) => {
        if (!cancelled) setPeriod({ key: periodKey, status: "ready", summary: s });
      })
      .catch(() => {
        if (!cancelled) setPeriod({ key: periodKey, status: "error", summary: null });
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, range.from, range.to, periodKey, problem, deliveredKey]);
  const current = period && period.key === periodKey ? period : null;
  const summary = current?.summary ?? null;
  const status = problem ? "invalid" : current ? current.status : "loading";
  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    requestJson<Bills>(`/api/restaurants/${restaurantId}/finance/bills`)
      .then((b) => {
        if (!cancelled) setDueState({ key: restaurantId, count: Number(b.due_this_week) || 0 });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [owner, restaurantId]);
  const dueThisWeek = dueState && dueState.key === restaurantId ? dueState.count : 0;

  const open = useMemo(
    () => data.orders.filter((o) => ["recebido", "em_preparo", "pronto", "saiu_para_entrega"].includes(o.status)).length,
    [data.orders],
  );
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
  const latest = useMemo(() => recentOrders(data.orders, 1)[0], [data.orders]);
  const dishes = useMemo(
    () =>
      (summary?.dishes ?? [])
        .map((d) => ({ ...d, product: data.products.find((p) => p.id === d.product_id) }))
        .filter((d) => matchesQuery(d.name, query))
        .slice(0, 5),
    [summary, data.products, query],
  );
  const shown = (value: (s: PeriodSummary) => string) => (summary ? value(summary) : "—");
  const rangeText =
    range.from === range.to ? `Em ${shortDay(range.from)}` : `De ${shortDay(range.from)} a ${shortDay(range.to)}`;

  return (
    <div className="overview">
      <div className="overview-main">
        {owner && dueThisWeek > 0 && (
          <div className="notice fin-notice" role="status">
            <span>
              {dueThisWeek === 1 ? "1 conta vence esta semana" : `${dueThisWeek} contas vencem esta semana`}
            </span>
            {onOpenBills && (
              <Button size="sm" variant="outline" onClick={onOpenBills}>
                Ver contas
              </Button>
            )}
          </div>
        )}
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
        <div className="overview-period">
          <div className="overview-period-chips" role="group" aria-label="Período">
            {PERIOD_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={preset === p.value ? "active" : ""}
                aria-pressed={preset === p.value}
                onClick={() => {
                  if (p.value === "personalizado" && preset !== "personalizado") setCustom(range);
                  choose(p.value);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset === "personalizado" && (
            <div className="overview-period-dates">
              <label className="form-label inline-label">
                De
                <input
                  type="date"
                  value={custom.from}
                  max={today}
                  onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                />
              </label>
              <label className="form-label inline-label">
                Até
                <input
                  type="date"
                  value={custom.to}
                  max={today}
                  onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                />
              </label>
            </div>
          )}
        </div>
        <div className="connected-stats">
          <div className="admin-panel connected-stat"><span>Pedidos em aberto</span><strong>{open}</strong></div>
          <div className="admin-panel connected-stat"><span>Pedidos entregues</span><strong>{shown((s) => String(s.count))}</strong></div>
          <div className="admin-panel connected-stat"><span>Faturamento</span><strong>{shown((s) => money(s.revenue_cents))}</strong></div>
        </div>
        {status === "invalid" ? (
          <p role="alert" className="form-error">{problem}</p>
        ) : status === "error" ? (
          <p role="alert" className="form-error">Não foi possível carregar o período. Tente de novo.</p>
        ) : (
          <p className="field-help">
            {rangeText}, só pedidos entregues
            {summary && summary.count > 0 && (
              <>
                {" "}· ticket médio {money(summary.average_cents)} · Entrega {summary.by_fulfillment.entrega.count} ·
                Retirada {summary.by_fulfillment.retirada.count} · Mesa {summary.by_fulfillment.mesa.count}
              </>
            )}
            .
          </p>
        )}
        {owner && (
          <section>
            <h2 className="overview-title">Pratos mais pedidos</h2>
            <p className="field-help">No período escolhido, só pedidos entregues.</p>
            {status === "error" || status === "invalid" ? null : status === "loading" ? null : dishes.length ? (
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
              <p className="field-help">Sem pedidos entregues neste período.</p>
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
