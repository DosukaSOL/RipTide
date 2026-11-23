/**
 * Three-way merge for the JSON each tool keeps in storage.
 *
 * Two windows can edit the same tool at the same time (the map popped out next to the main
 * window, say). Each window remembers the last version both agreed on (the base). When the
 * other window saves, this one merges instead of overwriting:
 *
 * - Objects merge field by field, so edits to different fields both survive.
 * - Lists of records with an `id` (plans, markers, runs, profiles…) merge record by record:
 *   records added in either window are kept, a record deleted in one window is deleted unless
 *   the other window changed it, and edits to different fields of one record both survive.
 * - Lists of plain values (found places, favourites) merge as sets: additions and removals
 *   from both windows are applied.
 * - When both windows changed the same value differently, this window's edit wins. That's the
 *   edit the person is making right now, and the result is the same whichever window merges.
 */

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const isObj = (v: unknown): v is Record<string, Json> => typeof v === "object" && v !== null && !Array.isArray(v);

export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => jsonEqual(x, bb[i]));
  }
  const ak = Object.keys(a as object);
  const bk = Object.keys(b as object);
  return ak.length === bk.length && ak.every((k) => Object.prototype.hasOwnProperty.call(b, k) && jsonEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

const hasId = (v: unknown): v is { id: string } & Record<string, Json> => isObj(v) && typeof v.id === "string";
const isPrimitive = (v: unknown) => v === null || ["string", "number", "boolean"].includes(typeof v);

function mergeIdList(base: Json[], local: Json[], remote: Json[]): Json[] {
  const byId = (list: Json[]) => new Map(list.map((x) => [(x as { id: string }).id, x]));
  const b = byId(base);
  const l = byId(local);
  const r = byId(remote);
  const out: Json[] = [];
  const done = new Set<string>();
  const take = (id: string) => {
    if (done.has(id)) return;
    done.add(id);
    const inB = b.has(id);
    const inL = l.has(id);
    const inR = r.has(id);
    if (inL && inR) out.push(inB ? merge3(b.get(id)!, l.get(id)!, r.get(id)!) : merge3(l.get(id)!, l.get(id)!, r.get(id)!));
    else if (inL && !inR) {
      // Deleted in the other window: stays deleted unless this window changed it.
      if (!inB || !jsonEqual(b.get(id), l.get(id))) out.push(l.get(id)!);
    } else if (!inL && inR) {
      if (!inB || !jsonEqual(b.get(id), r.get(id))) out.push(r.get(id)!);
    }
  };
  // The other window's order first, then records only this window has, in this window's order.
  for (const x of remote) take((x as { id: string }).id);
  for (const x of local) take((x as { id: string }).id);
  return out;
}

function mergeSet(base: Json[], local: Json[], remote: Json[]): Json[] {
  const key = (v: Json) => JSON.stringify(v);
  const b = new Set(base.map(key));
  const l = new Set(local.map(key));
  const removedHere = new Set([...b].filter((k) => !l.has(k)));
  const out: Json[] = [];
  const seen = new Set<string>();
  for (const v of remote) {
    const k = key(v);
    if (removedHere.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  for (const v of local) {
    const k = key(v);
    if (seen.has(k) || b.has(k)) continue; // only things added in this window
    seen.add(k);
    out.push(v);
  }
  return out;
}

/** Merge this window's version (local) and another window's version (remote), both edited from base. */
export function merge3<T>(base: T, local: T, remote: T): T {
  if (jsonEqual(local, remote)) return local;
  if (jsonEqual(local, base)) return remote;
  if (jsonEqual(remote, base)) return local;
  if (isObj(base) && isObj(local) && isObj(remote)) {
    const out: Record<string, Json> = {};
    for (const k of new Set([...Object.keys(remote), ...Object.keys(local)])) {
      const inL = k in local;
      const inR = k in remote;
      if (inL && inR) out[k] = merge3(base[k] ?? null, local[k]!, remote[k]!) as Json;
      else if (inL) {
        if (!(k in base) || !jsonEqual(base[k], local[k])) out[k] = local[k]!;
      } else if (!(k in base) || !jsonEqual(base[k], remote[k])) out[k] = remote[k]!;
    }
    return out as T;
  }
  if (Array.isArray(local) && Array.isArray(remote)) {
    const b = Array.isArray(base) ? (base as Json[]) : [];
    const all = [...b, ...local, ...remote];
    if (all.length && all.every(hasId)) return mergeIdList(b, local as Json[], remote as Json[]) as T;
    if (all.every(isPrimitive)) return mergeSet(b, local as Json[], remote as Json[]) as T;
  }
  // Same value changed differently in both windows: this window's edit wins.
  return local;
}
