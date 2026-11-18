import { timingSafeEqual } from "node:crypto";
import { logger, logFailure, withRequestLogging } from "@/lib/observability/logger";
import { z } from "zod";
import { serviceClient } from "@/lib/supabase/server";
import { apiError, noStore } from "@/lib/server-security";
import { asaasConfigFromEnv, asaasFromEnv } from "@/lib/asaas";
import { decideWebhook, type BillingRow } from "@/lib/billing-events";
import { notifyNewSubscriber } from "@/lib/billing-server";

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

function tokenMatches(received: string | null) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expected) throw new Error("BILLING_UNAVAILABLE");
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Restaurant from our externalReference first; falls back to the stored Asaas ids because
// subscription charges may not carry the reference.
async function findRow(body: z.infer<typeof payload>) {
  const service = serviceClient();
  const refs = [body.payment?.externalReference, body.subscription?.externalReference].filter(
    (v): v is string => typeof v === "string" && uuid.safeParse(v).success,
  );
  const lookups: [string, string][] = refs.map((v) => ["restaurant_id", v]);
  const subscriptionId = body.payment?.subscription ?? body.subscription?.id;
  if (subscriptionId) lookups.push(["asaas_subscription_id", subscriptionId]);
  const customerId = body.payment?.customer ?? body.subscription?.customer;
  if (customerId) lookups.push(["asaas_customer_id", customerId]);
  for (const [column, value] of lookups) {
    const { data, error } = await service
      .from("restaurant_billing")
      .select("*")
      .eq(column, value)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as BillingRow;
  }
  return null;
}

async function handlePOST(request: Request) {
  try {
    if (!tokenMatches(request.headers.get("asaas-access-token"))) throw new Error("UNAUTHORIZED");
    const body = payload.parse(await request.json());
    const service = serviceClient();
    const row = await findRow(body);
    const { error: insertError } = await service.from("billing_events").insert({
      id: body.id,
      restaurant_id: row?.restaurant_id ?? null,
      type: body.event,
      payload: body,
    });
    if (insertError) {
      if (insertError.code === "23505")
        return Response.json({ ok: true, duplicate: true }, { headers: noStore });
      throw insertError;
    }
    try {
      const decision = row ? decideWebhook(row, body.event, body.payment ?? null) : null;
      if (row && decision) {
        const { error } = await service
          .from("restaurant_billing")
          .update(decision.patch)
          .eq("restaurant_id", row.restaurant_id);
        if (error) throw error;
        if (decision.firstActivation) {
          const { count } = await service
            .from("restaurant_billing")
            .select("restaurant_id", { count: "exact", head: true })
            .eq("founder", true)
            .in("status", ["ativo", "atrasado"]);
          // Rare race on the last slot: the founder keeps the price, we only record the overflow.
          if (row.founder && (count ?? 0) > 10) logger.warn("billing.founder_overflow");
          await notifyNewSubscriber(row.restaurant_id, String(decision.patch.plan ?? row.plan));
        }
        if (decision.cancelAsaasSubscription && row.asaas_subscription_id && asaasConfigFromEnv()) {
          try {
            await asaasFromEnv().cancelSubscription(row.asaas_subscription_id);
          } catch (error) {
            logFailure(error, "asaas.api");
          }
        }
      }
    } catch (error) {
      // Let Asaas retry: drop the idempotency row so the retry is processed.
      await service.from("billing_events").delete().eq("id", body.id);
      throw error;
    }
    return Response.json({ ok: true }, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}

export const POST = withRequestLogging("/api/billing/asaas", handlePOST);
