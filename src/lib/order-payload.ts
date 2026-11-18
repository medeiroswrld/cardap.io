import { z } from "zod";

const item = z.object({
  product_id: z.uuid(),
  quantity: z.number().int().min(1).max(20),
  expected_price: z.number().int().positive(),
  note: z.string().max(300),
  removed_ingredients: z
    .array(z.string().min(1).max(80))
    .max(30)
    .refine((v) => new Set(v).size === v.length)
    .optional(),
  option_ids: z
    .array(z.uuid())
    .max(30)
    .refine((v) => new Set(v).size === v.length)
    .optional(),
});
const common = {
  key: z.uuid(),
  name: z.string().trim().min(2).max(80),
  phone: z.string().regex(/^\d{10,11}$/),
  marketing_consent: z.boolean(),
  items: z.array(item).min(1).max(50),
  // Coupon and origin are validated again by place_guest_order; the client is never trusted.
  coupon_code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{3,20}$/)
    .transform((v) => v.toUpperCase())
    .nullable()
    .optional(),
  expected_discount_cents: z.number().int().min(0).max(10000000).nullable().optional(),
  // A malformed origin (hand-edited link) must never block an order: it becomes null.
  origin: z
    .string()
    .regex(/^[a-z0-9-]{2,30}$/)
    .nullable()
    .optional()
    .catch(null),
};
const payment = z.enum(["dinheiro", "cartao", "pix"]);
const change = z.number().int().min(1).max(10000000).nullable().optional();
export const orderPayload = z
  .union([
  z
    .object({ ...common, fulfillment: z.literal("mesa").default("mesa"), table_id: z.uuid() })
    .strict(),
  z
    .object({
      ...common,
      fulfillment: z.literal("retirada"),
      payment_method: payment,
      change_for_cents: change,
    })
    .strict(),
  z
    .object({
      ...common,
      fulfillment: z.literal("entrega"),
      payment_method: payment,
      change_for_cents: change,
      // Fee the customer saw; the database rejects the order if the zone fee changed.
      expected_fee_cents: z.number().int().min(0).max(100000),
      address: z
        .object({
          zone_id: z.uuid(),
          street: z.string().trim().min(3).max(150),
          number: z.string().trim().min(1).max(20),
          complement: z.string().trim().max(80),
          reference: z.string().trim().max(150),
        })
        .strict(),
    })
    .strict(),
  ])
  .refine((v) => !v.coupon_code || typeof v.expected_discount_cents === "number", {
    message: "expected_discount_cents is required with a coupon",
  });
export type OrderPayload = z.infer<typeof orderPayload>;
