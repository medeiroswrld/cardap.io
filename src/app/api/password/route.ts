import { z } from "zod";
import { serverClient } from "@/lib/supabase/server";
import { apiError, checkOrigin, noStore } from "@/lib/server-security";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const client = await serverClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) throw new Error("UNAUTHORIZED");
    const { password } = z
      .object({ password: z.string().min(10).max(128) })
      .parse(await request.json());
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;
    return Response.json({ ok: true }, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}
