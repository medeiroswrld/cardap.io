import { withRequestLogging } from "@/lib/observability/logger";
import { logger } from "@/lib/observability/logger";
import { errorCode } from "@/lib/observability/core";
import { syncVideoAsset } from "@/lib/sync-video";
import { z } from "zod";
import { requireMember } from "@/lib/supabase/server";
import { apiError, noStore } from "@/lib/server-security";
import { withOrderAddress } from "@/lib/embed";
async function handleGET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.uuid().parse((await params).id);
    const { supabase, role } = await requireMember(id);
    const [
      restaurant,
      categories,
      products,
      media,
      tables,
      orders,
      options,
      optionLinks,
      zones,
    ] = await Promise.all([
      supabase.from("restaurants").select("*").eq("id", id).single(),
      supabase
        .from("categories")
        .select("*")
        .eq("restaurant_id", id)
        .order("position"),
      supabase
        .from("products")
        .select("*")
        .eq("restaurant_id", id)
        .eq("archived", false)
        .order("position"),
      supabase
        .from("product_media")
        .select("*")
        .eq("restaurant_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("dining_tables")
        .select("*")
        .eq("restaurant_id", id)
        .order("number"),
      supabase
        .from("orders")
        .select(
          "*,dining_tables(number),order_addresses(zone_name,street,number,complement,reference),order_items(*),order_status_events(status,created_at)",
        )
        .eq("restaurant_id", id)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("product_options")
        .select("*")
        .eq("restaurant_id", id)
        .order("name"),
      supabase
        .from("product_option_links")
        .select("product_id,option_id")
        .eq("restaurant_id", id),
      supabase
        .from("delivery_zones")
        .select("*")
        .eq("restaurant_id", id)
        .order("position"),
    ]);
    if (
      [
        restaurant,
        categories,
        products,
        media,
        tables,
        orders,
        options,
        optionLinks,
        zones,
      ].some((r) => r.error)
    )
      throw new Error("DATABASE_ERROR");
    const pendingOnline = (orders.data || []).filter(
      (o) => o.status === "aguardando_aceite",
    );
    await Promise.all(
      pendingOnline.map(async (order) => {
        const { count, error } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", id)
          .eq("customer_phone", order.customer_phone)
          .neq("status", "recusado")
          .lt("created_at", order.created_at);
        if (error) throw new Error("DATABASE_ERROR");
        order.first_order = count === 0;
      }),
    );
    if (role === "owner") {
      const pending = (media.data || [])
        .filter(
          (asset) =>
            ["uploading", "processing"].includes(asset.state) &&
            asset.provider_asset_id,
        )
        .slice(0, 5);
      await Promise.all(
        pending.map(async (asset) => {
          try {
            Object.assign(asset, await syncVideoAsset(id, asset));
          } catch (error) {
            logger.warn("video.sync_deferred", {
              operation: "video.sync",
              errorCode: errorCode(error),
            });
          }
        }),
      );
    }
    let contacts: unknown[] = [];
    let metrics: unknown[] = [];
    let photoMetrics: unknown[] = [];
    let feedback: unknown[] = [];
    if (role === "owner") {
      const [c, m, photos, reviews] = await Promise.all([
        supabase
          .from("contacts")
          .select("*")
          .eq("restaurant_id", id)
          .order("last_seen_at", { ascending: false })
          .limit(500),
        supabase
          .from("video_view_sessions")
          .select(
            "product_id,media_id,media_version,watched_seconds,coverage,qualified,created_at",
          )
          .eq("restaurant_id", id)
          .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
          .limit(10000),
        supabase
          .from("photo_view_sessions")
          .select("product_id,photo_url,visible_seconds,qualified,created_at")
          .eq("restaurant_id", id)
          .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
          .order("created_at", { ascending: false })
          .limit(10000),
        supabase
          .from("product_feedback")
          .select(
            "id,product_id,liked,comment,comment_hidden,updated_at,products(name)",
          )
          .eq("restaurant_id", id)
          .or("liked.eq.true,comment.neq.")
          .order("updated_at", { ascending: false })
          .limit(200),
      ]);
      if (c.error || m.error || photos.error || reviews.error)
        throw new Error("DATABASE_ERROR");
      contacts = c.data;
      metrics = m.data;
      photoMetrics = photos.data;
      feedback = reviews.data;
    }
    return Response.json(
      {
        restaurant: restaurant.data,
        role,
        categories: categories.data,
        options: options.data,
        optionLinks: optionLinks.data,
        products: products.data,
        media: media.data,
        tables: tables.data,
        zones: zones.data,
        orders: (orders.data || []).map(withOrderAddress),
        contacts,
        metrics,
        photoMetrics,
        feedback,
      },
      { headers: noStore },
    );
  } catch (error) {
    return apiError(error);
  }
}

export const GET = withRequestLogging(
  "/api/restaurants/[id]/workspace",
  handleGET,
);
