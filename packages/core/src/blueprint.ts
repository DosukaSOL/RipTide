import { z } from "zod";

/**
 * A Blueprint is the single source of truth for a server.
 * The Studio edits it visually, the CLI edits it as a file, and adapters
 * compile it into whatever the target engine needs.
 */

export const EngineTarget = z.enum(["fivem", "gta6"]);
export type EngineTarget = z.infer<typeof EngineTarget>;

const Id = z.string().max(64).regex(/^[a-z0-9][a-z0-9-_]*$/, "lowercase letters, numbers, - and _ only");
/** Single-line text: no control characters, so it can never break out of a config line. */
const Line = (max: number) => z.string().max(max).regex(/^[^\u0000-\u001f\u007f]*$/, "single line, no control characters");
const Permission = z.string().max(64).regex(/^[a-z0-9][a-z0-9._*-]*$/i, "letters, numbers, dots, dashes and * only");

export const Role = z.object({
  id: Id,
  name: Line(32).min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  inherits: Id.optional(),
  permissions: z.array(Permission).default([]),
  /** Max players that can hold this role at once. */
  limit: z.number().int().positive().optional(),
  /** Discord role that grants this role automatically. */
  discordRole: z.string().optional(),
});
export type Role = z.infer<typeof Role>;

export const Job = z.object({
  id: Id,
  label: z.string(),
  payPerHour: z.number().nonnegative(),
  slots: z.number().int().positive().optional(),
  /** Share of active players who pick this job (0-1). */
  share: z.number().min(0).max(1),
});
export type Job = z.infer<typeof Job>;

export const Sink = z.object({
  id: Id,
  label: z.string(),
  avgCost: z.number().nonnegative(),
  /** Times per in-game day an average active player pays this. */
  perDay: z.number().nonnegative(),
});
export type Sink = z.infer<typeof Sink>;

export const Economy = z.object({
  currency: z.object({ name: z.string(), symbol: z.string().max(3) }),
  startingCash: z.number().nonnegative(),
  startingBank: z.number().nonnegative(),
  jobs: z.array(Job).default([]),
  sinks: z.array(Sink).default([]),
  /** Paid per hour to active players without a job. */
  welfarePerHour: z.number().nonnegative().default(0),
  taxes: z.object({
    income: z.number().min(0).max(1),
    sales: z.number().min(0).max(1),
    /** Weekly wealth/property tax on balances above the threshold. */
    property: z.number().min(0).max(1),
    propertyThreshold: z.number().nonnegative().default(50000),
  }),
  /** Automatically nudge taxes when the money supply drifts. */
  autopilot: z.boolean().default(false),
});
export type Economy = z.infer<typeof Economy>;

export const ModRef = z.object({
  id: z.string(),
  enabled: z.boolean().default(true),
  version: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});
export type ModRef = z.infer<typeof ModRef>;

export const World = z.object({
  weather: z.object({
    mode: z.enum(["dynamic", "synced", "locked"]),
    preset: z.string().default("clear"),
  }),
  time: z.object({
    mode: z.enum(["realtime", "accelerated", "locked"]),
    /** In-game minutes per real minute when accelerated. */
    scale: z.number().positive().default(2),
    lockedAt: z.string().optional(),
  }),
  trafficDensity: z.number().min(0).max(1),
  pedDensity: z.number().min(0).max(1),
  police: z.enum(["off", "npc", "players", "hybrid"]),
  pvp: z.boolean(),
  zones: z
    .array(z.object({ id: Id, label: z.string(), flags: z.record(z.string(), z.union([z.boolean(), z.number()])) }))
    .default([]),
});
export type World = z.infer<typeof World>;

export const Visuals = z.object({
  preset: z.string(),
  bloom: z.number().min(0).max(1),
  grain: z.number().min(0).max(1),
  saturation: z.number().min(0).max(2),
  /** Players may turn the server look off client-side. */
  allowOptOut: z.boolean().default(true),
});
export type Visuals = z.infer<typeof Visuals>;

export const Access = z.object({
  whitelist: z.boolean(),
  application: z
    .object({ questions: z.array(z.string()), reviewers: z.array(Id) })
    .optional(),
  discordRequired: z.boolean().default(false),
  minAccountAgeDays: z.number().int().nonnegative().default(0),
  queuePriority: z.array(z.object({ role: Id, priority: z.number().int() })).default([]),
});
export type Access = z.infer<typeof Access>;

export const ScheduledEvent = z.object({
  id: Id,
  label: z.string(),
  /** 5-field cron in the server's timezone. */
  cron: z.string(),
  action: z.enum(["restart", "announce", "weather", "event", "backup"]),
  payload: z.record(z.string(), z.unknown()).optional(),
});
export type ScheduledEvent = z.infer<typeof ScheduledEvent>;

