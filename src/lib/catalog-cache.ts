import "server-only";
import { revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./observability/logger";

// Public menus are cached for a short time; owners' changes expire the tag
// immediately so the next customer refresh reads fresh prices/availability.
export function catalogTag(slug: string) {
  return `catalog:${slug}`;
}

export function invalidateCatalogSlug(slug: string) {
  revalidateTag(catalogTag(slug), { expire: 0 });
}

export async function invalidateCatalog(
  supabase: SupabaseClient,
  restaurantId: string,
) {
  const { data, error } = await supabase
    .from("restaurants")
    .select("slug")
    .eq("id", restaurantId)
    .single();
  if (error || !data?.slug) {
    // The write already succeeded; the 60 s cache window bounds staleness.
    logger.warn("dependency.failed", {
      operation: "supabase.catalog",
      errorCode: "DATABASE_ERROR",
    });
    return;
  }
  invalidateCatalogSlug(data.slug);
}
