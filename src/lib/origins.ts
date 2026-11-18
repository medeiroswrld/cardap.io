export type OriginRow = { id: string; restaurant_id: string; slug: string; name: string; created_at: string };
export type OriginReportRow = { origin: string; orders: number; total_cents: number };

export const BUILTIN_ORIGINS = [
  { slug: "ifood", name: "Embalagem do iFood" },
  { slug: "instagram", name: "Instagram" },
];

export function originLabel(slug: string | null, custom: { slug: string; name: string }[]): string {
  if (slug === "mesa") return "Mesa";
  if (slug === null || slug === "direto") return "Direto";
  const found = BUILTIN_ORIGINS.find((o) => o.slug === slug) ?? custom.find((o) => o.slug === slug);
  return found ? found.name : "Origem apagada";
}
export function originLink(restaurantSlug: string, originSlug: string): string {
  return `https://fomeplay.com.br/r/${restaurantSlug}?origem=${encodeURIComponent(originSlug)}`;
}

// A campaign link can carry anything in ?origem=; only a clean slug is ever stored or sent.
export function sanitizeOrigin(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const slug = raw.trim().toLowerCase();
  return /^[a-z0-9-]{2,30}$/.test(slug) ? slug : null;
}
