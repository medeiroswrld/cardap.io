import "server-only";
import { revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./observability/logger";

// Public menus are cached for a short time; owners' changes expire the tag
// immediately so the next customer refresh reads fresh prices/availability.
export function catalogTag(slug: string) {
  return `catalog:${slug}`;
}

// Catalog slugs are lowercase letters, digits and hyphens (same rule as the API route).
export function isCatalogSlug(slug: string): boolean {
  return /^[a-z0-9-]{1,80}$/.test(slug);
}

function warnInvalidationFailed() {
  // The write already succeeded; the 60 s cache window bounds staleness.
  logger.warn("dependency.failed", {
    operation: "supabase.catalog",
    errorCode: "DATABASE_ERROR",
  });
}

export function invalidateCatalogSlug(slug: string) {
  try {
    revalidateTag(catalogTag(slug), { expire: 0 });
  } catch {
    warnInvalidationFailed();
  }
}

export async function invalidateCatalog(
  supabase: SupabaseClient,
  restaurantId: string,
) {
  try {
    const { data, error } = await supabase
      .from("restaurants")
      .select("slug")
      .eq("id", restaurantId)
      .single();
    if (error || !data?.slug) {
      warnInvalidationFailed();
      return;
    }
    revalidateTag(catalogTag(data.slug), { expire: 0 });
  } catch {
    warnInvalidationFailed();
  }
}
