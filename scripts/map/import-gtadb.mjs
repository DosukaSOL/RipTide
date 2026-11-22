// Imports the official Leonida map tiles and community place data from a local
// checkout of https://github.com/rolux/gtadb.org into apps/studio/assets/map/leonida.
//
//   git clone --depth 1 --filter=blob:none --sparse https://github.com/rolux/gtadb.org /tmp/gtadb
//   cd /tmp/gtadb && git sparse-checkout set --no-cone 'LICENSE*' 'map/data/6/*' 'maps/tiles/6/day/[0-4]/*'
//   node scripts/map/import-gtadb.mjs --src /tmp/gtadb [--max-zoom 4]
//
// Map imagery: Rockstar Games' official map of Leonida, cut into tiles by gtadb.org.
// Place data: gtadb.org and contributors, CC BY 4.0. RipTide changes it: drops
// unconfirmed, demolished and unnamed entries, sorts places into categories and
// removes real-world street addresses. Run gtadb's own `git pull` to update; never
// fetch from their servers at runtime.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > 0 ? process.argv[i + 1] : d;
};
const src = resolve(arg("--src", "/tmp/gtadb"));
const maxZoom = Number(arg("--max-zoom", "4"));
if (!Number.isInteger(maxZoom) || maxZoom < 0 || maxZoom > 6) throw new Error("--max-zoom must be 0 to 6");
const out = resolve("apps/studio/assets/map/leonida");

