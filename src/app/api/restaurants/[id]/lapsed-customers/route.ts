import { withRequestLogging } from "@/lib/observability/logger";
import { z } from "zod";
import { requireMember } from "@/lib/supabase/server";
import { apiError, noStore } from "@/lib/server-security";

const query = z.object({
  days: z.coerce.number().pipe(z.union([z.literal(30), z.literal(60), z.literal(90)])),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
});

async function handleGET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z.uuid().parse((await params).id);
    const { supabase } = await requireMember(id, true);
    const search = new URL(request.url).searchParams;
    const { days, offset } = query.parse({
      days: search.get("days") ?? undefined,
      offset: search.get("offset") ?? undefined,
    });
    const { data, error } = await supabase.rpc("lapsed_customers", {
      p_restaurant: id,
      p_days: days,
      p_offset: offset,
    });
    if (error) throw error;
    return Response.json(data, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}

export const GET = withRequestLogging("/api/restaurants/[id]/lapsed-customers", handleGET);
