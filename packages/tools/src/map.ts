import { z } from "zod";
import { uid } from "./ids";

/**
 * Interactive Map data model for GTA VI's Leonida.
 *
 * Coordinates are in-game metres: x grows east, y grows north, origin at the
 * centre of the official map tiles. The tiles span ±EXTENT on both axes.
 *
 * Places come from three sources, and each record keeps its provenance so they
 * are never confused: the bundled community data (gtadb.org, CC BY 4.0), map
 * packs the user imports and approves, and the user's own markers.
 */

export const MAP_ID = "leonida-v1";
export const EXTENT = 16384;
/** Tiles at zoom z are 256 px and the grid is 2^(z+2) tiles across. */
export const TILE_PX = 256;

export const CATEGORIES = [
  { id: "landmarks", label: "Landmarks", color: "#FFB36B" },
  { id: "safehouses", label: "Safehouses", color: "#3DF2D0" },
  { id: "stores", label: "Stores", color: "#5AA9FF" },
  { id: "food", label: "Food & drink", color: "#FF8A5B" },
  { id: "garages", label: "Garages & mod shops", color: "#C9F26B" },
  { id: "activities", label: "Activities & nightlife", color: "#FF4F9A" },
  { id: "transport", label: "Transport", color: "#A9B4FF" },
  { id: "services", label: "Services", color: "#F4E9DC" },
  { id: "places", label: "Buildings & places", color: "#C6A8FF" },
  { id: "collectibles", label: "Collectibles", color: "#FFE066" },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]["id"];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]];
export const CategoryEnum = z.enum(CATEGORY_IDS);
export const categoryById = (id: string) => CATEGORIES.find((c) => c.id === id);
/** Colour for personal markers left in "My markers". */
export const PERSONAL_COLOR = "#FFFFFF";

export const Provenance = z.enum(["official", "verified", "community", "personal"]);
export type Provenance = z.infer<typeof Provenance>;

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  official: "Official",
  verified: "Verified",
  community: "Community",
  personal: "Personal",
};

const CTRL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
export const cleanText = (s: string, max: number) => s.replace(CTRL, "").slice(0, max);
const Text = (max: number) => z.string().max(max).transform((s) => s.replace(CTRL, ""));
const Coord = z.number().finite().min(-EXTENT).max(EXTENT);

export const MapRecord = z.object({
  id: z.string().min(1).max(80).regex(/^[A-Za-z0-9_.:-]+$/),
  title: Text(80).pipe(z.string().min(1)),
  category: z.union([CategoryEnum, z.literal("personal")]),
  x: Coord,
  y: Coord,
  area: Text(120).default(""),
  region: Text(60).default(""),
  kind: Text(40).default(""),
  inspiredBy: Text(80).default(""),
  enterable: z.boolean().default(false),
  notes: Text(2000).default(""),
  tags: z.array(Text(24)).max(12).default([]),
  provenance: Provenance,
  /** Where the record came from: bundled data, a pack id, or "me". */
  source: z.string().max(64).default(""),
  createdAt: z.number().int().nonnegative().default(0),
});
export type MapRecord = z.infer<typeof MapRecord>;

/* ---------- bundled places ---------- */

const PlaceRow = z.tuple([
  z.string().regex(/^L\d{1,6}$/),
  z.string().min(1).max(80),
  z.string().max(120),
  z.string().max(60),
  CategoryEnum,
  Coord,
  Coord,
  z.string().max(40),
  z.string().max(80),
  z.number().int().min(0).max(255),
]);

export const PlacesFile = z.object({
  format: z.literal("riptide-places"),
  schema: z.literal(1),
  map: z.literal(MAP_ID),
  source: z.string().max(200),
  revision: z.string().max(64),
  revisionDate: z.string().max(20),
  places: z.array(z.unknown()).max(50000),
});

export interface PlacesData {
  revision: string;
  revisionDate: string;
  records: MapRecord[];
  /** Rows that didn't validate and were left out. */
  skipped: number;
}

