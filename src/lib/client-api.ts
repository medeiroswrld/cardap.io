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
  const data = await response.json().catch(() => ({
    error: "Não foi possível ler a resposta. Tente novamente.",
  }));
  if (!response.ok)
    throw new Error(
      (
        {
          PRICE_CHANGED:
            "Um preço mudou. Remova o item da sacola e adicione novamente para conferir o valor atual.",
          OPTIONS_CHANGED:
            "Um ingrediente ou adicional mudou. Remova o item da sacola e escolha novamente.",
          UNAVAILABLE:
            "Um produto não está mais disponível. Revise sua sacola.",
          CLOSED: "O restaurante não está recebendo pedidos agora.",
        } as Record<string, string>
      )[data.error] ||
        data.error ||
        "Não foi possível concluir. Tente novamente.",
    );
  return data as T;
}
