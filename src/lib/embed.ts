// PostgREST returns an embedded relation as an array unless it can prove the
// relation is one-to-one. Backstop for one-to-one embeds such as order_addresses.
export function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function withOrderAddress<T extends { order_addresses?: unknown }>(order: T) {
  return { ...order, order_addresses: firstOrNull(order.order_addresses) };
}
