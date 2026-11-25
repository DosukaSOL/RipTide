import { z } from "zod";
import { EXTENT, pxPerMetre, screenToWorld, type View } from "./map";

/**
 * Map backgrounds ("basemaps"). Places, markers, found progress and routes are stored in
 * in-game metres and never depend on which background is drawn, so a background can be
 * switched off, or left out of a build, without touching anyone's data.
 *
 * - "official": the map art of Leonida (© Rockstar Games, tiles prepared by gtadb.org), bundled
 *   with the app. Builds made with RIPTIDE_MAP_ART=off leave it out.
 * - "custom": an image the player picks from their own device. It stays on that device (in the
 *   browser's or app's local storage), is never uploaded, and is placed on the map's coordinates by
 *   fitting it to the whole map or by lining up three or more known places.
 * - "schematic": an original coordinate grid drawn by RipTide. No game art.
 */
export type BasemapId = "official" | "custom" | "schematic";
export type BasemapStatus = "bundled" | "user-provided" | "schematic";

export interface Basemap {
  id: BasemapId;
  /** Name in Settings. */
  label: string;
  /** Short badge on the map. */
  badge: string;
  status: BasemapStatus;
  /** Credit for the background itself. Place data has its own, separate credit. */
  attribution: string | null;
  /** Draws raster tiles that must be shipped with the app. */
  tiles: boolean;
  background: string;
}

export const BASEMAPS: Record<BasemapId, Basemap> = {
  official: {
    id: "official",
    label: "Map art of Leonida",
    badge: "Official map of Leonida",
    status: "bundled",
    attribution: "Map of Leonida © Rockstar Games. Tiles prepared by gtadb.org.",
    tiles: true,
    background: "#2f90b0",
  },
  custom: {
    id: "custom",
    label: "Your own map image",
    badge: "Your map image",
    status: "user-provided",
    attribution: null,
    tiles: false,
    background: "#17122e",
  },
  schematic: {
    id: "schematic",
    label: "Schematic grid",
    badge: "Schematic grid",
    status: "schematic",
    attribution: null,
    tiles: false,
    background: "#17122e",
  },
};

/**
 * The background to draw: the one chosen, if it's available. A chosen image that isn't loaded
 * (or was removed) falls back to the map art when built in, otherwise to the grid.
 */
export function pickBasemap(chosen: BasemapId, has: { artBuilt: boolean; tilesLoaded: boolean; customLoaded?: boolean }): Basemap {
  if (chosen === "custom" && has.customLoaded) return BASEMAPS.custom;
  if (chosen === "schematic") return BASEMAPS.schematic;
  if (has.artBuilt && has.tilesLoaded) return BASEMAPS.official;
  return BASEMAPS.schematic;
}

/** Backgrounds a person can choose in this build. */
export function availableBasemaps(artBuilt: boolean): Basemap[] {
  return artBuilt ? [BASEMAPS.official, BASEMAPS.custom, BASEMAPS.schematic] : [BASEMAPS.custom, BASEMAPS.schematic];
}

/* ---------- your own map image ---------- */

/** Image pixels → map metres: x = a·px + c·py + e, y = b·px + d·py + f. */
export type Affine = [a: number, b: number, c: number, d: number, e: number, f: number];

export const AlignPoint = z.object({
  placeId: z.string().max(80),
  label: z.string().max(120),
  /** Map position of the place, in metres. */
  x: z.number().finite(),
  y: z.number().finite(),
  /** Where the player clicked on their image, in image pixels. */
  px: z.number().finite(),
  py: z.number().finite(),
});
export type AlignPoint = z.infer<typeof AlignPoint>;

export const MapImage = z.object({
  name: z.string().max(200).default("Map image"),
  type: z.enum(["image/png", "image/jpeg", "image/webp"]),
  width: z.number().int().min(1).max(20000),
  height: z.number().int().min(1).max(20000),
  bytes: z.number().int().min(1),
  addedAt: z.number(),
  /** "fit": the image covers the whole map square; "points": lined up with known places. */
  mode: z.enum(["fit", "points"]).default("fit"),
  points: z.array(AlignPoint).max(12).default([]),
  opacity: z.number().min(0.2).max(1).default(1),
});
export type MapImage = z.infer<typeof MapImage>;
export const MAP_IMAGE_MAX_BYTES = 80 * 1024 * 1024;

/** The image stretched over the whole map square (±EXTENT): right for a full, square map image. */
export function fitAffine(width: number, height: number): Affine {
  return [(2 * EXTENT) / width, 0, 0, -(2 * EXTENT) / height, -EXTENT, EXTENT];
}

