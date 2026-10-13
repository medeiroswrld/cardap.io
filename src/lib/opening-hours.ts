export function isRestaurantOpen(
  restaurant: {
    accepting_orders: boolean;
    timezone: string;
    opening_hours: { day: number; open: string; close: string }[];
  },
  now = new Date(),
) {
  if (!restaurant.accepting_orders) return false;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: restaurant.timezone,
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
  const time = part("hour") + ":" + part("minute");
  return restaurant.opening_hours.some(
    (slot) => slot.day === day && time >= slot.open && time < slot.close,
  );
}
