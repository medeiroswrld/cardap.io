import { statusLabel, type OrderStatus } from "./order-flow";

const OPEN: OrderStatus[] = [
  "aguardando_pagamento",
  "aguardando_aceite",
  "recebido",
  "em_preparo",
  "pronto",
  "saiu_para_entrega",
];
const HISTORY: OrderStatus[] = ["entregue", "recusado", "cancelado"];

// Columns that only exist for online orders are hidden while empty.
const ONLINE_ONLY: OrderStatus[] = ["aguardando_pagamento", "aguardando_aceite", "saiu_para_entrega"];
export function boardColumns(orders: { status: string }[], history: boolean) {
  if (history) return HISTORY;
  return OPEN.filter(
    (column) => !ONLINE_ONLY.includes(column) || orders.some((o) => o.status === column),
  );
}

export function columnTitle(column: OrderStatus) {
  return column === "aguardando_aceite"
    ? "Aguardando aceite"
    : statusLabel(column, "mesa");
}

export type ModalKind = "accept" | "refuse" | "cancel" | "preparing" | "confirm";

export function modalKind(from: OrderStatus, to: OrderStatus): ModalKind {
  if (to === "recusado") return "refuse";
  if (to === "cancelado") return "cancel";
  if (from === "aguardando_aceite" && to === "recebido") return "accept";
  if (to === "em_preparo") return "preparing";
  return "confirm";
}

export function minutesWaiting(createdAt: string, now: number) {
  return Math.max(0, Math.floor((now - Date.parse(createdAt)) / 60000));
}
