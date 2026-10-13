export type Segment = [number, number];
export function mergeSegments(segments: Segment[]): Segment[] {
  const sorted = segments
    .filter(
      ([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a && a >= 0,
    )
    .sort((a, b) => a[0] - b[0]);
  const result: Segment[] = [];
  for (const segment of sorted) {
    const last = result.at(-1);
    if (last && segment[0] <= last[1] + 0.03)
      last[1] = Math.max(last[1], segment[1]);
    else result.push([...segment]);
  }
  return result;
}
export function observationDelta(
  previous: number,
  current: number,
  elapsed: number,
  rate: number,
) {
  if (
    elapsed <= 0 ||
    elapsed > 1 ||
    current <= previous ||
    current - previous > elapsed * Math.max(1, rate) + 0.35
  )
    return 0;
  return Math.min(elapsed, (current - previous) / Math.max(0.1, rate));
}
