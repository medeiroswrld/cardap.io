import { addCycle, priceFor, webhookStatus, type BillingStatus, type Cycle, type SellablePlan } from "./plans";

// Pure webhook decision: given the stored billing row and an Asaas event, which columns change.
export type BillingRow = {
  restaurant_id: string;
  plan: string;
  cycle: Cycle;
  status: BillingStatus;
  founder: boolean;
  price_cents: number;
  asaas_customer_id: string | null;
  asaas_subscription_id: string | null;
  setup_payment_id: string | null;
  current_period_end: string | null;
  overdue_since: string | null;
  cancel_at: string | null;
  pending_plan: SellablePlan | null;
  pending_cycle: Cycle | null;
};
export type WebhookPayment = { id?: string; subscription?: string | null; dueDate?: string | null };
export type WebhookDecision = {
  patch: Partial<BillingRow>;
  firstActivation: boolean;
  cancelAsaasSubscription: boolean;
};
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function decideWebhook(row: BillingRow, event: string, payment: WebhookPayment | null): WebhookDecision | null {
  const next = webhookStatus(event);
  if (!next) return null;
  const none = { firstActivation: false, cancelAsaasSubscription: false };
  if (next === "ativo") {
    // A refunded/deleted plan only comes back through a new checkout (start_subscription).
    if (row.status === "cancelado" || row.status === "cortesia") return null;
    const patch: Partial<BillingRow> = { status: "ativo", overdue_since: null };
    let cycle = row.cycle;
    // The next confirmed subscription charge applies a scheduled downgrade.
    if (payment?.subscription && row.pending_plan && row.pending_cycle) {
      cycle = row.pending_cycle;
      patch.plan = row.pending_plan;
      patch.cycle = row.pending_cycle;
      patch.price_cents = priceFor(row.pending_plan, row.pending_cycle, false);
      patch.pending_plan = null;
      patch.pending_cycle = null;
    }
    if (isDate(payment?.dueDate)) {
      const end = addCycle(payment.dueDate, cycle);
      patch.current_period_end = row.current_period_end && row.current_period_end > end ? row.current_period_end : end;
    }
    return { patch, firstActivation: row.status === "pendente", cancelAsaasSubscription: false };
  }
  if (next === "atrasado") {
    // Only a paying restaurant can fall behind; an unpaid first checkout stays pendente.
    if (row.status !== "ativo" && row.status !== "atrasado") return null;
    return {
      ...none,
      patch: { status: "atrasado", overdue_since: row.overdue_since ?? (isDate(payment?.dueDate) ? payment.dueDate : null) },
    };
  }
  // cancelado
  if (row.status === "cortesia") return null;
  // Our own cancel already scheduled cancel_at; the Asaas deletion echo must not cut the paid period.
  if ((event === "SUBSCRIPTION_DELETED" || event === "SUBSCRIPTION_INACTIVATED") && row.cancel_at) return null;
  return {
    patch: { status: "cancelado" },
    firstActivation: false,
    cancelAsaasSubscription: event === "PAYMENT_REFUNDED" && Boolean(row.asaas_subscription_id),
  };
}
