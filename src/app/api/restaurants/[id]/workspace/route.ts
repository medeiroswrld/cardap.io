import { z } from "zod";
import { requireMember } from "@/lib/supabase/server";
import { apiError, noStore } from "@/lib/server-security";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.uuid().parse((await params).id);
    const { supabase, role } = await requireMember(id);
    const [restaurant, categories, products, media, tables, orders] =
      await Promise.all([
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
            "*,dining_tables(number),order_items(*),order_status_events(status,created_at)",
          )
          .eq("restaurant_id", id)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
    if (
      [restaurant, categories, products, media, tables, orders].some(
        (r) => r.error,
      )
    )
      throw new Error("DATABASE_ERROR");
    let contacts: unknown[] = [];
    let metrics: unknown[] = [];
    if (role === "owner") {
      const [c, m] = await Promise.all([
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
      ]);
      if (c.error || m.error) throw new Error("DATABASE_ERROR");
      contacts = c.data;
      metrics = m.data;
    }
    return Response.json(
      {
        restaurant: restaurant.data,
        role,
        categories: categories.data,
        products: products.data,
        media: media.data,
        tables: tables.data,
        orders: orders.data,
        contacts,
        metrics,
      },
      { headers: noStore },
    );
  } catch (error) {
    return apiError(error);
  }
}
