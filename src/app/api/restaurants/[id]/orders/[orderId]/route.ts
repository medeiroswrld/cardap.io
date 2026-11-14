import { logFailure, withRequestLogging } from "@/lib/observability/logger";
import { errorCode, errorStatus } from "@/lib/observability/core";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireMember, serviceClient } from "@/lib/supabase/server";
import { apiError, checkOrigin, hash, noStore } from "@/lib/server-security";
import { withOrderAddress } from "@/lib/embed";
import { orderTxid, pixPayload, pixReceiptLink } from "@/lib/pix";
type Context = { params: Promise<{ id: string; orderId: string }> };
async function handleGET(_request: Request, { params }: Context) {
  try {
    const { id, orderId } = await params;
    z.uuid().parse(id);
    z.uuid().parse(orderId);
    const token = (await cookies()).get(`guest_${id}`)?.value;
    if (!token) throw new Error("GUEST_SESSION_EXPIRED");
    const client = serviceClient();
    const { data: session, error: sessionError } = await client
      .from("guest_sessions")
      .select("id")
      .eq("restaurant_id", id)
      .eq("token_hash", hash(token))
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) throw new Error("GUEST_SESSION_EXPIRED");
    const { data, error } = await client
      .from("orders")
      .select(
        "id,number,table_id,status,fulfillment,delivery_fee_cents,payment_method,change_for_cents,total_cents,created_at,estimate_minutes,cancellation_reason,dining_tables(number),order_addresses(zone_name,street,number,complement,reference),order_items(*),order_status_events(status,created_at)",
      )
      .eq("restaurant_id", id)
      .eq("guest_session_id", session.id)
      .eq("id", orderId)
      .single();
    if (error && error.code !== "PGRST116") throw error;
    if (!data)
      return Response.json(
        { error: "Pedido não encontrado." },
        { status: 404, headers: noStore },
      );
    const { data: restaurant, error: restaurantError } =
      data.status === "entregue"
        ? await client
            .from("restaurants")
            .select("google_review_url,feedback_enabled")
            .eq("id", id)
            .single()
        : { data: null, error: null };
    if (restaurantError) logFailure(restaurantError, "supabase.orders");
    let payment: { pix_code: string | null; pix_whatsapp: string | null; restaurant_name: string } | null = null;
    if (data.status === "aguardando_pagamento") {
      const [pixRow, rest] = await Promise.all([
        client.from("restaurant_pix").select("pix_key,merchant_name,merchant_city").eq("restaurant_id", id).maybeSingle(),
        client.from("restaurants").select("name,phone").eq("id", id).single(),
      ]);
      if (pixRow.error) logFailure(pixRow.error, "supabase.orders");
      if (rest.error) logFailure(rest.error, "supabase.orders");
      const name = rest.data?.name ?? "";
      payment = {
        restaurant_name: name,
        // Amount comes from the order saved by the server, never from the client.
        pix_code: pixRow.data
          ? pixPayload({
              key: pixRow.data.pix_key,
              name: pixRow.data.merchant_name,
              city: pixRow.data.merchant_city,
              amountCents: data.total_cents,
              txid: orderTxid(data.number),
            })
          : null,
        pix_whatsapp: rest.data?.phone
          ? pixReceiptLink({ phone: rest.data.phone, number: data.number, totalCents: data.total_cents, restaurantName: name })
          : null,
      };
    }
    return Response.json(
      {
        ...withOrderAddress(data),
        ...(payment ?? {}),
        google_review_url: restaurant?.google_review_url || "",
        feedback_enabled: restaurant?.feedback_enabled ?? true,
      },
      { headers: noStore },
    );
  } catch (error) {
    return apiError(error);
  }
}
async function handlePATCH(request: Request, { params }: Context) {
  try {
    checkOrigin(request);
    const { id, orderId } = await params;
    z.uuid().parse(id);
    z.uuid().parse(orderId);
    const { supabase } = await requireMember(id);
    const body = z
      .object({
        status: z.enum([
          "recebido",
          "em_preparo",
          "pronto",
          "saiu_para_entrega",
          "entregue",
          "recusado",
          "cancelado",
        ]),
        expected_status: z.enum([
          "aguardando_pagamento",
          "aguardando_aceite",
          "recebido",
          "em_preparo",
          "pronto",
          "saiu_para_entrega",
        ]),
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
    if (error) {
      if (errorStatus(errorCode(error)) >= 500) throw error;
      logFailure(error, "supabase.orders");
      return Response.json(
        {
          error:
            error.message === "STALE_ORDER"
              ? "Este pedido já foi atualizado por outra pessoa. A lista foi atualizada."
              : "O pedido mudou ou a transição não é permitida. Atualize e tente novamente.",
        },
        { status: errorStatus(errorCode(error)), headers: noStore },
      );
    }
    return Response.json(data, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}

export const GET = withRequestLogging(
  "/api/restaurants/[id]/orders/[orderId]",
  handleGET,
);

export const PATCH = withRequestLogging(
  "/api/restaurants/[id]/orders/[orderId]",
  handlePATCH,
);
