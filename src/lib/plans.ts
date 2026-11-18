import type { PageKey } from "./admin-sections";

// Plans and prices (cents). Keep in sync with start_subscription() in 021_billing.sql.
export type Plan = "essencial" | "profissional" | "agencia";
export type SellablePlan = "essencial" | "profissional";
export type Cycle = "mensal" | "anual";
export type BillingStatus = "pendente" | "ativo" | "atrasado" | "cancelado" | "cortesia";
export type BillingState = BillingStatus | "bloqueado";

export const PLAN_PRICES: Record<SellablePlan, Record<Cycle, number>> = {
  essencial: { mensal: 14900, anual: 149000 },
  profissional: { mensal: 24900, anual: 249000 },
};
export const AGENCY_MONTHLY_CENTS = 59700;
export const SETUP_FEE_CENTS = 29700;
export const FOUNDER_PRICE_CENTS = 17900;
export const FOUNDER_SLOTS = 10;

export type Feature =
  | "crm" | "reviews" | "coupons" | "lapsed" | "results" | "metrics" | "origin"
  | "finance" | "upsell" | "theme_full";

// Minimum plan for each feature. Everything else is available from Essencial.
export const FEATURES: Record<Feature, SellablePlan> = {
  crm: "profissional",
  reviews: "profissional",
  coupons: "profissional",
  lapsed: "profissional",
  results: "profissional",
  metrics: "profissional",
  origin: "profissional",
  finance: "profissional",
  upsell: "profissional",
  theme_full: "profissional",
};
const PAGE_FEATURE: Partial<Record<PageKey, Feature>> = {
  contatos: "crm",
  avaliacoes: "reviews",
  cupons: "coupons",
  reconquistar: "lapsed",
  resultados: "results",
  metricas: "metrics",
  origem: "origin",
  caixa: "finance",
  mes: "finance",
  contas: "finance",
};
const RANK: Record<Plan, number> = { essencial: 0, profissional: 1, agencia: 1 };

