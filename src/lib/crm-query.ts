import { z } from "zod";
import { CRM_SEGMENTS, type CrmSegment } from "./crm";

const segment = z.enum(CRM_SEGMENTS as [CrmSegment, ...CrmSegment[]]);
const tag = z.string().trim().min(1).max(30);

export const crmListQuery = z.object({
  search: z.string().trim().max(80).optional(),
  segment: segment.optional(),
  tag: tag.optional(),
  marketing: z.literal("1").optional(),
  sort: z.enum(["last_order", "spent", "orders", "name"]).default("last_order"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});

export const crmSaveBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), tags: z.array(z.string().max(30)).max(10), notes: z.string().max(2000) }),
  z.object({ action: z.literal("erase"), confirm: z.literal("EXCLUIR") }),
]);

export const crmCampaignQuery = z
  .object({ segment: segment.optional(), tag: tag.optional() })
  .refine((v) => v.segment || v.tag, "Escolha um segmento ou uma etiqueta.");

export const crmSettingsBody = z.object({
  action: z.literal("crm_settings"),
  recurring_min_orders: z.number().int().min(2).max(50),
  recurring_days: z.number().int().min(7).max(365),
  vip_min_orders: z.number().int().min(2).max(100),
  vip_min_spent_cents: z.number().int().min(0).max(100000000),
  vip_days: z.number().int().min(7).max(365),
  lapsed_days: z.number().int().min(7).max(365),
});

// Empty query values ("") mean "not set".
export function searchParamsObject(url: URL) {
  return Object.fromEntries([...url.searchParams].filter(([, v]) => v !== ""));
}
