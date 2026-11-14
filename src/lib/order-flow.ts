// Order lifecycle per fulfillment. Mirrors advance_order in migration 014.
export type Fulfillment = "mesa" | "retirada" | "entrega";
export type OrderStatus =
  | "aguardando_pagamento"
  | "aguardando_aceite"
  | "recebido"
  | "em_preparo"
  | "pronto"
  | "saiu_para_entrega"
  | "entregue"
  | "recusado"
  | "cancelado";
export type PaymentMethod = "dinheiro" | "cartao" | "pix";

export const paymentNames: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  cartao: "Cartão na maquininha",
  pix: "Pix na hora",
};

const names: Record<OrderStatus, string> = {
  aguardando_pagamento: "Aguardando pagamento",
  aguardando_aceite: "Aguardando o restaurante aceitar",
  recebido: "Recebido",
  em_preparo: "Em preparo",
  pronto: "Pronto",
  saiu_para_entrega: "Saiu para entrega",
  entregue: "Entregue",
  recusado: "Recusado",
  cancelado: "Cancelado",
};

export function statusLabel(status: OrderStatus, fulfillment: Fulfillment) {
  if (fulfillment === "retirada" && status === "pronto")
    return "Pronto para retirar";
  if (fulfillment === "retirada" && status === "entregue") return "Retirado";
  return names[status];
}

// paysFirst: the order was created waiting for an advance Pix payment.
export function customerSteps(fulfillment: Fulfillment, paysFirst = false): OrderStatus[] {
  if (fulfillment === "mesa")
    return ["recebido", "em_preparo", "pronto", "entregue"];
  const first: OrderStatus = paysFirst ? "aguardando_pagamento" : "aguardando_aceite";
  if (fulfillment === "retirada")
    return [first, "recebido", "em_preparo", "pronto", "entregue"];
  return [
    first,
    "recebido",
    "em_preparo",
    "pronto",
    "saiu_para_entrega",
    "entregue",
  ];
}

export function paysFirst(order: { order_status_events: { status: string }[] }) {
  return order.order_status_events.some((e) => e.status === "aguardando_pagamento");
}

export function paymentLabel(method: PaymentMethod, pixOnline: boolean) {
  return method === "pix" && pixOnline ? "Pix agora, pelo cardápio" : paymentNames[method];
}

export function nextAction(
  status: OrderStatus,
  fulfillment: Fulfillment,
): { status: OrderStatus; label: string } | null {
  if (status === "aguardando_pagamento")
    return { status: "recebido", label: "Pix recebido" };
  if (status === "aguardando_aceite")
    return { status: "recebido", label: "Aceitar pedido" };
  if (status === "recebido")
    return { status: "em_preparo", label: "Iniciar preparo" };
  if (status === "em_preparo") return { status: "pronto", label: "Marcar pronto" };
  if (status === "pronto" && fulfillment === "entrega")
    return { status: "saiu_para_entrega", label: "Saiu para entrega" };
  if (status === "pronto")
    return {
      status: "entregue",
      label: fulfillment === "retirada" ? "Confirmar retirada" : "Confirmar entrega",
    };
  if (status === "saiu_para_entrega")
    return { status: "entregue", label: "Confirmar entrega" };
  return null;
}

export function canCancel(status: OrderStatus) {
  return ["aguardando_pagamento", "recebido", "em_preparo", "saiu_para_entrega"].includes(status);
}

export function fulfillmentLabel(order: {
  fulfillment: Fulfillment;
  table?: number | null;
  zone?: string | null;
}) {
  if (order.fulfillment === "mesa")
    return `Mesa ${String(order.table ?? "").padStart(2, "0")}`;
  if (order.fulfillment === "retirada") return "Retirada";
  return order.zone ? `Entrega · ${order.zone}` : "Entrega";
}