export function pageFeature(page: PageKey): Feature | null {
  return PAGE_FEATURE[page] ?? null;
}
export function pagePlan(page: PageKey): SellablePlan {
  const feature = PAGE_FEATURE[page];
  return feature ? FEATURES[feature] : "essencial";
}
export function allows(plan: Plan, feature: Feature) {
  return RANK[plan] >= RANK[FEATURES[feature]];
}
export function priceFor(plan: SellablePlan, cycle: Cycle, founder = false) {
  if (founder && plan === "profissional" && cycle === "mensal") return FOUNDER_PRICE_CENTS;
  return PLAN_PRICES[plan][cycle];
}
export function firstChargeCents(plan: SellablePlan, cycle: Cycle, founder = false) {
  return SETUP_FEE_CENTS + priceFor(plan, cycle, founder);
}
// Orders are paused (menu stays online) while billing is not in good standing.
export function stateBlocks(state: string) {
  return state === "pendente" || state === "bloqueado" || state === "cancelado";
}
// Webhook event -> billing status. null = no status change (still stored in billing_events).
export function webhookStatus(event: string): BillingStatus | null {
  switch (event) {
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED":
      return "ativo";
    case "PAYMENT_OVERDUE":
      return "atrasado";
    case "PAYMENT_REFUNDED":
    case "SUBSCRIPTION_DELETED":
    case "SUBSCRIPTION_INACTIVATED":
      return "cancelado";
    default:
      return null;
  }
}
export function slugFromName(name: string) {
  let base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
  if (base.length < 3) base = "restaurante";
  if (base === "demo") base = "demo-restaurante";
  return base;
}
export const MIN_COMMISSION = 12;
export const MAX_COMMISSION = 30;
export function ifoodSavings(monthlyCents: number, percent: number) {
  const sales = Number.isFinite(monthlyCents) ? Math.max(0, monthlyCents) : 0;
  const rate = Number.isFinite(percent)
    ? Math.min(MAX_COMMISSION, Math.max(MIN_COMMISSION, percent))
    : MIN_COMMISSION;
  return Math.round((sales * rate) / 100);
}
// Date (YYYY-MM-DD) plus one billing cycle, clamped to the end of the month.
export function addCycle(date: string, cycle: Cycle) {
  const [y, m, d] = date.split("-").map(Number);
  const months = cycle === "anual" ? 12 : 1;
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
export function isSellablePlan(value: unknown): value is SellablePlan {
  return value === "essencial" || value === "profissional";
}
// Calendar dates in Brazil (billing dates are Asaas/BRT dates).
export function todayBrt(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}
export function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Server-side gating of the owner catalog route (POST /api/restaurants/[id]/catalog): the minimum
// feature each action needs. null = available on every plan. Keep in sync with the action schema
// there (scripts/test-plans.mjs fails when an action is missing from this map).
export const CATALOG_ACTIONS: Record<string, Feature | null> = {
  feedback_settings: "reviews",
  moderate_feedback: "reviews",
  save_option: null, // offer_in_bag: true needs "upsell", see catalogActionFeature
  options_in_bag_all: null, // offer: true needs "upsell"
  bag_suggestions: null, // a non-empty list needs "upsell"
  save_product: null,
  archive_product: null,
  save_category: null,
  remove_category: null,
  settings: null,
  save_delivery_zone: null,
  // LGPD: an owner must always be able to honour a marketing opt-out.
  revoke_marketing: null,
  save_pix: null,
  menu_theme: null, // keys beyond BASIC_THEME_KEYS need "theme_full"
  crm_settings: "crm",
  save_coupon: "coupons",
  delete_coupon: "coupons",
  save_origin: "origin",
  delete_origin: "origin",
  save_finance_entry: "finance",
  delete_finance_entry: "finance",
  set_entry_paid: "finance",
  save_payment_fees: "finance",
};
// Essencial's identity is logo, cover and main color only.
export const BASIC_THEME_KEYS = ["logo_url", "cover_url", "brand"] as const;

type CatalogBody = {
  action: string;
  offer_in_bag?: boolean;
  offer?: boolean;
  product_ids?: unknown[];
  theme?: Record<string, unknown>;
};
// The feature a catalog request needs (null = any plan). Turning offers off or clearing the
// suggestion list is always allowed, so an owner who downgraded can switch them off.
export function catalogActionFeature(body: CatalogBody): Feature | null {
  if (!Object.hasOwn(CATALOG_ACTIONS, body.action)) throw new Error("INVALID_INPUT");
  switch (body.action) {
    case "save_option":
      return body.offer_in_bag === true ? "upsell" : null;
    case "options_in_bag_all":
      return body.offer === true ? "upsell" : null;
    case "bag_suggestions":
      return (body.product_ids?.length ?? 0) > 0 ? "upsell" : null;
    case "menu_theme":
      return Object.keys(body.theme ?? {}).some((key) => !(BASIC_THEME_KEYS as readonly string[]).includes(key))
        ? "theme_full"
        : null;
    default:
      return CATALOG_ACTIONS[body.action];
  }
}

// Orders: billing that is not in good standing pauses them (CLOSED); Essencial has no coupons, so a
// coupon on the order is dropped (the customer is simply not discounted; the preview already said
// COUPON_INVALID). `cortesia`, `ativo` and `atrasado` never block.
export function gateOrder<T extends { coupon_code?: string | null; expected_discount_cents?: number | null }>(
  payload: T,
  plan: Plan,
  state: string,
): { blocked: boolean; payload: T } {
  if (stateBlocks(state)) return { blocked: true, payload };
  if (allows(plan, "coupons") || (!payload.coupon_code && payload.expected_discount_cents == null))
    return { blocked: false, payload };
  const { coupon_code: _code, expected_discount_cents: _discount, ...rest } = payload;
  void _code;
  void _discount;
  return { blocked: false, payload: rest as T };
}
