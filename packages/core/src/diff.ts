/**
 * Readable diffs between two Blueprints. Powers preview servers
 * ("what changes if I merge this?") and the deploy history.
 */

export interface Change {
  path: string;
  kind: "added" | "removed" | "changed";
  before?: unknown;
  after?: unknown;
}

const keyOf = (v: unknown): string | undefined =>
  v && typeof v === "object" && "id" in (v as object) ? String((v as { id: unknown }).id) : undefined;

export function diffBlueprints(a: unknown, b: unknown, path = ""): Change[] {
  if (Object.is(a, b)) return [];
  if (Array.isArray(a) && Array.isArray(b) && [...a, ...b].every((x) => keyOf(x) !== undefined)) {
    const am = new Map(a.map((x) => [keyOf(x)!, x]));
    const bm = new Map(b.map((x) => [keyOf(x)!, x]));
    const out: Change[] = [];
    for (const [k, v] of am) if (!bm.has(k)) out.push({ path: `${path}[${k}]`, kind: "removed", before: v });
    for (const [k, v] of bm) {
      if (!am.has(k)) out.push({ path: `${path}[${k}]`, kind: "added", after: v });
      else out.push(...diffBlueprints(am.get(k), v, `${path}[${k}]`));
    }
    return out;
  }
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const out: Change[] = [];
    for (const k of keys) {
      const p = path ? `${path}.${k}` : k;
      const av = (a as Record<string, unknown>)[k];
      const bv = (b as Record<string, unknown>)[k];
      if (av === undefined) out.push({ path: p, kind: "added", after: bv });
      else if (bv === undefined) out.push({ path: p, kind: "removed", before: av });
      else out.push(...diffBlueprints(av, bv, p));
    }
    return out;
  }
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  return [{ path, kind: "changed", before: a, after: b }];
}

export function summarizeChange(c: Change): string {
  const show = (v: unknown) => (typeof v === "object" ? keyOf(v) ?? "item" : String(v));
  if (c.kind === "added") return `Added ${c.path} (${show(c.after)})`;
  if (c.kind === "removed") return `Removed ${c.path}`;
  return `${c.path}: ${show(c.before)} → ${show(c.after)}`;
}
