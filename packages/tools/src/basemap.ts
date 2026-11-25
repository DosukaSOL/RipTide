import { EXTENT, pxPerMetre, screenToWorld, type View } from "./map";

/**
 * Map backgrounds ("basemaps"). Places, markers, found progress and routes are stored in
 * in-game metres and never depend on which background is drawn, so a background can be
 * switched off, or left out of a build, without touching anyone's data.
 *
 * - "official": the map art of Leonida (© Rockstar Games, tiles prepared by gtadb.org), bundled
 *   with the app. Builds made with RIPTIDE_MAP_ART=off leave it out.
 * - "schematic": an original coordinate grid drawn by RipTide. No game art.
 */
export type BasemapId = "official" | "schematic";
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

/** The background to draw: the one chosen, if this build has it and its tiles loaded. */
export function pickBasemap(chosen: BasemapId, has: { artBuilt: boolean; tilesLoaded: boolean }): Basemap {
  if (chosen === "official" && has.artBuilt && has.tilesLoaded) return BASEMAPS.official;
  return BASEMAPS.schematic;
}

/** Backgrounds a person can choose in this build. */
export function availableBasemaps(artBuilt: boolean): Basemap[] {
  return artBuilt ? [BASEMAPS.official, BASEMAPS.schematic] : [BASEMAPS.schematic];
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
