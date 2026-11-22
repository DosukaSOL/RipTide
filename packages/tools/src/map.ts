import { z } from "zod";
import { uid } from "./ids";

/**
 * Interactive Map data model.
 *
 * No GTA VI map data ships with RipTide. The canvas is schematic. Locations come
 * from versioned map packs or from the user's own markers, and every record
 * carries its provenance so official, verified, community and personal data
 * are never confused.
 */

export const CATEGORIES = [
  { id: "missions", label: "Missions" },
  { id: "activities", label: "Activities" },
  { id: "collectibles", label: "Collectibles" },
  { id: "businesses", label: "Businesses" },
] as const;
export type DataCategory = (typeof CATEGORIES)[number]["id"];

export const Provenance = z.enum(["official", "verified", "community", "personal"]);
export type Provenance = z.infer<typeof Provenance>;

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  official: "Official",
  verified: "Verified",
  community: "Community",
  personal: "Personal",
};

const Text = (max: number) => z.string().max(max).transform((s) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ""));

/** Schematic map space: 0..1000 on both axes. */
export const MAP_SIZE = 1000;
const Coord = z.number().finite().min(0).max(MAP_SIZE);

export const MapRecord = z.object({
  id: z.string().min(1).max(64).regex(/^[A-Za-z0-9_.:-]+$/),
  title: Text(80).pipe(z.string().min(1)),
  category: z.enum(["missions", "activities", "collectibles", "businesses", "personal"]),
  x: Coord,
  y: Coord,
  notes: Text(2000).default(""),
  tags: z.array(Text(24)).max(12).default([]),
  provenance: Provenance,
  /** Pack the record came from, if any. */
  packId: z.string().max(64).optional(),
  saved: z.boolean().default(false),
  createdAt: z.number().int().nonnegative().default(0),
});
export type MapRecord = z.infer<typeof MapRecord>;

export const MapPack = z.object({
  format: z.literal("riptide-map-pack"),
  schema: z.literal(1),
  id: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*$/),
  name: Text(80).pipe(z.string().min(1)),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  map: z.literal("schematic-v1"),
  publisher: Text(80).default("Unknown"),
  provenance: Provenance.exclude(["personal"]),
  records: z
    .array(MapRecord.omit({ provenance: true, packId: true, saved: true }).extend({ category: z.enum(["missions", "activities", "collectibles", "businesses"]) }))
    .max(20000),
});
export type MapPack = z.infer<typeof MapPack>;

export interface InstalledPack {
  id: string;
  name: string;
  version: string;
  publisher: string;
  /** What the pack claimed. */
  claimed: Provenance;
  /** What RipTide trusts it as. Unsigned packs are always community. */
  provenance: Provenance;
  /** Community packs stay hidden until the user reviews them. */
  approved: boolean;
  installedAt: number;
  records: MapRecord[];
}

/**
 * Import a map pack file. Packs can't prove "official" or "verified" status
 * without a signature, and RipTide has no signing key yet, so every imported pack
 * is treated as community data and starts unapproved.
 */
export function importMapPack(text: string, existing: InstalledPack[], now = Date.now()): { pack: InstalledPack; warnings: string[] } {
  if (text.length > 20 * 1024 * 1024) throw new Error("This map pack is larger than 20 MB.");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file couldn't be read as JSON.");
  }
  const parsed = MapPack.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(`This isn't a valid RipTide map pack${first ? ` (${first.path.join(".") || "file"}: ${first.message})` : ""}.`);
  }
  const p = parsed.data;
  const warnings: string[] = [];
  const prev = existing.find((e) => e.id === p.id);
  if (prev && compareVersions(p.version, prev.version) <= 0) {
    throw new Error(`Version ${prev.version} of "${p.name}" is already installed. Import a newer version to update it.`);
  }
  if (p.provenance !== "community") warnings.push(`This pack says it's ${PROVENANCE_LABEL[p.provenance].toLowerCase()} data, but it isn't signed, so RipTide treats it as community data.`);
  const ids = new Set<string>();
  const records: MapRecord[] = [];
  for (const r of p.records) {
    if (ids.has(r.id)) {
      warnings.push(`Skipped a duplicate record id "${r.id}".`);
      continue;
    }
    ids.add(r.id);
    records.push({ ...r, id: `${p.id}:${r.id}`, provenance: "community", packId: p.id, saved: false });
  }
  return {
    pack: { id: p.id, name: p.name, version: p.version, publisher: p.publisher, claimed: p.provenance, provenance: "community", approved: false, installedAt: now, records },
    warnings,
  };
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

