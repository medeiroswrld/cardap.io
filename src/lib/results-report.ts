// Types and text helpers for the monthly results report (migration 017).
export type ResultsCount = { count: number; revenue_cents: number };
export type ResultsDish = { product_id: string; name: string; quantity: number; revenue_cents: number };
export type ResultsVideo = { product_id: string; name: string; adds: number; qualified_views: number };
export type ResultsReport = {
  month: string;
  timezone: string;
  fee_percent: number | string;
  orders: ResultsCount & {
    average_cents: number;
    by_fulfillment: { mesa: ResultsCount; retirada: ResultsCount; entrega: ResultsCount };
  };
  previous: ResultsCount;
  ifood: { base_cents: number; saved_cents: number };
  customers: { total: number; new: number; returning: number; reactivated: number };
  top_quantity: ResultsDish[];
  top_revenue: ResultsDish[];
  top_videos: ResultsVideo[];
};

const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function currentMonth(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return { year, month };
}

export function monthOptions(now: Date, timeZone: string) {
  const { year, month } = currentMonth(now, timeZone);
  return Array.from({ length: 13 }, (_, i) => {
    const total = year * 12 + (month - 1) - i;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    return {
      value: `${y}-${String(m).padStart(2, "0")}`,
      label: `${MONTHS[m - 1]} de ${y}${i === 0 ? " (até hoje)" : ""}`,
    };
  });
}

export function isValidMonth(value: string, now: Date, timeZone: string) {
  return monthOptions(now, timeZone).some((o) => o.value === value);
}

export function variation(current: number, previous: number) {
  if (!previous) return "—";
  const percent = Math.round(((current - previous) / previous) * 100);
  return percent > 0 ? `+${percent}%` : `${percent}%`;
}

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function savingsText(baseCents: number, feePercent: number | string, savedCents: number) {
  const fee = Number(feePercent).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return `${brl(baseCents)} × ${fee}% = ${brl(savedCents)} que ficaram com você`;
}
