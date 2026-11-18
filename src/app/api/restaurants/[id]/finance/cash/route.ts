import { withRequestLogging } from "@/lib/observability/logger";
import { z } from "zod";
import { requireMember } from "@/lib/supabase/server";
import { requirePlan } from "@/lib/billing-server";
import { apiError, noStore } from "@/lib/server-security";
import { isFinanceDay } from "@/lib/finance";

async function handleGET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z.uuid().parse((await params).id);
    const { supabase } = await requireMember(id, true);
    await requirePlan(id, "finance", supabase);
    const day = new URL(request.url).searchParams.get("day") ?? "";
    if (!isFinanceDay(day) || day < "2000-01-01" || day > "2100-12-31") throw new Error("INVALID_INPUT");
    const { data, error } = await supabase.rpc("cash_day", { p_restaurant: id, p_day: day });
    if (error) throw error;
    return Response.json(data, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}

export const GET = withRequestLogging("/api/restaurants/[id]/finance/cash", handleGET);
