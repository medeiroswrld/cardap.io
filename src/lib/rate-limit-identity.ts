import { createHmac } from "node:crypto";
import { isIP } from "node:net";

// Vercel overwrites this header. Never trust client-forwarded IPs on another host.
export function rateLimitAddress(headers: Headers, onVercel: boolean) {
  if (!onVercel) return "shared-origin";
  const address = headers.get("x-vercel-forwarded-for")?.trim();
  if (!address || !isIP(address)) return "shared-origin";
  if (isIP(address) === 6) return new URL(`http://[${address}]/`).hostname;
  return address;
}
export function rateLimitHash(
  secret: string | undefined,
  restaurant: string,
  action: string,
  subject: string,
) {
  if (!secret || secret.length < 32) throw new Error("RATE_LIMIT_UNAVAILABLE");
  return createHmac("sha256", secret)
    .update(JSON.stringify([restaurant, action, subject]))
    .digest("hex");
}
export class RateLimitError extends Error {
  constructor(public readonly retryAfter: number) {
    super("RATE_LIMITED");
  }
}
