import { cookies } from "next/headers";
import { z } from "zod";
import { requireMember, serviceClient } from "@/lib/supabase/server";
import { apiError, checkOrigin, hash, noStore } from "@/lib/server-security";
type Context = { params: Promise<{ id: string; orderId: string }> };
export async function GET(_request: Request, { params }: Context) {
  try {
    const { id, orderId } = await params;
    z.uuid().parse(id);
    z.uuid().parse(orderId);
    const token = (await cookies()).get(`guest_${id}`)?.value;
    if (!token) throw new Error("GUEST_SESSION_EXPIRED");
    const client = serviceClient();
    const { data: session } = await client
      .from("guest_sessions")
      .select("id")
      .eq("restaurant_id", id)
      .eq("token_hash", hash(token))
      .gt("expires_at", new Date().toISOString())
      .single();
    if (!session) throw new Error("GUEST_SESSION_EXPIRED");
    const { data, error } = await client
      .from("orders")
      .select(
        "id,number,table_id,status,total_cents,created_at,estimate_minutes,cancellation_reason,dining_tables(number),order_items(*),order_status_events(status,created_at)",
      )
      .eq("restaurant_id", id)
      .eq("guest_session_id", session.id)
      .eq("id", orderId)
      .single();
    if (error || !data)
      return Response.json(
        { error: "Pedido não encontrado." },
        { status: 404, headers: noStore },
      );
    return Response.json(data, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    checkOrigin(request);
    const { id, orderId } = await params;
    z.uuid().parse(id);
    z.uuid().parse(orderId);
    const { supabase } = await requireMember(id);
    const body = z
      .object({
        status: z.enum(["em_preparo", "pronto", "entregue", "cancelado"]),
        expected_status: z.enum(["recebido", "em_preparo", "pronto"]),
        reason: z.string().max(300).optional(),
        estimate: z.number().int().min(1).max(180).optional(),
      })
      .parse(await request.json());
    const { data, error } = await supabase.rpc("advance_order", {
      p_restaurant: id,
      p_order: orderId,
      p_expected: body.expected_status,
      p_status: body.status,
      p_reason: body.reason || null,
      p_estimate: body.estimate || null,
    });
    if (error)
      return Response.json(
        {
          error:
            "O pedido mudou ou a transição não é permitida. Atualize e tente novamente.",
        },
        { status: 409, headers: noStore },
      );
    return Response.json(data, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}
