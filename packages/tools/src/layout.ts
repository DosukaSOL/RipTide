/**
 * Window geometry for detached tool windows.
 * Keeps saved windows on screen when a monitor is unplugged, the layout
 * changes, or display scaling changes between sessions.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MIN_WINDOW = { w: 480, h: 360 };
/** How much of a window must remain visible to count as reachable. */
const MIN_VISIBLE = 120;

export function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Index of the screen showing most of the window, or -1 if none. */
export function screenFor(win: Rect, screens: Rect[]): number {
  let best = -1;
  let area = 0;
  screens.forEach((s, i) => {
    const o = overlap(win, s);
    if (o > area) {
      area = o;
      best = i;
    }
  });
  return best;
}

function sane(r: Rect): Rect {
  const n = (v: number, d: number) => (Number.isFinite(v) ? Math.round(v) : d);
  return { x: n(r.x, 0), y: n(r.y, 0), w: Math.max(MIN_WINDOW.w, n(r.w, 960)), h: Math.max(MIN_WINDOW.h, n(r.h, 720)) };
}

/**
 * Return a geometry that is fully usable on the current screens.
 * - Still on a screen: shrink to fit and nudge inside its edges.
 * - Off every screen (monitor unplugged): centre it on the primary screen.
 */
export function clampToScreens(saved: Rect, screens: Rect[], primary = 0): Rect {
  const g = sane(saved);
  if (!screens.length) return g;
  let i = screenFor(g, screens);
  const visible = i >= 0 ? overlap(g, screens[i]!) : 0;
  const reachable = visible >= Math.min(MIN_VISIBLE * MIN_VISIBLE, g.w * g.h * 0.25);
  if (i < 0 || !reachable) i = Math.min(Math.max(0, primary), screens.length - 1);
  const s = screens[i]!;
  const w = Math.min(g.w, s.w);
  const h = Math.min(g.h, s.h);
  if (i !== screenFor(g, screens) || !reachable) {
    return { x: s.x + Math.round((s.w - w) / 2), y: s.y + Math.round((s.h - h) / 2), w, h };
  }
  const x = Math.min(Math.max(g.x, s.x), s.x + s.w - w);
  const y = Math.min(Math.max(g.y, s.y), s.y + s.h - h);
  return { x, y, w, h };
}

/** Default spot for a detached window: the largest screen other than the current one, else beside the app. */
export function suggestPlacement(current: Rect, screens: Rect[]): Rect {
  const here = screenFor(current, screens);
  const others = screens.map((s, i) => ({ s, i })).filter((o) => o.i !== here);
  const target = others.sort((a, b) => b.s.w * b.s.h - a.s.w * a.s.h)[0]?.s ?? screens[here] ?? current;
  const w = Math.max(MIN_WINDOW.w, Math.round(target.w * 0.8));
  const h = Math.max(MIN_WINDOW.h, Math.round(target.h * 0.8));
  return clampToScreens({ x: target.x + Math.round((target.w - w) / 2), y: target.y + Math.round((target.h - h) / 2), w, h }, screens);
}
