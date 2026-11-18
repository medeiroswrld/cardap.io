import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Asaas, AsaasPayment } from "./asaas";
import { decideWebhook, type BillingRow, type WebhookPayment } from "./billing-events";
import { addCycle, priceFor, SETUP_FEE_CENTS, todayBrt } from "./plans";

// Asaas webhook processing, with its collaborators injected so it can be tested without a network
// or a database. Asaas delivers at least once and unordered, and pauses the queue after 15
// consecutive non-200 answers, so: transient failures (database, Asaas outage) answer 5xx and are
// retried (the event stays unprocessed); everything else is logged and answered 200.
export type WebhookDeps = {
  service: SupabaseClient;
  // null/throwing when the integration is not configured
  asaas: () => Asaas;
  token: string | undefined;
  notify?: (restaurantId: string, plan: string) => Promise<void>;
  log?: (event: "billing.founder_overflow" | "billing.webhook_ignored", reason?: string) => void;
  today?: () => string;
};

const uuid = z.uuid();
const payload = z.object({
  id: z.string().min(1).max(200),
  event: z.string().min(1).max(100),
  payment: z
    .object({
      id: z.string().optional(),
      customer: z.string().optional(),
      subscription: z.string().nullish(),
      externalReference: z.string().nullish(),
      dueDate: z.string().nullish(),
    })
    .loose()
    .optional(),
  subscription: z
    .object({
      id: z.string().optional(),
      customer: z.string().optional(),
      externalReference: z.string().nullish(),
    })
    .loose()
    .optional(),
});
type Body = z.infer<typeof payload>;

function tokenMatches(received: string | null, expected: string | undefined) {
  if (!expected) throw new Error("BILLING_UNAVAILABLE");
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Restaurant from our externalReference first; falls back to the stored Asaas ids because
// subscription charges may not carry the reference.
async function findRow(service: SupabaseClient, body: Body) {
  const refs = [body.payment?.externalReference, body.subscription?.externalReference].filter(
    (v): v is string => typeof v === "string" && uuid.safeParse(v).success,
  );
  const lookups: [string, string][] = refs.map((v) => ["restaurant_id", v]);
  const subscriptionId = body.payment?.subscription ?? body.subscription?.id;
  if (subscriptionId) lookups.push(["asaas_subscription_id", subscriptionId]);
  const customerId = body.payment?.customer ?? body.subscription?.customer;
  if (customerId) lookups.push(["asaas_customer_id", customerId]);
  for (const [column, value] of lookups) {
    const { data, error } = await service.from("restaurant_billing").select("*").eq(column, value).maybeSingle();
    if (error) throw error;
    if (data) return data as BillingRow;
  }
  return null;
}

// Retryable: the database or Asaas is unavailable. Anything else is not going to fix itself.
function isTransient(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const e = error as { message?: unknown; code?: unknown };
  if (e.message === "BILLING_UNAVAILABLE") return true;
  // PostgREST/network errors carry a string `code` (possibly empty); plain Errors do not.
  return typeof e.code === "string";
}

const ok = (extra: Record<string, unknown> = {}) =>
  Response.json({ ok: true, ...extra }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });

// Verifies the payment with Asaas itself instead of trusting the webhook body.
async function verifiedPayment(asaas: Asaas, row: BillingRow, payment: WebhookPayment): Promise<AsaasPayment | null> {
  let remote: AsaasPayment;
  try {
    remote = await asaas.getPayment(String(payment.id));
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return null;
    throw error; // transient: Asaas retries
  }
  if (remote.status !== "CONFIRMED" && remote.status !== "RECEIVED") return null;
  if (!row.asaas_customer_id || remote.customer !== row.asaas_customer_id) return null;
  const cents = Math.round(remote.value * 100);
  const accepted =
    payment.id === row.setup_payment_id
      ? [SETUP_FEE_CENTS + row.price_cents]
      : [
          row.price_cents,
          ...(row.pending_plan && row.pending_cycle ? [priceFor(row.pending_plan, row.pending_cycle, false)] : []),
        ];
  return accepted.includes(cents) ? remote : null;
}

