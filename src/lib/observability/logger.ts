import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import {
  createSafeLogger,
  errorCode,
  errorStatus,
  pseudonym,
  safeAction,
  type Event,
  type Fields,
  type LogContext,
} from "./core";

const context = new AsyncLocalStorage<LogContext>();
const sink = createSafeLogger(undefined, process.env.LOG_LEVEL);
export const logger = {
  info: (event: Event, fields?: Fields) =>
    sink.info(event, fields, context.getStore()),
  warn: (event: Event, fields?: Fields) =>
    sink.warn(event, fields, context.getStore()),
  error: (event: Event, fields?: Fields) =>
    sink.error(event, fields, context.getStore()),
  fatal: (event: Event, fields?: Fields) =>
    sink.fatal(event, fields, context.getStore()),
};
export function setLogUser(userId: string) {
  const current = context.getStore();
  if (current) current.userId = pseudonym(userId, process.env.LOG_HASH_KEY);
}
export function hasRequestContext() {
  return Boolean(context.getStore());
}
export function logFailure(error: unknown, operation?: Fields["operation"]) {
  const code = errorCode(error);
  logger[errorStatus(code) >= 500 ? "error" : "warn"]("request.failed", {
    errorCode: code,
    operation,
  });
}
export function withRequestLogging<Args extends unknown[]>(
  route: string,
  handler: (request: Request, ...args: Args) => Promise<Response>,
) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    const requestId = randomUUID();
    return context.run(
      { requestId, action: safeAction(request.method, route) },
      async () => {
        const start = performance.now();
        let response: Response;
        try {
          response = await handler(request, ...args);
        } catch (error) {
          logFailure(error);
          response = Response.json(
            {
              error:
                "Não foi possível concluir a solicitação. Tente novamente.",
            },
            { status: 500, headers: { "Cache-Control": "private, no-store" } },
          );
        }
        logger[
          response.status >= 500
            ? "error"
            : response.status >= 400
              ? "warn"
              : "info"
        ]("request.completed", {
          status: response.status,
          durationMs: performance.now() - start,
        });
        // Copy only if immutable (e.g. Response.redirect); preserve cookie headers.
        try {
          response.headers.set("X-Request-ID", requestId);
        } catch {
          response = new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
          response.headers.set("X-Request-ID", requestId);
        }
        return response;
      },
    );
  };
}
export function logServerError(error: unknown) {
  context.run({ requestId: randomUUID(), action: "server" }, () => {
    logger.error("server.error", {
      errorCode: errorCode(error),
      operation: "next.render",
    });
  });
}
export function logProxyFailure() {
  context.run({ requestId: randomUUID(), action: "server" }, () => {
    logger.error("dependency.failed", {
      operation: "next.proxy",
      errorCode: "AUTH_UNAVAILABLE",
    });
  });
}
