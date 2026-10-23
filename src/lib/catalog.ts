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
  const [categories, products, media, tables, options, optionLinks] =
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
    ]);
  if (
    [categories, products, media, tables, options, optionLinks].some(
      (r) => r.error,
    )
  ) {
    logger.error("dependency.failed", {
      operation: "supabase.catalog",
      errorCode: "DATABASE_ERROR",
    });
    throw new Error("DATABASE_ERROR");
  }
  return {
    restaurant,
    options: options.data,
    optionLinks: optionLinks.data,
    categories: categories.data,
    products: products.data,
    media: media.data,
    tables: tables.data,
  } as Catalog;
}

// Short shared cache for the public menu; invalidated by owner mutations.
export function readCatalog(slug: string): Promise<Catalog | null> {
  if (!isConfigured()) throw new Error("INTEGRATION_UNAVAILABLE");
  return unstable_cache(() => fetchCatalog(slug), ["catalog", slug], {
    revalidate: 60,
    tags: [catalogTag(slug)],
  })();
}
