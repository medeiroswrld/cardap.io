import { withRequestLogging } from "@/lib/observability/logger";
import { z } from "zod";
import { requireMember } from "@/lib/supabase/server";
import { apiError, noStore } from "@/lib/server-security";
import { crmCampaignQuery, searchParamsObject } from "@/lib/crm-query";

async function handleGET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z.uuid().parse((await params).id);
    const { supabase } = await requireMember(id, true);
    const q = crmCampaignQuery.parse(searchParamsObject(new URL(request.url)));
    const { data, error } = await supabase.rpc("crm_campaign", {
      p_restaurant: id,
      p_segment: q.segment ?? null,
      p_tag: q.tag ?? null,
    });
    if (error) throw error;
    return Response.json(data, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}

export const GET = withRequestLogging("/api/restaurants/[id]/crm/campaign", handleGET);
