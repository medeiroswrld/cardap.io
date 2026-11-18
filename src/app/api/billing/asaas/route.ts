import { logger, withRequestLogging } from "@/lib/observability/logger";
import { serviceClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/server-security";
import { asaasFromEnv } from "@/lib/asaas";
import { processAsaasWebhook } from "@/lib/billing-webhook";
import { notifyNewSubscriber } from "@/lib/billing-server";

async function handlePOST(request: Request) {
  try {
    return await processAsaasWebhook(request, {
      service: serviceClient(),
      asaas: () => asaasFromEnv(),
      token: process.env.ASAAS_WEBHOOK_TOKEN,
      notify: notifyNewSubscriber,
      log: (event, detail) =>
        logger.warn(event, event === "billing.webhook_unactivated" ? { eventId: detail } : undefined),
    });
  } catch (error) {
    return apiError(error);
  }
}

export const POST = withRequestLogging("/api/billing/asaas", handlePOST);