async function apply(deps: WebhookDeps, row: BillingRow, body: Body) {
  const { service } = deps;
  const today = (deps.today ?? todayBrt)();
  const payment: WebhookPayment | null = body.payment ?? null;

  let confirmedAlready = false;
  if (body.event === "PAYMENT_RECEIVED" && payment?.id) {
    const { data, error } = await service
      .from("billing_events")
      .select("id")
      .eq("payment_id", payment.id)
      .eq("type", "PAYMENT_CONFIRMED")
      .not("processed_at", "is", null)
      .limit(1);
    if (error) throw error;
    confirmedAlready = Array.isArray(data) && data.length > 0;
  }
  let decision = decideWebhook(row, body.event, payment, { subscriptionId: body.subscription?.id, confirmedAlready });
  if (!decision) {
    deps.log?.("billing.webhook_ignored", "no-decision");
    return;
  }

  if (decision.needsVerification && payment) {
    const remote = await verifiedPayment(deps.asaas(), row, payment);
    if (!remote) {
      deps.log?.("billing.webhook_ignored", "payment-not-verified");
      return;
    }
    // Trust Asaas's own due date over the webhook body.
    payment.dueDate = remote.dueDate ?? payment.dueDate;
    const again = decideWebhook(row, body.event, payment, { subscriptionId: body.subscription?.id, confirmedAlready });
    if (!again) return;
    decision = again;
  }

  // First activation: the Asaas subscription starts one cycle after the first charge's due date.
  if (decision.createSubscription && row.asaas_customer_id) {
    const due = payment?.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(payment.dueDate) ? payment.dueDate : today;
    let nextDueDate = addCycle(due, row.cycle);
    if (nextDueDate < today) nextDueDate = today;
    const label = row.plan === "profissional" ? "Profissional" : "Essencial";
    const subscription = await deps.asaas().createSubscription({
      customer: row.asaas_customer_id,
      valueCents: row.price_cents,
      nextDueDate,
      cycle: row.cycle,
      description: `Fome Play ${label} - assinatura ${row.cycle}`,
      externalReference: row.restaurant_id,
    });
    const saved = await service
      .from("restaurant_billing")
      .update({ asaas_subscription_id: subscription.id })
      .eq("restaurant_id", row.restaurant_id);
    if (saved.error) throw saved.error;
  }

  if (Object.keys(decision.patch).length > 0) {
    const { error } = await service.from("restaurant_billing").update(decision.patch).eq("restaurant_id", row.restaurant_id);
    if (error) throw error;
  }
  if (decision.firstActivation && decision.patch.status === "ativo") {
    const { count } = await service
      .from("restaurant_billing")
      .select("restaurant_id", { count: "exact", head: true })
      .eq("founder", true)
      .in("status", ["ativo", "atrasado"]);
    // Rare race on the last slot: the founder keeps the price, we only record the overflow.
    if (row.founder && (count ?? 0) > 10) deps.log?.("billing.founder_overflow");
    await deps.notify?.(row.restaurant_id, String(decision.patch.plan ?? row.plan));
  }
  if (decision.cancelAsaasSubscription && row.asaas_subscription_id) {
    await deps.asaas().cancelSubscription(row.asaas_subscription_id);
  }
}

export async function processAsaasWebhook(request: Request, deps: WebhookDeps): Promise<Response> {
  if (!tokenMatches(request.headers.get("asaas-access-token"), deps.token)) throw new Error("UNAUTHORIZED");
  const { service } = deps;
  const parsed = payload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    deps.log?.("billing.webhook_ignored", "bad-payload");
    return ok({ ignored: true });
  }
  const body = parsed.data;
  const row = await findRow(service, body);
  const { error: insertError } = await service.from("billing_events").insert({
    id: body.id,
    restaurant_id: row?.restaurant_id ?? null,
    type: body.event,
    payload: body,
    payment_id: body.payment?.id ?? null,
  });
  if (insertError) {
    if (insertError.code !== "23505") throw insertError;
    // Known event: finished ones are acknowledged, unfinished ones (crash/5xx earlier) run again.
    const { data: existing, error } = await service
      .from("billing_events")
      .select("processed_at")
      .eq("id", body.id)
      .maybeSingle();
    if (error) throw error;
    if (existing?.processed_at) return ok({ duplicate: true });
  }
  try {
    if (row) await apply(deps, row, body);
    else deps.log?.("billing.webhook_ignored", "unknown-restaurant");
  } catch (error) {
    if (isTransient(error)) throw error;
    deps.log?.("billing.webhook_ignored", "processing-error");
  }
  const { error: doneError } = await service
    .from("billing_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", body.id);
  if (doneError) throw doneError;
  return ok();
}
