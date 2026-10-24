import { withRequestLogging } from "@/lib/observability/logger";
import { z } from "zod";
import { isGoogleReviewUrl } from "@/lib/feedback";
import { invalidateCatalog } from "@/lib/catalog-cache";
import { requireMember } from "@/lib/supabase/server";
import { apiError, checkOrigin, noStore } from "@/lib/server-security";
const product = z.object({
  id: z.uuid(),
  category_id: z.uuid(),
  name: z.string().trim().min(2).max(100),
  description: z.string().max(300),
  ingredients: z.string().max(1500),
  removable_ingredients: z
    .array(z.string().trim().min(1).max(80))
    .max(30)
    .refine((v) => new Set(v).size === v.length)
    .optional(),
  allergens: z.string().max(400),
  price_cents: z.number().int().positive().max(1000000),
  photo_url: z.url().nullable(),
  published: z.boolean(),
  available: z.boolean(),
  position: z.number().int().min(0).max(10000),
});
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("feedback_settings"), enabled: z.boolean() }),
  z.object({
    action: z.literal("moderate_feedback"),
    id: z.uuid(),
    hidden: z.boolean(),
  }),
  z.object({
    action: z.literal("save_option"),
    id: z.uuid(),
    name: z.string().trim().min(2).max(80),
    price_cents: z.number().int().min(0).max(100000),
    active: z.boolean(),
    product_ids: z
      .array(z.uuid())
      .max(500)
      .refine((v) => new Set(v).size === v.length),
  }),
  z.object({ action: z.literal("save_product"), product }),
  z.object({ action: z.literal("archive_product"), id: z.uuid() }),
  z.object({
    action: z.literal("save_category"),
    id: z.uuid(),
    name: z.string().trim().min(2).max(50),
    visible: z.boolean(),
    position: z.number().int().min(0).max(10000),
  }),
  z.object({
    action: z.literal("remove_category"),
    id: z.uuid(),
    destination: z.uuid(),
  }),
  z.object({
    action: z.literal("settings"),
    name: z.string().trim().min(2).max(80),
    subtitle: z.string().max(100),
    phone: z.string().max(20),
    address: z.string().max(250),
    privacy_email: z.email(),
    google_review_url: z
      .string()
      .trim()
      .max(500)
      .refine(isGoogleReviewUrl)
      .optional(),
    retention_days: z.number().int().min(1).max(730),
    accepting_orders: z.boolean(),
    opening_hours: z
      .array(
        z.object({
          day: z.number().int().min(0).max(6),
          open: z.string().regex(/^\d{2}:\d{2}$/),
          close: z.string().regex(/^\d{2}:\d{2}$/),
        }),
      )
      .max(28),
    tables: z.number().int().min(1).max(100),
    pickup_enabled: z.boolean().optional(),
    delivery_enabled: z.boolean().optional(),
    delivery_min_order_cents: z
      .number()
      .int()
      .min(0)
      .max(1000000)
      .optional(),
  }),
  z.object({
    action: z.literal("save_delivery_zone"),
    id: z.uuid(),
    name: z.string().trim().min(2).max(80),
    fee_cents: z.number().int().min(0).max(100000),
    estimate_minutes: z.number().int().min(5).max(240),
    active: z.boolean(),
    position: z.number().int().min(0).max(10000),
  }),
  z.object({ action: z.literal("revoke_marketing"), id: z.uuid() }),
]);
async function handlePOST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const id = z.uuid().parse((await params).id);
    const { supabase } = await requireMember(id, true);
    const body = schema.parse(await request.json());
    if (body.action === "feedback_settings") {
      const { error } = await supabase.rpc("set_feedback_enabled", {
        p_restaurant: id,
        p_enabled: body.enabled,
      });
      if (error) throw error;
    } else if (body.action === "moderate_feedback") {
      const { error } = await supabase.rpc("moderate_feedback", {
        p_restaurant: id,
        p_feedback: body.id,
        p_hidden: body.hidden,
      });
      if (error) throw error;
    } else if (body.action === "save_option") {
      const { error } = await supabase.rpc("save_product_option", {
        p_restaurant: id,
        p_id: body.id,
        p_name: body.name,
        p_price: body.price_cents,
        p_active: body.active,
        p_products: body.product_ids,
      });
      if (error) throw error;
    } else if (body.action === "save_product") {
      const { data: existing } = await supabase
        .from("products")
        .select("id")
        .eq("id", body.product.id)
        .eq("restaurant_id", id)
        .maybeSingle();
      const payload = { ...body.product, restaurant_id: id };
      const result = existing
        ? await supabase
            .from("products")
            .update(payload)
            .eq("id", body.product.id)
            .eq("restaurant_id", id)
        : await supabase.from("products").insert(payload);
      if (result.error) throw result.error;
    } else if (body.action === "archive_product") {
      const { error } = await supabase
        .from("products")
        .update({ archived: true, published: false })
        .eq("id", body.id)
        .eq("restaurant_id", id);
      if (error) throw error;
    } else if (body.action === "save_category") {
      const { action: _, ...values } = body;
      void _;
      const { data: existing } = await supabase
        .from("categories")
        .select("id")
        .eq("id", body.id)
        .eq("restaurant_id", id)
        .maybeSingle();
      const result = existing
        ? await supabase
            .from("categories")
            .update(values)
            .eq("id", body.id)
            .eq("restaurant_id", id)
        : await supabase
            .from("categories")
            .insert({ ...values, restaurant_id: id });
      if (result.error) throw result.error;
    } else if (body.action === "remove_category") {
      const { error } = await supabase.rpc("move_and_remove_category", {
        p_restaurant: id,
        p_category: body.id,
        p_destination: body.destination,
      });
      if (error) throw error;
    } else if (body.action === "settings") {
      const { action: _, tables, ...values } = body;
      void _;
      const { error } = await supabase.rpc("save_restaurant_settings", {
        p_restaurant: id,
        p_settings: values,
        p_tables: tables,
      });
      if (error) throw error;
    } else if (body.action === "save_delivery_zone") {
      const { error } = await supabase.rpc("save_delivery_zone", {
        p_restaurant: id,
        p_id: body.id,
        p_name: body.name,
        p_fee: body.fee_cents,
        p_estimate: body.estimate_minutes,
        p_active: body.active,
        p_position: body.position,
      });
      if (error) throw error;
    } else if (body.action === "revoke_marketing") {
      const { error } = await supabase.rpc("revoke_marketing", {
        p_restaurant: id,
        p_contact: body.id,
      });
      if (error) throw error;
    }
    // Marketing revocations and comment moderation are not part of the public catalog.
    if (body.action !== "revoke_marketing" && body.action !== "moderate_feedback")
      await invalidateCatalog(supabase, id);
    return Response.json({ ok: true }, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}

export const POST = withRequestLogging(
  "/api/restaurants/[id]/catalog",
  handlePOST,
);
