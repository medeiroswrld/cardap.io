import { withRequestLogging } from "@/lib/observability/logger";
import { z } from "zod";
import { requireMember } from "@/lib/supabase/server";
import { requirePlan } from "@/lib/billing-server";
import { apiError, noStore } from "@/lib/server-security";
import { isValidMonth } from "@/lib/results-report";

async function handleGET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z.uuid().parse((await params).id);
    const { supabase } = await requireMember(id, true);
    await requirePlan(id, "results", supabase);
    const month = new URL(request.url).searchParams.get("month") ?? "";
    const { data: restaurant, error: restaurantError } = await supabase
      .from("restaurants")
      .select("timezone")
      .eq("id", id)
      .single();
    if (restaurantError) throw restaurantError;
    if (!isValidMonth(month, new Date(), restaurant.timezone)) throw new Error("INVALID_INPUT");
    const { data, error } = await supabase.rpc("results_report", {
      p_restaurant: id,
      p_month: `${month}-01`,
    });
    if (error) throw error;
    return Response.json(data, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}

export const GET = withRequestLogging("/api/restaurants/[id]/results", handleGET);
