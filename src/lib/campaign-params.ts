import { cleanCouponCode } from "./coupons";
import { sanitizeOrigin } from "./origins";

// Campaign links (?cupom=, ?origem=) are kept per restaurant for the browser
// session. Storage can be blocked, so every access is guarded.
const couponKey = (slug: string) => `fp:cupom:${slug}`;
const originKey = (slug: string) => `fp:origem:${slug}`;

export function readStoredCoupon(slug: string): string | null {
  try {
    return cleanCouponCode(sessionStorage.getItem(couponKey(slug)));
  } catch {
    return null;
  }
}
export function readStoredOrigin(slug: string): string | null {
  try {
    return sanitizeOrigin(sessionStorage.getItem(originKey(slug)));
  } catch {
    return null;
  }
}
export function clearStoredCoupon(slug: string) {
  try {
    sessionStorage.removeItem(couponKey(slug));
  } catch {}
}
export function storeCoupon(slug: string, code: string) {
  try {
    sessionStorage.setItem(couponKey(slug), code);
  } catch {}
}

// Reads the campaign params from the URL into sessionStorage, then removes
// them from the address bar (other params such as ?mesa= stay).
export function captureCampaignParams(slug: string) {
  try {
    const url = new URL(window.location.href);
    const hasCoupon = url.searchParams.has("cupom");
    const hasOrigin = url.searchParams.has("origem");
    if (!hasCoupon && !hasOrigin) return;
    const coupon = cleanCouponCode(url.searchParams.get("cupom"));
    const origin = sanitizeOrigin(url.searchParams.get("origem"));
    try {
      if (coupon) sessionStorage.setItem(couponKey(slug), coupon);
      if (origin) sessionStorage.setItem(originKey(slug), origin);
    } catch {}
    url.searchParams.delete("cupom");
    url.searchParams.delete("origem");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  } catch {}
}
