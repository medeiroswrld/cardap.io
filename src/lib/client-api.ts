export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super(requestId ? `${message} Referência: ${requestId}` : message);
    this.name = "ApiRequestError";
  }
}
export async function requestJson<T>(
  url: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const reference = response.headers.get("X-Request-ID");
  const requestId =
    reference &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      reference,
    )
      ? reference
      : undefined;
  const data = await response.json().catch(() => {
    throw new ApiRequestError(
      "Não foi possível ler a resposta. Tente novamente.",
      response.status,
      requestId,
    );
  });
  if (!response.ok) {
    throw new ApiRequestError(
      (
        {
          PRICE_CHANGED:
            "Um preço mudou. Remova o item da sacola e adicione novamente para conferir o valor atual.",
          OPTIONS_CHANGED:
            "Um ingrediente ou adicional mudou. Remova o item da sacola e escolha novamente.",
          UNAVAILABLE:
            "Um produto não está mais disponível. Revise sua sacola.",
          CLOSED: "O restaurante não está recebendo pedidos agora.",
          RATE_LIMITED:
            "Muitas tentativas em pouco tempo. Aguarde alguns minutos antes de tentar novamente ou chame a equipe.",
        } as Record<string, string>
      )[data.error] ||
        data.error ||
        "Não foi possível concluir. Tente novamente.",
      response.status,
      requestId,
    );
  }
  return data as T;
}
