import { withRequestLogging } from "@/lib/observability/logger";
import { serviceClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/server-security";

async function handleGET() {
  try {
    const { data, error } = await serviceClient().rpc("founder_slots_left");
    if (error || typeof data !== "number") throw error ?? new Error("DATABASE_ERROR");
    return Response.json(
      { left: data },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export const GET = withRequestLogging("/api/billing/founders", handleGET);
