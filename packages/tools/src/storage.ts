import { z } from "zod";
import { Plan } from "./heist";
import { MapRecord, Provenance } from "./map";

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
  map: "riptide.map.v1",
  workspaces: "riptide.workspaces.v1",
} as const;

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
  stats: Stats,
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

export const MapState = z.object({
  filter: z
    .object({
      categories: z.array(z.enum(["missions", "activities", "collectibles", "businesses"])).default([]),
      savedOnly: z.boolean().default(false),
      notesOnly: z.boolean().default(false),
      query: z.string().max(120).default(""),
    })
    .default({}),
  view: z.object({ x: z.number(), y: z.number(), k: z.number() }).default({ x: 500, y: 500, k: 1 }),
  markers: z.array(MapRecord).max(2000).default([]),
  packs: z.array(Pack).max(20).default([]),
  bookmarks: z.array(z.object({ id: z.string().max(40), name: z.string().max(60), x: z.number(), y: z.number(), k: z.number() })).max(50).default([]),
  savedFilters: z
    .array(
      z.object({
        id: z.string().max(40),
        name: z.string().max(60),
        categories: z.array(z.enum(["missions", "activities", "collectibles", "businesses"])),
        savedOnly: z.boolean(),
        notesOnly: z.boolean(),
        query: z.string().max(120),
      }),
    )
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
