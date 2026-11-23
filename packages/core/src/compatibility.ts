import type { Blueprint, EngineTarget, ModRef } from "./blueprint";
import { CATALOG_BY_ID, type CatalogItem } from "./catalog";

export type IssueLevel = "error" | "warning" | "info";

export interface CompatIssue {
  level: IssueLevel;
  code: "unknown" | "engine" | "missing" | "exclusive" | "conflict" | "cycle" | "planned";
  mods: string[];
  message: string;
  /** A one-click fix the Studio can apply. */
  fix?: { label: string; add?: string[]; remove?: string[] };
}

export interface CompatReport {
  issues: CompatIssue[];
  /** Mods in a safe start order (dependencies first). */
  loadOrder: string[];
  ok: boolean;
}

/** Pick the best catalog item to satisfy a capability for a target engine. */
export function suggestProvider(capability: string, engine: EngineTarget, catalog: Iterable<CatalogItem> = CATALOG_BY_ID.values()): CatalogItem | undefined {
  const rank = { ready: 0, beta: 1, planned: 2 } as const;
  return [...catalog]
    .filter((i) => i.provides.includes(capability) && i.engines.includes(engine))
    .sort((a, b) => rank[a.status] - rank[b.status])[0];
}

export function checkCompatibility(bp: Pick<Blueprint, "mods" | "engine">, catalog = CATALOG_BY_ID): CompatReport {
  const engine = bp.engine.target;
  const active: CatalogItem[] = [];
  const issues: CompatIssue[] = [];

  for (const ref of bp.mods.filter((m: ModRef) => m.enabled)) {
    const item = catalog.get(ref.id);
    if (!item) {
      issues.push({ level: "error", code: "unknown", mods: [ref.id], message: `"${ref.id}" isn't in the catalog. Check the spelling or import it as a custom resource.`, fix: { label: "Remove", remove: [ref.id] } });
      continue;
    }
    if (!item.engines.includes(engine)) {
      issues.push({ level: "error", code: "engine", mods: [item.id], message: `${item.name} doesn't run on ${engine === "gta6" ? "GTA VI" : "FiveM"} yet.`, fix: { label: "Remove", remove: [item.id] } });
      continue;
    }
    if (item.status === "planned") {
      // Not released, so there's nothing to install or start. Keep it out of the build.
      issues.push({ level: "warning", code: "planned", mods: [item.id], message: `${item.name} isn't released yet, so it's left out of the build.` });
      continue;
    }
    active.push(item);
  }

  // Exclusive capabilities: only one provider allowed.
  const exclusiveOwners = new Map<string, CatalogItem[]>();
  for (const item of active) {
    for (const cap of item.exclusive ?? []) {
      exclusiveOwners.set(cap, [...(exclusiveOwners.get(cap) ?? []), item]);
    }
  }
  for (const [cap, owners] of exclusiveOwners) {
    if (owners.length > 1) {
      const [keep, ...rest] = owners;
      issues.push({
        level: "error",
        code: "exclusive",
        mods: owners.map((o) => o.id),
        message: `${owners.map((o) => o.name).join(" and ")} both handle ${cap}. Only one can run.`,
        fix: { label: `Keep ${keep!.name}`, remove: rest.map((r) => r.id) },
      });
    }
  }

  // Explicit conflicts.
  const activeIds = new Set(active.map((a) => a.id));
  for (const item of active) {
    for (const other of item.conflictsWith ?? []) {
      if (activeIds.has(other) && item.id < other) {
        issues.push({ level: "error", code: "conflict", mods: [item.id, other], message: `${item.name} is known to break ${catalog.get(other)?.name ?? other}.` });
      }
    }
  }

  // Missing requirements.
  const provided = new Set(active.flatMap((a) => a.provides));
  for (const item of active) {
    for (const req of item.requires) {
      if (!provided.has(req)) {
        const suggestion = suggestProvider(req, engine, catalog.values());
        issues.push({
          level: "error",
          code: "missing",
          mods: [item.id],
          message: `${item.name} needs a ${req} provider.`,
          fix: suggestion ? { label: `Add ${suggestion.name}`, add: [suggestion.id] } : undefined,
        });
      }
    }
  }

  const { order, cycle } = resolveLoadOrder(active);
  if (cycle.length) {
    issues.push({ level: "error", code: "cycle", mods: cycle, message: `These mods depend on each other in a loop: ${cycle.join(", ")}.` });
  }

  return { issues, loadOrder: order, ok: !issues.some((i) => i.level === "error") };
}

/**
 * Kahn's algorithm over "requires capability -> provided by" edges. Stable by original order.
 * Each requirement depends on one provider (the first released one in the list), not on every
 * mod that offers the capability: two mods that both provide "radio" don't both have to start
 * first, and depending on all of them could report loops that aren't there.
 */
export function resolveLoadOrder(items: CatalogItem[]): { order: string[]; cycle: string[] } {
  const rank = { ready: 0, beta: 1, planned: 2 } as const;
  const providers = new Map<string, CatalogItem[]>();
  items.forEach((i) => i.provides.forEach((p) => providers.set(p, [...(providers.get(p) ?? []), i])));
  const pick = (cap: string, self: string) =>
    (providers.get(cap) ?? []).filter((p) => p.id !== self).sort((a, b) => rank[a.status] - rank[b.status])[0];

  const deps = new Map<string, Set<string>>();
  for (const i of items) {
    const d = new Set<string>();
    // A mod that provides a capability itself doesn't need another mod for it.
    i.requires.filter((r) => !i.provides.includes(r)).forEach((r) => {
      const p = pick(r, i.id);
      if (p) d.add(p.id);
    });
    deps.set(i.id, d);
  }

  const order: string[] = [];
  const remaining = items.map((i) => i.id);
  let progressed = true;
  while (remaining.length && progressed) {
    progressed = false;
    for (let k = 0; k < remaining.length; k++) {
      const id = remaining[k]!;
      if ([...deps.get(id)!].every((d) => order.includes(d))) {
        order.push(id);
        remaining.splice(k, 1);
        progressed = true;
        k--;
      }
    }
  }
  return { order: [...order, ...remaining], cycle: remaining };
}
