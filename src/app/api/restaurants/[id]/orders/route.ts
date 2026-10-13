import { cookies } from "next/headers";
import { z } from "zod";
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
      }),
    )
    .min(1)
    .max(50),
});
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const id = z.uuid().parse((await params).id);
    const payload = schema.parse(await request.json());
    const token = (await cookies()).get(`guest_${id}`)?.value;
    if (!token) throw new Error("UNAUTHORIZED");
    const { data, error } = await serviceClient().rpc("place_guest_order", {
      p_restaurant: id,
      p_token_hash: hash(token),
      p_key: payload.key,
      p_payload: payload,
    });
    if (error) {
      const code = error.message.includes("PRICE_CHANGED")
        ? "PRICE_CHANGED"
        : error.message.includes("IDEMPOTENCY_CONFLICT")
          ? "IDEMPOTENCY_CONFLICT"
          : error.message.includes("UNAVAILABLE")
            ? "UNAVAILABLE"
            : error.message.includes("CLOSED")
              ? "CLOSED"
              : "ORDER_REJECTED";
      return Response.json(
        { error: code },
        {
          status:
            code === "PRICE_CHANGED" || code === "IDEMPOTENCY_CONFLICT"
              ? 409
              : 400,
          headers: noStore,
        },
      );
    }
    return Response.json({ order: data }, { status: 201, headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}