/** Least-squares affine transform from three or more point pairs, or null if they're in a line. */
export function solveAffine(points: { px: number; py: number; x: number; y: number }[]): Affine | null {
  if (points.length < 3) return null;
  // Normal equations for [a c e] and [b d f] with rows [px py 1].
  let s00 = 0, s01 = 0, s02 = 0, s11 = 0, s12 = 0, s22 = 0;
  let tx0 = 0, tx1 = 0, tx2 = 0, ty0 = 0, ty1 = 0, ty2 = 0;
  for (const p of points) {
    s00 += p.px * p.px; s01 += p.px * p.py; s02 += p.px; s11 += p.py * p.py; s12 += p.py; s22 += 1;
    tx0 += p.px * p.x; tx1 += p.py * p.x; tx2 += p.x;
    ty0 += p.px * p.y; ty1 += p.py * p.y; ty2 += p.y;
  }
  const M = [[s00, s01, s02], [s01, s11, s12], [s02, s12, s22]];
  const det = (m: number[][]) => m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) - m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) + m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!);
  const D = det(M);
  // Scale-aware check for points that are (nearly) in a line.
  if (!Number.isFinite(D) || Math.abs(D) < 1e-9 * Math.max(1, s00 * s11 * s22)) return null;
  const solve = (t: number[]) => [0, 1, 2].map((k) => det(M.map((row, r) => row.map((v, c) => (c === k ? t[r]! : v)))) / D);
  const [a, c, e] = solve([tx0, tx1, tx2]);
  const [b, d, f] = solve([ty0, ty1, ty2]);
  return [a!, b!, c!, d!, e!, f!];
}

export const applyAffine = (m: Affine, px: number, py: number) => ({ x: m[0] * px + m[2] * py + m[4], y: m[1] * px + m[3] * py + m[5] });

/** Average distance, in metres, between where the points are and where the transform puts them. */
export function alignError(m: Affine, points: { px: number; py: number; x: number; y: number }[]): number {
  if (!points.length) return 0;
  const sum = points.reduce((s, p) => {
    const q = applyAffine(m, p.px, p.py);
    return s + Math.hypot(q.x - p.x, q.y - p.y);
  }, 0);
  return sum / points.length;
}

/** The transform in use for an image: its points when there are enough, otherwise the full-map fit. */
export function imageAffine(img: MapImage): Affine {
  return (img.mode === "points" && solveAffine(img.points)) || fitAffine(img.width, img.height);
}

/** SVG matrix that draws the image in the map's SVG space, where y points down (svg y = -metres). */
export function svgMatrix(m: Affine): string {
  return `matrix(${m[0]} ${-m[1]} ${m[2]} ${-m[3]} ${m[4]} ${-m[5]})`;
}

export interface GridLine {
  axis: "x" | "y";
  /** World coordinate of the line, in metres. */
  at: number;
  major: boolean;
}

const STEPS = [125, 250, 500, 1000, 2000, 4000, 8000];

/**
 * Grid lines for the schematic background: spaced at least ~56 px apart on screen, with every
 * kilometre (or every other line, when lines are a kilometre or more apart) marked as major.
 * Limited to the map's extent.
 */
export function gridLines(v: View, w: number, h: number): { step: number; lines: GridLine[] } {
  const s = pxPerMetre(v.z);
  const step = STEPS.find((m) => m * s >= 56) ?? STEPS[STEPS.length - 1]!;
  const majorEvery = step < 1000 ? 1000 : step * 2;
  const tl = screenToWorld(v, 0, 0, w, h);
  const br = screenToWorld(v, w, h, w, h);
  const lines: GridLine[] = [];
  const add = (axis: "x" | "y", lo: number, hi: number) => {
    const a = Math.ceil(Math.max(-EXTENT, lo) / step) * step;
    const b = Math.floor(Math.min(EXTENT, hi) / step) * step;
    for (let at = a; at <= b && lines.length < 400; at += step) lines.push({ axis, at, major: at % majorEvery === 0 });
  };
  add("x", tl.x, br.x);
  add("y", br.y, tl.y);
  return { step, lines };
}

/** "2 km", "-3.25 km", "500 m": a grid coordinate for an edge label. */
export function gridLabel(at: number): string {
  if (at === 0) return "0";
  return Math.abs(at) >= 1000 ? `${+(at / 1000).toFixed(3)} km` : `${at} m`;
}

/** Lines to label: every other line, so labels are at least ~112 px apart. */
export const labelled = (l: GridLine, step: number) => Math.round(l.at / step) % 2 === 0;
