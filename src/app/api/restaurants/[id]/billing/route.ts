import { logFailure, withRequestLogging } from "@/lib/observability/logger";
import { z } from "zod";
import { requireMember, serviceClient } from "@/lib/supabase/server";
import { apiError, checkOrigin, noStore } from "@/lib/server-security";
import { asaasConfigFromEnv, asaasFromEnv } from "@/lib/asaas";
import { isValidDocument, normalizeDocument } from "@/lib/cpf-cnpj";
import { provisionCheckout } from "@/lib/billing-server";
import { isSellablePlan, priceFor, todayBrt, type Cycle, type SellablePlan } from "@/lib/plans";
import type { BillingRow } from "@/lib/billing-events";

type Params = { params: Promise<{ id: string }> };
const rank = { essencial: 0, profissional: 1 } as const;
const cycleRank = { mensal: 0, anual: 1 } as const;

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
    const { data: state, error } = await supabase.rpc("restaurant_billing_state", { p_restaurant: id });
    if (error) throw error;
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
        existingCustomerId: row.asaas_customer_id,
        existingSubscriptionId: row.asaas_subscription_id,
        customer,
      });
      return Response.json({ redirect }, { headers: noStore });
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
      await asaas.cancelSubscription(row.asaas_subscription_id);
      const cancelAt = row.current_period_end ?? todayBrt();
      await update({ cancel_at: cancelAt, pending_plan: null, pending_cycle: null });
      return Response.json({ ok: true, cancelAt }, { headers: noStore });
    }

    if (row.cancel_at) throw new Error("STATE_CONFLICT");
    const current = { plan: row.plan as SellablePlan, cycle: row.cycle as Cycle };
    const same = body.plan === current.plan && body.cycle === current.cycle;
    if (same && !row.pending_plan) throw new Error("INVALID_INPUT");
    if (same) {
      // Choosing the current plan again cancels a scheduled downgrade.
      await asaas.updateSubscription(row.asaas_subscription_id, { valueCents: row.price_cents, cycle: current.cycle });
      await update({ pending_plan: null, pending_cycle: null });
      return Response.json({ ok: true, applied: "now" }, { headers: noStore });
    }
    if (row.founder && !body.confirmFounderLoss) throw new Error("FOUNDER_CONFIRM_REQUIRED");
    const newPrice = priceFor(body.plan, body.cycle, false);
    // Upgrade: neither dimension goes down. Everything else (incl. mixed) waits for the next charge.
    const upgrade =
      rank[body.plan] >= rank[current.plan] && cycleRank[body.cycle] >= cycleRank[current.cycle];
    await asaas.updateSubscription(row.asaas_subscription_id, { valueCents: newPrice, cycle: body.cycle });
    if (upgrade) {
      await update({
        plan: body.plan,
        cycle: body.cycle,
        price_cents: newPrice,
        founder: false,
        pending_plan: null,
        pending_cycle: null,
      });
    } else {
      await update({ pending_plan: body.plan, pending_cycle: body.cycle, founder: false });
    }
    return Response.json({ ok: true, applied: upgrade ? "now" : "next_charge" }, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}

export const GET = withRequestLogging("/api/restaurants/[id]/billing", handleGET);
export const POST = withRequestLogging("/api/restaurants/[id]/billing", handlePOST);
