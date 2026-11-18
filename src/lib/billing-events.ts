import { addCycle, priceFor, webhookStatus, type BillingStatus, type Cycle, type SellablePlan } from "./plans";

// Pure billing decisions: given the stored billing row and an Asaas event (or an owner request),
// which columns change.
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
  pending_since: string | null;
  // came back after a cancellation: the first charge skips the implantação
  reactivated?: boolean;
};
export type WebhookPayment = { id?: string; subscription?: string | null; dueDate?: string | null };
export type WebhookContext = {
  // id of the subscription named by a SUBSCRIPTION_* event
  subscriptionId?: string | null;
  // a PAYMENT_CONFIRMED for this same payment was already processed
  confirmedAlready?: boolean;
};
export type WebhookDecision = {
  patch: Partial<BillingRow>;
  firstActivation: boolean;
  // setup charge paid and no Asaas subscription yet: the handler creates it
  createSubscription: boolean;
  // the event activates/renews: the handler must verify the payment with Asaas first
  needsVerification: boolean;
  cancelAsaasSubscription: boolean;
};
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// A payment event only counts when it is this restaurant's current setup charge or a charge of its
// subscription; anything else (old abandoned charges, foreign ids) is stored and ignored.
export function isCurrentPayment(row: BillingRow, payment: WebhookPayment | null) {
  if (!payment) return false;
  if (payment.id && payment.id === row.setup_payment_id) return true;
  return Boolean(payment.subscription && payment.subscription === row.asaas_subscription_id);
}

export function decideWebhook(
  row: BillingRow,
  event: string,
  payment: WebhookPayment | null,
  ctx: WebhookContext = {},
): WebhookDecision | null {
  const next = webhookStatus(event);
  if (!next) return null;
  const none = { firstActivation: false, createSubscription: false, needsVerification: false, cancelAsaasSubscription: false };
  if (event.startsWith("PAYMENT_")) {
    if (!isCurrentPayment(row, payment)) return null;
  } else if (ctx.subscriptionId && ctx.subscriptionId !== row.asaas_subscription_id) {
    return null;
  }
  const dueDate = isDate(payment?.dueDate) ? payment.dueDate : null;
  if (next === "ativo") {
    // A refunded/deleted plan only comes back through a new checkout (start_subscription).
    if (row.status === "cancelado" || row.status === "cortesia") return null;
    // PAYMENT_RECEIVED trails PAYMENT_CONFIRMED for the same payment: nothing new to apply.
    if (event === "PAYMENT_RECEIVED" && ctx.confirmedAlready) return null;
    // A payment older than the current overdue charge does not clear the overdue state.
    const stale = Boolean(row.overdue_since && dueDate && dueDate < row.overdue_since);
    const patch: Partial<BillingRow> = stale ? {} : { status: "ativo", overdue_since: null };
    let cycle = row.cycle;
    // The next confirmed subscription charge due on/after the scheduling day applies a scheduled downgrade.
    if (
      payment?.subscription && row.pending_plan && row.pending_cycle && dueDate &&
      (!row.pending_since || dueDate >= row.pending_since)
    ) {
      cycle = row.pending_cycle;
      patch.plan = row.pending_plan;
      patch.cycle = row.pending_cycle;
      patch.price_cents = priceFor(row.pending_plan, row.pending_cycle, false);
      patch.founder = false;
      patch.pending_plan = null;
      patch.pending_cycle = null;
      patch.pending_since = null;
    }
    if (dueDate) {
      const end = addCycle(dueDate, cycle);
      patch.current_period_end = row.current_period_end && row.current_period_end > end ? row.current_period_end : end;
    }
    return {
      patch,
      firstActivation: row.status === "pendente",
      createSubscription: Boolean(payment?.id && payment.id === row.setup_payment_id && !row.asaas_subscription_id),
      needsVerification: true,
      cancelAsaasSubscription: false,
    };
  }
  if (next === "atrasado") {
    // Only a paying restaurant can fall behind; an unpaid first checkout stays pendente.
    if (row.status !== "ativo" && row.status !== "atrasado") return null;
    return {
      ...none,
      patch: { status: "atrasado", overdue_since: row.overdue_since ?? dueDate },
    };
  }
  // cancelado
  if (row.status === "cortesia") return null;
  // A refund (full or partial) of the current charge ends the plan: the guarantee returns the plan amount.
  const isRefund = event === "PAYMENT_REFUNDED" || event === "PAYMENT_PARTIALLY_REFUNDED";
  // Our own cancel already scheduled cancel_at; the Asaas deletion echo must not cut the paid period.
  if ((event === "SUBSCRIPTION_DELETED" || event === "SUBSCRIPTION_INACTIVATED") && row.cancel_at) return null;
  return {
    ...none,
    patch: isRefund ? { status: "cancelado", cancel_at: null } : { status: "cancelado" },
    cancelAsaasSubscription: isRefund && Boolean(row.asaas_subscription_id),
  };
}

// Owner plan change. Upgrade = neither dimension goes down (applies now, new price immediately);
// everything else (downgrade, mixed) is scheduled for the next subscription charge. The founder
// price is only lost when a change actually applies; a scheduled change keeps it until then.
export type ChangeRequest = { plan: SellablePlan; cycle: Cycle; confirmFounderLoss?: boolean };
export type ChangeDecision =
  | { kind: "invalid" }
  | { kind: "founder_confirm" }
  | { kind: "keep" | "upgrade" | "schedule"; valueCents: number; cycle: Cycle; patch: Partial<BillingRow> };
const planRank = { essencial: 0, profissional: 1 } as const;
const cycleRank = { mensal: 0, anual: 1 } as const;

export function decideChangePlan(
  row: Pick<BillingRow, "plan" | "cycle" | "founder" | "pending_plan">,
  request: ChangeRequest,
  today: string,
): ChangeDecision {
  const plan = row.plan as SellablePlan;
  const same = request.plan === plan && request.cycle === row.cycle;
  if (same) {
    if (!row.pending_plan) return { kind: "invalid" };
    // Choosing the current plan again cancels a scheduled downgrade; Asaas goes back to the
    // current price (founder price included) and the row price stays consistent with it.
    const valueCents = priceFor(plan, row.cycle, row.founder);
    return {
      kind: "keep",
      valueCents,
      cycle: row.cycle,
      patch: { price_cents: valueCents, pending_plan: null, pending_cycle: null, pending_since: null },
    };
  }
  if (row.founder && !request.confirmFounderLoss) return { kind: "founder_confirm" };
  const valueCents = priceFor(request.plan, request.cycle, false);
  const upgrade = planRank[request.plan] >= planRank[plan] && cycleRank[request.cycle] >= cycleRank[row.cycle];
  if (upgrade) {
    return {
      kind: "upgrade",
      valueCents,
      cycle: request.cycle,
      patch: {
        plan: request.plan,
        cycle: request.cycle,
        price_cents: valueCents,
        founder: false,
        pending_plan: null,
        pending_cycle: null,
        pending_since: null,
      },
    };
  }
  return {
    kind: "schedule",
    valueCents,
    cycle: request.cycle,
    patch: { pending_plan: request.plan, pending_cycle: request.cycle, pending_since: today },
  };
}
