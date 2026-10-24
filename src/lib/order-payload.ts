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
};
const payment = z.enum(["dinheiro", "cartao", "pix"]);
const change = z.number().int().min(1).max(10000000).nullable().optional();
export const orderPayload = z.union([
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
]);
export type OrderPayload = z.infer<typeof orderPayload>;
