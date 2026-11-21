import type { Blueprint } from "./blueprint";
import { CATALOG_BY_ID } from "./catalog";

export interface BudgetLine {
  id: string;
  name: string;
  serverMs: number;
  clientMB: number;
  streamMB: number;
}

export interface BudgetReport {
  lines: BudgetLine[];
  totals: { serverMs: number; clientMB: number; streamMB: number };
  limits: { serverMs: number; clientMB: number; streamMB: number };
  /** 0-1 share of each limit in use. */
  usage: { serverMs: number; clientMB: number; streamMB: number };
  /** Estimated first-join download time on a 50 Mbit/s connection, seconds. */
  firstJoinSeconds: number;
  verdict: "comfortable" | "tight" | "over";
}

/**
 * Default limits. Server: script time a tick can spend before players feel it.
 * Client: memory a mid-range PC can give mods. Stream: what players tolerate downloading.
 */
export const DEFAULT_LIMITS = { serverMs: 12, clientMB: 1800, streamMB: 3000 };

export function estimateBudget(bp: Pick<Blueprint, "mods" | "meta">, limits = DEFAULT_LIMITS, catalog = CATALOG_BY_ID): BudgetReport {
  const players = bp.meta.maxPlayers;
  const lines: BudgetLine[] = bp.mods
    .filter((m) => m.enabled)
    .map((m) => catalog.get(m.id))
    .filter((i): i is NonNullable<typeof i> => !!i)
    .map((i) => ({
      id: i.id,
      name: i.name,
      serverMs: round(i.cost.serverMs + (i.cost.serverMsPer100 * players) / 100),
      clientMB: i.cost.clientMB,
      streamMB: i.cost.streamMB,
    }));

  const totals = lines.reduce(
    (t, l) => ({ serverMs: round(t.serverMs + l.serverMs), clientMB: t.clientMB + l.clientMB, streamMB: t.streamMB + l.streamMB }),
    { serverMs: 0, clientMB: 0, streamMB: 0 },
  );
  const usage = {
    serverMs: totals.serverMs / limits.serverMs,
    clientMB: totals.clientMB / limits.clientMB,
    streamMB: totals.streamMB / limits.streamMB,
  };
  const worst = Math.max(usage.serverMs, usage.clientMB, usage.streamMB);
  return {
    lines: lines.sort((a, b) => b.serverMs - a.serverMs),
    totals,
    limits,
    usage,
    firstJoinSeconds: Math.round((totals.streamMB * 8) / 50),
    verdict: worst > 1 ? "over" : worst > 0.8 ? "tight" : "comfortable",
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