export const Blueprint = z.object({
  $schema: z.string().optional(),
  version: z.literal(1),
  meta: z.object({
    name: Line(48).min(2),
    slug: Id,
    tagline: Line(120).default(""),
    tags: z.array(Line(24).regex(/^[^",]*$/, "no quotes or commas")).max(20).default([]),
    language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).default("en"),
    maxPlayers: z.number().int().min(1).max(2048),
    region: z.string(),
    discordGuild: z.string().optional(),
  }),
  engine: z.object({
    target: EngineTarget,
    build: z.string().regex(/^\d{1,6}$/).optional(),
    /** Which FiveM: on GTA V Legacy (most servers), or FiveM for GTA V Enhanced (early access since July 2026). */
    edition: z.enum(["legacy", "enhanced"]).default("legacy"),
  }),
  world: World,
  economy: Economy,
  roles: z.array(Role).min(1),
  rulebook: z.string().default(""),
  mods: z.array(ModRef).default([]),
  visuals: Visuals,
  access: Access,
  schedule: z.array(ScheduledEvent).default([]),
  ops: z.object({
    backups: z.object({ everyHours: z.number().positive(), keep: z.number().int().positive() }),
    previews: z.boolean().default(true),
  }),
});
export type Blueprint = z.infer<typeof Blueprint>;

export interface ValidationIssue {
  path: string;
  message: string;
}

export function validateBlueprint(input: unknown):
  | { ok: true; blueprint: Blueprint }
  | { ok: false; issues: ValidationIssue[] } {
  const parsed = Blueprint.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    };
  }
  const bp = parsed.data;
  const issues: ValidationIssue[] = [];
  const roleIds = new Set(bp.roles.map((r) => r.id));
  const firstIndex = new Map<string, number>();
  bp.roles.forEach((r, i) => {
    if (firstIndex.has(r.id)) {
      issues.push({ path: `roles.${i}.id`, message: `Two roles use the id "${r.id}" (roles ${firstIndex.get(r.id)! + 1} and ${i + 1}). Give each role its own id.` });
    } else firstIndex.set(r.id, i);
    if (r.inherits && !roleIds.has(r.inherits)) {
      issues.push({ path: `roles.${i}.inherits`, message: `Role "${r.inherits}" doesn't exist` });
    }
  });
  for (const cycle of roleCycles(bp.roles)) {
    const i = firstIndex.get(cycle[0]!) ?? 0;
    issues.push({ path: `roles.${i}.inherits`, message: `Roles inherit from each other in a loop: ${[...cycle, cycle[0]].join(" → ")}. Remove one "inherits" to break it.` });
  }
  const share = bp.economy.jobs.reduce((s, j) => s + j.share, 0);
  if (share > 1.0001) {
    issues.push({ path: "economy.jobs", message: `Job shares add up to ${(share * 100).toFixed(0)}%, keep them at or below 100%` });
  }
  bp.access.queuePriority.forEach((q, i) => {
    if (!roleIds.has(q.role)) issues.push({ path: `access.queuePriority.${i}.role`, message: `Role "${q.role}" doesn't exist` });
  });
  return issues.length ? { ok: false, issues } : { ok: true, blueprint: bp };
}

/** Every inheritance loop among roles, each listed once, starting from its first role in the list. */
export function roleCycles(roles: Role[]): string[][] {
  const parent = new Map<string, string | undefined>();
  for (const r of roles) if (!parent.has(r.id)) parent.set(r.id, r.inherits);
  const found: string[][] = [];
  const inCycle = new Set<string>();
  for (const r of roles) {
    const path: string[] = [];
    const at = new Map<string, number>();
    let cur: string | undefined = r.id;
    while (cur !== undefined && parent.has(cur) && !at.has(cur) && !inCycle.has(cur)) {
      at.set(cur, path.length);
      path.push(cur);
      cur = parent.get(cur);
    }
    if (cur !== undefined && at.has(cur)) {
      const cycle = path.slice(at.get(cur)!);
      cycle.forEach((c) => inCycle.add(c));
      found.push(cycle);
    }
  }
  return found;
}

/** Resolve a role's full permission set, following `inherits`. */
export function effectivePermissions(roles: Role[], roleId: string): Set<string> {
  const byId = new Map(roles.map((r) => [r.id, r]));
  const out = new Set<string>();
  const seen = new Set<string>();
  let cur = byId.get(roleId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    cur.permissions.forEach((p) => out.add(p));
    cur = cur.inherits ? byId.get(cur.inherits) : undefined;
  }
  return out;
}
