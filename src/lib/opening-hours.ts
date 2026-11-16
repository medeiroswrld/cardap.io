type Slot = { day: number; open: string; close: string };
type OpeningRestaurant = {
  accepting_orders: boolean;
  timezone: string;
  opening_hours: Slot[];
};

// Day of week (0 = Sunday) and "HH:MM" in the restaurant's own timezone.
function localNow(timezone: string, now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((p) => p.type === type)?.value || "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    part("weekday"),
  );
  return { day, time: part("hour") + ":" + part("minute") };
}

export function isRestaurantOpen(
  restaurant: OpeningRestaurant,
  now = new Date(),
) {
  if (!restaurant.accepting_orders) return false;
  const { day, time } = localNow(restaurant.timezone, now);
  return restaurant.opening_hours.some(
    (slot) => slot.day === day && time >= slot.open && time < slot.close,
  );
}

const hhmm = (time: string) => time.slice(0, 5);
const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Customer-facing reason why ordering is unavailable, or null when open.
export function openingMessage(restaurant: OpeningRestaurant, now = new Date()) {
  if (!restaurant.accepting_orders)
    return "Pedidos pausados pelo restaurante no momento.";
  if (isRestaurantOpen(restaurant, now)) return null;
  const { day, time } = localNow(restaurant.timezone, now);
  for (let offset = 0; offset <= 7; offset++) {
    const weekday = (day + offset) % 7;
    const next = restaurant.opening_hours
      .filter((s) => s.day === weekday && (offset > 0 || hhmm(s.open) > time))
      .sort((a, b) => a.open.localeCompare(b.open))[0];
    if (!next) continue;
    const when =
      offset === 0 ? "hoje" : offset === 1 ? "amanhã" : WEEKDAYS[weekday];
    return `Fechado agora · abre ${when} às ${hhmm(next.open)}`;
  }
  return "Fechado agora.";
}

// "Seg a Sex 18:00–23:00 · Sáb e Dom 11:00–23:00" (week starts on Monday).
export function weeklyHours(slots: Slot[]) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const signature = (day: number) =>
    slots
      .filter((s) => s.day === day)
      .sort((a, b) => a.open.localeCompare(b.open))
      .map((s) => `${hhmm(s.open)}–${hhmm(s.close)}`)
      .join(", ");
  const groups: { days: number[]; text: string }[] = [];
  for (const day of order) {
    const text = signature(day);
    if (!text) continue;
    const last = groups[groups.length - 1];
    const previous = order[order.indexOf(day) - 1];
    if (last && last.text === text && last.days[last.days.length - 1] === previous)
      last.days.push(day);
    else groups.push({ days: [day], text });
  }
  return groups
    .map(({ days, text }) => {
      const first = SHORT[days[0]];
      const end = SHORT[days[days.length - 1]];
      const label =
        days.length === 1 ? first : days.length === 2 ? `${first} e ${end}` : `${first} a ${end}`;
      return `${label} ${text}`;
    })
    .join(" · ");
}
