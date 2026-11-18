import { logFailure, withRequestLogging } from "@/lib/observability/logger";
import { errorCode, errorStatus } from "@/lib/observability/core";
import { z } from "zod";
import { isGoogleReviewUrl } from "@/lib/feedback";
import { invalidateCatalog } from "@/lib/catalog-cache";
import { normalizePixKey, pixText } from "@/lib/pix";
import { crmSettingsBody } from "@/lib/crm-query";
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
const financeDate = z
  .string()
  .regex(/^d{4}-d{2}-d{2}$/)
  .refine((v) => v >= "2000-01-01" && v <= "2100-12-31" && !Number.isNaN(Date.parse(v)));
const financeEntry = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("income"),
    description: z.string().trim().min(2).max(60),
    amount_cents: z.number().int().min(1).max(10000000),
    entry_date: financeDate,
  }),
  z.object({
    kind: z.literal("expense"),
    description: z.string().trim().min(2).max(80),
    category: z.enum(["insumos", "embalagens", "funcionarios", "aluguel", "contas", "marketing", "impostos", "outros"]),
    amount_cents: z.number().int().min(1).max(100000000),
    entry_date: financeDate,
    due_date: financeDate.nullable().optional(),
    paid: z.boolean(),
    // Editing a paid expense must resend its existing paid_at, otherwise the DB resets it to entry_date.
    paid_at: financeDate.nullable().optional(),
  }),
]);
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
    offer_in_bag: z.boolean().optional(),
  }),
  z.object({ action: z.literal("options_in_bag_all"), offer: z.boolean() }),
  z.object({
    action: z.literal("bag_suggestions"),
    product_ids: z
      .array(z.uuid())
      .max(3)
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
    menu_start_view: z.enum(["lista", "reels"]).optional(),
    ifood_fee_percent: z.number().min(0).max(60).optional(),
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
    auto_accept_orders: z.boolean().optional(),
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
  z.object({
    action: z.literal("save_pix"),
    pix_key: z.string().trim().max(77),
    key_type: z.enum(["cpf", "cnpj", "telefone", "email", "aleatoria"]).optional(),
    merchant_name: z.string().trim().max(25),
    merchant_city: z.string().trim().max(15),
  }),
  z.object({
    action: z.literal("menu_theme"),
    theme: z.record(z.string(), z.string().max(400)).refine((t) => Object.keys(t).length <= 12),
  }),
  crmSettingsBody,
  z.object({
    action: z.literal("save_coupon"),
    id: z.uuid().nullable().optional(),
    code: z
      .string()
      .trim()
      .transform((v) => v.toUpperCase())
      .pipe(z.string().regex(/^[A-Z0-9]{3,20}$/)),
    kind: z.enum(["percent", "fixed"]),
    value: z.number().int().min(1).max(50000),
    min_order_cents: z.number().int().min(0).max(100000),
    valid_until: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    active: z.boolean(),
  }),
  z.object({ action: z.literal("delete_coupon"), id: z.uuid() }),
  z.object({ action: z.literal("save_origin"), name: z.string().trim().min(2).max(40) }),
  z.object({ action: z.literal("delete_origin"), id: z.uuid() }),
  z.object({ action: z.literal("save_finance_entry"), id: z.uuid().nullable().optional(), entry: financeEntry }),
  z.object({ action: z.literal("delete_finance_entry"), id: z.uuid() }),
  z.object({ action: z.literal("set_entry_paid"), id: z.uuid(), paid: z.boolean() }),
  z.object({
    action: z.literal("save_payment_fees"),
    card_fee_percent: z.number().min(0).max(15),
    pix_fee_percent: z.number().min(0).max(15),
  }),
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
      if (body.offer_in_bag !== undefined) {
        const flag = await supabase.rpc("set_option_offer_in_bag", {
          p_restaurant: id,
          p_option: body.id,
          p_offer: body.offer_in_bag,
        });
        if (flag.error) throw flag.error;
      }
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
      const { action: _, tables, menu_start_view, ifood_fee_percent, ...values } = body;
      void _;
      const { error } = await supabase.rpc("save_restaurant_settings", {
        p_restaurant: id,
        p_settings: values,
        p_tables: tables,
      });
      if (error) throw error;
      if (menu_start_view) {
        const view = await supabase.rpc("set_menu_start_view", {
          p_restaurant: id,
          p_view: menu_start_view,
        });
        if (view.error) throw view.error;
      }
      if (ifood_fee_percent !== undefined) {
        const fee = await supabase.rpc("set_ifood_fee", {
          p_restaurant: id,
          p_percent: ifood_fee_percent,
        });
        if (fee.error) throw fee.error;
      }
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
      if (error?.code === "23505") {
        logFailure(error, "supabase.catalog");
        return Response.json(
          { error: "Já existe um bairro com esse nome." },
          { status: 409, headers: noStore },
        );
      }
      if (error) throw error;
    } else if (body.action === "save_pix") {
      let key = "";
      if (body.pix_key) {
        const normalized = body.key_type ? normalizePixKey(body.key_type, body.pix_key) : null;
        if (
          !normalized ||
          !pixText(body.merchant_name, 25) ||
          !pixText(body.merchant_city, 15)
        )
          throw new Error("INVALID_INPUT");
        key = normalized;
      }
      const { error } = await supabase.rpc("save_restaurant_pix", {
        p_restaurant: id,
        p_key: key,
        p_name: body.merchant_name,
        p_city: body.merchant_city,
      });
      if (error) throw error;
    } else if (body.action === "options_in_bag_all") {
      // Bulk switch for every option already registered (owner-only RPC per option).
      const { data: options, error: listError } = await supabase
        .from("product_options")
        .select("id")
        .eq("restaurant_id", id);
      if (listError) throw listError;
      for (const option of options ?? []) {
        const { error } = await supabase.rpc("set_option_offer_in_bag", {
          p_restaurant: id,
          p_option: option.id,
          p_offer: body.offer,
        });
        if (error) throw error;
      }
    } else if (body.action === "bag_suggestions") {
      const { error } = await supabase.rpc("save_bag_suggestions", {
        p_restaurant: id,
        p_products: body.product_ids,
      });
      if (error) throw error;
    } else if (body.action === "menu_theme") {
      const { error } = await supabase.rpc("save_menu_theme", {
        p_restaurant: id,
        p_theme: body.theme,
      });
      if (error) {
        const code = errorCode(error);
        if (errorStatus(code) >= 500) throw error;
        logFailure(error, "supabase.catalog");
        return Response.json(
          { error: code },
          { status: errorStatus(code), headers: noStore },
        );
      }
    } else if (
      body.action === "save_coupon" ||
      body.action === "delete_coupon" ||
      body.action === "save_origin" ||
      body.action === "delete_origin" ||
      body.action === "save_finance_entry" ||
      body.action === "delete_finance_entry" ||
      body.action === "set_entry_paid" ||
      body.action === "save_payment_fees"
    ) {
      // Owner-only RPCs; domain errors (COUPON_*, LIMIT_REACHED) are returned as codes.
      let result: { data: unknown; error: { message?: string; code?: string } | null };
      if (body.action === "save_coupon") {
        if (body.kind === "percent" && body.value > 90) throw new Error("INVALID_INPUT");
        result = await supabase.rpc("save_coupon", {
          p_restaurant: id,
          p_id: body.id ?? null,
          p_coupon: {
            code: body.code,
            kind: body.kind,
            value: body.value,
            min_order_cents: body.min_order_cents,
            valid_until: body.valid_until ?? "",
            active: body.active,
          },
        });
      } else if (body.action === "delete_coupon")
        result = await supabase.rpc("delete_coupon", { p_restaurant: id, p_id: body.id });
      else if (body.action === "save_origin")
        result = await supabase.rpc("save_origin", { p_restaurant: id, p_name: body.name });
      else if (body.action === "delete_origin")
        result = await supabase.rpc("delete_origin", { p_restaurant: id, p_id: body.id });
      else if (body.action === "save_finance_entry") {
        const { entry } = body;
        result = await supabase.rpc("save_finance_entry", {
          p_restaurant: id,
          p_id: body.id ?? null,
          p_entry:
            entry.kind === "income"
              ? { kind: "income", description: entry.description, amount_cents: entry.amount_cents, entry_date: entry.entry_date }
              : {
                  kind: "expense",
                  description: entry.description,
                  category: entry.category,
                  amount_cents: entry.amount_cents,
                  entry_date: entry.entry_date,
                  due_date: entry.due_date ?? "",
                  paid: entry.paid,
                  paid_at: entry.paid_at ?? "",
                },
        });
      } else if (body.action === "delete_finance_entry")
        result = await supabase.rpc("delete_finance_entry", { p_restaurant: id, p_id: body.id });
      else if (body.action === "set_entry_paid")
        result = await supabase.rpc("set_entry_paid", { p_restaurant: id, p_id: body.id, p_paid: body.paid });
      else
        result = await supabase.rpc("save_payment_fees", {
          p_restaurant: id,
          p_card: body.card_fee_percent,
          p_pix: body.pix_fee_percent,
        });
      if (result.error) {
        const code = errorCode(result.error);
        if (errorStatus(code) >= 500) throw result.error;
        logFailure(result.error, "supabase.catalog");
        return Response.json({ error: code }, { status: errorStatus(code), headers: noStore });
      }
      return Response.json(
        body.action === "save_coupon" || body.action === "save_finance_entry"
          ? { ok: true, id: result.data }
          : body.action === "save_origin"
            ? { ok: true, origin: result.data }
            : { ok: true },
        { headers: noStore },
      );
    } else if (body.action === "crm_settings") {
      const { action: _, ...settings } = body;
      void _;
      const { error } = await supabase.rpc("crm_save_settings", { p_restaurant: id, p_settings: settings });
      if (error) throw error;
    } else if (body.action === "revoke_marketing") {
      const { error } = await supabase.rpc("revoke_marketing", {
        p_restaurant: id,
        p_contact: body.id,
      });
      if (error) throw error;
    }
    // Marketing revocations, CRM settings and comment moderation are not part of the public catalog.
    if (
      body.action !== "revoke_marketing" &&
      body.action !== "moderate_feedback" &&
      body.action !== "crm_settings"
    )
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
