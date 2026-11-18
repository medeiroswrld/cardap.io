import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Asaas, AsaasPayment } from "./asaas";
import { decideWebhook, type BillingRow, type WebhookPayment } from "./billing-events";
import { addCycle, priceFor, SETUP_FEE_CENTS, todayBrt, webhookStatus } from "./plans";

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
  // drops the cached public menu (its plan decides which upsell offers show)
  invalidate?: (restaurantId: string) => Promise<void>;
  // detail: a short reason for `webhook_ignored`, the billing_events id for `webhook_unactivated` and `notify_failed`
  log?: (
    event: "billing.founder_overflow" | "billing.webhook_ignored" | "billing.webhook_unactivated" | "billing.notify_failed",
    detail?: string,
  ) => void;
  // how long a processing claim on an event blocks other deliveries of it
  leaseSeconds?: number;
  now?: () => Date;
  today?: () => string;
};

const uuid = z.uuid();
// Only these fields are parsed (zod strips the rest) and only they are stored in billing_events: the raw
// payload may carry card data or tokens.
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
    .optional(),
  subscription: z
    .object({
      id: z.string().optional(),
      customer: z.string().optional(),
      externalReference: z.string().nullish(),
    })
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
  // Asaas refused the request for good; constraint violations (Postgres class 23) will fail again.
  if (e.message === "ASAAS_REJECTED") return false;
  if (typeof e.code === "string" && e.code.startsWith("23")) return false;
  // PostgREST/network errors carry a string `code` (possibly empty); plain Errors do not.
  return typeof e.code === "string";
}

// PostgREST `or` filter for a claimable row. The timestamp is quoted: an ISO value contains ":" and "."
// and must reach the parser as one value.
export function processingClaimFilter(expiredIso: string) {
  return `processing_started_at.is.null,processing_started_at.lt."${expiredIso}"`;
}
export function subscriptionClaimFilter(expiredIso: string) {
  return `subscription_claimed_at.is.null,subscription_claimed_at.lt."${expiredIso}"`;
}

const ok = (extra: Record<string, unknown> = {}) =>
  Response.json({ ok: true, ...extra }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });

const PAID = ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"];

// Verifies the payment with Asaas itself instead of trusting the webhook body.
// "paid": status must be a paid one, owned by this customer, for the expected value.
// "overdue": Asaas must still consider it OVERDUE (events arrive late and unordered).
async function verifiedPayment(
  deps: WebhookDeps,
  row: BillingRow,
  payment: WebhookPayment,
  mode: "paid" | "overdue",
  eventId: string,
): Promise<AsaasPayment | null> {
  let remote: AsaasPayment;
  try {
    remote = await deps.asaas().getPayment(String(payment.id));
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return null;
    throw error; // transient: Asaas retries
  }
  if (mode === "overdue") return remote.status === "OVERDUE" ? remote : null;
  if (!PAID.includes(remote.status)) return null;
  // `value` includes interest/fine/discount once the charge is paid; `originalValue` is what we billed.
  const cents = Math.round((remote.originalValue ?? remote.value) * 100);
  const accepted =
    payment.id === row.setup_payment_id
      ? [(row.reactivated ? 0 : SETUP_FEE_CENTS) + row.price_cents]
      : [
          row.price_cents,
          ...(row.pending_plan && row.pending_cycle ? [priceFor(row.pending_plan, row.pending_cycle, false)] : []),
        ];
  if (row.asaas_customer_id && remote.customer === row.asaas_customer_id && accepted.includes(cents)) return remote;
  // Asaas has the money but we cannot tie it to this restaurant: a human has to look at it.
  if (payment.id === row.setup_payment_id && row.status === "pendente") deps.log?.("billing.webhook_unactivated", eventId);
  return null;
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
    // events with no status mapping (PAYMENT_DELETED, PAYMENT_CHARGEBACK_REQUESTED...) are logged by type
    deps.log?.("billing.webhook_ignored", webhookStatus(body.event) === null ? body.event : "no-decision");
    return;
  }

  if ((decision.needsVerification || body.event === "PAYMENT_OVERDUE") && payment) {
    const remote = await verifiedPayment(
      deps,
      row,
      payment,
      body.event === "PAYMENT_OVERDUE" ? "overdue" : "paid",
      body.id,
    );
    if (!remote) {
      deps.log?.("billing.webhook_ignored", "payment-not-verified");
      return;
    }
    // Trust Asaas's own due date over the webhook body.
    payment.dueDate = remote.dueDate ?? payment.dueDate;
    if (body.event === "PAYMENT_OVERDUE") return applyPatch(deps, row, decision, body.id);
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
    // Two deliveries (CONFIRMED and RECEIVED) can arrive together. Whoever flips the lease on the billing
    // row first creates the subscription; the other answers a retryable error and, when retried, finds
    // the saved subscription id (the lease also expires if the claimant dies).
    const nowDate = (deps.now ?? (() => new Date()))();
    const expired = new Date(nowDate.getTime() - (deps.leaseSeconds ?? 120) * 1000).toISOString();
    const claim = await service
      .from("restaurant_billing")
      .update({ subscription_claimed_at: nowDate.toISOString() })
      .eq("restaurant_id", row.restaurant_id)
      .is("asaas_subscription_id", null)
      .or(subscriptionClaimFilter(expired))
      .select("restaurant_id");
    if (claim.error) throw claim.error;
    if (!claim.data || claim.data.length === 0) throw new Error("BILLING_UNAVAILABLE");
    // A crash between creating the subscription and saving its id must not leave a second one on retry:
    // reuse the customer's live subscription when Asaas already has it.
    let subscription: { id: string };
    try {
      const live = await deps.asaas().listSubscriptions({ customer: row.asaas_customer_id, status: "ACTIVE" });
      subscription =
        live[0] ??
        (await deps.asaas().createSubscription({
          customer: row.asaas_customer_id,
          valueCents: row.price_cents,
          nextDueDate,
          cycle: row.cycle,
          description: `Fome Play ${label} - assinatura ${row.cycle}`,
          externalReference: row.restaurant_id,
        }));
    } catch (error) {
      // Nothing was created: free the lease so the retry does not have to wait for it to expire.
      await service
        .from("restaurant_billing")
        .update({ subscription_claimed_at: null })
        .eq("restaurant_id", row.restaurant_id)
        .eq("subscription_claimed_at", nowDate.toISOString()) // only our own lease
        .then(() => undefined, () => undefined);
      throw error;
    }
    const saved = await service
      .from("restaurant_billing")
      .update({ asaas_subscription_id: subscription.id })
      .eq("restaurant_id", row.restaurant_id);
    if (saved.error) throw saved.error;
  }

  await applyPatch(deps, row, decision, body.id);
}

