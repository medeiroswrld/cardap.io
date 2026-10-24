// Pure rule for the management alert: chime on new orders and keep chiming
// while any online order still waits for acceptance.
export const ALERT_REPEAT_MS = 20000;

export function pendingCount(orders: { status: string }[]) {
  return orders.filter((o) => o.status === "aguardando_aceite").length;
}

export function shouldPlayAlert(input: {
  pending: number;
  newOrderIds: string[];
  lastPlayedAt: number | null;
  now: number;
  muted: boolean;
}) {
  if (input.muted) return false;
  if (input.newOrderIds.length > 0) return true;
  if (input.pending === 0) return false;
  return (
    input.lastPlayedAt === null || input.now - input.lastPlayedAt >= ALERT_REPEAT_MS
  );
}
