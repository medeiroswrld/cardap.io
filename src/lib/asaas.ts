import type { Cycle } from "./plans";

// Typed Asaas v3 client. Never logs the API key, documents or payloads: failures surface only
// as stable error codes. Docs: https://docs.asaas.com (auth header `access_token`).
export type AsaasConfig = { apiKey: string; env: "sandbox" | "production"; fetchImpl?: typeof fetch };
export type AsaasCustomer = { id: string };
export type AsaasPayment = {
  id: string;
  customer?: string;
  subscription?: string | null;
  value: number;
  status: string;
  dueDate: string;
  invoiceUrl: string | null;
  description?: string | null;
  externalReference?: string | null;
  // Asaas keeps removed charges readable with deleted: true
  deleted?: boolean;
};
export type AsaasSubscription = {
  id: string;
  customer: string;
  value: number;
  cycle: string;
  nextDueDate: string;
  status: string;
};
const BASE = { sandbox: "https://api-sandbox.asaas.com/v3", production: "https://api.asaas.com/v3" } as const;

// Only hosted Asaas invoice pages (https://*.asaas.com) are ever handed to a browser.
export function safeInvoiceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (host === "asaas.com" || host.endsWith(".asaas.com")) ? url.toString() : null;
  } catch {
    return null;
  }
}
export const toReais = (cents: number) => Number((cents / 100).toFixed(2));
export const asaasCycle = (cycle: Cycle) => (cycle === "anual" ? "YEARLY" : "MONTHLY");

export function asaasConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AsaasConfig | null {
  const apiKey = env.ASAAS_API_KEY;
  const mode = env.ASAAS_ENV;
  if (!apiKey || (mode !== "sandbox" && mode !== "production")) return null;
  return { apiKey, env: mode };
}

export function createAsaas(config: AsaasConfig) {
  const doFetch = config.fetchImpl ?? fetch;
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await doFetch(BASE[config.env] + path, {
        method,
        headers: {
          access_token: config.apiKey,
          "Content-Type": "application/json",
          "User-Agent": "fomeplay-billing",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      });
    } catch {
      throw new Error("BILLING_UNAVAILABLE");
    }
    const data = await response.json().catch(() => null);
    if (response.status === 404) throw new Error("NOT_FOUND");
    if (!response.ok) {
      const codes = Array.isArray(data?.errors) ? data.errors.map((e: { code?: string }) => e?.code) : [];
      if (response.status === 400 && codes.includes("invalid_cpfCnpj")) throw new Error("INVALID_DOCUMENT");
      // Auth/config problems and throttling heal on retry; any other 4xx means Asaas refuses this
      // request for good (retrying the same webhook cannot fix it).
      if (response.status >= 400 && response.status < 500 && ![401, 403, 408, 429].includes(response.status))
        throw new Error("ASAAS_REJECTED");
      throw new Error("BILLING_UNAVAILABLE");
    }
    if (!data || typeof data !== "object") throw new Error("BILLING_UNAVAILABLE");
    return data as T;
  }
  const normalizePayment = (p: AsaasPayment): AsaasPayment => ({ ...p, invoiceUrl: safeInvoiceUrl(p.invoiceUrl) });
  return {
    createCustomer(input: { name: string; cpfCnpj: string; email: string; mobilePhone?: string; externalReference: string }) {
      return call<AsaasCustomer>("POST", "/customers", { ...input, notificationDisabled: true });
    },
    async createPayment(input: { customer: string; valueCents: number; dueDate: string; description: string; externalReference: string }) {
      const payment = await call<AsaasPayment>("POST", "/payments", {
        customer: input.customer,
        billingType: "UNDEFINED",
        value: toReais(input.valueCents),
        dueDate: input.dueDate,
        description: input.description,
        externalReference: input.externalReference,
      });
      return normalizePayment(payment);
    },
    updateCustomer(id: string, input: { notificationDisabled: boolean }) {
      return call<AsaasCustomer>("PUT", `/customers/${encodeURIComponent(id)}`, input);
    },
    async listSubscriptions(filter: { customer: string; status?: "ACTIVE" | "INACTIVE" | "EXPIRED" }) {
      const query = new URLSearchParams({ customer: filter.customer, limit: "10" });
      if (filter.status) query.set("status", filter.status);
      const list = await call<{ data: AsaasSubscription[] }>("GET", `/subscriptions?${query}`);
      return Array.isArray(list.data) ? list.data : [];
    },
    createSubscription(input: { customer: string; valueCents: number; nextDueDate: string; cycle: Cycle; description: string; externalReference: string }) {
      return call<AsaasSubscription>("POST", "/subscriptions", {
        customer: input.customer,
        billingType: "UNDEFINED",
        value: toReais(input.valueCents),
        nextDueDate: input.nextDueDate,
        cycle: asaasCycle(input.cycle),
        description: input.description,
        externalReference: input.externalReference,
      });
    },
    updateSubscription(id: string, input: { valueCents?: number; cycle?: Cycle; nextDueDate?: string }) {
      const body: Record<string, unknown> = { updatePendingPayments: true };
      if (input.valueCents !== undefined) body.value = toReais(input.valueCents);
      if (input.cycle) body.cycle = asaasCycle(input.cycle);
      if (input.nextDueDate) body.nextDueDate = input.nextDueDate;
      return call<AsaasSubscription>("PUT", `/subscriptions/${encodeURIComponent(id)}`, body);
    },
    // An already-deleted subscription/charge (404) counts as done.
    async cancelSubscription(id: string) {
      try {
        return await call<{ deleted: boolean; id: string }>("DELETE", `/subscriptions/${encodeURIComponent(id)}`);
      } catch (error) {
        if (error instanceof Error && error.message === "NOT_FOUND") return { deleted: true, id };
        throw error;
      }
    },
    async getPayment(id: string) {
      return normalizePayment(await call<AsaasPayment>("GET", `/payments/${encodeURIComponent(id)}`));
    },
    async deletePayment(id: string) {
      try {
        return await call<{ deleted: boolean; id: string }>("DELETE", `/payments/${encodeURIComponent(id)}`);
      } catch (error) {
        if (error instanceof Error && error.message === "NOT_FOUND") return { deleted: true, id };
        throw error;
      }
    },
    async listPayments(filter: { customer?: string; subscription?: string }, limit = 20) {
      const query = new URLSearchParams({ limit: String(limit) });
      if (filter.customer) query.set("customer", filter.customer);
      if (filter.subscription) query.set("subscription", filter.subscription);
      const list = await call<{ data: AsaasPayment[] }>("GET", `/payments?${query}`);
      return Array.isArray(list.data) ? list.data.map(normalizePayment) : [];
    },
  };
}
export type Asaas = ReturnType<typeof createAsaas>;

// Server code: throws BILLING_UNAVAILABLE when the integration is not configured.
export function asaasFromEnv(fetchImpl?: typeof fetch): Asaas {
  const config = asaasConfigFromEnv();
  if (!config) throw new Error("BILLING_UNAVAILABLE");
  return createAsaas({ ...config, fetchImpl });
}
