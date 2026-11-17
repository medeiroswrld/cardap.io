// Helpers for the management dashboard ("Visão geral").
export function recentOrders<T extends { created_at: string }>(orders: T[], n: number): T[] {
  return [...orders].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, n);
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export function matchesQuery(text: string, query: string) {
  return fold(text).includes(fold(query.trim()));
}
