import { logFailure, withRequestLogging } from "@/lib/observability/logger";
import { errorCode, errorStatus } from "@/lib/observability/core";
import { cookies } from "next/headers";
import { z } from "zod";
import { enforcePublicLimit } from "@/lib/rate-limit";
import { serviceClient } from "@/lib/supabase/server";
import { apiError, checkOrigin, hash, noStore } from "@/lib/server-security";
type Context = { params: Promise<{ id: string; productId: string }> };
const input = z.object({
  order_id: z.uuid().optional(),
  liked: z.boolean(),
  comment: z.string().trim().max(1000),
});

async function handleGET(_request: Request, { params }: Context) {
  try {
    const { id, productId } = await params;
    z.uuid().parse(id);
    z.uuid().parse(productId);
    const token = (await cookies()).get(`guest_${id}`)?.value;
    const { data, error } = await serviceClient().rpc("read_guest_feedback", {
      p_restaurant: id,
      p_product: productId,
      p_token_hash: token ? hash(token) : null,
    });
    if (error) {
      if (errorStatus(errorCode(error)) >= 500) throw error;
      logFailure(error, "supabase.feedback");
      return Response.json(
        { error: "Não foi possível carregar as avaliações. Tente novamente." },
        {
          status: error.message.includes("PRODUCT_NOT_FOUND") ? 404 : 503,
          headers: noStore,
        },
      );
    }
    return Response.json(data, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}

async function handlePOST(request: Request, { params }: Context) {
  try {
    checkOrigin(request);
    const { id, productId } = await params;
    z.uuid().parse(id);
    z.uuid().parse(productId);
    const token = (await cookies()).get(`guest_${id}`)?.value;
    if (!token) throw new Error("GUEST_SESSION_EXPIRED");
    const body = input.parse(await request.json());
    await enforcePublicLimit(request, id, "feedback");
    await enforcePublicLimit(request, id, "feedback_session", token);
    const { error } = await serviceClient().rpc("save_guest_feedback", {
      p_restaurant: id,
      p_product: productId,
      p_token_hash: hash(token),
      p_order: body.order_id || null,
      p_liked: body.liked,
      p_comment: body.comment,
    });
    if (error?.message.includes("SESSION_EXPIRED"))
      throw new Error("GUEST_SESSION_EXPIRED");
    if (error) {
      if (errorStatus(errorCode(error)) >= 500) throw error;
      logFailure(error, "supabase.feedback");
      return Response.json(
        {
          error: error.message.includes("FEEDBACK_DISABLED")
            ? "O restaurante desativou as curtidas e os comentários."
            : "Não foi possível salvar. Confira se o prato ainda está no cardápio e tente novamente.",
        },
        { status: 403, headers: noStore },
      );
    }
    return Response.json({ ok: true }, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}

export const GET = withRequestLogging(
  "/api/restaurants/[id]/products/[productId]/feedback",
  handleGET,
);

export const POST = withRequestLogging(
  "/api/restaurants/[id]/products/[productId]/feedback",
  handlePOST,
);
