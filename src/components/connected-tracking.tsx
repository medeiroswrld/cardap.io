"use client";
import { OrderChoices } from "./order-choices";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Clock3, Utensils } from "lucide-react";
import type { RealOrder } from "@/lib/connected-types";
import {
  customerSteps,
  fulfillmentLabel,
  paymentNames,
  statusLabel,
} from "@/lib/order-flow";
import { money } from "@/lib/utils";
import { requestJson } from "@/lib/client-api";
import { GoogleReviewInvite, ProductFeedbackModal } from "./product-feedback";
export function ConnectedTracking({
  restaurantId,
  slug,
  id,
}: {
  restaurantId: string;
  slug: string;
  id?: string;
}) {
  const [orders, setOrders] = useState<RealOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedbackProduct, setFeedbackProduct] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const refresh = useCallback(async () => {
    try {
      const ids: string[] = id
        ? [id]
        : JSON.parse(
            localStorage.getItem(`menu:${restaurantId}:orders`) || "[]",
          );
      const results = await Promise.all(
        ids.map((orderId) =>
          requestJson<RealOrder>(
            `/api/restaurants/${restaurantId}/orders/${orderId}`,
          ),
        ),
      );
      setOrders(results);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [restaurantId, id]);
  useEffect(() => {
    queueMicrotask(() => void refresh());
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 5000);
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  return (
    <main className="standalone connected-tracking">
      <Link href={`/r/${slug}`} className="back-link">
        <ArrowLeft size={18} /> Voltar ao cardápio
      </Link>
      <span className="eyebrow">
        {orders.some((o) => o.fulfillment !== "mesa")
          ? "Da cozinha para você"
          : "Da cozinha para sua mesa"}
      </span>
      <h1>{id ? "Acompanhe seu pedido" : "Meus pedidos"}</h1>
      <p>
        Atualização automática a cada 5 segundos.
        {orders.some((o) => o.fulfillment !== "mesa") ? "" : " Pagamento no local."}
      </p>
      {loading && <p role="status">Buscando seu pedido…</p>}
      {error && (
        <div className="notice" role="alert">
          {error}{" "}
          <button
            className="button button-secondary"
            onClick={() => void refresh()}
          >
            Tentar novamente
          </button>
        </div>
      )}
      {!loading && !error && !orders.length && (
        <div className="empty-state">
          <Utensils />
          <h2>Nenhum pedido por aqui.</h2>
          <p>Os pedidos desta sessão aparecem aqui após a confirmação.</p>
        </div>
      )}
      {orders.map((order) => (
        <article className="panel connected-order" key={order.id}>
          <div className="panel-heading">
            <h2>Pedido #{order.number}</h2>
            <span className="status-pill">{statusLabel(order.status, order.fulfillment)}</span>
          </div>
          <p>
            {fulfillmentLabel({
              fulfillment: order.fulfillment,
              table: order.dining_tables?.number,
              zone: order.order_addresses?.zone_name,
            })}{" "}
            · {new Date(order.created_at).toLocaleString("pt-BR")}
          </p>
          {order.status === "cancelado" || order.status === "recusado" ? (
            <div className="notice">
              {order.status === "recusado" ? "Recusado" : "Cancelado"}:{" "}
              {order.cancellation_reason}
            </div>
          ) : (
            <ol className="connected-steps">
              {customerSteps(order.fulfillment).map((status, index, steps) => (
                <li
                  key={status}
                  className={
                    index <= steps.indexOf(order.status) ? "complete" : ""
                  }
                >
                  <Check size={17} />
                  {statusLabel(status, order.fulfillment)}
                </li>
              ))}
            </ol>
          )}
          {order.order_addresses && (
            <p>
              Entregar em {order.order_addresses.street},{" "}
              {order.order_addresses.number}
              {order.order_addresses.complement
                ? ` (${order.order_addresses.complement})`
                : ""}{" "}
              · {order.order_addresses.zone_name}
            </p>
          )}
          {order.payment_method && (
            <p>
              Pagamento: {paymentNames[order.payment_method]}
              {order.change_for_cents
                ? ` · troco para ${money(order.change_for_cents)}`
                : ""}
            </p>
          )}
          {order.estimate_minutes && (
            <p>
              <Clock3 size={16} /> Estimativa informada pela equipe:{" "}
              {order.estimate_minutes} minutos.
            </p>
          )}
          <div className="checkout-summary">
            {order.order_items.map((item) => (
              <div key={item.id}>
                <span>
                  {item.quantity}× {item.product_name}
                  <OrderChoices
                    removed={item.removed_ingredients}
                    additions={item.add_ons}
                  />
                  {item.note && <small> — {item.note}</small>}
                </span>
                <strong>{money(item.quantity * item.unit_price_cents)}</strong>
              </div>
            ))}
            {order.delivery_fee_cents > 0 && (
              <div>
                <span>Taxa de entrega</span>
                <strong>{money(order.delivery_fee_cents)}</strong>
              </div>
            )}
            <div className="total-row">
              <span>Total</span>
              <strong>{money(order.total_cents)}</strong>
            </div>
          </div>
          {order.status === "entregue" && (
            <section className="delivered-feedback">
              {order.feedback_enabled !== false && (
                <>
                  <h3>Seu pedido chegou. Conta pra gente?</h3>
                  <p>Curta e comente os pratos que você provou.</p>
                  <div className="feedback-product-buttons">
                    {Array.from(
                      new Map(
                        order.order_items.map((item) => [
                          item.product_id,
                          item,
                        ]),
                      ).values(),
                    ).map((item) => (
                      <button
                        key={item.product_id}
                        className="button button-outline"
                        onClick={() =>
                          setFeedbackProduct({
                            id: item.product_id,
                            name: item.product_name,
                          })
                        }
                      >
                        Avaliar {item.product_name}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <GoogleReviewInvite url={order.google_review_url} />
            </section>
          )}
        </article>
      ))}
      <ProductFeedbackModal
        restaurantId={restaurantId}
        product={feedbackProduct}
        onClose={() => setFeedbackProduct(null)}
      />
    </main>
  );
}
