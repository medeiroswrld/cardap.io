import { withRequestLogging } from "@/lib/observability/logger";
import { cookies } from "next/headers";
import { z } from "zod";
import { serviceClient, serverClient } from "@/lib/supabase/server";
import { apiError, checkOrigin, hash, noStore } from "@/lib/server-security";
async function handlePOST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const id = z.uuid().parse((await params).id);
    const body = z
      .object({
        id: z.uuid(),
        media_id: z.uuid(),
        version: z.uuid(),
        product_id: z.uuid(),
        position: z.number().int().min(0).max(10000),
        sequence: z.number().int().positive().max(10000),
        watched_seconds: z.number().min(0).max(3600),
        segments: z
          .array(
            z.tuple([z.number().min(0).max(45), z.number().min(0).max(46)]),
          )
          .max(180),
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
    const { error } = await serviceClient().rpc("record_video_view", {
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

export const POST = withRequestLogging(
  "/api/restaurants/[id]/views",
  handlePOST,
);
