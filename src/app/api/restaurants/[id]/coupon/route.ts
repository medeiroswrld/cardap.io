import { logFailure, withRequestLogging } from "@/lib/observability/logger";
import { errorCode, errorStatus } from "@/lib/observability/core";
import { z } from "zod";
import { enforcePublicLimit } from "@/lib/rate-limit";
import { rateLimitAddress } from "@/lib/rate-limit-identity";
import { serviceClient } from "@/lib/supabase/server";
import { normalizeCode } from "@/lib/coupons";
import { apiError, noStore } from "@/lib/server-security";
import { readBilling } from "@/lib/billing-server";
import { allows } from "@/lib/plans";

// Public preview for the menu. check_coupon is granted to service_role only, so
// every lookup is rate-limited per client before it reaches the database.
async function handleGET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z.uuid().parse((await params).id);
    const code = normalizeCode(new URL(request.url).searchParams.get("code") ?? "");
    // Own bucket per client (the "session" scope allows 60 attempts per 10 minutes).
    await enforcePublicLimit(
      request,
      id,
      "session",
      "coupon:" + rateLimitAddress(request.headers, process.env.VERCEL === "1"),
    );
    if (!/^[A-Z0-9]{3,20}$/.test(code))
      return Response.json({ error: "COUPON_INVALID" }, { status: 400, headers: noStore });
    // Essencial has no coupons: every code is simply unknown.
    const service = serviceClient();
    if (!allows((await readBilling(id)).plan, "coupons"))
      return Response.json({ error: "COUPON_INVALID" }, { status: 400, headers: noStore });
    const { data, error } = await service.rpc("check_coupon", {
      p_restaurant: id,
      p_code: code,
    });
    if (error) {
      const mapped = errorCode(error);
      if (errorStatus(mapped) >= 500) throw error;
      logFailure(error, "supabase.orders");
      return Response.json({ error: mapped }, { status: errorStatus(mapped), headers: noStore });
    }
    return Response.json(data, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}

export const GET = withRequestLogging("/api/restaurants/[id]/coupon", handleGET);
