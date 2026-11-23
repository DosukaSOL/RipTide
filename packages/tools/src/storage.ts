import { z } from "zod";
import { Plan } from "./heist";
import { MapRecord, Provenance, CategoryEnum, DEFAULT_VIEW } from "./map";

/**
 * Versioned schemas for everything RipTide Tools keeps on this device.
 * Stored data is untrusted: anything that doesn't validate falls back to a safe
 * default instead of crashing the app, and older versions migrate forward.
 */

export const KEYS = {
  flags: "riptide.flags.v1",
  settings: "riptide.settings.v1",
  vicelab: "riptide.vicelab.v1",
  heist: "riptide.heist.v1",
  map: "riptide.map.v2",
  workspaces: "riptide.workspaces.v1",
} as const;

/** Keys from earlier previews. Read once so their data can be cleaned up, never written. */
export const LEGACY_KEYS = { map: "riptide.map.v1" } as const;

export const Flags = z.object({ toolsShell: z.boolean().default(false) });
export type Flags = z.infer<typeof Flags>;

export const Settings = z.object({
  motion: z.enum(["system", "reduced", "full"]).default("system"),
  splash: z.boolean().default(true),
});
export type Settings = z.infer<typeof Settings>;

const Stats = z.object({
  frames: z.number(),
  durationS: z.number(),
  avgFps: z.number(),
  low1Fps: z.number(),
  low01Fps: z.number(),
  p50Ms: z.number(),
  p99Ms: z.number(),
  stddevMs: z.number(),
  maxMs: z.number(),
});

export const Run = z.object({
  id: z.string().max(40),
  name: z.string().max(80),
  game: z.string().max(40),
  preset: z.string().max(20),
  scene: z.string().max(80).default(""),
  hardwareId: z.string().max(40).default(""),
  source: z.string().max(20),
  fileName: z.string().max(200).default(""),
  createdAt: z.number(),
  /** What the stats measure: presented frames (most captures) or displayed frames. */
  metric: z.enum(["presented", "displayed"]).default("presented"),
  stats: Stats,
  /** Displayed-frame FPS, when the capture recorded it next to presented frames. */
  displayed: z.object({ avgFps: z.number(), low1Fps: z.number() }).optional(),
  /** Notes from reading the capture (other processes left out, several runs in one file…). */
  notes: z.array(z.string().max(300)).max(10).default([]),
  /** Downsampled series for charting; the full capture is not stored. */
  series: z.array(z.tuple([z.number(), z.number(), z.number()])).max(1500),
});
export type Run = z.infer<typeof Run>;

export const Hardware = z.object({
  id: z.string().max(40),
  name: z.string().max(60),
  cpu: z.string().max(80).default(""),
  gpu: z.string().max(120).default(""),
  ramGb: z.number().min(0).max(4096).default(0),
  resolution: z.string().max(20).default(""),
  notes: z.string().max(400).default(""),
});
export type Hardware = z.infer<typeof Hardware>;

export const ViceLabState = z.object({
  runs: z.array(Run).max(200).default([]),
  hardware: z.array(Hardware).max(20).default([]),
  priority: z.enum(["balanced", "performance", "quality"]).default("balanced"),
  game: z.string().max(40).default(""),
  duration: z.number().int().min(10).max(600).default(60),
  targetFps: z.number().int().min(20).max(500).default(60),
});
export type ViceLabState = z.infer<typeof ViceLabState>;

export const HeistState = z.object({
  plans: z.array(Plan).max(50).default([]),
  activeId: z.string().max(40).default(""),
});
export type HeistState = z.infer<typeof HeistState>;

const Pack = z.object({
  id: z.string().max(64),
  name: z.string().max(80),
  version: z.string().max(20),
  publisher: z.string().max(80),
  claimed: Provenance,
  provenance: Provenance,
  approved: z.boolean(),
  installedAt: z.number(),
  records: z.array(MapRecord).max(20000),
});

