"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiErrorMessages, requestJson } from "@/lib/client-api";
import {
  cleanCouponCode,
  couponError,
  discountFor,
  exceedsTotal,
  type CouponPreview,
} from "@/lib/coupons";
import { clearStoredCoupon, readStoredCoupon, storeCoupon } from "@/lib/campaign-params";

const refreshOn = ["PRICE_CHANGED", "COUPON_INVALID", "COUPON_EXPIRED", "COUPON_MIN_ORDER", "COUPON_EXCEEDS_TOTAL"];
// Order errors after which the preview may be stale (price, expiry, minimum).
export function isCouponRefreshError(message: string) {
  return refreshOn.some((code) => message.startsWith(apiErrorMessages[code]));
}

export function useCoupon({
  restaurantId,
  slug,
  subtotal,
  fee,
}: {
  restaurantId?: string;
  slug: string;
  subtotal: number;
  fee: number;
}) {
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<CouponPreview | null>(null);
  const [applyError, setApplyError] = useState("");
  const [busy, setBusy] = useState(false);

  const apply = useCallback(
    async (raw: string) => {
      if (!restaurantId) return;
      const code = cleanCouponCode(raw);
      setApplyError("");
      if (!code) {
        setPreview(null);
        setApplyError(couponError("COUPON_INVALID"));
        return;
      }
      setBusy(true);
      try {
        const next = await requestJson<CouponPreview>(
          `/api/restaurants/${restaurantId}/coupon?code=${encodeURIComponent(code)}`,
        );
        setPreview(next);
        setInput(next.code);
        storeCoupon(slug, next.code);
      } catch (error) {
        setPreview(null);
        setApplyError((error as Error).message);
        clearStoredCoupon(slug);
      } finally {
        setBusy(false);
      }
    },
    [restaurantId, slug],
  );

  // A coupon from a campaign link is pre-filled and applied on its own.
  useEffect(() => {
    if (!restaurantId) return;
    const stored = readStoredCoupon(slug);
    if (!stored) return;
    queueMicrotask(() => {
      setInput(stored);
      void apply(stored);
    });
  }, [restaurantId, slug, apply]);

  // Mirrors the server: below the minimum, or a discount that would zero the order, is never sent.
  let problem = "";
  if (preview) {
    if (subtotal < preview.min_order_cents)
      problem = couponError("COUPON_MIN_ORDER", preview.min_order_cents);
    else if (exceedsTotal(preview, subtotal, fee)) problem = couponError("COUPON_EXCEEDS_TOTAL");
  }
  const effective = preview && !problem ? preview : null;
  const discount = effective ? discountFor(effective, subtotal) : 0;

  return {
    enabled: !!restaurantId,
    input,
    setInput,
    preview,
    effective,
    discount,
    message: problem || applyError,
    // Typed but never applied (and nothing explaining why): the customer would lose the discount.
    pendingTyped: !!input.trim() && !preview && !applyError,
    busy,
    apply: () => apply(input),
    remove() {
      setPreview(null);
      setApplyError("");
      setInput("");
      clearStoredCoupon(slug);
    },
    refresh() {
      const code = preview?.code ?? cleanCouponCode(input);
      if (code) void apply(code);
    },
  };
}
export type CouponState = ReturnType<typeof useCoupon>;

export function CouponField({ coupon }: { coupon: CouponState }) {
  if (!coupon.enabled) return null;
  const { preview, message } = coupon;
  return (
    <div className="coupon-field">
      {preview ? (
        <div className={`coupon-applied${coupon.effective ? "" : " is-inactive"}`}>
          <span>
            Cupom <strong>{preview.code}</strong>
            {coupon.effective ? " aplicado" : ""}
          </span>
          <button type="button" className="coupon-remove" onClick={coupon.remove}>
            Remover
          </button>
        </div>
      ) : (
        <>
          <label htmlFor="coupon-code">Cupom de desconto</label>
          <div className="coupon-row">
            <input
              id="coupon-code"
              value={coupon.input}
              maxLength={20}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="Digite o código"
              onChange={(e) => coupon.setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (coupon.input.trim()) void coupon.apply();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={coupon.busy || !coupon.input.trim()}
              onClick={() => void coupon.apply()}
            >
              {coupon.busy ? "Aplicando…" : "Aplicar"}
            </Button>
          </div>
        </>
      )}
      {message && (
        <p className="coupon-message" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
