import "server-only";
import { createHash } from "node:crypto";
import { errorCode, errorStatus } from "./observability/core";
import { logFailure } from "./observability/logger";
import { RateLimitError } from "./rate-limit-identity";
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function checkOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (!configured) throw new Error("APP_URL_REQUIRED");
  const origin = request.headers.get("origin");
  if (origin !== new URL(configured).origin) throw new Error("ORIGIN_REJECTED");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new Error("ORIGIN_REJECTED");
}
export const noStore = { "Cache-Control": "private, no-store, max-age=0" };
export function apiError(error: unknown) {
  const message = errorCode(error);
  const status = errorStatus(message);
  logFailure(error);
  return Response.json(
    {
      error:
        message === "RATE_LIMITED"
          ? "Muitas tentativas em pouco tempo. Aguarde alguns minutos antes de tentar novamente ou chame a equipe."
          : message === "VIDEO_STORAGE_UNAVAILABLE"
            ? "O armazenamento de vídeos está indisponível. Tente novamente em instantes."
            : message === "VIDEO_UPLOAD_INCOMPLETE"
              ? "O envio do vídeo ainda não foi confirmado. Verifique sua conexão e tente novamente."
              : message === "STREAM_AUTH_FAILED"
                ? "O serviço de vídeos recusou o acesso. Confira a configuração do Cloudflare Stream antes de reenviar."
                : status === 503
                  ? "Serviço temporariamente indisponível. Tente novamente em instantes."
                  : status >= 500
                    ? "Ocorreu uma falha interna. Tente novamente em instantes."
                    : message === "GUEST_SESSION_EXPIRED"
                      ? "Sua sessão de pedidos expirou ou pertence a outro navegador. Fale com a equipe para acompanhar o pedido."
                      : status === 401
                        ? "Entre na sua conta para continuar."
                        : status === 403
                          ? "Acesso não permitido."
                          : "Não foi possível concluir a solicitação. Confira os dados e tente novamente.",
    },
    {
      status,
      headers:
        error instanceof RateLimitError
          ? { ...noStore, "Retry-After": String(error.retryAfter) }
          : noStore,
    },
  );
}
