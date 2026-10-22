import "server-only";
import { serviceClient } from "./supabase/server";
import {
  rateLimitAddress,
  rateLimitHash,
  RateLimitError,
} from "./rate-limit-identity";
import { logger } from "./observability/logger";

type Action =
  "session" | "order" | "order_table" | "feedback" | "feedback_session";
export async function enforcePublicLimit(
  request: Request,
  restaurant: string,
  action: Action,
  subject?: string,
) {
  const identity =
    subject ?? rateLimitAddress(request.headers, process.env.VERCEL === "1");
  const digest = rateLimitHash(
    process.env.RATE_LIMIT_HASH_KEY,
    restaurant,
    action,
    identity,
  );
  const { data, error } = await serviceClient().rpc(
    "consume_public_rate_limit",
    {
      p_restaurant: restaurant,
      p_action: action,
      p_subject: digest,
    },
  );
  if (error?.message === "NOT_FOUND") throw new Error("NOT_FOUND");
  if (
    error ||
    typeof data?.allowed !== "boolean" ||
    !Number.isInteger(data?.retryAfter) ||
    data.retryAfter < 1 ||
    data.retryAfter > 600
  ) {
    logger.error("dependency.failed", { errorCode: "RATE_LIMIT_UNAVAILABLE" });
    throw new Error("RATE_LIMIT_UNAVAILABLE");
  }
  if (!data.allowed) throw new RateLimitError(data.retryAfter);
}
