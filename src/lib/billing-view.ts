import { safeInvoiceUrl } from "./asaas";
import { priceFor, type Cycle, type SellablePlan } from "./plans";

// Pure view helpers for the "Plano e pagamento" tab, the billing gate and the overdue banner.
export type Invoice = {
  id: string;
  dueDate: string;
  valueCents: number;
  status: string;
  invoiceUrl: string | null;
};
export type BillingInfo = {
  plan: string;
  cycle: Cycle;
  status: string;
  state: string;
  founder: boolean;
  priceCents: number;
  currentPeriodEnd: string | null;
  overdueSince: string | null;
  cancelAt: string | null;
  pendingPlan: SellablePlan | null;
  pendingCycle: Cycle | null;
  hasSubscription: boolean;
  invoices: Invoice[] | null;
};
export type Tone = "success" | "warning" | "danger" | "neutral";

export function planLabel(plan: string) {
  return plan === "profissional" ? "Profissional" : plan === "agencia" ? "Agência" : "Essencial";
}
export const cycleLabel = (cycle: Cycle) => (cycle === "anual" ? "Anual" : "Mensal");
export const cycleUnit = (cycle: Cycle) => (cycle === "anual" ? "ano" : "mês");

// "2026-11-18" -> "18/11/2026"; "" when the value is not a calendar date.
export function fullDate(value: string | null | undefined) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
// "2026-11-18" -> "18/11"
export function shortDate(value: string | null | undefined) {
  return fullDate(value).slice(0, 5);
}

export function stateView(state: string): { label: string; tone: Tone } {
  switch (state) {
    case "ativo":
      return { label: "Ativo", tone: "success" };
    case "cortesia":
      return { label: "Cortesia", tone: "neutral" };
    case "atrasado":
      return { label: "Pagamento em atraso", tone: "warning" };
    case "pendente":
      return { label: "Pagamento pendente", tone: "warning" };
    case "bloqueado":
      return { label: "Bloqueado", tone: "danger" };
    case "cancelado":
      return { label: "Cancelado", tone: "danger" };
    default:
      return { label: "Indisponível", tone: "neutral" };
  }
}

// Asaas payment status -> label, tone and which link the invoice row offers.
export function invoiceView(status: string): { label: string; tone: Tone; action: "pay" | "receipt" } {
  switch (status) {
    case "PENDING":
      return { label: "Em aberto", tone: "warning", action: "pay" };
    case "OVERDUE":
      return { label: "Vencida", tone: "danger", action: "pay" };
    case "CONFIRMED":
    case "RECEIVED":
    case "RECEIVED_IN_CASH":
      return { label: "Paga", tone: "success", action: "receipt" };
    case "REFUNDED":
    case "REFUND_REQUESTED":
    case "REFUND_IN_PROGRESS":
      return { label: "Estornada", tone: "neutral", action: "receipt" };
    default:
      return { label: "Em análise", tone: "neutral", action: "receipt" };
  }
}

// Only hosted Asaas pages (https://*.asaas.com) are ever linked.
export const invoiceLink = (value: unknown) => safeInvoiceUrl(value);

// The oldest unpaid invoice that has a safe payment link (what "Pagar agora" opens).
export function payableInvoice(invoices: Invoice[] | null | undefined): { id: string; url: string } | null {
  const open = (invoices ?? [])
    .filter((i) => invoiceView(i.status).action === "pay" && invoiceLink(i.invoiceUrl))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  return open ? { id: open.id, url: invoiceLink(open.invoiceUrl)! } : null;
}

// Same rule as the server (decideChangePlan): up in both axes is immediate, anything else waits for the next charge.
export function changeKind(
  current: { plan: string; cycle: Cycle },
  target: { plan: SellablePlan; cycle: Cycle },
): "same" | "upgrade" | "schedule" {
  if (current.plan === target.plan && current.cycle === target.cycle) return "same";
  const planRank = { essencial: 0, profissional: 1 } as const;
  const cycleRank = { mensal: 0, anual: 1 } as const;
  const cur = planRank[current.plan as SellablePlan] ?? 0;
  return planRank[target.plan] >= cur && cycleRank[target.cycle] >= cycleRank[current.cycle] ? "upgrade" : "schedule";
}
export function targetPrice(target: { plan: SellablePlan; cycle: Cycle }) {
  return priceFor(target.plan, target.cycle, false);
}
