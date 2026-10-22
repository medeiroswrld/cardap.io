import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logger } = await import("./lib/observability/logger");
  logger.info("server.started", { operation: "next.startup" });
  if (!process.env.LOG_HASH_KEY || process.env.LOG_HASH_KEY.length < 32)
    logger.warn("logger.identity_disabled", { operation: "next.startup" });
}

export const onRequestError: Instrumentation.onRequestError = async (error) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logServerError } = await import("./lib/observability/logger");
  // Never serialize framework request/headers/error: auth codes can be in URLs.
  logServerError(error);
};
