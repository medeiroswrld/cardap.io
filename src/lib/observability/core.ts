import pino, { type DestinationStream } from "pino";
import { createHmac } from "node:crypto";
import { ZodError } from "zod";

export const events = [
  "request.completed",
  "request.failed",
  "dependency.failed",
  "video.sync_deferred",
  "video.rejected",
  "auth.callback_rejected",
  "auth.cookie_write_failed",
  "server.error",
  "server.started",
  "logger.identity_disabled",
  "server.fatal",
] as const;
export type Event = (typeof events)[number];
export const operations = [
  "supabase.auth",
  "supabase.membership",
  "supabase.catalog",
  "supabase.workspace",
  "supabase.orders",
  "supabase.feedback",
  "supabase.onboarding",
  "supabase.media",
  "supabase.storage",
  "cloudflare.upload",
  "cloudflare.status",
  "video.sync",
  "next.render",
  "next.proxy",
  "next.startup",
] as const;
export const errorCodes = [
  "RATE_LIMIT_UNAVAILABLE",
  "RATE_LIMITED",
  "STATE_CONFLICT",
  "UNEXPECTED_ERROR",
  "INVALID_INPUT",
  "UNAUTHORIZED",
  "GUEST_SESSION_EXPIRED",
  "FORBIDDEN",
  "ORIGIN_REJECTED",
  "NOT_FOUND",
  "APP_URL_REQUIRED",
  "INTEGRATION_UNAVAILABLE",
  "DATABASE_ERROR",
  "STREAM_AUTH_FAILED",
  "STREAM_UPLOAD_FAILED",
  "STREAM_STATUS_FAILED",
  "VIDEO_STORAGE_UNAVAILABLE",
  "VIDEO_UPLOAD_INCOMPLETE",
  "INVALID_ASSET",
  "EMAIL_REQUIRED",
  "PASSWORD_REQUIRED",
  "AUTH_UNAVAILABLE",
  "PRICE_CHANGED",
  "OPTIONS_CHANGED",
  "IDEMPOTENCY_CONFLICT",
  "UNAVAILABLE",
  "CLOSED",
  "PICKUP_DISABLED",
  "DELIVERY_DISABLED",
  "INVALID_ZONE",
  "INVALID_ADDRESS",
  "BELOW_MINIMUM",
  "INVALID_PAYMENT",
  "INVALID_CHANGE",
  "FEEDBACK_DISABLED",
  "PRODUCT_NOT_FOUND",
  "AUTH_REJECTED",
  "INVALID_VIDEO",
  "COOKIE_WRITE_FAILED",
  "23505",
  "42501",
  "PGRST116",
] as const;
export type ErrorCode = (typeof errorCodes)[number];
export type Fields = {
  operation?: (typeof operations)[number];
  errorCode?: ErrorCode;
  status?: number;
  durationMs?: number;
};
export type LogContext = {
  requestId?: string;
  action?: string;
  userId?: string;
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const methods = ["GET", "POST", "PATCH", "PUT", "DELETE", "HEAD", "OPTIONS"];
// Static templates only: never accept a URL, slug, query string or supplied header.
const routes = new Set([
  "/api/auth",
  "/api/password",
  "/api/onboarding",
  "/api/catalog/[slug]",
  "/auth/confirm",
  ...[
    "catalog",
    "workspace",
    "session",
    "orders",
    "orders/[orderId]",
    "media",
    "views",
    "photo-views",
    "cart-events",
    "associations",
    "photo-associations",
    "subscribe",
    "products/[productId]/feedback",
  ].map((part) => `/api/restaurants/[id]/${part}`),
]);
export function safeAction(method: string, route: string) {
  return methods.includes(method) && routes.has(route)
    ? `${method} ${route}`
    : "server";
}
function member<T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return typeof value === "string" && values.includes(value as T);
}
// Read data properties only: do not invoke getters, toJSON, serializers or coercion.
function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  try {
    return Object.getOwnPropertyDescriptor(value, key)?.value;
  } catch {
    return undefined;
  }
}
export function errorCode(error: unknown): ErrorCode {
  if (error instanceof ZodError || error instanceof SyntaxError)
    return "INVALID_INPUT";
  const message = field(error, "message");
  if (message === "SESSION_EXPIRED") return "GUEST_SESSION_EXPIRED";
  if (message === "RATE_LIMITED") return "RATE_LIMITED";
  if (
    message === "STALE_ORDER" ||
    message === "INVALID_TRANSITION" ||
    message === "ALREADY_ONBOARDED"
  )
    return "STATE_CONFLICT";
  if (
    [
      "INVALID_CONTACT",
      "INVALID_COVERAGE",
      "INVALID_CUSTOMER",
      "INVALID_DESTINATION",
      "INVALID_FEEDBACK",
      "INVALID_HOURS",
      "INVALID_INTERVAL",
      "INVALID_ITEMS",
      "INVALID_MEDIA",
      "INVALID_OBSERVATION",
      "INVALID_PERIOD",
      "INVALID_PHOTO",
      "INVALID_PRODUCTS",
      "INVALID_QUANTITY",
      "INVALID_SEGMENTS",
      "INVALID_SETTINGS",
      "INVALID_TABLE",
    ].includes(message as string)
  )
    return "INVALID_INPUT";
  if (member(errorCodes, message)) return message;
  if (
    [
      "Supabase não configurado",
      "Integração de dados não configurada",
      "Cloudflare Stream não configurado",
    ].includes(message as string)
  )
    return "INTEGRATION_UNAVAILABLE";
  const code = field(error, "code");
  return member(errorCodes, code) ? code : "UNEXPECTED_ERROR";
}
export function errorStatus(code: ErrorCode) {
  if (code === "RATE_LIMIT_UNAVAILABLE") return 503;
  if (code === "RATE_LIMITED") return 429;
  if (code === "STATE_CONFLICT") return 409;
  if (["UNAUTHORIZED", "GUEST_SESSION_EXPIRED"].includes(code)) return 401;
  if (
    ["FORBIDDEN", "ORIGIN_REJECTED", "FEEDBACK_DISABLED", "42501"].includes(
      code,
    )
  )
    return 403;
  if (["NOT_FOUND", "PRODUCT_NOT_FOUND", "PGRST116"].includes(code)) return 404;
  if (
    [
      "23505",
      "PRICE_CHANGED",
      "OPTIONS_CHANGED",
      "IDEMPOTENCY_CONFLICT",
    ].includes(code)
  )
    return 409;
  if (
    [
      "INVALID_INPUT",
      "INVALID_ASSET",
      "EMAIL_REQUIRED",
      "PASSWORD_REQUIRED",
      "UNAVAILABLE",
      "CLOSED",
      "PICKUP_DISABLED",
      "DELIVERY_DISABLED",
      "INVALID_ZONE",
      "INVALID_ADDRESS",
      "BELOW_MINIMUM",
      "INVALID_PAYMENT",
      "INVALID_CHANGE",
      "AUTH_REJECTED",
      "VIDEO_UPLOAD_INCOMPLETE",
    ].includes(code)
  )
    return 400;
  if (
    [
      "APP_URL_REQUIRED",
      "INTEGRATION_UNAVAILABLE",
      "STREAM_AUTH_FAILED",
      "STREAM_UPLOAD_FAILED",
      "STREAM_STATUS_FAILED",
      "VIDEO_STORAGE_UNAVAILABLE",
      "AUTH_UNAVAILABLE",
    ].includes(code)
  )
    return 503;
  return 500;
}
export function pseudonym(userId: string, key: string | undefined) {
  if (!key || key.length < 32 || !/^[0-9a-f-]{36}$/i.test(userId))
    return undefined;
  return "usr_" + createHmac("sha256", key).update(userId).digest("hex");
}
export function createSafeLogger(
  destination?: DestinationStream,
  configuredLevel = "info",
) {
  const levels = ["info", "warn", "error", "fatal"] as const;
  const engine = pino(
    {
      level: member(levels, configuredLevel) ? configuredLevel : "info",
      base: { service: "cardapio" },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      // Defense in depth. The allowlist below is the primary privacy boundary.
      redact: {
        paths: [
          "password",
          "token",
          "authorization",
          "cookie",
          "email",
          "phone",
          "body",
          "headers",
          "err",
          "*.password",
          "*.token",
        ],
        censor: "[REDACTED]",
      },
    },
    destination,
  );
  function emit(
    level: (typeof levels)[number],
    event: Event,
    fields: Fields = {},
    context: LogContext = {},
  ) {
    const output: Record<string, string | number> = {};
    const requestId = field(context, "requestId");
    const action = field(context, "action");
    const userId = field(context, "userId");
    if (typeof requestId === "string" && uuid.test(requestId))
      output.requestId = requestId;
    if (
      typeof action === "string" &&
      (action === "server" ||
        methods.some(
          (method) =>
            action.startsWith(method + " ") &&
            routes.has(action.slice(method.length + 1)),
        ))
    )
      output.action = action;
    else output.action = "server";
    if (typeof userId === "string" && /^usr_[a-f0-9]{64}$/.test(userId))
      output.userId = userId;
    const operation = field(fields, "operation");
    const code = field(fields, "errorCode");
    if (member(operations, operation)) output.operation = operation;
    if (member(errorCodes, code)) output.errorCode = code;
    for (const key of ["status", "durationMs"] as const) {
      const value = field(fields, key);
      if (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= (key === "status" ? 599 : 86400000)
      )
        output[key] = Math.round(value);
    }
    engine[level](output, member(events, event) ? event : "server.error");
  }
  return {
    info: (event: Event, fields?: Fields, context?: LogContext) =>
      emit("info", event, fields, context),
    warn: (event: Event, fields?: Fields, context?: LogContext) =>
      emit("warn", event, fields, context),
    error: (event: Event, fields?: Fields, context?: LogContext) =>
      emit("error", event, fields, context),
    fatal: (event: Event, fields?: Fields, context?: LogContext) =>
      emit("fatal", event, fields, context),
  };
}
