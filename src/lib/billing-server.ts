import "server-only";
import { serviceClient } from "./supabase/server";
import { logger } from "./observability/logger";
import { errorCode } from "./observability/core";
import { type Asaas } from "./asaas";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, allows, firstChargeCents, todayBrt, type Cycle, type Feature, type Plan, type SellablePlan } from "./plans";

export type CustomerInput = { name: string; cpfCnpj: string; email: string; mobilePhone?: string };
type Db = SupabaseClient;

// Plan and billing state as the database computes them (restaurant_plan / restaurant_billing_state).
// Answers are cached per client object: routes build one Supabase client per request, so a request
// that asks twice (gate + order checks) hits the database once. Without a client the service role is used.
const answers = new WeakMap<object, Map<string, Promise<string>>>();
function ask(client: Pick<Db, "rpc">, fn: "restaurant_plan" | "restaurant_billing_state", id: string) {
  let perClient = answers.get(client);
  if (!perClient) answers.set(client, (perClient = new Map()));
  const key = `${fn}:${id}`;
  let pending = perClient.get(key);
  if (!pending) {
    pending = (async () => {
      const { data, error } = await client.rpc(fn, { p_restaurant: id });
      if (error) throw error;
      if (typeof data !== "string") throw new Error("DATABASE_ERROR");
      return data;
    })();
    perClient.set(key, pending);
    pending.catch(() => perClient.delete(key));
  }
  return pending;
}
export async function restaurantPlan(id: string, client: Pick<Db, "rpc"> = serviceClient()) {
  return (await ask(client, "restaurant_plan", id)) as Plan;
}
export async function billingState(id: string, client: Pick<Db, "rpc"> = serviceClient()) {
  return ask(client, "restaurant_billing_state", id);
}
// Plan and state for paths that must not turn a billing-read failure into an outage (orders, workspace):
// when a read fails (database down, function missing...) it is logged and the restaurant is treated as
// fully entitled (profissional, ativo). The state is service-role only; the plan may use the request's client.
export async function readBilling(id: string, member?: Pick<Db, "rpc">) {
  let plan: Plan = "profissional";
  let state = "ativo";
  let degraded = false;
  try {
    const service = serviceClient();
    const [p, s] = await Promise.allSettled([restaurantPlan(id, member ?? service), billingState(id, service)]);
    if (p.status === "fulfilled") plan = p.value;
    else degraded = true;
    if (s.status === "fulfilled") state = s.value;
    else degraded = true;
    if (degraded) throw p.status === "rejected" ? p.reason : (s as PromiseRejectedResult).reason;
  } catch (error) {
    logger.warn("billing.state_unavailable", { operation: "supabase.billing", errorCode: errorCode(error) });
  }
  return { plan, state, degraded };
}

// Throws PLAN_REQUIRED (403, "Disponível no plano Profissional.") unless the restaurant's effective plan
// includes the feature. Pass the request's Supabase client to share the per-request cache.
export async function requirePlan(id: string, feature: Feature, client?: Pick<Db, "rpc">) {
  if (!allows(await restaurantPlan(id, client), feature)) throw new Error("PLAN_REQUIRED");
}

async function save(service: Db, restaurantId: string, patch: Record<string, unknown>) {
  const { error } = await service.from("restaurant_billing").update(patch).eq("restaurant_id", restaurantId);
  if (error) throw error;
}

// Creates whatever is missing in Asaas for a pendente restaurant (customer, then the one-off first
// charge = setup + first period, due in 2 days) and stores each id right after creation. The Asaas
// SUBSCRIPTION is not created here: the webhook creates it when this first charge is paid.
// Safe to call again (retry): the customer is reused; the previous charge is reused when it is still
// open, unpaid-overdue-free and for the same value, otherwise it is deleted in Asaas and replaced.
export async function provisionCheckout(
  asaas: Asaas,
  input: {
    restaurantId: string;
    plan: SellablePlan;
    cycle: Cycle;
    founder: boolean;
    // a cancelled restaurant coming back: the first charge is the plan price only (no implantação)
    reactivation?: boolean;
    customer?: CustomerInput;
  },
  service: Db = serviceClient(),
  today = todayBrt(),
) {
  const { data: row, error: readError } = await service
    .from("restaurant_billing")
    .select("asaas_customer_id, setup_payment_id")
    .eq("restaurant_id", input.restaurantId)
    .maybeSingle();
  if (readError) throw readError;
  if (!row) throw new Error("NOT_FOUND");
  const label = input.plan === "profissional" ? "Profissional" : "Essencial";
  let customerId: string | null = row.asaas_customer_id ?? null;
  if (!customerId) {
    if (!input.customer) throw new Error("INVALID_DOCUMENT");
    customerId = (await asaas.createCustomer({ ...input.customer, externalReference: input.restaurantId })).id;
    await save(service, input.restaurantId, { asaas_customer_id: customerId });
  }
  const valueCents = firstChargeCents(input.plan, input.cycle, input.founder, { reactivation: input.reactivation });
  if (row.setup_payment_id) {
    let existing: Awaited<ReturnType<Asaas["getPayment"]>> | null = null;
    try {
      existing = await asaas.getPayment(row.setup_payment_id);
    } catch (error) {
      if (!(error instanceof Error && error.message === "NOT_FOUND")) throw error;
    }
    // A charge Asaas still returns with deleted: true is gone: never reuse it.
    if (existing?.deleted) existing = null;
    if (existing) {
      // Anything but a plainly open charge (paid, in risk analysis, received in cash...) is not ours to replace.
      if (existing.status !== "PENDING" && existing.status !== "OVERDUE") throw new Error("STATE_CONFLICT");
      if (
        existing.status === "PENDING" &&
        existing.dueDate >= today &&
        Math.round(existing.value * 100) === valueCents &&
        existing.invoiceUrl
      )
        return existing.invoiceUrl;
      await asaas.deletePayment(existing.id);
    }
  }
  const payment = await asaas.createPayment({
    customer: customerId,
    valueCents,
    dueDate: addDays(today, 2),
    description: input.reactivation
      ? `Fome Play ${label} - reativação ${input.cycle === "anual" ? "(ano)" : "(mês)"}`
      : `Fome Play ${label} - implantação + ${input.cycle === "anual" ? "1º ano" : "1º mês"}`,
    externalReference: input.restaurantId,
  });
  await save(service, input.restaurantId, { setup_payment_id: payment.id });
  if (!payment.invoiceUrl) throw new Error("BILLING_UNAVAILABLE");
  return payment.invoiceUrl;
}

// Best-effort e-mail to the Fome Play owner on the first activation (Resend REST API).
export async function notifyNewSubscriber(restaurantId: string, plan: string, reactivation = false) {
  const to = process.env.BILLING_NOTIFY_EMAIL;
  const key = process.env.RESEND_API_KEY;
  if (!to || !key) return;
  try {
    const { data } = await serviceClient().from("restaurants").select("name").eq("id", restaurantId).maybeSingle();
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.BILLING_FROM_EMAIL || "Fome Play <onboarding@resend.dev>",
        to: [to],
        subject: reactivation
          ? `Reativação: ${data?.name ?? "restaurante"} (${plan})`
          : `Novo assinante: ${data?.name ?? "restaurante"} (${plan})`,
        text: reactivation
          ? `Reativação: ${data?.name ?? "restaurante"} (${plan}) — sem implantação.`
          : `Novo assinante: ${data?.name ?? "restaurante"} (${plan}) — fazer implantação.`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("notify");
  } catch {
    logger.warn("billing.notify_failed", { errorCode: "INTEGRATION_UNAVAILABLE" });
  }
}
