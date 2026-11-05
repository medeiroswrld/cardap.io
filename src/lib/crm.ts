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
    .replace(/\{nome\}/gi, () => firstName(name))
    .replace(/[ \t]+([,!.?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// Opens a chat started by the restaurant; nothing is sent automatically.
export function chatLink(phone: string) {
  return `https://wa.me/55${phone.replace(/\D/g, "")}`;
}
export function campaignLink(phone: string, message: string) {
  return `${chatLink(phone)}?text=${encodeURIComponent(message)}`;
}

function cell(value: string) {
  const safe = /^[\t\r]|^\s*[=+\-@]/.test(value) ? `'${value}` : value;
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

export const CRM_MAX_TAGS = 10;
export const CRM_TAG_MAX_LENGTH = 30;

// Validates a tag typed by the owner against the tags already on the customer.
export function checkNewTag(tags: string[], raw: string): { value: string; error: string } {
  const value = raw.trim().slice(0, CRM_TAG_MAX_LENGTH);
  if (!value) return { value, error: "" };
  if (tags.length >= CRM_MAX_TAGS) return { value, error: `Limite de ${CRM_MAX_TAGS} etiquetas atingido.` };
  if (tags.some((t) => t.toLowerCase() === value.toLowerCase())) return { value, error: "Essa etiqueta já existe." };
  return { value, error: "" };
}

const settingsRules: { key: Exclude<keyof CrmSettings, "vip_min_spent_cents">; label: string; min: number; max: number }[] = [
  { key: "recurring_min_orders", label: "Recorrente: mínimo de pedidos", min: 2, max: 50 },
  { key: "recurring_days", label: "Recorrente: dias", min: 7, max: 365 },
  { key: "vip_min_orders", label: "VIP: mínimo de pedidos", min: 2, max: 100 },
  { key: "vip_days", label: "VIP: dias", min: 7, max: 365 },
  { key: "lapsed_days", label: "Sumido: dias sem pedir", min: 7, max: 365 },
];

// Parses raw form strings (vip_min_spent in reais) into settings; limits mirror the server.
export function parseCrmSettings(
  input: Record<string, string>,
): { ok: true; values: CrmSettings } | { ok: false; errors: Record<string, string> } {
  // Keyed by input field so each message can be linked to its input.
  const errors: Record<string, string> = {};
  const out = {} as CrmSettings;
  for (const { key, label, min, max } of settingsRules) {
    const raw = (input[key] ?? "").trim();
    const n = Number(raw);
    if (!raw || !Number.isInteger(n) || n < min || n > max) {
      errors[key] = `${label}: informe um número inteiro de ${min} a ${max}.`;
    } else out[key] = n;
  }
  const rawSpent = (input.vip_min_spent ?? "").trim().replace(",", ".");
  const spent = Number(rawSpent);
  if (!rawSpent || !Number.isFinite(spent) || spent < 0 || spent > 1_000_000) {
    errors.vip_min_spent = "VIP: gasto mínimo: informe um valor em reais de 0 a 1.000.000.";
  } else out.vip_min_spent_cents = Math.round(spent * 100);
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values: out };
}
