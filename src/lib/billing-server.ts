import "server-only";
import { serviceClient } from "./supabase/server";
import { logger } from "./observability/logger";
import { type Asaas } from "./asaas";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, firstChargeCents, todayBrt, type Cycle, type SellablePlan } from "./plans";

export type CustomerInput = { name: string; cpfCnpj: string; email: string; mobilePhone?: string };
type Db = SupabaseClient;

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
  const valueCents = firstChargeCents(input.plan, input.cycle, input.founder);
  if (row.setup_payment_id) {
    let existing: Awaited<ReturnType<Asaas["getPayment"]>> | null = null;
    try {
      existing = await asaas.getPayment(row.setup_payment_id);
    } catch (error) {
      if (!(error instanceof Error && error.message === "NOT_FOUND")) throw error;
    }
    if (existing) {
      if (existing.status === "CONFIRMED" || existing.status === "RECEIVED") throw new Error("STATE_CONFLICT");
      if (
        existing.status === "PENDING" &&
        existing.dueDate >= today &&
        Math.round(existing.value * 100) === valueCents &&
        existing.invoiceUrl
      )
        return existing.invoiceUrl;
      if (existing.status === "PENDING" || existing.status === "OVERDUE") await asaas.deletePayment(existing.id);
    }
  }
  const payment = await asaas.createPayment({
    customer: customerId,
    valueCents,
    dueDate: addDays(today, 2),
    description: `Fome Play ${label} - implantação + ${input.cycle === "anual" ? "1º ano" : "1º mês"}`,
    externalReference: input.restaurantId,
  });
  await save(service, input.restaurantId, { setup_payment_id: payment.id });
  if (!payment.invoiceUrl) throw new Error("BILLING_UNAVAILABLE");
  return payment.invoiceUrl;
}

// Best-effort e-mail to the Fome Play owner on the first activation (Resend REST API).
export async function notifyNewSubscriber(restaurantId: string, plan: string) {
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
        subject: `Novo assinante: ${data?.name ?? "restaurante"} (${plan})`,
        text: `Novo assinante: ${data?.name ?? "restaurante"} (${plan}) — fazer implantação.`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("notify");
  } catch {
    logger.warn("billing.notify_failed", { errorCode: "INTEGRATION_UNAVAILABLE" });
  }
}
