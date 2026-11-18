import "server-only";
import { serviceClient } from "./supabase/server";
import {
  rateLimitAddress,
  rateLimitHash,
  RateLimitError,
} from "./rate-limit-identity";
import { logger } from "./observability/logger";

type Action =
  "session" | "order" | "order_table" | "order_online" | "feedback" | "feedback_session";
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
// Billing endpoints have no restaurant yet (subscribe) or need their own cap (retry_payment):
// dedicated per-subject buckets, one-hour windows, HMAC-hashed subjects.
const BILLING_WINDOW_SECONDS = 3600;
const BILLING_MAX_HITS = 5;
async function consumeBillingLimit(action: string, subject: string) {
  const digest = rateLimitHash(process.env.RATE_LIMIT_HASH_KEY, "billing", action, subject);
  const { data, error } = await serviceClient().rpc("consume_billing_rate_limit", {
    p_subject: digest,
    p_max: BILLING_MAX_HITS,
    p_period: BILLING_WINDOW_SECONDS,
  });
  if (
    error ||
    typeof data?.allowed !== "boolean" ||
    !Number.isInteger(data?.retryAfter) ||
    data.retryAfter < 1 ||
    data.retryAfter > BILLING_WINDOW_SECONDS
  ) {
    logger.error("dependency.failed", { errorCode: "RATE_LIMIT_UNAVAILABLE" });
    throw new Error("RATE_LIMIT_UNAVAILABLE");
  }
  if (!data.allowed) throw new RateLimitError(data.retryAfter);
}
// Public subscribe: 5 attempts per hour per client address.
export function enforceBillingLimit(request: Request) {
  return consumeBillingLimit("subscribe", rateLimitAddress(request.headers, process.env.VERCEL === "1"));
}
// Owner "generate the payment again": 5 per hour per restaurant.
export function enforceRetryPaymentLimit(restaurantId: string) {
  return consumeBillingLimit("retry_payment", restaurantId);
}
