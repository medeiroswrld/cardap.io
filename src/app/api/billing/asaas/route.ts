import { logger, withRequestLogging } from "@/lib/observability/logger";
import { serviceClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/server-security";
import { asaasFromEnv } from "@/lib/asaas";
import { processAsaasWebhook } from "@/lib/billing-webhook";
import { notifyNewSubscriber } from "@/lib/billing-server";
import { invalidateCatalog } from "@/lib/catalog-cache";

async function handlePOST(request: Request) {
  try {
    return await processAsaasWebhook(request, {
      service: serviceClient(),
      asaas: () => asaasFromEnv(),
      token: process.env.ASAAS_WEBHOOK_TOKEN,
      notify: notifyNewSubscriber,
      invalidate: (restaurantId) => invalidateCatalog(serviceClient(), restaurantId),
      log: (event, detail) =>
        logger.warn(
          event,
          event === "billing.webhook_unactivated" || event === "billing.notify_failed"
            ? { eventId: detail }
            : event === "billing.webhook_ignored"
              ? { webhookEvent: detail } // reasons (lowercase) are dropped by the sanitizer; event types pass
              : undefined,
        ),
    });
  } catch (error) {
    return apiError(error);
  }
}

export const POST = withRequestLogging("/api/billing/asaas", handlePOST);
