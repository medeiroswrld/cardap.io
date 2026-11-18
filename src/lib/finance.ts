// Owner finance (migration 020): shared types and text helpers.
import { money } from "./utils";

export const EXPENSE_CATEGORIES = [
  { key: "insumos", label: "Insumos" },
  { key: "embalagens", label: "Embalagens" },
  { key: "funcionarios", label: "Funcionários" },
  { key: "aluguel", label: "Aluguel" },
  { key: "contas", label: "Contas (luz, água, gás, internet)" },
  { key: "marketing", label: "Marketing" },
  { key: "impostos", label: "Impostos" },
  { key: "outros", label: "Outros" },
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["key"];

export const METHOD_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro",
  cartao: "Cartão",
  pix: "Pix",
  mesa: "Mesa (pago no local)",
  outro: "Outro",
};

export type FinanceMethod = { method: string; orders: number; total_cents: number };
export type FinanceSales = {
  methods: FinanceMethod[];
  items_cents: number;
  delivery_fees_cents: number;
  discount_cents: number;
  sold_cents: number;
  machine_fee_cents: number;
};
export type CashDay = FinanceSales & {
  day: string;
  other_income: { id: string; description: string; amount_cents: number }[];
  other_income_cents: number;
  net_cents: number;
};
export type FinanceEntry = {
  id: string;
  kind: "expense" | "income";
  description: string;
  category: ExpenseCategory | null;
  amount_cents: number;
  entry_date: string;
  due_date: string | null;
  paid_at: string | null;
};
export type FinanceMonth = {
  month: string;
  sales: FinanceSales;
  other_income_cents: number;
  expenses_cents: number;
  profit_cents: number;
  previous_profit_cents: number;
  by_category: { category: ExpenseCategory; total_cents: number }[];
  entries: FinanceEntry[];
};
export type Bill = {
  id: string;
  description: string;
  category: ExpenseCategory;
  amount_cents: number;
  entry_date: string;
  due_date: string;
};
export type PaidBill = {
  id: string;
  description: string;
  category: ExpenseCategory;
  amount_cents: number;
  due_date: string | null;
  paid_at: string;
};
export type Bills = {
  today: string;
  open: Bill[];
  due_this_week: number;
  recently_paid: PaidBill[];
};
export type PaymentFees = { card_fee_percent: number; pix_fee_percent: number };

const METHOD_ORDER = ["dinheiro", "cartao", "pix", "mesa", "outro"];

function dayMonth(day: string) {
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
}

export function cashSummaryText(day: CashDay, restaurant: string): string {
  const parts: string[] = [];
  for (const key of METHOD_ORDER) {
    const found = day.methods.find((m) => m.method === key);
    if (!found) continue;
    const label = key === "mesa" ? "Mesa" : METHOD_LABELS[key];
    parts.push(`${label} ${money(found.total_cents)}`);
  }
  if (day.other_income_cents > 0) parts.push(`Outras ${money(day.other_income_cents)}`);
  parts.push(`Líquido ${money(day.net_cents)}`);
  const head = `Caixa ${dayMonth(day.day)}`;
  return `${restaurant ? `${restaurant} · ` : ""}${head} — ${parts.join(" · ")}`;
}

export function dayNumber(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

export function dueLabel(
  due: string,
  today: string,
): { text: string; tone: "danger" | "warning" | "neutral" } {
  const diff = dayNumber(due) - dayNumber(today);
  if (diff < 0) {
    return { text: diff === -1 ? "Venceu ontem" : `Venceu há ${-diff} dias`, tone: "danger" };
  }
  if (diff === 0) return { text: "Vence hoje", tone: "warning" };
  return {
    text: diff === 1 ? "Vence amanhã" : `Vence em ${diff} dias`,
    tone: diff <= 7 ? "warning" : "neutral",
  };
}

export function percentChange(current: number, previous: number): string | null {
  if (!(previous > 0)) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return pct < 0 ? `−${-pct}%` : `+${pct}%`;
}

export const isFinanceDay = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function localParts(nowIso: string, timeZone: string) {
  const at = new Date(nowIso);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  const hour =
    Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(at)) % 24;
  return { day, hour };
}

// Default day for the cash screen: before 05:00 local the "day" is still last night's service.
export function defaultCashDay(nowIso: string, timeZone: string): string {
  const { day, hour } = localParts(nowIso, timeZone);
  return hour < 5 ? addDays(day, -1) : day;
}

// Keeps a picked cash day inside [today - 90, today]; null when it is not a valid day.
export function clampCashDay(value: string, today: string): string | null {
  if (!isFinanceDay(value)) return null;
  const min = addDays(today, -90);
  if (value < min) return min;
  if (value > today) return today;
  return value;
}
