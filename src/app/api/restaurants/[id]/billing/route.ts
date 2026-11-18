import { logFailure, withRequestLogging } from "@/lib/observability/logger";
import { z } from "zod";
import { requireMember, serviceClient } from "@/lib/supabase/server";
import { apiError, checkOrigin, noStore } from "@/lib/server-security";
import { asaasConfigFromEnv, asaasFromEnv } from "@/lib/asaas";
import { isValidDocument, normalizeDocument } from "@/lib/cpf-cnpj";
import { billingState, provisionCheckout } from "@/lib/billing-server";
import { isSellablePlan, todayBrt } from "@/lib/plans";
import { decideChangePlan, type BillingRow } from "@/lib/billing-events";
import { enforceRetryPaymentLimit } from "@/lib/rate-limit";

type Params = { params: Promise<{ id: string }> };

async function loadRow(supabase: Awaited<ReturnType<typeof requireMember>>["supabase"], id: string) {
  const { data, error } = await supabase
    .from("restaurant_billing")
    .select("*")
    .eq("restaurant_id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("NOT_FOUND");
  return data as BillingRow;
}

async function handleGET(_request: Request, { params }: Params) {
  try {
    const id = z.uuid().parse((await params).id);
    const { supabase } = await requireMember(id, true);
    const row = await loadRow(supabase, id);
    const state = await billingState(id); // service role only; the owner was verified by requireMember
    // Invoices come straight from Asaas; a failure there must not hide the plan state.
    let invoices: {
      id: string;
      dueDate: string;
      valueCents: number;
      status: string;
      invoiceUrl: string | null;
    }[] | null = [];
    if (row.asaas_customer_id && asaasConfigFromEnv()) {
      try {
        const payments = await asaasFromEnv().listPayments({ customer: row.asaas_customer_id });
        invoices = payments.map((p) => ({
          id: p.id,
          dueDate: p.dueDate,
          valueCents: Math.round(p.value * 100),
          status: p.status,
          invoiceUrl: p.invoiceUrl,
        }));
      } catch (e) {
        logFailure(e, "asaas.api");
        invoices = null;
      }
    }
    return Response.json(
      {
        plan: row.plan,
        cycle: row.cycle,
        status: row.status,
        state,
        founder: row.founder,
        priceCents: row.price_cents,
        currentPeriodEnd: row.current_period_end,
        overdueSince: row.overdue_since,
        cancelAt: row.cancel_at,
        pendingPlan: row.pending_plan,
        pendingCycle: row.pending_cycle,
        hasSubscription: Boolean(row.asaas_subscription_id),
        invoices,
      },
      { headers: noStore },
    );
  } catch (error) {
    return apiError(error);
  }
}

const action = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("change_plan"),
    plan: z.enum(["essencial", "profissional"]),
    cycle: z.enum(["mensal", "anual"]),
    confirmFounderLoss: z.boolean().optional(),
  }),
  z.object({ action: z.literal("cancel") }),
  z.object({
    action: z.literal("retry_payment"),
    document: z.string().max(30).refine(isValidDocument, "INVALID_DOCUMENT").optional(),
  }),
]);

async function handlePOST(request: Request, { params }: Params) {
  try {
    checkOrigin(request);
    const id = z.uuid().parse((await params).id);
    const { supabase, user } = await requireMember(id, true);
    const body = action.parse(await request.json());
    const service = serviceClient();
    const row = await loadRow(supabase, id);
    const update = async (patch: Record<string, unknown>) => {
      const { error } = await service.from("restaurant_billing").update(patch).eq("restaurant_id", id);
      if (error) throw error;
    };

    if (body.action === "retry_payment") {
      if (row.status !== "pendente" || !isSellablePlan(row.plan)) throw new Error("STATE_CONFLICT");
      if (!asaasConfigFromEnv()) throw new Error("BILLING_UNAVAILABLE");
      await enforceRetryPaymentLimit(id);
      // Re-claim the founder slot atomically (it may have expired after 48h) and refresh the price.
      const { data: started, error } = await service.rpc("start_subscription", {
        p_restaurant: id,
        p_plan: row.plan,
        p_cycle: row.cycle,
        p_want_founder: row.founder,
      });
      if (error) throw error;
      let customer;
      if (!row.asaas_customer_id) {
        if (!body.document || !user.email) throw new Error("INVALID_DOCUMENT");
        const { data: restaurant } = await supabase.from("restaurants").select("name").eq("id", id).maybeSingle();
        customer = {
          name: restaurant?.name ?? user.email,
          cpfCnpj: normalizeDocument(body.document),
          email: user.email,
        };
      }
      const redirect = await provisionCheckout(asaasFromEnv(), {
        restaurantId: id,
        plan: row.plan,
        cycle: row.cycle,
        founder: Boolean(started?.founder),
        customer,
      });
      return Response.json(
        { redirect, founder: Boolean(started?.founder), priceCents: Number(started?.price_cents) },
        { headers: noStore },
      );
    }

    // change_plan and cancel need a live, paid subscription that is not already ending.
    if (
      !["ativo", "atrasado"].includes(row.status) ||
      !row.asaas_subscription_id ||
      !isSellablePlan(row.plan)
    )
      throw new Error("STATE_CONFLICT");
    if (!asaasConfigFromEnv()) throw new Error("BILLING_UNAVAILABLE");
    const asaas = asaasFromEnv();

    if (body.action === "cancel") {
      if (row.cancel_at) return Response.json({ ok: true, cancelAt: row.cancel_at }, { headers: noStore });
      const cancelAt = row.current_period_end ?? todayBrt();
      // cancel_at first: if the SUBSCRIPTION_DELETED echo arrives before we return, the webhook already
      // sees it and keeps the paid period. Roll it back when Asaas refuses.
      await update({ cancel_at: cancelAt, pending_plan: null, pending_cycle: null, pending_since: null });
      try {
        await asaas.cancelSubscription(row.asaas_subscription_id);
      } catch (error) {
        try {
          await update({
            cancel_at: null,
            pending_plan: row.pending_plan,
            pending_cycle: row.pending_cycle,
            pending_since: row.pending_since,
          });
        } catch (rollbackError) {
          logFailure(rollbackError, "supabase.billing");
        }
        throw error;
      }
      return Response.json({ ok: true, cancelAt }, { headers: noStore });
    }

    if (row.cancel_at) throw new Error("STATE_CONFLICT");
    const decision = decideChangePlan(row, body, todayBrt());
    if (decision.kind === "invalid") throw new Error("INVALID_INPUT");
    if (decision.kind === "founder_confirm") throw new Error("FOUNDER_CONFIRM_REQUIRED");
    await asaas.updateSubscription(row.asaas_subscription_id, { valueCents: decision.valueCents, cycle: decision.cycle });
    await update(decision.patch);
    return Response.json(
      { ok: true, applied: decision.kind === "schedule" ? "next_charge" : "now" },
      { headers: noStore },
    );
  } catch (error) {
    return apiError(error);
  }
}

export const GET = withRequestLogging("/api/restaurants/[id]/billing", handleGET);
export const POST = withRequestLogging("/api/restaurants/[id]/billing", handlePOST);
