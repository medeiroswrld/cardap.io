"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiErrorCode, requestJson } from "@/lib/client-api";
import {
  cleanCouponCode,
  couponError,
  discountFor,
  dropsCoupon,
  exceedsTotal,
  type CouponPreview,
} from "@/lib/coupons";
import { clearStoredCoupon, readStoredCoupon, storeCoupon } from "@/lib/campaign-params";

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
  // Last failure was transient (network, rate limit): the code is kept and Aplicar becomes a retry.
  const [retry, setRetry] = useState(false);
  // Polite announcements for successes ("aplicado", "removido"); errors go through `message`.
  const [notice, setNotice] = useState("");
  const autoApplied = useRef<string | null>(null);

  const apply = useCallback(
    async (raw: string) => {
      if (!restaurantId) return;
      const code = cleanCouponCode(raw);
      setApplyError("");
      setNotice("");
      setRetry(false);
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
        setNotice(`Cupom ${next.code} aplicado`);
      } catch (error) {
        setApplyError((error as Error).message);
        // Only "not found" / "expired" discard the code; anything else can be retried.
        if (dropsCoupon(apiErrorCode(error))) {
          setPreview(null);
          clearStoredCoupon(slug);
        } else setRetry(true);
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
    // Once per stored code, even if the effect re-runs (StrictMode, apply identity).
    const mark = `${slug}:${stored}`;
    if (autoApplied.current === mark) return;
    autoApplied.current = mark;
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
    // While an apply is in flight the submit button is disabled instead (see menu-app).
    pendingTyped: !!input.trim() && !preview && !applyError && !busy,
    busy,
    retry,
    notice,
    apply: () => apply(input),
    remove() {
      setPreview(null);
      setApplyError("");
      setRetry(false);
      setInput("");
      setNotice("Cupom removido.");
      clearStoredCoupon(slug);
      autoApplied.current = null;
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
  const text = message || coupon.notice;
  return (
    <div className="coupon-field">
      {preview ? (
        <div className={`coupon-applied${coupon.effective ? "" : " is-inactive"}`}>
          <span>
            Cupom <strong>{preview.code}</strong>
            {coupon.effective ? " aplicado" : ""}
          </span>
          <button
            type="button"
            className="coupon-remove"
            aria-label={`Remover cupom ${preview.code}`}
            onClick={coupon.remove}
          >
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
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? "coupon-message" : undefined}
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
              {coupon.busy ? "Aplicando…" : coupon.retry ? "Tentar de novo" : "Aplicar"}
            </Button>
          </div>
        </>
      )}
      <div id="coupon-message" className="coupon-status" role="status" aria-live="polite">
        {text && <p className={message ? "coupon-message" : "sr-only"}>{text}</p>}
      </div>
    </div>
  );
}