async function applyPatch(
  deps: WebhookDeps,
  row: BillingRow,
  decision: NonNullable<ReturnType<typeof decideWebhook>>,
  eventId: string,
) {
  const { service } = deps;
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
    // The first charge went out silently (the buyer was sent straight to the invoice page); from now
    // on Asaas should send renewal invoices. A failure here must not undo the activation.
    if (row.asaas_customer_id) {
      try {
        await deps.asaas().updateCustomer(row.asaas_customer_id, { notificationDisabled: false });
      } catch {
        deps.log?.("billing.notify_failed", eventId);
      }
    }
  }
  // plan or state changed: the public menu (cached 60 s) must not keep showing the old plan
  if ("status" in decision.patch || "plan" in decision.patch) {
    try {
      await deps.invalidate?.(row.restaurant_id);
    } catch {
      // the 60 s window bounds staleness
    }
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
  const now = (deps.now ?? (() => new Date()))();
  const { error: insertError } = await service.from("billing_events").insert({
    id: body.id,
    restaurant_id: row?.restaurant_id ?? null,
    type: body.event,
    payload: body,
    payment_id: body.payment?.id ?? null,
    processing_started_at: now.toISOString(),
  });
  const lease = (deps.leaseSeconds ?? 120) * 1000;
  if (insertError) {
    if (insertError.code !== "23505") throw insertError;
    // Known event. Finished: acknowledge. Otherwise claim it with one conditional UPDATE (atomic in
    // Postgres, so concurrent deliveries cannot both win). A claim older than the lease is taken over
    // (the previous worker crashed); a fresh one means another delivery is working on it right now:
    // answer an error so Asaas retries instead of dropping the event.
    const expired = new Date(now.getTime() - lease).toISOString();
    const claimed = await service
      .from("billing_events")
      .update({ processing_started_at: now.toISOString() })
      .eq("id", body.id)
      .is("processed_at", null)
      .or(processingClaimFilter(expired))
      .select("id");
    if (claimed.error) throw claimed.error;
    if (!claimed.data || claimed.data.length === 0) {
      const { data: existing, error } = await service
        .from("billing_events")
        .select("processed_at")
        .eq("id", body.id)
        .maybeSingle();
      if (error) throw error;
      if (existing?.processed_at) return ok({ duplicate: true });
      throw new Error("BILLING_UNAVAILABLE");
    }
  }
  const release = () =>
    service
      .from("billing_events")
      .update({ processing_started_at: null })
      .eq("id", body.id)
      .then(() => undefined, () => undefined);
  try {
    if (row) await apply(deps, row, body);
    else deps.log?.("billing.webhook_ignored", "unknown-restaurant");
  } catch (error) {
    if (isTransient(error)) {
      await release(); // let the next delivery in right away
      throw error;
    }
    deps.log?.("billing.webhook_ignored", "processing-error");
    if (
      row?.status === "pendente" &&
      (body.event === "PAYMENT_CONFIRMED" || body.event === "PAYMENT_RECEIVED") &&
      body.payment?.id === row.setup_payment_id
    )
      deps.log?.("billing.webhook_unactivated", body.id);
  }
  const { error: doneError } = await service
    .from("billing_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", body.id);
  if (doneError) throw doneError;
  return ok();
}
