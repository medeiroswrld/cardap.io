import "server-only";
import { serviceClient } from "./supabase/server";
import { logger } from "./observability/logger";
import { type Asaas } from "./asaas";
import { addCycle, addDays, firstChargeCents, priceFor, todayBrt, type Cycle, type SellablePlan } from "./plans";

export type CustomerInput = { name: string; cpfCnpj: string; email: string; mobilePhone?: string };

// Creates whatever is missing in Asaas (customer, first one-off charge, subscription) and stores the ids.
// The first charge is always new (setup + first period, due in 2 days); the subscription starts one
// cycle later. Safe to call again for a pendente restaurant (retry): existing ids are reused.
export async function provisionCheckout(
  asaas: Asaas,
  input: {
    restaurantId: string;
    plan: SellablePlan;
    cycle: Cycle;
    founder: boolean;
    existingCustomerId?: string | null;
    existingSubscriptionId?: string | null;
    customer?: CustomerInput;
  },
) {
  const service = serviceClient();
  const today = todayBrt();
  const label = input.plan === "profissional" ? "Profissional" : "Essencial";
  let customerId = input.existingCustomerId ?? null;
  if (!customerId) {
    if (!input.customer) throw new Error("INVALID_DOCUMENT");
    customerId = (
      await asaas.createCustomer({ ...input.customer, externalReference: input.restaurantId })
    ).id;
    await service.from("restaurant_billing").update({ asaas_customer_id: customerId }).eq("restaurant_id", input.restaurantId);
  }
  const price = priceFor(input.plan, input.cycle, input.founder);
  const payment = await asaas.createPayment({
    customer: customerId,
    valueCents: firstChargeCents(input.plan, input.cycle, input.founder),
    dueDate: addDays(today, 2),
    description: `Fome Play ${label} - implantação + ${input.cycle === "anual" ? "1º ano" : "1º mês"}`,
    externalReference: input.restaurantId,
  });
  const update: Record<string, string> = { setup_payment_id: payment.id };
  if (input.existingSubscriptionId) {
    // Price may have changed (founder slot lost) while the checkout stayed unpaid.
    await asaas.updateSubscription(input.existingSubscriptionId, { valueCents: price, cycle: input.cycle });
  } else {
    const subscription = await asaas.createSubscription({
      customer: customerId,
      valueCents: price,
      nextDueDate: addCycle(today, input.cycle),
      cycle: input.cycle,
      description: `Fome Play ${label} - assinatura ${input.cycle}`,
      externalReference: input.restaurantId,
    });
    update.asaas_subscription_id = subscription.id;
  }
  await service.from("restaurant_billing").update(update).eq("restaurant_id", input.restaurantId);
  if (!payment.invoiceUrl || !/^https:\/\//.test(payment.invoiceUrl)) throw new Error("BILLING_UNAVAILABLE");
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
