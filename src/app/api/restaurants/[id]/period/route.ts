import { withRequestLogging } from "@/lib/observability/logger";
import { z } from "zod";
import { requireMember } from "@/lib/supabase/server";
import { apiError, noStore } from "@/lib/server-security";
import { dayStart, addDays, rangeProblem, summarizePeriod, todayIn, type PeriodOrder } from "@/lib/period";

const PAGE = 1000;
const MAX_PAGES = 50;

// Delivered orders between two calendar days (inclusive) in the restaurant's timezone.
async function handleGET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z.uuid().parse((await params).id);
    const { supabase, role } = await requireMember(id);
    const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    const { data: restaurant, error: restaurantError } = await supabase
      .from("restaurants")
      .select("timezone")
      .eq("id", id)
      .single();
    if (restaurantError) throw restaurantError;
    if (rangeProblem(from, to, todayIn(restaurant.timezone))) throw new Error("INVALID_INPUT");
    const start = dayStart(from, restaurant.timezone);
    const end = dayStart(addDays(to, 1), restaurant.timezone);
    const orders: PeriodOrder[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await supabase
        .from("orders")
        .select("id,total_cents,fulfillment,order_items(product_id,product_name,quantity,unit_price_cents)")
        .eq("restaurant_id", id)
        .eq("status", "entregue")
        .gte("created_at", start)
        .lt("created_at", end)
        .order("created_at")
        .order("id")
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      orders.push(...(data as PeriodOrder[]));
      if (data.length < PAGE) break;
    }
    return Response.json(summarizePeriod(from, to, orders, role === "owner"), { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}

export const GET = withRequestLogging("/api/restaurants/[id]/period", handleGET);
