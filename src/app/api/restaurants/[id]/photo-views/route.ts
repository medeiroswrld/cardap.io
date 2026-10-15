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
      .object({
        id: z.uuid(),
        product_id: z.uuid(),
        photo_url: z.url().max(2048),
        sequence: z.number().int().positive().max(10000),
        visible_seconds: z.number().min(0).max(3600),
      })
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
    if (!token) throw new Error("UNAUTHORIZED");
    const { error } = await serviceClient().rpc("record_photo_view", {
      p_restaurant: id,
      p_token_hash: hash(token),
      p_payload: body,
    });
    if (error) throw error;
    return Response.json({ ok: true }, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}
