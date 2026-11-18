import "server-only";
import { logger } from "./observability/logger";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { isConfigured } from "./supabase/server";
import { catalogTag } from "./catalog-cache";
import type { Catalog } from "./connected-types";
async function fetchCatalog(slug: string): Promise<Catalog | null> {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: restaurant, error } = await client
    .from("restaurants")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    logger.error("dependency.failed", {
      operation: "supabase.catalog",
      errorCode: "DATABASE_ERROR",
    });
    throw new Error("DATABASE_ERROR");
  }
  if (!restaurant) return null;
  const [categories, products, media, tables, options, optionLinks, zones, pixEnabled, planResult] =
    await Promise.all([
      client
        .from("categories")
        .select("*")
        .eq("restaurant_id", restaurant.id)
        .eq("visible", true)
        .order("position"),
      client
        .from("products")
        .select("*")
        .eq("restaurant_id", restaurant.id)
        .eq("published", true)
        .eq("archived", false)
        .order("position"),
      client
        .from("product_media")
        .select(
          "id,product_id,provider_asset_id,version,state,playback_url,duration_seconds",
        )
        .eq("restaurant_id", restaurant.id)
        .eq("state", "ready")
        .order("created_at", { ascending: false }),
      client
        .from("dining_tables")
        .select("id,number,active")
        .eq("restaurant_id", restaurant.id)
        .eq("active", true)
        .order("number"),
      client
        .from("product_options")
        .select("*")
        .eq("restaurant_id", restaurant.id)
        .eq("active", true)
        .order("name"),
      client
        .from("product_option_links")
        .select("product_id,option_id")
        .eq("restaurant_id", restaurant.id),
      client
        .from("delivery_zones")
        .select("id,name,fee_cents,estimate_minutes,active,position")
        .eq("restaurant_id", restaurant.id)
        .eq("active", true)
        .order("position"),
      client.rpc("restaurant_pix_enabled", { p_restaurant: restaurant.id }),
      client.rpc("restaurant_plan", { p_restaurant: restaurant.id }),
    ]);
  if (
    [categories, products, media, tables, options, optionLinks, zones].some(
      (r) => r.error,
    )
  ) {
    logger.error("dependency.failed", {
      operation: "supabase.catalog",
      errorCode: "DATABASE_ERROR",
    });
    throw new Error("DATABASE_ERROR");
  }
  // Pix is optional: a failed check falls back to pay-on-delivery instead of breaking the menu.
  if (pixEnabled.error) {
    logger.warn("dependency.failed", {
      operation: "supabase.catalog",
      errorCode: "DATABASE_ERROR",
    });
  }
  const catalog = {
    plan: planResult.data === "essencial" ? "essencial" : "profissional",
    restaurant,
    options: options.data,
    optionLinks: optionLinks.data,
    categories: categories.data,
    products: products.data,
    media: media.data,
    tables: tables.data,
    zones: zones.data,
    pixOnline: pixEnabled.data === true,
  } as Catalog;
  // A failed plan read must not hide offers a paying restaurant is entitled to, nor be remembered for 60 s:
  // throwing keeps unstable_cache from storing it; readCatalog serves the catalog as profissional.
  if (planResult.error) throw new PlanUnavailable(catalog);
  return catalog;
}
export class PlanUnavailable extends Error {
  constructor(readonly catalog: Catalog) {
    super("PLAN_UNAVAILABLE");
  }
}

// Short shared cache for the public menu; invalidated by owner mutations.
export function readCatalog(slug: string): Promise<Catalog | null> {
  if (!isConfigured()) throw new Error("INTEGRATION_UNAVAILABLE");
  // Bump "v4" whenever the Catalog shape changes so old cached entries are ignored.
  return unstable_cache(() => fetchCatalog(slug), ["catalog", "v4", slug], {
    revalidate: 60,
    tags: [catalogTag(slug)],
  })().catch((error: unknown) => {
    const unavailable = error as Partial<PlanUnavailable> | null;
    if (unavailable?.message !== "PLAN_UNAVAILABLE" || !unavailable.catalog) throw error;
    logger.warn("billing.state_unavailable", { operation: "supabase.catalog", errorCode: "DATABASE_ERROR" });
    return unavailable.catalog;
  });
}
