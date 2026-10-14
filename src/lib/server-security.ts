import "server-only";
import { createHash } from "node:crypto";
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
  const message = error instanceof Error ? error.message : "REQUEST_FAILED";
  const status =
    message === "UNAUTHORIZED" || message === "GUEST_SESSION_EXPIRED"
      ? 401
      : message === "FORBIDDEN" || message === "ORIGIN_REJECTED"
        ? 403
        : message.includes("configurad") ||
            message === "APP_URL_REQUIRED" ||
            message === "STREAM_AUTH_FAILED" ||
            message === "VIDEO_STORAGE_UNAVAILABLE"
          ? 503
          : 400;
  return Response.json(
    {
      error:
        message === "VIDEO_STORAGE_UNAVAILABLE"
          ? "O armazenamento de vídeos está indisponível. Tente novamente em instantes."
          : message === "VIDEO_UPLOAD_INCOMPLETE"
            ? "O envio do vídeo ainda não foi confirmado. Verifique sua conexão e tente novamente."
            : message === "STREAM_AUTH_FAILED"
              ? "O serviço de vídeos recusou o acesso. Confira a configuração do Cloudflare Stream antes de reenviar."
              : status === 503
                ? "Integração ainda não configurada."
                : message === "GUEST_SESSION_EXPIRED"
                  ? "Sua sessão de pedidos expirou ou pertence a outro navegador. Fale com a equipe para acompanhar o pedido."
                  : status === 401
                    ? "Entre na sua conta para continuar."
                    : status === 403
                      ? "Acesso não permitido."
                      : "Não foi possível concluir a solicitação. Confira os dados e tente novamente.",
    },
    { status, headers: noStore },
  );
}
