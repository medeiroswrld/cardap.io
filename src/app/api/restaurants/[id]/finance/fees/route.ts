import { withRequestLogging } from "@/lib/observability/logger";
import { z } from "zod";
import { requireMember } from "@/lib/supabase/server";
import { requirePlan } from "@/lib/billing-server";
import { apiError, noStore } from "@/lib/server-security";


async function handleGET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z.uuid().parse((await params).id);
    const { supabase } = await requireMember(id, true);
    await requirePlan(id, "finance", supabase);

    const { data, error } = await supabase.rpc("get_payment_fees", { p_restaurant: id });
    if (error) throw error;
    return Response.json(data, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}

export const GET = withRequestLogging("/api/restaurants/[id]/finance/fees", handleGET);