/** Parse the bundled places file. Bad rows are skipped, never trusted. */
export function parsePlaces(data: unknown): PlacesData {
  const f = PlacesFile.parse(data);
  const records: MapRecord[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const row of f.places) {
    const r = PlaceRow.safeParse(row);
    if (!r.success || seen.has(r.data[0])) {
      skipped++;
      continue;
    }
    const [id, title, area, region, category, x, y, kind, inspiredBy, flags] = r.data;
    seen.add(id);
    records.push({
      id: `gtadb:${id}`,
      title: cleanText(title, 80),
      category,
      x,
      y,
      area: cleanText(area, 120),
      region: cleanText(region, 60),
      kind: cleanText(kind, 40),
      inspiredBy: cleanText(inspiredBy, 80),
      enterable: (flags & 1) === 1,
      notes: "",
      tags: [],
      provenance: "community",
      source: "gtadb",
      createdAt: 0,
    });
  }
  return { revision: f.revision, revisionDate: f.revisionDate, records, skipped };
}

export const TilesManifest = z.object({
  format: z.literal("riptide-map-tiles"),
  schema: z.literal(1),
  map: z.literal(MAP_ID),
  revision: z.string().max(64),
  tileSize: z.literal(TILE_PX),
  extent: z.literal(EXTENT),
  minZoom: z.number().int().min(0).max(8),
  maxZoom: z.number().int().min(0).max(8),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  tiles: z.record(z.string().regex(/^\d$/), z.array(z.string().regex(/^\d{1,4}-\d{1,4}$/)).max(100000)),
});
export type TilesManifest = z.infer<typeof TilesManifest>;

/* ---------- map packs ---------- */

