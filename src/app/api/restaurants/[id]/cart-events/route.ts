import { cookies } from "next/headers";
import { z } from "zod";
import { serviceClient, serverClient } from "@/lib/supabase/server";
import { apiError, checkOrigin, hash, noStore } from "@/lib/server-security";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const id = z.uuid().parse((await params).id);
    const body = z
      .object({ id: z.uuid(), product_id: z.uuid() })
      .parse(await request.json());
    const client = await serverClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (user) {
      const { data: member } = await client
        .from("restaurant_members")
        .select("restaurant_id")
        .eq("restaurant_id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (member) return Response.json({ ignored: true }, { headers: noStore });
    }
    const token = (await cookies()).get(`guest_${id}`)?.value;
    if (!token) throw new Error("GUEST_SESSION_EXPIRED");
    const { error } = await serviceClient().rpc("record_cart_add", {
      p_restaurant: id,
      p_token_hash: hash(token),
      p_event: body.id,
      p_product: body.product_id,
    });
    if (error) throw error;
    return Response.json({ ok: true }, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}
