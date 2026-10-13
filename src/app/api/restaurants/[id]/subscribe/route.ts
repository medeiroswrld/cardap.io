import { cookies } from "next/headers";
import { z } from "zod";
import { serviceClient } from "@/lib/supabase/server";
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
        name: z.string().trim().min(2).max(80),
        phone: z.string().regex(/^\d{10,11}$/),
        consent: z.literal(true),
      })
      .parse(await request.json());
    const token = (await cookies()).get(`guest_${id}`)?.value;
    if (!token) throw new Error("UNAUTHORIZED");
    const { error } = await serviceClient().rpc("subscribe_guest", {
      p_restaurant: id,
      p_token_hash: hash(token),
      p_name: body.name,
      p_phone: body.phone,
    });
    if (error) throw error;
    return Response.json({ ok: true }, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}
