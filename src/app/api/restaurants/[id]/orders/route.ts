import { logFailure, withRequestLogging } from "@/lib/observability/logger";
import { errorCode, errorStatus } from "@/lib/observability/core";
import { cookies } from "next/headers";
import { z } from "zod";
import { enforcePublicLimit } from "@/lib/rate-limit";
import { serviceClient } from "@/lib/supabase/server";
import { apiError, checkOrigin, hash, noStore } from "@/lib/server-security";
const schema = z.object({
  key: z.uuid(),
  table_id: z.uuid(),
  name: z.string().trim().min(2).max(80),
  phone: z.string().regex(/^\d{10,11}$/),
  marketing_consent: z.boolean(),
  items: z
    .array(
      z.object({
        product_id: z.uuid(),
        quantity: z.number().int().min(1).max(20),
        expected_price: z.number().int().positive(),
        note: z.string().max(300),
        removed_ingredients: z
          .array(z.string().min(1).max(80))
          .max(30)
          .refine((v) => new Set(v).size === v.length)
          .optional(),
        option_ids: z
          .array(z.uuid())
          .max(30)
          .refine((v) => new Set(v).size === v.length)
          .optional(),
      }),
    )
    .min(1)
    .max(50),
});
async function handlePOST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const id = z.uuid().parse((await params).id);
    const payload = schema.parse(await request.json());
    const token = (await cookies()).get(`guest_${id}`)?.value;
    if (!token) throw new Error("UNAUTHORIZED");
    await enforcePublicLimit(request, id, "order");
    await enforcePublicLimit(request, id, "order_table", payload.table_id);
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
