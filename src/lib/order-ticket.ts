// Kitchen/counter ticket for thermal printers (58 mm or 80 mm), printed from
// the browser. Pure functions: the component only opens the print dialog.
import { fulfillmentLabel, paymentNames, type Fulfillment, type PaymentMethod } from "./order-flow";
import type { AddOn } from "./product-options";

export type PaperWidth = 58 | 80;

export type TicketOrder = {
  id: string;
  number: number;
  status: string;
  fulfillment: Fulfillment;
  created_at: string;
  customer_name?: string;
  customer_phone?: string;
  total_cents: number;
  delivery_fee_cents: number;
  payment_method: PaymentMethod | null;
  change_for_cents: number | null;
  estimate_minutes: number | null;
  dining_tables: { number: number } | null;
  order_addresses: {
    zone_name: string;
    street: string;
    number: string;
    complement: string;
    reference: string;
  } | null;
  order_items: {
    product_name: string;
    quantity: number;
    unit_price_cents: number;
    note: string;
    removed_ingredients: string[];
    add_ons: AddOn[];
  }[];
};

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function escape(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

export function ticketHtml(
  order: TicketOrder,
  restaurantName: string,
  width: PaperWidth,
  timeZone?: string,
) {
  const e = escape;
  const when = new Date(order.created_at).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
  const where = fulfillmentLabel({
    fulfillment: order.fulfillment,
    table: order.dining_tables?.number,
    zone: order.order_addresses?.zone_name,
  });
  const items = order.order_items
    .map((item) => {
      // The server snapshot of the unit price already includes the add-ons.
      const unit = item.unit_price_cents;
      const lines = [
        `<div class="row item"><span>${item.quantity}x ${e(item.product_name)}</span><span>${brl(unit * item.quantity)}</span></div>`,
      ];
      if (item.removed_ingredients.length)
        lines.push(`<div class="sub">SEM: ${e(item.removed_ingredients.join(", "))}</div>`);
      if (item.add_ons.length)
        lines.push(`<div class="sub">+ ${e(item.add_ons.map((o) => o.name).join(", "))}</div>`);
      if (item.note) lines.push(`<div class="sub">OBS: ${e(item.note)}</div>`);
      return lines.join("");
    })
    .join("");
  const subtotal = order.total_cents - order.delivery_fee_cents;
  const a = order.order_addresses;
  const online = order.fulfillment !== "mesa";
  const parts: string[] = [
    `<div class="center strong">${e(restaurantName)}</div>`,
    `<div class="center big">PEDIDO #${order.number}</div>`,
    `<div class="center strong">${e(where.toUpperCase())}</div>`,
    `<div class="center">${e(when)}</div>`,
    `<hr>`,
  ];
  if (order.customer_name) parts.push(`<div>Cliente: ${e(order.customer_name)}</div>`);
  if (online && order.customer_phone)
    parts.push(`<div>Tel: ${e(formatPhone(order.customer_phone))}</div>`);
  if (order.fulfillment === "entrega" && a) {
    parts.push(
      `<div class="strong">${e(`${a.street}, ${a.number}`)}${a.complement ? ` - ${e(a.complement)}` : ""}</div>`,
      `<div>Bairro: ${e(a.zone_name)}</div>`,
    );
    if (a.reference) parts.push(`<div>Ref.: ${e(a.reference)}</div>`);
  }
  if (order.customer_name || (order.fulfillment === "entrega" && a)) parts.push(`<hr>`);
  parts.push(items, `<hr>`);
  if (order.delivery_fee_cents > 0)
    parts.push(
      `<div class="row"><span>Subtotal</span><span>${brl(subtotal)}</span></div>`,
      `<div class="row"><span>Taxa de entrega</span><span>${brl(order.delivery_fee_cents)}</span></div>`,
    );
  parts.push(`<div class="row big"><span>TOTAL</span><span>${brl(order.total_cents)}</span></div>`);
  if (order.payment_method) {
    parts.push(`<div>Pagamento: ${e(paymentNames[order.payment_method])}</div>`);
    if (order.change_for_cents)
      parts.push(
        `<div class="strong">Troco para ${brl(order.change_for_cents)} (levar ${brl(order.change_for_cents - order.total_cents)})</div>`,
      );
  }
  if (order.estimate_minutes) parts.push(`<div>Estimativa: ${order.estimate_minutes} min</div>`);
  parts.push(`<div class="center end">.</div>`);
  const body = width === 58 ? 48 : 72;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pedido #${order.number}</title><style>
@page{size:${width}mm auto;margin:0}
*{box-sizing:border-box}
body{width:${body}mm;margin:0 auto;padding:2mm 0;font:${width === 58 ? 11 : 12}px/1.35 "Courier New",monospace;color:#000;background:#fff}
.center{text-align:center}.strong{font-weight:700}.big{font-size:1.4em;font-weight:700;margin:1mm 0}
.row{display:flex;justify-content:space-between;gap:2mm}.item{font-weight:700;margin-top:1mm}
.sub{padding-left:3mm}hr{border:0;border-top:1px dashed #000;margin:2mm 0}.end{margin-top:4mm;color:#fff}
</style></head><body>${parts.join("")}</body></html>`;
}

// Auto-print rule: an order prints once, the first time it is seen as
// "recebido" (table orders, auto-accepted orders, or right after acceptance).
// Orders already on screen when printing was turned on are never reprinted.
export function ordersToPrint<T extends { id: string; status: string }>(
  orders: T[],
  printed: Set<string>,
) {
  return orders.filter((o) => o.status === "recebido" && !printed.has(o.id));
}
