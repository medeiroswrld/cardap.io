import { withRequestLogging } from "@/lib/observability/logger";
import { z } from "zod";
import { requireMember } from "@/lib/supabase/server";
import { apiError, noStore } from "@/lib/server-security";
async function handleGET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.uuid().parse((await params).id);
    const days = z.coerce
      .number()
      .refine((n) => n === 7 || n === 30)
      .parse(new URL(request.url).searchParams.get("days") || 30);
    const { supabase } = await requireMember(id, true);
    const { data, error } = await supabase.rpc("photo_associations", {
      p_restaurant: id,
      p_days: days,
    });
    if (error) throw error;
    return Response.json(data, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}

export const GET = withRequestLogging(
  "/api/restaurants/[id]/photo-associations",
  handleGET,
);
