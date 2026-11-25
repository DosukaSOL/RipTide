/**
 * Route maths on map coordinates (in-game metres). Every distance here is a straight line
 * between points: RipTide has no road data, so it never claims drive times or road lengths.
 */

export interface Pt {
  x: number;
  y: number;
}

export const ROUTE_METHOD = "straight-line" as const;

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Total straight-line length of a path through the points in order, optionally from a start point. */
export function pathLength(stops: Pt[], start?: Pt): number {
  let total = 0;
  let prev = start;
  for (const s of stops) {
    if (prev) total += dist(prev, s);
    prev = s;
  }
  return total;
}

/**
 * Orders stops to shorten the straight-line path: nearest neighbour from the start (or the first
 * stop), then 2-opt until no swap helps. Deterministic: ties go to the earlier stop. Returns the
 * indices of `stops` in visiting order. `keepLast` pins the final stop (an end anchor).
 */
export function orderStops(stops: Pt[], opts: { start?: Pt; keepFirst?: boolean; keepLast?: boolean } = {}): number[] {
  const n = stops.length;
  if (n <= 2 && !opts.start) return stops.map((_, i) => i);
  const fixedFirst = opts.keepFirst && n > 0 ? 0 : -1;
  const fixedLast = opts.keepLast && n > 1 ? n - 1 : -1;
  const free = stops.map((_, i) => i).filter((i) => i !== fixedFirst && i !== fixedLast);

  // Nearest neighbour.
  const order: number[] = fixedFirst >= 0 ? [fixedFirst] : [];
  let at: Pt | undefined = fixedFirst >= 0 ? stops[fixedFirst] : opts.start;
  const left = new Set(free);
  if (!at && left.size) {
    const first = free[0]!;
    order.push(first);
    left.delete(first);
    at = stops[first];
  }
  while (left.size) {
    let best = -1;
    let bestD = Infinity;
    for (const i of free) {
      if (!left.has(i)) continue;
      const d = dist(at!, stops[i]!);
      if (d < bestD - 1e-9) {
        bestD = d;
        best = i;
      }
    }
    order.push(best);
    left.delete(best);
    at = stops[best];
  }
  if (fixedLast >= 0) order.push(fixedLast);

  // 2-opt on the open path: reverse a stretch whenever that shortens it. Anchored ends never move.
  const lo = fixedFirst >= 0 ? 1 : 0;
  const hi = fixedLast >= 0 ? order.length - 2 : order.length - 1;
  const p = (k: number): Pt | null => (k < 0 ? opts.start ?? null : k >= order.length ? null : stops[order[k]!]!);
  const edge = (u: Pt | null, v: Pt | null) => (u && v ? dist(u, v) : 0);
  let improved = true;
  for (let pass = 0; improved && pass < 50; pass++) {
    improved = false;
    for (let i = lo; i < hi; i++) {
      for (let j = i + 1; j <= hi; j++) {
        const a = p(i - 1);
        const b = p(i);
        const c = p(j);
        const d = p(j + 1);
        if (edge(a, c) + edge(b, d) < edge(a, b) + edge(c, d) - 1e-6) {
          order.splice(i, j - i + 1, ...order.slice(i, j + 1).reverse());
          improved = true;
        }
      }
    }
  }
  return order;
}

/** "850 m" or "3.4 km", always labelled as a straight line by the caller. */
export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}
