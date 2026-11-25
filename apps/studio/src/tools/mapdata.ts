import { useEffect, useState } from "react";
import { parsePlaces, TilesManifest, type PlacesData, type TilesManifest as Manifest } from "@riptide/tools";

/**
 * Loads the bundled Leonida tiles manifest and places from this app's own origin.
 * Nothing is fetched from anywhere else. One request per window, shared by
 * every map instance in it.
 */
export const MAP_BASE = "./map/leonida";

declare const __MAP_ART__: boolean | undefined;
/** False in builds made with RIPTIDE_MAP_ART=off: the map art isn't shipped, only places. */
export const MAP_ART_BUILT: boolean = typeof __MAP_ART__ === "boolean" ? __MAP_ART__ : true;

export interface MapData {
  status: "loading" | "ready" | "error";
  manifest: Manifest | null;
  /** Fast lookup: tiles[z] has "row-col" keys that exist. */
  tiles: Map<number, Set<string>>;
  places: PlacesData | null;
  error: string;
}

let cache: Promise<MapData> | null = null;

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${MAP_BASE}/${path}`, { credentials: "same-origin", cache: "force-cache" });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  const text = await res.text();
  if (text.length > 8 * 1024 * 1024) throw new Error(`${path} is too large`);
  return JSON.parse(text);
}

function load(): Promise<MapData> {
  cache ??= (async (): Promise<MapData> => {
    const [m, p] = await Promise.allSettled([MAP_ART_BUILT ? getJson("manifest.json") : Promise.resolve(null), getJson("places.json")]);
    let manifest: Manifest | null = null;
    let places: PlacesData | null = null;
    const errors: string[] = [];
    if (!MAP_ART_BUILT) {
      /* no map art in this build: the schematic background is used */
    } else if (m.status === "fulfilled") {
      const r = TilesManifest.safeParse(m.value);
      if (r.success) manifest = r.data;
      else errors.push("map tiles");
    } else errors.push("map tiles");
    if (p.status === "fulfilled") {
      try {
        places = parsePlaces(p.value);
      } catch {
        errors.push("places");
      }
    } else errors.push("places");
    const tiles = new Map<number, Set<string>>();
    if (manifest) for (const [z, list] of Object.entries(manifest.tiles)) tiles.set(Number(z), new Set(list));
    return {
      status: manifest || places ? "ready" : "error",
      manifest,
      tiles,
      places,
      error: errors.length ? `The ${errors.join(" and ")} couldn't be loaded. Reinstall or rebuild RipTide to restore them.${errors.includes("places") ? "" : " The schematic grid is shown instead."}` : "",
    };
  })();
  return cache;
}

const EMPTY: MapData = { status: "loading", manifest: null, tiles: new Map(), places: null, error: "" };

export function useMapData(): MapData {
  const [data, setData] = useState<MapData>(EMPTY);
  useEffect(() => {
    let alive = true;
    load().then(
      (d) => alive && setData(d),
      () => alive && setData({ ...EMPTY, status: "error", error: "The map couldn't be loaded." }),
    );
    return () => {
      alive = false;
    };
  }, []);
  return data;
}
