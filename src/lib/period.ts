// Date ranges for the "Visão geral" summary. Days are calendar days in the restaurant's timezone.

export type PeriodPreset = "hoje" | "7d" | "14d" | "30d" | "mes" | "personalizado";
export const PERIOD_PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "14d", label: "14 dias" },
  { value: "30d", label: "30 dias" },
  { value: "mes", label: "Este mês" },
  { value: "personalizado", label: "Personalizado" },
];
export const MAX_PERIOD_DAYS = 366;

const DAY = 86_400_000;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function todayIn(timeZone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function utcDay(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function isDay(value: string) {
  if (!YMD.test(value)) return false;
  return new Date(utcDay(value)).toISOString().slice(0, 10) === value;
}

export function addDays(ymd: string, days: number) {
  return new Date(utcDay(ymd) + days * DAY).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.round((utcDay(to) - utcDay(from)) / DAY) + 1;
}

export function presetRange(preset: Exclude<PeriodPreset, "personalizado">, today: string) {
  if (preset === "hoje") return { from: today, to: today };
  if (preset === "mes") return { from: `${today.slice(0, 8)}01`, to: today };
  const days = preset === "7d" ? 7 : preset === "14d" ? 14 : 30;
  return { from: addDays(today, -(days - 1)), to: today };
}

// Error text for a range the customer typed, or "" when it is fine.
export function rangeProblem(from: string, to: string, today: string) {
  if (!isDay(from) || !isDay(to)) return "Escolha a data inicial e a final.";
  if (from > to) return "A data inicial precisa ser antes da final.";
  if (to > today) return "A data final não pode ser depois de hoje.";
  if (daysBetween(from, to) > MAX_PERIOD_DAYS) return "Escolha um período de até 1 ano.";
  return "";
}

function offsetMs(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - instant;
}

// The instant the given calendar day starts in the timezone (ISO string).
export function dayStart(ymd: string, timeZone: string) {
  const guess = utcDay(ymd);
  let instant = guess - offsetMs(guess, timeZone);
  instant = guess - offsetMs(instant, timeZone);
  return new Date(instant).toISOString();
}

export function shortDay(ymd: string) {
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
}

export type PeriodCount = { count: number; revenue_cents: number };
export type PeriodDish = { product_id: string; name: string; quantity: number; revenue_cents: number };
export type PeriodSummary = {
  from: string;
  to: string;
  count: number;
  revenue_cents: number;
  average_cents: number;
  by_fulfillment: { mesa: PeriodCount; retirada: PeriodCount; entrega: PeriodCount };
  dishes: PeriodDish[];
};
export type PeriodOrder = {
  total_cents: number;
  fulfillment: string;
  order_items: { product_id: string | null; product_name: string; quantity: number; unit_price_cents: number }[];
};

export function summarizePeriod(from: string, to: string, orders: PeriodOrder[], withDishes: boolean): PeriodSummary {
  const by = {
    mesa: { count: 0, revenue_cents: 0 },
    retirada: { count: 0, revenue_cents: 0 },
    entrega: { count: 0, revenue_cents: 0 },
  };
  const dishes = new Map<string, PeriodDish>();
  let revenue = 0;
  for (const o of orders) {
    revenue += o.total_cents;
    const slot = by[o.fulfillment as keyof typeof by];
    if (slot) {
      slot.count += 1;
      slot.revenue_cents += o.total_cents;
    }
    if (!withDishes) continue;
    for (const i of o.order_items ?? []) {
      if (!i.product_id) continue;
      const d = dishes.get(i.product_id) ?? { product_id: i.product_id, name: i.product_name, quantity: 0, revenue_cents: 0 };
      d.quantity += i.quantity;
      d.revenue_cents += i.quantity * i.unit_price_cents;
      dishes.set(i.product_id, d);
    }
  }
  return {
    from,
    to,
    count: orders.length,
    revenue_cents: revenue,
    average_cents: orders.length ? Math.round(revenue / orders.length) : 0,
    by_fulfillment: by,
    dishes: [...dishes.values()]
      .sort((a, b) => b.quantity - a.quantity || b.revenue_cents - a.revenue_cents || a.name.localeCompare(b.name))
      .slice(0, 5),
  };
}
