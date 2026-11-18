export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly requestId?: string,
    public readonly code?: string,
  ) {
    super(requestId ? `${message} Referência: ${requestId}` : message);
    this.name = "ApiRequestError";
  }
}
export function apiErrorCode(error: unknown): string | undefined {
  return error instanceof ApiRequestError ? error.code : undefined;
}
export const apiErrorMessages: Record<string, string> = {
  LOW_CONTRAST: "Essas cores deixam o texto difícil de ler. Escolha cores com mais contraste.",
  PRICE_CHANGED:
    "Um preço mudou. Remova o item da sacola e adicione novamente para conferir o valor atual.",
  OPTIONS_CHANGED:
    "Um ingrediente ou adicional mudou. Remova o item da sacola e escolha novamente.",
  UNAVAILABLE:
    "Um produto não está mais disponível. Revise sua sacola.",
  CLOSED: "O restaurante não está recebendo pedidos agora.",
  PICKUP_DISABLED: "Este restaurante não está aceitando pedidos para retirada agora.",
  DELIVERY_DISABLED: "Este restaurante não está fazendo entregas agora.",
  INVALID_ZONE: "Escolha um bairro atendido pela entrega.",
  INVALID_ADDRESS: "Confira rua e número do endereço de entrega.",
  BELOW_MINIMUM: "O pedido ainda não atingiu o valor mínimo para entrega.",
  INVALID_PAYMENT: "Escolha como vai pagar na entrega ou retirada.",
  INVALID_CHANGE: "O troco precisa ser para um valor igual ou maior que o total, e só vale para dinheiro.",
  CUSTOMER_HAS_OPEN_ORDERS:
    "Este cliente tem pedido em andamento. Conclua ou cancele o pedido antes de excluir os dados.",
  COUPON_INVALID: "Cupom não encontrado.",
  COUPON_EXPIRED: "Este cupom expirou.",
  COUPON_MIN_ORDER: "Este cupom vale só para pedidos a partir do valor mínimo definido pelo restaurante.",
  COUPON_EXCEEDS_TOTAL: "O desconto não pode ser maior que o pedido. Adicione mais itens.",
  COUPON_DUPLICATE: "Já existe um cupom com esse código.",
  COUPON_USED: "Este cupom já foi usado em pedidos. Você pode pausá-lo.",
  DUE_DATE_REQUIRED: "Informe o vencimento da conta.",
  LIMIT_REACHED: "Limite de 20 origens atingido.",
  PLAN_REQUIRED: "Este recurso faz parte do plano Profissional.",
  EMAIL_IN_USE: "Este e-mail já tem conta. Entre para continuar.",
  INVALID_DOCUMENT: "CPF ou CNPJ inválido.",
  BILLING_UNAVAILABLE: "Assinaturas indisponíveis no momento. Fale com a gente.",
  FOUNDER_CONFIRM_REQUIRED:
    "Você perde o preço de fundador ao trocar de plano ou ciclo. Confirme para continuar.",
  WEAK_PASSWORD: "Essa senha é fraca ou muito comum. Use pelo menos 8 caracteres, misturando letras e números.",
  RATE_LIMITED:
    "Muitas tentativas em pouco tempo. Aguarde alguns minutos antes de tentar novamente ou chame a equipe.",
};
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
      (typeof data.error === "string" && Object.hasOwn(apiErrorMessages, data.error)
        ? apiErrorMessages[data.error]
        : data.error) || "Não foi possível concluir. Tente novamente.",
      response.status,
      requestId,
      typeof data.error === "string" && Object.hasOwn(apiErrorMessages, data.error)
        ? data.error
        : undefined,
    );
  }
  return data as T;
}
