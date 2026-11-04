import { withRequestLogging } from "@/lib/observability/logger";
import { z } from "zod";
import { requireMember } from "@/lib/supabase/server";
import { apiError, checkOrigin, noStore } from "@/lib/server-security";
import { crmSaveBody } from "@/lib/crm-query";

type Context = { params: Promise<{ id: string; contactId: string }> };

async function handleGET(_request: Request, { params }: Context) {
  try {
    const { id, contactId } = await params;
    z.uuid().parse(id);
    z.uuid().parse(contactId);
    const { supabase } = await requireMember(id, true);
    const { data, error } = await supabase.rpc("crm_customer", { p_restaurant: id, p_contact: contactId });
    if (error) throw error;
    return Response.json(data, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}

async function handlePOST(request: Request, { params }: Context) {
  try {
    checkOrigin(request);
    const { id, contactId } = await params;
    z.uuid().parse(id);
    z.uuid().parse(contactId);
    const { supabase } = await requireMember(id, true);
    const body = crmSaveBody.parse(await request.json());
    if (body.action === "save") {
      const { error } = await supabase.rpc("crm_save_customer", {
        p_restaurant: id,
        p_contact: contactId,
        p_tags: body.tags,
        p_notes: body.notes,
      });
      if (error) throw error;
      return Response.json({ ok: true }, { headers: noStore });
    }
    const { data, error } = await supabase.rpc("crm_erase_customer", { p_restaurant: id, p_contact: contactId });
    if (error) throw error;
    return Response.json(data, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}

export const GET = withRequestLogging("/api/restaurants/[id]/crm/[contactId]", handleGET);
export const POST = withRequestLogging("/api/restaurants/[id]/crm/[contactId]", handlePOST);
