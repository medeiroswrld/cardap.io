import { logFailure, withRequestLogging } from "@/lib/observability/logger";
import { errorCode, errorStatus } from "@/lib/observability/core";
import { cookies } from "next/headers";
import { z } from "zod";
import { enforcePublicLimit } from "@/lib/rate-limit";
import { serviceClient } from "@/lib/supabase/server";
import { orderPayload } from "@/lib/order-payload";
import { apiError, checkOrigin, hash, noStore } from "@/lib/server-security";
async function handlePOST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const id = z.uuid().parse((await params).id);
    const payload = orderPayload.parse(await request.json());
    const token = (await cookies()).get(`guest_${id}`)?.value;
    if (!token) throw new Error("UNAUTHORIZED");
    await enforcePublicLimit(request, id, "order");
    if (payload.fulfillment === "mesa")
      await enforcePublicLimit(request, id, "order_table", payload.table_id);
    else await enforcePublicLimit(request, id, "order_online", hash(token));
    const { data, error } = await serviceClient().rpc("place_guest_order", {
      p_restaurant: id,
      p_token_hash: hash(token),
      p_key: payload.key,
      p_payload: payload,
    });
    if (error) {
      const code = errorCode(error);
      if (errorStatus(code) >= 500) throw error;
      logFailure(error, "supabase.orders");
      return Response.json(
        { error: code },
        {
          status: errorStatus(code),
          headers: noStore,
        },
      );
    }
    return Response.json({ order: data }, { status: 201, headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}

export const POST = withRequestLogging(
  "/api/restaurants/[id]/orders",
  handlePOST,
);
