import { withRequestLogging } from "@/lib/observability/logger";
import { z } from "zod";
import { requireMember } from "@/lib/supabase/server";
import { apiError, noStore } from "@/lib/server-security";
import { isFinanceDay } from "@/lib/finance";

async function handleGET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z.uuid().parse((await params).id);
    const { supabase } = await requireMember(id, true);
    const month = new URL(request.url).searchParams.get("month") ?? "";
    if (!/^\d{4}-\d{2}-01$/.test(month) || !isFinanceDay(month) || month < "2000-01-01" || month > "2100-12-01")
      throw new Error("INVALID_INPUT");
    const { data, error } = await supabase.rpc("finance_month", { p_restaurant: id, p_month: month });
    if (error) throw error;
    return Response.json(data, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}

export const GET = withRequestLogging("/api/restaurants/[id]/finance/month", handleGET);
