// Presentation rules for the restaurant CRM. Totals and segments come from the
// database (crm_rows in migration 012); nothing here recomputes them.
export type CrmSegment = "novo" | "recorrente" | "vip" | "sumido" | "sem_pedidos";
export const CRM_SEGMENTS: CrmSegment[] = ["novo", "recorrente", "vip", "sumido", "sem_pedidos"];
export const segmentNames: Record<CrmSegment, string> = {
  novo: "Novos",
  recorrente: "Recorrentes",
  vip: "VIP",
  sumido: "Sumidos",
  sem_pedidos: "Sem pedidos",
};
export const segmentLabel: Record<CrmSegment, string> = {
  novo: "Novo",
  recorrente: "Recorrente",
  vip: "VIP",
  sumido: "Sumido",
  sem_pedidos: "Sem pedidos",
};
export const CRM_PAGE_SIZE = 50;

export type CrmSettings = {
  recurring_min_orders: number;
  recurring_days: number;
  vip_min_orders: number;
  vip_min_spent_cents: number;
  vip_days: number;
  lapsed_days: number;
};
export const DEFAULT_CRM_SETTINGS: CrmSettings = {
  recurring_min_orders: 2,
  recurring_days: 60,
  vip_min_orders: 5,
  vip_min_spent_cents: 50000,
  vip_days: 90,
  lapsed_days: 30,
};
export function settingsFromRestaurant(r: {
  crm_recurring_min_orders: number;
  crm_recurring_days: number;
  crm_vip_min_orders: number;
  crm_vip_min_spent_cents: number;
  crm_vip_days: number;
  crm_lapsed_days: number;
}): CrmSettings {
  return {
    recurring_min_orders: r.crm_recurring_min_orders,
    recurring_days: r.crm_recurring_days,
    vip_min_orders: r.crm_vip_min_orders,
    vip_min_spent_cents: r.crm_vip_min_spent_cents,
    vip_days: r.crm_vip_days,
    lapsed_days: r.crm_lapsed_days,
  };
}

export type CrmCustomer = {
  id: string;
  name: string;
  phone: string;
  marketing_status: "authorized" | "not_authorized" | "revoked";
  tags: string[];
  orders_count: number;
  spent_cents: number;
  avg_ticket_cents: number;
  first_order_at: string | null;
  last_order_at: string | null;
  segment: CrmSegment;
};
export type CrmList = {
  total: number;
  segments: Record<CrmSegment, number>;
  customers: CrmCustomer[];
};
export type CrmDetail = CrmCustomer & {
  notes: string;
  favorites: { product_name: string; quantity: number }[];
  fulfillment_mix: { mesa: number; retirada: number; entrega: number };
  addresses: {
    zone_name: string;
    street: string;
    number: string;
    complement: string;
    reference: string;
  }[];
  orders: {
    id: string;
    number: number;
    created_at: string;
    status: string;
    fulfillment: "mesa" | "retirada" | "entrega";
    total_cents: number;
  }[];
};
export type CampaignRow = {
  id: string;
  name: string;
  phone: string;
  segment: CrmSegment;
  last_order_at: string | null;
  spent_cents: number;
};

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? "";
}

export function fillCampaignMessage(template: string, name: string) {
  return template
    .replace(/\{nome\}/gi, firstName(name))
    .replace(/[ \t]+([,!.?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// Opens a chat started by the restaurant; nothing is sent automatically.
export function campaignLink(phone: string, message: string) {
  return `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;
}

function cell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function customersCsv(rows: CampaignRow[]) {
  const header = "nome;whatsapp;segmento;ultimo_pedido;total_gasto";
  const lines = rows.map((r) =>
    [
      cell(r.name),
      cell(r.phone),
      cell(segmentLabel[r.segment]),
      r.last_order_at
        ? new Date(r.last_order_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
        : "",
      (r.spent_cents / 100).toFixed(2).replace(".", ","),
    ].join(";"),
  );
  return "﻿" + [header, ...lines].join("\r\n");
}
