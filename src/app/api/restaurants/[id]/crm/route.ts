import { withRequestLogging } from "@/lib/observability/logger";
import { z } from "zod";
import { requireMember } from "@/lib/supabase/server";
import { apiError, noStore } from "@/lib/server-security";
import { CRM_PAGE_SIZE } from "@/lib/crm";
import { crmListQuery, searchParamsObject } from "@/lib/crm-query";

async function handleGET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z.uuid().parse((await params).id);
    const { supabase } = await requireMember(id, true);
    const q = crmListQuery.parse(searchParamsObject(new URL(request.url)));
    const { data, error } = await supabase.rpc("crm_customers", {
      p_restaurant: id,
      p_search: q.search ?? null,
      p_segment: q.segment ?? null,
      p_tag: q.tag ?? null,
      p_marketing_only: q.marketing === "1",
      p_sort: q.sort,
      p_limit: CRM_PAGE_SIZE,
      p_offset: (q.page - 1) * CRM_PAGE_SIZE,
    });
    if (error) throw error;
    return Response.json(data, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}

export const GET = withRequestLogging("/api/restaurants/[id]/crm", handleGET);
