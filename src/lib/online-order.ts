import { paymentNames, type Fulfillment, type PaymentMethod } from "./order-flow";

export function orderTotals(
  subtotal: number,
  fulfillment: Fulfillment,
  zone?: { fee_cents: number } | null,
) {
  const fee = fulfillment === "entrega" && zone ? zone.fee_cents : 0;
  return { subtotal, fee, total: subtotal + fee };
}

export function missingForMinimum(subtotal: number, minimum: number) {
  return Math.max(0, minimum - subtotal);
}

export function isValidChange(
  changeFor: number | null,
  total: number,
  payment: PaymentMethod,
) {
  if (changeFor === null) return true;
  return payment === "dinheiro" && changeFor >= total;
}

export type WhatsAppOrder = {
  number: number;
  customer_name: string;
  customer_phone: string;
  fulfillment: Fulfillment;
  total_cents: number;
  payment_method: PaymentMethod | null;
  change_for_cents: number | null;
  items: { quantity: number; product_name: string }[];
  address?: {
    zone_name: string;
    street: string;
    number: string;
    complement: string;
    reference: string;
  } | null;
  restaurantName: string;
};

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Opens a chat started by the staff; nothing is sent automatically.
export function whatsappConfirmationLink(order: WhatsAppOrder) {
  const lines = [
    `Olá, ${order.customer_name}! Aqui é do ${order.restaurantName}.`,
    `Recebemos seu pedido #${order.number}:`,
    ...order.items.map((i) => `• ${i.quantity}× ${i.product_name}`),
  ];
  if (order.address) {
    const a = order.address;
    lines.push(
      `Entrega: ${a.street}, ${a.number} · ${a.zone_name}` +
        (a.complement ? ` (${a.complement})` : "") +
        (a.reference ? ` — ${a.reference}` : ""),
    );
  } else if (order.fulfillment === "retirada") lines.push("Retirada no balcão.");
  if (order.payment_method)
    lines.push(
      `Pagamento: ${paymentNames[order.payment_method]}` +
        (order.change_for_cents
          ? ` (troco para ${brl(order.change_for_cents)})`
          : ""),
    );
  lines.push(`Total: ${brl(order.total_cents)}`, "Podemos confirmar?");
  return `https://wa.me/55${order.customer_phone}?text=${encodeURIComponent(lines.join("\n"))}`;
}