export function createMarker(x: number, y: number, title = "My marker", now = Date.now()): MapRecord {
  const clamp = (v: number) => Math.min(MAP_SIZE, Math.max(0, Math.round(v * 10) / 10));
  return { id: `me:${uid()}`, title, category: "personal", x: clamp(x), y: clamp(y), notes: "", tags: [], provenance: "personal", saved: false, createdAt: now };
}

export interface MapFilter {
  categories: DataCategory[];
  savedOnly: boolean;
  notesOnly: boolean;
  query: string;
}

export const EMPTY_FILTER: MapFilter = { categories: [], savedOnly: false, notesOnly: false, query: "" };

/** Records that should be drawn: approved pack records plus personal markers, after filters. */
export function visibleRecords(packs: InstalledPack[], personal: MapRecord[], f: MapFilter): MapRecord[] {
  const pool = [...packs.filter((p) => p.approved).flatMap((p) => p.records), ...personal];
  const q = f.query.trim().toLowerCase();
  const anyCategory = f.categories.length > 0;
  return pool.filter((r) => {
    if (anyCategory || f.savedOnly || f.notesOnly) {
      const byCat = anyCategory && r.category !== "personal" && f.categories.includes(r.category as DataCategory);
      const bySaved = f.savedOnly && r.saved;
      const byNotes = f.notesOnly && r.category === "personal";
      if (!(byCat || bySaved || byNotes)) return false;
    }
    if (q && !`${r.title} ${r.notes} ${r.tags.join(" ")}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Per-category counts. null means no data source provides that category yet. */
export function categoryCounts(packs: InstalledPack[]): Record<DataCategory, number | null> {
  const out = Object.fromEntries(CATEGORIES.map((c) => [c.id, null])) as Record<DataCategory, number | null>;
  for (const p of packs.filter((x) => x.approved)) for (const r of p.records) {
    const c = r.category as DataCategory;
    out[c] = (out[c] ?? 0) + 1;
  }
  return out;
}

export interface View {
  x: number;
  y: number;
  k: number;
}
export const DEFAULT_VIEW: View = { x: MAP_SIZE / 2, y: MAP_SIZE / 2, k: 1 };
export const ZOOM = { min: 0.6, max: 8 };

export function clampView(v: View): View {
  const k = Math.min(ZOOM.max, Math.max(ZOOM.min, Number.isFinite(v.k) ? v.k : 1));
  const c = (n: number) => Math.min(MAP_SIZE, Math.max(0, Number.isFinite(n) ? n : MAP_SIZE / 2));
  return { x: c(v.x), y: c(v.y), k };
}

/** Zoom by `factor` keeping the map point under (px, py) fixed. px/py are 0..1 across the viewport. */
export function zoomAt(v: View, factor: number, px: number, py: number, aspect: number): View {
  const k2 = Math.min(ZOOM.max, Math.max(ZOOM.min, v.k * factor));
  const spanX = MAP_SIZE / v.k;
  const spanY = spanX / aspect;
  const mx = v.x + (px - 0.5) * spanX;
  const my = v.y + (py - 0.5) * spanY;
  const spanX2 = MAP_SIZE / k2;
  const spanY2 = spanX2 / aspect;
  return clampView({ x: mx - (px - 0.5) * spanX2, y: my - (py - 0.5) * spanY2, k: k2 });
}
