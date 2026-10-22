import { setLogUser, withRequestLogging } from "@/lib/observability/logger";
import { z } from "zod";
import { serverClient } from "@/lib/supabase/server";
import { apiError, checkOrigin, noStore } from "@/lib/server-security";
async function handlePOST(request: Request) {
  try {
    checkOrigin(request);
    const client = await serverClient();
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();
    if (authError && (!authError.status || authError.status >= 500))
      throw new Error("AUTH_UNAVAILABLE");
    if (!user) throw new Error("UNAUTHORIZED");
    setLogUser(user.id);
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

export const POST = withRequestLogging("/api/password", handlePOST);