const Hidden = z.array(z.union([CategoryEnum, z.literal("mine")])).max(20);
const FilterShape = {
  hidden: Hidden.default([]),
  region: z.string().max(60).default(""),
  query: z.string().max(120).default(""),
  favoritesOnly: z.boolean().default(false),
  hideFound: z.boolean().default(false),
};
const Profile = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(40),
  found: z.array(z.string().max(80)).max(50000).default([]),
});
const DEFAULT_PROFILE = { id: "main", name: "Main playthrough", found: [] as string[] };

export const MapState = z.object({
  filter: z.object(FilterShape).default({}),
  view: z
    .object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() })
    .default(DEFAULT_VIEW),
  markers: z.array(MapRecord).max(2000).default([]),
  packs: z.array(Pack).max(20).default([]),
  favorites: z.array(z.string().max(80)).max(20000).default([]),
  profiles: z
    .array(Profile)
    .max(8)
    .default([DEFAULT_PROFILE])
    .transform((list) => {
      const seen = new Set<string>();
      const out = list.filter((p) => !seen.has(p.id) && seen.add(p.id));
      return out.length ? out : [{ ...DEFAULT_PROFILE, found: [] }];
    }),
  activeProfile: z.string().max(40).default("main"),
  bookmarks: z.array(z.object({ id: z.string().max(40), name: z.string().max(60), x: z.number().finite(), y: z.number().finite(), z: z.number().finite() })).max(50).default([]),
  savedFilters: z
    .array(z.object({ id: z.string().max(40), name: z.string().max(60), ...FilterShape }))
    .max(30)
    .default([]),
  selectedId: z.string().max(80).default(""),
});
export type MapState = z.infer<typeof MapState>;

const Geometry = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });

export const ToolId = z.enum(["home", "studio", "vicelab", "heist", "map", "workspaces", "roadmap", "settings", "help"]);
export type ToolId = z.infer<typeof ToolId>;

export const Workspace = z.object({
  id: z.string().max(40),
  name: z.string().max(40),
  preset: z.enum(["single", "dual", "custom"]).default("single"),
  /** Tools that open in their own window when this workspace is restored. */
  detached: z.array(z.object({ tool: ToolId, geometry: Geometry.optional() })).max(8).default([]),
  restoreOnStartup: z.boolean().default(true),
  keepIndependent: z.boolean().default(true),
  rememberPositions: z.boolean().default(true),
  savedAt: z.number().default(0),
});
export type Workspace = z.infer<typeof Workspace>;

export const WorkspacesState = z.object({
  activeId: z.string().max(40).default("default"),
  list: z.array(Workspace).min(1).max(20).default([{ id: "default", name: "Default", preset: "single", detached: [], restoreOnStartup: true, keepIndependent: true, rememberPositions: true, savedAt: 0 }]),
});
export type WorkspacesState = z.infer<typeof WorkspacesState>;

/**
 * Like readStored, but says what happened: "empty" (nothing stored), "ok", or "invalid"
 * (something is stored but it isn't valid JSON or doesn't match the schema). Callers use
 * "invalid" to try a backup before falling back to defaults, so good data is never replaced
 * by an empty default without anyone knowing.
 */
export function parseStored<T>(raw: string | null, schema: z.ZodType<T, z.ZodTypeDef, unknown>): { status: "empty" } | { status: "ok"; value: T } | { status: "invalid" } {
  if (raw === null || raw === "") return { status: "empty" };
  try {
    const r = schema.safeParse(JSON.parse(raw));
    return r.success ? { status: "ok", value: r.data } : { status: "invalid" };
  } catch {
    return { status: "invalid" };
  }
}

/** Parse stored JSON with a schema; never throws. */
export function readStored<T>(raw: string | null, schema: z.ZodType<T, z.ZodTypeDef, unknown>, fallback: T): T {
  if (!raw) return fallback;
  try {
    const r = schema.safeParse(JSON.parse(raw));
    return r.success ? r.data : fallback;
  } catch {
    return fallback;
  }
}
