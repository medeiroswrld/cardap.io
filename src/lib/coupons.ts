import { money } from "./utils";

export type CouponPreview = {
  code: string;
  kind: "percent" | "fixed";
  value: number;
  min_order_cents: number;
  valid_until: string | null;
};
export type CouponRow = CouponPreview & {
  id: string;
  restaurant_id: string;
  active: boolean;
  created_at: string;
};
export type CouponStats = Record<string, { uses: number; discount_cents: number }>;

export const SITE_URL = "https://fomeplay.com.br";

// Same math as public.coupon_discount: percent floors, fixed never exceeds the subtotal.
export function discountFor(c: CouponPreview, subtotal: number): number {
  if (c.kind === "percent") return Math.floor((subtotal * c.value) / 100);
  return Math.min(c.value, subtotal);
}
// Mirrors the database rule COUPON_EXCEEDS_TOTAL: the order total must stay positive.
export function exceedsTotal(c: CouponPreview, subtotal: number, fee: number): boolean {
  return subtotal - discountFor(c, subtotal) + fee <= 0;
}
export function normalizeCode(s: string): string {
  return s.trim().toUpperCase();
}
// Same shape the order schema accepts; anything else from a link is ignored.
export function cleanCouponCode(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const code = normalizeCode(raw);
  return /^[A-Z0-9]{3,20}$/.test(code) ? code : null;
}
export function couponError(code: string, min?: number): string {
  if (code === "COUPON_INVALID") return "Cupom não encontrado.";
  if (code === "COUPON_EXPIRED") return "Este cupom expirou.";
  if (code === "COUPON_MIN_ORDER")
    return `Este cupom vale para pedidos a partir de ${money(min ?? 0)}.`;
  if (code === "COUPON_EXCEEDS_TOTAL")
    return "O desconto não pode ser maior que o pedido. Adicione mais itens.";
  return "Não foi possível aplicar o cupom. Tente novamente.";
}
export const COUPON_PRICE_CHANGED_TEXT =
  "Um preço ou o desconto do cupom mudou. Confira a sacola e o total antes de enviar de novo.";
// After an order with a coupon fails with these codes, the preview may be stale.
export function isCouponRefreshCode(code: string | undefined): boolean {
  return code === "PRICE_CHANGED" || !!code?.startsWith("COUPON_");
}
// Only a definitive answer about the code itself discards it; network errors and rate limits keep it for a retry.
export function dropsCoupon(code: string | undefined): boolean {
  return code === "COUPON_INVALID" || code === "COUPON_EXPIRED";
}
export function couponLink(slug: string, code: string): string {
  return `${SITE_URL}/r/${slug}?cupom=${encodeURIComponent(code)}`;
}
export function winBackMessage(
  template: string,
  vars: { nome: string; restaurante: string; link: string },
): string {
  const first = vars.nome.trim().split(/\s+/)[0] ?? "";
  return template
    .replaceAll("{nome}", first)
    .replaceAll("{restaurante}", vars.restaurante)
    .replaceAll("{link}", vars.link);
}
export function whatsappUrl(phone: string, text: string): string {
  return `https://wa.me/55${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
