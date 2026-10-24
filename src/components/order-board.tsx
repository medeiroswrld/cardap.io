"use client";
import { useState } from "react";
import { ShoppingBag } from "lucide-react";
import type { RealOrder } from "@/lib/connected-types";
import {
  canCancel,
  fulfillmentLabel,
  nextAction,
  paymentNames,
  statusLabel,
  type OrderStatus,
} from "@/lib/order-flow";
import { boardColumns, columnTitle, modalKind } from "@/lib/order-board";
import { whatsappConfirmationLink } from "@/lib/online-order";
import { money } from "@/lib/utils";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import { OrderChoices } from "./order-choices";

type Change = (
  order: RealOrder,
  status: OrderStatus,
  reason?: string,
  estimate?: number,
) => Promise<void>;

export function OrderBoard({
  orders,
  busy,
  change,
  restaurantName,
}: {
  orders: RealOrder[];
  busy: boolean;
  change: Change;
  restaurantName: string;
}) {
  const [selected, setSelected] = useState<RealOrder | null>(null);
  const [status, setStatus] = useState<OrderStatus>("em_preparo");
  const [error, setError] = useState("");
  const [history, setHistory] = useState(false);
  const columns = boardColumns(orders, history);
  const kind = selected ? modalKind(selected.status, status) : "confirm";
  const open = (order: RealOrder, to: OrderStatus) => {
    setError("");
    setSelected(order);
    setStatus(to);
  };
  return (
    <>
      <div className="connected-toolbar">
        <Button variant="outline" onClick={() => setHistory(!history)}>
          {history
            ? "Ver pedidos em aberto"
            : "Ver entregues, recusados e cancelados"}
        </Button>
        <span className="field-help">
          Tempo real com reconciliação a cada 15 segundos
        </span>
      </div>
      <div className="kanban connected-kanban">
        {columns.map((column) => (
          <section key={column} className="kanban-column">
            <h2>
              {columnTitle(column)}{" "}
              <span>{orders.filter((o) => o.status === column).length}</span>
            </h2>
            <div className="kanban-cards">
              {orders
                .filter((o) => o.status === column)
                .map((order) => {
                  const next = nextAction(order.status, order.fulfillment);
                  const online = order.fulfillment !== "mesa";
                  const address = order.order_addresses;
                  return (
                    <article className="order-card" key={order.id}>
                      <div className="panel-heading">
                        <strong>#{order.number}</strong>
                        <span>
                          {fulfillmentLabel({
                            fulfillment: order.fulfillment,
                            table: order.dining_tables?.number,
                            zone: address?.zone_name,
                          })}
                        </span>
                        {order.first_order && (
                          <span className="status-pill">Cliente novo</span>
                        )}
                      </div>
                      <p>
                        {order.customer_name} ·{" "}
                        {new Date(order.created_at).toLocaleTimeString(
                          "pt-BR",
                          { hour: "2-digit", minute: "2-digit" },
                        )}
                      </p>
                      {online && order.customer_phone && (
                        <p>Telefone: {order.customer_phone}</p>
                      )}
                      {order.fulfillment === "entrega" && address && (
                        <p>
                          {address.street}, {address.number}
                          {address.complement && ` · ${address.complement}`} ·{" "}
                          {address.zone_name}
                          {address.reference && ` · Ref.: ${address.reference}`}
                        </p>
                      )}
                      {online && order.payment_method && (
                        <p>
                          Pagamento: {paymentNames[order.payment_method]}
                          {order.change_for_cents
                            ? ` · troco para ${money(order.change_for_cents)}`
                            : ""}
                        </p>
                      )}
                      <ul className="connected-items">
                        {order.order_items.map((item) => (
                          <li key={item.id}>
                            {item.quantity}× {item.product_name}
                            <OrderChoices
                              removed={item.removed_ingredients}
                              additions={item.add_ons}
                            />
                            {item.note && <small>{item.note}</small>}
                          </li>
                        ))}
                      </ul>
                      {order.delivery_fee_cents > 0 && (
                        <p>Taxa {money(order.delivery_fee_cents)}</p>
                      )}
                      <strong>{money(order.total_cents)}</strong>
                      {order.cancellation_reason && (
                        <p className="notice">{order.cancellation_reason}</p>
                      )}
                      {!history && (
                        <div className="connected-order-actions">
                          {next && (
                            <Button
                              disabled={busy}
                              onClick={() => open(order, next.status)}
                            >
                              {next.label}
                            </Button>
                          )}
                          {order.status === "aguardando_aceite" && (
                            <>
                              <Button
                                variant="outline"
                                disabled={busy}
                                onClick={() => open(order, "recusado")}
                              >
                                Recusar
                              </Button>
                              <Button asChild variant="outline">
                                <a
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  href={whatsappConfirmationLink({
                                    ...order,
                                    customer_name: order.customer_name ?? "",
                                    customer_phone: order.customer_phone ?? "",
                                    items: order.order_items,
                                    address,
                                    restaurantName,
                                  })}
                                >
                                  Confirmar no WhatsApp
                                </a>
                              </Button>
                            </>
                          )}
                          {canCancel(order.status) && (
                            <Button
                              variant="ghost"
                              disabled={busy}
                              onClick={() => open(order, "cancelado")}
                            >
                              Cancelar pedido
                            </Button>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              {!orders.some((o) => o.status === column) && (
                <div className="kanban-empty">
                  <ShoppingBag />
                  <p>Nenhum pedido nesta etapa.</p>
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
      <Modal
        open={!!selected}
        onOpenChange={(isOpen) => {
          if (!isOpen && !busy) setSelected(null);
        }}
        title={
          kind === "cancel"
            ? "Cancelar pedido"
            : kind === "refuse"
              ? "Recusar pedido"
              : `Pedido #${selected?.number}`
        }
        description="Confirme a atualização para avisar o cliente."
      >
        {selected && (
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              try {
                await change(
                  selected,
                  status,
                  String(form.get("reason") || "") || undefined,
                  form.get("estimate")
                    ? Number(form.get("estimate"))
                    : undefined,
                );
                setSelected(null);
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            {kind === "cancel" || kind === "refuse" ? (
              <label className="form-label">
                {kind === "refuse"
                  ? "Motivo da recusa"
                  : "Motivo do cancelamento"}
                <textarea
                  name="reason"
                  required
                  minLength={3}
                  maxLength={300}
                />
              </label>
            ) : (
              <>
                <p>
                  Atualizar para{" "}
                  <strong>{statusLabel(status, selected.fulfillment)}</strong>.
                </p>
                {kind === "accept" && (
                  <label className="form-label">
                    Tempo estimado em minutos
                    <input
                      type="number"
                      name="estimate"
                      required
                      min={1}
                      max={180}
                    />
                  </label>
                )}
                {kind === "preparing" && (
                  <label className="form-label">
                    Estimativa de preparo em minutos (opcional)
                    <input type="number" name="estimate" min={1} max={180} />
                  </label>
                )}
              </>
            )}
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "Atualizando…" : "Confirmar atualização"}
            </Button>
          </form>
        )}
      </Modal>
    </>
  );
}