export const MapPack = z.object({
  format: z.literal("riptide-map-pack"),
  schema: z.literal(1),
  id: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*$/),
  name: Text(80).pipe(z.string().min(1)),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  map: z.literal(MAP_ID),
  publisher: Text(80).default("Unknown"),
  provenance: Provenance.exclude(["personal"]),
  records: z
    .array(
      z.object({
        id: z.string().min(1).max(48).regex(/^[A-Za-z0-9_.-]+$/),
        title: Text(80).pipe(z.string().min(1)),
        category: CategoryEnum,
        x: Coord,
        y: Coord,
        area: Text(120).default(""),
        kind: Text(40).default(""),
        notes: Text(2000).default(""),
        tags: z.array(Text(24)).max(12).default([]),
      }),
    )
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
  /** Packs stay hidden until the user reviews them. */
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
  if (data && typeof data === "object" && (data as { map?: unknown }).map === "schematic-v1") {
    throw new Error("This pack was made for the old placeholder map, so its places can't be put on Leonida.");
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
    records.push({ ...r, id: `${p.id}:${r.id}`, region: "", inspiredBy: "", enterable: false, provenance: "community", source: p.id, createdAt: 0 });
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

const clampCoord = (v: number) => Math.min(EXTENT, Math.max(-EXTENT, Math.round((Number.isFinite(v) ? v : 0) * 10) / 10));

export function createMarker(x: number, y: number, title = "My marker", now = Date.now()): MapRecord {
  return { id: `me:${uid()}`, title, category: "personal", x: clampCoord(x), y: clampCoord(y), area: "", region: "", kind: "", inspiredBy: "", enterable: false, notes: "", tags: [], provenance: "personal", source: "me", createdAt: now };
}

/* ---------- filtering, search, progress ---------- */

export type HiddenId = CategoryId | "mine";

export interface MapFilter {
  /** Categories switched off. "mine" hides the user's own markers. */
  hidden: HiddenId[];
  region: string;
  query: string;
  favoritesOnly: boolean;
  hideFound: boolean;
}

export const EMPTY_FILTER: MapFilter = { hidden: [], region: "", query: "", favoritesOnly: false, hideFound: false };

const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function haystack(r: MapRecord): string {
  return norm(`${r.title} ${r.area} ${r.kind} ${r.inspiredBy} ${r.notes} ${r.tags.join(" ")} ${categoryById(r.category)?.label ?? "my markers"}`);
}

export function matchesQuery(r: MapRecord, query: string): boolean {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const h = haystack(r);
  return words.every((w) => h.includes(w));
}

/** Records to draw, after every filter. */
export function visibleRecords(pool: MapRecord[], f: MapFilter, favorites: ReadonlySet<string>, found: ReadonlySet<string>): MapRecord[] {
  const hidden = new Set(f.hidden);
  return pool.filter((r) => {
    if (r.provenance === "personal") {
      if (hidden.has("mine")) return false;
      if (r.category !== "personal" && hidden.has(r.category)) return false;
    } else {
      if (r.category !== "personal" && hidden.has(r.category)) return false;
      if (f.region && r.region !== f.region) return false;
    }
    if (f.favoritesOnly && !favorites.has(r.id)) return false;
    if (f.hideFound && found.has(r.id)) return false;
    if (f.query && !matchesQuery(r, f.query)) return false;
    return true;
  });
}

/** Ranked search for the results list. Title matches beat area and notes. */
export function searchRecords(pool: MapRecord[], query: string, limit = 8): MapRecord[] {
  const q = norm(query).trim();
  if (!q) return [];
  const words = q.split(/\s+/);
  const scored: { r: MapRecord; s: number }[] = [];
  for (const r of pool) {
    if (!matchesQuery(r, q)) continue;
    const t = norm(r.title);
    let s = 0;
    if (t === q) s += 200;
    if (t.startsWith(q)) s += 100;
    else if (t.split(/[\s'-]+/).some((w) => w.startsWith(words[0]!))) s += 60;
    else if (t.includes(q)) s += 40;
    if (norm(r.kind).includes(q)) s += 20;
    if (norm(r.area).includes(q)) s += 15;
    if (norm(r.inspiredBy).includes(q)) s += 8;
    if (r.provenance === "personal") s += 5;
    scored.push({ r, s });
  }
  scored.sort((a, b) => b.s - a.s || a.r.title.localeCompare(b.r.title));
  return scored.slice(0, limit).map((x) => x.r);
}

export interface CategoryCount {
  total: number;
  found: number;
}

/** Places you can tick off: everything with a category, including your own markers given one. */
export const isTrackable = (r: Pick<MapRecord, "category">) => r.category !== "personal";

/** Per-category totals and how many the active profile has found. Your own markers count in their category and under "mine". */
export function categoryCounts(pool: MapRecord[], found: ReadonlySet<string>, region = ""): Record<CategoryId | "mine", CategoryCount> {
  const out = Object.fromEntries([...CATEGORY_IDS, "mine"].map((c) => [c, { total: 0, found: 0 }])) as Record<CategoryId | "mine", CategoryCount>;
  for (const r of pool) {
    if (region && r.provenance !== "personal" && r.region !== region) continue;
    if (r.provenance === "personal") {
      out.mine.total++;
      if (found.has(r.id)) out.mine.found++;
    }
    if (r.category === "personal") continue;
    out[r.category].total++;
    if (found.has(r.id)) out[r.category].found++;
  }
  return out;
}

/** Regions present in the data, largest first. */
export function regionsOf(pool: MapRecord[]): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const r of pool) if (r.region) m.set(r.region, (m.get(r.region) ?? 0) + 1);
  return [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** The closest record not found yet, skipping the current one. */
export function nextUnfound(records: MapRecord[], found: ReadonlySet<string>, from: { x: number; y: number }, skipId = ""): MapRecord | undefined {
  let best: MapRecord | undefined;
  let bestD = Infinity;
  for (const r of records) {
    if (r.id === skipId || found.has(r.id) || !isTrackable(r)) continue;
    const d = (r.x - from.x) ** 2 + (r.y - from.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

/* ---------- view and projection ---------- */

/** Centre in in-game metres and a continuous zoom level. z matches tile levels. */
export interface View {
  x: number;
  y: number;
  z: number;
}
export const DEFAULT_VIEW: View = { x: -3100, y: 1000, z: 0.4 };
/** Land area of Leonida on the official map, in in-game metres. */
export const LEONIDA_BOX = { minX: -9500, minY: -8900, maxX: 2700, maxY: 9800 };
export const ZOOM = { min: -0.5, max: 5.5 };
const PAN_LIMIT = 13000;

/** Screen pixels per metre at zoom z: the whole extent is 1024 px at z = 0. */
export const pxPerMetre = (z: number) => 2 ** z / 32;

export function clampView(v: Partial<View>): View {
  const z = Math.min(ZOOM.max, Math.max(ZOOM.min, Number.isFinite(v.z) ? v.z! : DEFAULT_VIEW.z));
  const c = (n: number | undefined, d: number) => Math.min(PAN_LIMIT, Math.max(-PAN_LIMIT, Number.isFinite(n) ? n! : d));
  return { x: c(v.x, DEFAULT_VIEW.x), y: c(v.y, DEFAULT_VIEW.y), z };
}

/** World point under a screen point. px/py are pixels from the viewport's top-left. */
export function screenToWorld(v: View, px: number, py: number, w: number, h: number): { x: number; y: number } {
  const s = pxPerMetre(v.z);
  return { x: v.x + (px - w / 2) / s, y: v.y - (py - h / 2) / s };
}

export function worldToScreen(v: View, x: number, y: number, w: number, h: number): { px: number; py: number } {
  const s = pxPerMetre(v.z);
  return { px: w / 2 + (x - v.x) * s, py: h / 2 - (y - v.y) * s };
}

/** Change zoom by dz keeping the world point under (px, py) fixed. */
export function zoomAt(v: View, dz: number, px: number, py: number, w: number, h: number): View {
  const z2 = Math.min(ZOOM.max, Math.max(ZOOM.min, v.z + dz));
  const p = screenToWorld(v, px, py, w, h);
  const s2 = pxPerMetre(z2);
  return clampView({ x: p.x - (px - w / 2) / s2, y: p.y + (py - h / 2) / s2, z: z2 });
}

/** Zoom that fits a world box into the viewport, with padding in pixels. */
export function fitView(box: { minX: number; minY: number; maxX: number; maxY: number }, w: number, h: number, pad = 40): View {
  const bw = Math.max(50, box.maxX - box.minX);
  const bh = Math.max(50, box.maxY - box.minY);
  const s = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
  return clampView({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2, z: Math.log2(Math.max(1e-6, s) * 32) });
}

/** View showing all of Leonida in a viewport of w × h pixels. */
export const homeView = (w: number, h: number) => fitView(LEONIDA_BOX, w, h, 24);

export interface TileRef {
  key: string;
  z: number;
  row: number;
  col: number;
  /** World box: x from x0, y from yTop downwards, size metres square. */
  x0: number;
  yTop: number;
  size: number;
}

export const tileMetres = (z: number) => (EXTENT * 2) / 2 ** (z + 2);

/** Tile level to draw for a view: sharp on high-DPI screens, never past what's bundled. */
export function tileLevel(z: number, dpr: number, maxZoom: number, minZoom = 0): number {
  return Math.min(maxZoom, Math.max(minZoom, Math.round(z + Math.log2(Math.max(1, dpr)) - 0.2)));
}

/** Tiles covering the viewport at level `level`, limited to those that exist. */
export function visibleTiles(v: View, w: number, h: number, level: number, exists: (z: number, key: string) => boolean): TileRef[] {
  const size = tileMetres(level);
  const tl = screenToWorld(v, 0, 0, w, h);
  const br = screenToWorld(v, w, h, w, h);
  const n = 2 ** (level + 2);
  const c0 = Math.max(0, Math.floor((tl.x + EXTENT) / size));
  const c1 = Math.min(n - 1, Math.ceil((br.x + EXTENT) / size) - 1);
  const r0 = Math.max(0, Math.floor((EXTENT - tl.y) / size));
  const r1 = Math.min(n - 1, Math.ceil((EXTENT - br.y) / size) - 1);
  const out: TileRef[] = [];
  if ((c1 - c0 + 1) * (r1 - r0 + 1) > 4000) return out;
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const key = `${row}-${col}`;
      if (!exists(level, key)) continue;
      out.push({ key, z: level, row, col, x0: -EXTENT + col * size, yTop: EXTENT - row * size, size });
    }
  }
  return out;
}