const revision = execFileSync("git", ["-C", src, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const revisionDate = execFileSync("git", ["-C", src, "log", "-1", "--format=%cs"], { encoding: "utf8" }).trim();
if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error("Couldn't read the gtadb revision.");

/* ---------- tiles ---------- */
rmSync(out, { recursive: true, force: true });
const tiles = {};
for (let z = 0; z <= maxZoom; z++) {
  const dir = join(src, "maps/tiles/6/day", String(z));
  if (!existsSync(dir)) throw new Error(`Missing tiles for zoom ${z}. Add maps/tiles/6/day/${z} to the sparse checkout.`);
  mkdirSync(join(out, String(z)), { recursive: true });
  const list = [];
  for (const f of readdirSync(dir).sort()) {
    const m = /^(\d+),(\d+),(\d+)\.jpg$/.exec(f);
    if (!m || Number(m[1]) !== z) continue;
    const key = `${m[2]}-${m[3]}`; // row-column
    const bytes = readFileSync(join(dir, f));
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error(`${f} isn't a JPEG.`);
    copyFileSync(join(dir, f), join(out, String(z), `${key}.jpg`));
    list.push(key);
  }
  tiles[z] = list;
}

/* ---------- places ---------- */
const DROP = new Set(["unconfirmed", "demolished", "//may-not-exist"]);
const KIND = {
  "#supermarket": ["stores", "Supermarket"],
  "#clothes": ["stores", "Clothing store"],
  "#hair": ["stores", "Barber"],
  "#electronics": ["stores", "Electronics store"],
  "#shoes": ["stores", "Shoe store"],
  "#tattoos": ["stores", "Tattoo parlour"],
  "#gas": ["stores", "Gas station"],
  "#vendor": ["stores", "Street vendor"],
  "#guns": ["stores", "Gun store"],
  "#food": ["food", "Food"],
  "#fastfood": ["food", "Fast food"],
  "#drinks": ["food", "Drinks"],
  "#bar": ["food", "Bar"],
  "#safehouse": ["safehouses", "Safehouse"],
  "#modshop": ["garages", "Mod shop"],
  "#pay'n'spray": ["garages", "Paint and repair shop"],
  "#carwash": ["garages", "Car wash"],
  "#nightclub": ["activities", "Nightclub"],
  "#stripclub": ["activities", "Strip club"],
  "#tennis": ["activities", "Tennis courts"],
  "#racetrack": ["activities", "Racetrack"],
  "#ferriswheel": ["activities", "Ferris wheel"],
  "#blimp": ["activities", "Blimp"],
  "#bus": ["transport", "Bus station"],
  "#train": ["transport", "Train station"],
  "#metro": ["transport", "Metro station"],
  "#metromover": ["transport", "Metromover station"],
  "#airport": ["transport", "Airport"],
  "#marina": ["transport", "Marina"],
  "#airbase": ["transport", "Air base"],
  "#police": ["services", "Police station"],
  "#hospital": ["services", "Hospital"],
  "#jail": ["services", "Jail"],
};
const PLAIN = [
  ["landmark", "landmarks"],
  ["point-of-interest", "landmarks"],
  ["restaurant", "food"],
  ["leisure", "activities"],
  ["events", "activities"],
  ["transportation", "transport"],
  ["government", "services"],
  ["utilities", "services"],
  ["service", "services"],
  ["public", "landmarks"],
  ["natural", "landmarks"],
  ["retail", "stores"],
  ["supermarket", "stores"],
];
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

const raw = JSON.parse(readFileSync(join(src, "map/data/6/landmarks.json"), "utf8"));
const places = [];
const stats = { total: 0, dropped: 0, unnamed: 0, outOfBounds: 0 };
for (const [id, v] of Object.entries(raw)) {
  stats.total++;
  if (!Array.isArray(v) || v.length < 7 || !/^L\d{1,6}$/.test(id)) continue;
  const tags = new Set((v[6] ?? []).map(String));
  if ([...tags].some((t) => DROP.has(t) || t.startsWith("//duplicate"))) {
    stats.dropped++;
    continue;
  }
  const [x, y] = Array.isArray(v[1]) ? v[1] : [];
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 16384 || Math.abs(y) > 16384) {
    stats.outOfBounds++;
    continue;
  }
  const parts = clean(v[0], 200).split(", ").filter(Boolean);
  const hash = (v[6] ?? []).find((t) => KIND[t]);
  const named = !!parts[0] && !parts[0].startsWith("?");
  if (!named && !hash) {
    stats.unnamed++;
    continue;
  }
  const category = hash ? KIND[hash][0] : (PLAIN.find(([t]) => tags.has(t))?.[1] ?? "places");
  const kind = hash ? KIND[hash][1] : "";
  const title = clean(named ? parts[0] : kind, 80);
  const area = clean(parts.slice(1).join(", "), 120);
  const region = clean(parts.length > 1 ? parts[parts.length - 1] : "", 60);
  // Real-world inspiration: venue names only. Never homes or street addresses.
  const realFirst = clean(String(v[3] ?? "").split(",")[0], 80);
  const privateish = tags.has("residential") || category === "places" || /^\d/.test(realFirst) || !realFirst;
  const inspired = privateish ? "" : realFirst;
  const flags = tags.has("enterable") ? 1 : 0;
  places.push([id, title, area, region, category, Math.round(x * 10) / 10, Math.round(y * 10) / 10, kind, inspired, flags]);
}
places.sort((a, b) => Number(a[0].slice(1)) - Number(b[0].slice(1)));

const attribution = {
  imagery: "Map of Leonida © Rockstar Games. Tiles prepared by gtadb.org.",
  data: "GTA VI Landmarks Data (CC BY 4.0) — https://map.gtadb.org. Changed by RipTide: filtered, categorised, addresses removed.",
  license: "https://creativecommons.org/licenses/by/4.0/",
};
writeFileSync(
  join(out, "manifest.json"),
  JSON.stringify({ format: "riptide-map-tiles", schema: 1, map: "leonida-v1", source: "https://github.com/rolux/gtadb.org", revision, revisionDate, attribution, tileSize: 256, extent: 16384, minZoom: 0, maxZoom, background: "#2f90b0", tiles }) + "\n",
);
writeFileSync(
  join(out, "places.json"),
  JSON.stringify({ format: "riptide-places", schema: 1, map: "leonida-v1", source: "https://github.com/rolux/gtadb.org", revision, revisionDate, attribution, columns: ["id", "title", "area", "region", "category", "x", "y", "kind", "inspiredBy", "flags"], places }) + "\n",
);

const byCat = places.reduce((m, p) => ((m[p[4]] = (m[p[4]] ?? 0) + 1), m), {});
console.log(`gtadb ${revision.slice(0, 10)} (${revisionDate})`);
console.log(`tiles: ${Object.entries(tiles).map(([z, l]) => `z${z}=${l.length}`).join(" ")}`);
console.log(`places: ${places.length} kept of ${stats.total} (dropped ${stats.dropped}, unnamed ${stats.unnamed}, out of bounds ${stats.outOfBounds})`);
console.log(byCat);
