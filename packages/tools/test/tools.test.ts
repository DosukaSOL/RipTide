import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCapture,
  computeStats,
  downsample,
  recommend,
  CaptureError,
  LIMITS,
  createPlan,
  nextStatus,
  progress,
  exportPlan,
  parsePlanFile,
  TEMPLATES,
  importMapPack,
  visibleRecords,
  categoryCounts,
  createMarker,
  EMPTY_FILTER,
  zoomAt,
  clampView,
  DEFAULT_VIEW,
  parsePlaces,
  searchRecords,
  nextUnfound,
  regionsOf,
  screenToWorld,
  worldToScreen,
  visibleTiles,
  tileLevel,
  tileMetres,
  fitView,
  homeView,
  LEONIDA_BOX,
  EXTENT,
  type MapRecord,
  compareVersions,
  clampToScreens,
  screenFor,
  suggestPlacement,
  readStored,
  MapState,
  WorkspacesState,
  ViceLabState,
  HeistState,
  uid,
  ROADMAP,
} from "../src/index";

const frames = (n: number, ms = 16.67) => Array.from({ length: n }, () => ms);

// ---------- frame-time parsing ----------

test("PresentMon CSV with MsBetweenPresents", () => {
  const csv = "Application,ProcessID,MsBetweenPresents,MsBetweenDisplayChange\n" + frames(100).map((f) => `game.exe,1,${f},${f}`).join("\n");
  const r = parseCapture(csv, "capture.csv");
  assert.equal(r.source, "presentmon");
  assert.equal(r.frametimesMs.length, 100);
});

test("PresentMon 2 style FrameTime column and quoted fields", () => {
  const csv = '"Application","FrameTime","CPUBusy"\n' + frames(60, 8.33).map((f) => `"game.exe","${f}","5"`).join("\n");
  const r = parseCapture(csv);
  assert.equal(r.frametimesMs.length, 60);
  assert.equal(r.frametimesMs[0], 8.33);
});

test("MangoHud CSV with a preamble before the header", () => {
  const csv = "os,cpu,gpu,ram\nLinux,Ryzen,RTX,32\nfps,frametime,cpu_load,gpu_load\n" + frames(90, 10).map((f) => `100,${f},40,90`).join("\n");
  const r = parseCapture(csv, "mangohud.csv");
  assert.equal(r.source, "mangohud");
  assert.equal(r.frametimesMs.length, 90);
});

test("CapFrameX JSON", () => {
  const json = JSON.stringify({ Info: {}, Runs: [{ CaptureData: { MsBetweenPresents: frames(50) } }, { CaptureData: { MsBetweenPresents: frames(50, 20) } }] });
  const r = parseCapture(json, "run.json");
  assert.equal(r.source, "capframex");
  assert.equal(r.frametimesMs.length, 100);
});

test("plain list, semicolon CSV and junk rows", () => {
  assert.equal(parseCapture(frames(40).join("\n")).source, "plain");
  const semi = "Frame;MsBetweenPresents\n" + frames(40).map((f, i) => `${i};${f}`).join("\n") + "\nbad;row\n1;-5\n2;99999";
  const r = parseCapture(semi);
  assert.equal(r.frametimesMs.length, 40);
  assert.equal(r.skipped, 3);
});

test("rejects too-short, unreadable and oversized captures", () => {
  assert.throws(() => parseCapture("MsBetweenPresents\n16\n16"), CaptureError);
  assert.throws(() => parseCapture("{not json", "x.json"), CaptureError);
  assert.throws(() => parseCapture(JSON.stringify({ hello: 1 }), "x.json"), CaptureError);
  assert.throws(() => parseCapture("x".repeat(LIMITS.maxBytes + 1)), CaptureError);
});

// ---------- stats ----------

test("stats for a steady 60 fps run", () => {
  const s = computeStats(frames(600, 1000 / 60));
  assert.equal(s.avgFps, 60);
  assert.equal(s.low1Fps, 60);
  assert.equal(s.stddevMs, 0);
  assert.equal(s.durationS, 10);
});

test("1% lows capture stutter that the average hides", () => {
  const ft = frames(990, 10).concat(frames(10, 50));
  const s = computeStats(ft);
  assert.ok(s.avgFps > 90, `avg ${s.avgFps}`);
  assert.equal(s.low1Fps, 20);
  assert.equal(s.p99Ms, 10);
  assert.equal(s.maxMs, 50);
  assert.ok(s.stddevMs > 3);
});

test("downsample keeps spikes and bounds size", () => {
  const ft = frames(10000, 10);
  ft[5000] = 200;
  const d = downsample(ft, 500);
  assert.ok(d.length <= 500);
  assert.equal(Math.max(...d.map((p) => p.max)), 200);
});

// ---------- recommendations ----------

test("recommendations only use the user's own runs", () => {
  const runs = [
    { id: "a", game: "gtav", preset: "ultra", stats: { avgFps: 52, low1Fps: 35 } },
    { id: "b", game: "gtav", preset: "high", stats: { avgFps: 74, low1Fps: 55 } },
    { id: "c", game: "gtav", preset: "medium", stats: { avgFps: 98, low1Fps: 70 } },
    { id: "d", game: "rdr2", preset: "low", stats: { avgFps: 140, low1Fps: 100 } },
  ];
  assert.equal(recommend(runs, "gtav", "balanced", 60)?.run.id, "b");
  assert.equal(recommend(runs, "gtav", "performance", 60)?.run.id, "c");
  assert.equal(recommend(runs, "gtav", "quality", 60)?.run.id, "a");
  assert.equal(recommend(runs, "rdr2", "balanced"), null, "needs two runs");
  assert.equal(recommend(runs, "gtav", "balanced", 200)?.run.id, "c", "falls back to closest");
});

// ---------- heist ----------

test("plan templates, status cycle and progress", () => {
  const p = createPlan("crew-four", 1000);
  assert.equal(p.roles.length, 4);
  assert.equal(p.phases.length, 4);
  assert.deepEqual(progress(p), { assigned: 0, roles: 4, phasesDone: 0, phases: 4, checklistDone: 0, checklist: 0 });
  assert.equal(nextStatus("not-started"), "in-progress");
  assert.equal(nextStatus("in-progress"), "done");
  assert.equal(nextStatus("done"), "not-started");
  assert.equal(TEMPLATES.length, 2);
  assert.ok(createPlan("nope").phases.length > 0, "unknown template falls back");
});

test("plans round-trip through a file and get a fresh id", () => {
  const p = createPlan();
  p.roles[0]!.assignee = "Mia";
  p.notes = "Meet at the pier";
  const back = parsePlanFile(exportPlan(p));
  assert.notEqual(back.id, p.id);
  assert.equal(back.roles[0]!.assignee, "Mia");
  assert.equal(back.notes, "Meet at the pier");
  assert.throws(() => parsePlanFile("{}"));
  assert.throws(() => parsePlanFile('{"format":"riptide-heist-plan","schema":2}'));
  assert.throws(() => parsePlanFile("nope"));
});

test("plan import strips control characters", () => {
  const p = createPlan();
  p.name = "Bad\u0000name\u0007";
  const back = parsePlanFile(exportPlan(p));
  assert.equal(back.name, "Badname");
});

// ---------- map ----------

const pack = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: "riptide-map-pack",
    schema: 1,
    id: "test-pack",
    name: "Test pack",
    version: "1.0.0",
    map: "leonida-v1",
    publisher: "Tester",
    provenance: "official",
    records: [
      { id: "a", title: "Pier", category: "activities", x: 100, y: 200 },
      { id: "b", title: "Shop", category: "stores", x: 300, y: 400, tags: ["food"] },
      { id: "a", title: "Dup", category: "landmarks", x: 1, y: 1 },
    ],
    ...over,
  });

const placesFile = (rows: unknown[]) => ({ format: "riptide-places", schema: 1, map: "leonida-v1", source: "test", revision: "abc", revisionDate: "2026-11-19", places: rows });
const ROWS = [
  ["L1", "Vice Regal", "Washington Beach, Vice Beach", "Vice Beach", "places", 1409.4, 2803.2, "", "", 0],
  ["L16", "Y Vice City", "Washington Beach, Vice Beach", "Vice Beach", "safehouses", 1958.1, 1590.8, "Safehouse", "W South Beach", 1],
  ["L282", "Mod shop", "Port Gellhorn", "Port Gellhorn", "garages", -6436.3, 2595.6, "Mod shop", "", 1],
  ["L999", "Gas station", "Hamlet", "Hamlet", "stores", -2000, 3000, "Gas station", "", 0],
];

test("bundled places parse, and bad rows are skipped instead of trusted", () => {
  const d = parsePlaces(placesFile([...ROWS, ["L5", "<script>", "", "", "stores", 99999, 0, "", "", 0], ["bad"], ROWS[0]]));
  assert.equal(d.records.length, 4);
  assert.equal(d.skipped, 3, "out-of-range, malformed and duplicate rows are skipped");
  const y = d.records.find((r) => r.id === "gtadb:L16")!;
  assert.equal(y.provenance, "community");
  assert.equal(y.enterable, true);
  assert.equal(y.inspiredBy, "W South Beach");
  assert.throws(() => parsePlaces({ ...placesFile(ROWS), map: "schematic-v1" }));
  assert.throws(() => parsePlaces("nope"));
});

test("map packs are for Leonida, downgraded to community, unapproved, de-duplicated", () => {
  const { pack: p, warnings } = importMapPack(pack(), []);
  assert.equal(p.claimed, "official");
  assert.equal(p.provenance, "community");
  assert.equal(p.approved, false);
  assert.equal(p.records.length, 2);
  assert.ok(p.records.every((r) => r.provenance === "community" && r.id.startsWith("test-pack:")));
  assert.equal(warnings.length, 2);
  assert.throws(() => importMapPack(pack({ map: "schematic-v1" }), []), /old placeholder map/);
});

test("map pack validation and versioning", () => {
  assert.throws(() => importMapPack("nope", []));
  assert.throws(() => importMapPack(pack({ format: "other" }), []));
  assert.throws(() => importMapPack(pack({ records: [{ id: "x", title: "Far", category: "stores", x: EXTENT + 1, y: 1 }] }), []));
  assert.throws(() => importMapPack(pack({ records: [{ id: "x", title: "Bad", category: "missions", x: 1, y: 1 }] }), []));
  const { pack: p } = importMapPack(pack(), []);
  assert.throws(() => importMapPack(pack(), [p]), /already installed/);
  assert.equal(importMapPack(pack({ version: "1.1.0" }), [p]).pack.version, "1.1.0");
  assert.ok(compareVersions("1.10.0", "1.9.9") > 0);
});

test("filters, regions, favourites and found tracking", () => {
  const places = parsePlaces(placesFile(ROWS)).records;
  const me: MapRecord = { ...createMarker(0, 0, "Hideout"), notes: "food truck nearby" };
  const pool = [...places, me];
  const none = new Set<string>();
  assert.equal(visibleRecords(pool, EMPTY_FILTER, none, none).length, 5);
  assert.equal(visibleRecords(pool, { ...EMPTY_FILTER, hidden: ["places"] }, none, none).length, 4);
  assert.equal(visibleRecords(pool, { ...EMPTY_FILTER, hidden: ["mine"] }, none, none).length, 4);
  assert.equal(visibleRecords(pool, { ...EMPTY_FILTER, region: "Vice Beach" }, none, none).length, 3, "region filter keeps your own markers");
  assert.equal(visibleRecords(pool, { ...EMPTY_FILTER, query: "food" }, none, none).length, 1);
  assert.equal(visibleRecords(pool, { ...EMPTY_FILTER, query: "south beach" }, none, none)[0]!.title, "Y Vice City", "search covers the real-world inspiration");
  const found = new Set(["gtadb:L1"]);
  assert.equal(visibleRecords(pool, { ...EMPTY_FILTER, hideFound: true }, none, found).length, 4);
  assert.equal(visibleRecords(pool, { ...EMPTY_FILTER, favoritesOnly: true }, new Set([me.id]), none)[0]!.title, "Hideout");
  const counts = categoryCounts(pool, found);
  assert.deepEqual(counts.places, { total: 1, found: 1 });
  assert.deepEqual(counts.collectibles, { total: 0, found: 0 });
  assert.deepEqual(counts.mine, { total: 1, found: 0 });
  const collectible: MapRecord = { ...createMarker(5, 5, "Shell"), category: "collectibles" };
  const c2 = categoryCounts([...pool, collectible], new Set([collectible.id]));
  assert.deepEqual(c2.collectibles, { total: 1, found: 1 }, "your own markers count in the category you give them");
  assert.deepEqual(c2.mine, { total: 2, found: 1 });
  assert.equal(categoryCounts(pool, found, "Hamlet").stores.total, 1);
  assert.deepEqual(regionsOf(places).map((r) => r.name), ["Vice Beach", "Hamlet", "Port Gellhorn"]);
});

test("search ranks title matches first and handles accents", () => {
  const places = parsePlaces(placesFile([...ROWS, ["L7", "Café Mod", "Vice Beach", "Vice Beach", "food", 0, 0, "", "", 0]])).records;
  assert.equal(searchRecords(places, "mod")[0]!.title, "Mod shop");
  assert.equal(searchRecords(places, "cafe")[0]!.title, "Café Mod");
  assert.deepEqual(searchRecords(places, "   "), []);
  assert.equal(searchRecords(places, "zzzz").length, 0);
});

test("next unfound picks the closest place you haven't found", () => {
  const places = parsePlaces(placesFile(ROWS)).records;
  assert.equal(nextUnfound(places, new Set(), { x: 1900, y: 1600 })!.id, "gtadb:L16");
  assert.equal(nextUnfound(places, new Set(["gtadb:L16"]), { x: 1900, y: 1600 })!.id, "gtadb:L1");
  assert.equal(nextUnfound(places, new Set(places.map((p) => p.id)), { x: 0, y: 0 }), undefined);
  assert.equal(nextUnfound([createMarker(0, 0)], new Set(), { x: 0, y: 0 }), undefined, "uncategorised markers aren't things to find");
});

test("projection round-trips and zoom keeps the cursor point", () => {
  const v = { x: 1000, y: -500, z: 2 };
  const p = worldToScreen(v, 1500, 0, 800, 600);
  const back = screenToWorld(v, p.px, p.py, 800, 600);
  assert.ok(Math.abs(back.x - 1500) < 1e-6 && Math.abs(back.y) < 1e-6);
  assert.ok(p.py < 300, "north is up");
  const z = zoomAt(v, 1, 600, 150, 800, 600);
  const before = screenToWorld(v, 600, 150, 800, 600);
  const after = screenToWorld(z, 600, 150, 800, 600);
  assert.ok(Math.abs(before.x - after.x) < 1e-6 && Math.abs(before.y - after.y) < 1e-6);
  assert.deepEqual(clampView({ x: NaN, y: 99999, z: 99 }), { x: DEFAULT_VIEW.x, y: 13000, z: 5.5 });
  const m = createMarker(-99999, 20000.04);
  assert.equal(m.x, -EXTENT);
  assert.equal(m.y, EXTENT);
  const f = fitView({ minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 }, 800, 600, 0);
  assert.ok(Math.abs(2 ** f.z / 32 - 0.3) < 1e-9);
  for (const [w, h] of [[1200, 760], [550, 440], [360, 640]] as const) {
    const v2 = homeView(w, h);
    const a = worldToScreen(v2, LEONIDA_BOX.minX, LEONIDA_BOX.maxY, w, h);
    const b = worldToScreen(v2, LEONIDA_BOX.maxX, LEONIDA_BOX.minY, w, h);
    assert.ok(a.px >= 0 && a.py >= 0 && b.px <= w && b.py <= h, `all of Leonida fits ${w}x${h}`);
  }
});

test("tiles line up with in-game coordinates and only existing tiles load", () => {
  assert.equal(tileMetres(0), 8192);
  assert.equal(tileMetres(4), 512);
  assert.equal(tileLevel(2.4, 1, 4), 2);
  assert.equal(tileLevel(2.4, 2, 4), 3, "sharper tiles on high-DPI screens");
  assert.equal(tileLevel(9, 1, 4), 4, "never past the bundled zoom");
  const all = visibleTiles({ x: 0, y: 0, z: 0 }, 1024, 1024, 0, () => true);
  assert.equal(all.length, 16, "the whole extent is 4x4 tiles at level 0");
  const first = all[0]!;
  assert.equal(first.x0, -EXTENT);
  assert.equal(first.yTop, EXTENT);
  const some = visibleTiles({ x: 0, y: 0, z: 0 }, 1024, 1024, 0, (_z, k) => k === "1-2");
  assert.deepEqual(some.map((t) => [t.row, t.col, t.x0, t.yTop]), [[1, 2, 0, 8192]]);
  assert.equal(visibleTiles({ x: 0, y: 0, z: 4 }, 512, 512, 4, () => true).length, 4);
});

// ---------- window layout ----------

const left = { x: 0, y: 0, w: 1920, h: 1040 };
const right = { x: 1920, y: 0, w: 2560, h: 1400 };

test("windows stay put on a connected screen", () => {
  const g = { x: 2000, y: 100, w: 1200, h: 800 };
  assert.deepEqual(clampToScreens(g, [left, right]), g);
  assert.equal(screenFor(g, [left, right]), 1);
});

test("a window on an unplugged monitor comes back to the primary screen", () => {
  const g = { x: 2000, y: 100, w: 1200, h: 800 };
  const r = clampToScreens(g, [left]);
  assert.equal(screenFor(r, [left]), 0);
  assert.ok(r.x >= 0 && r.x + r.w <= 1920 && r.y + r.h <= 1040);
});

test("oversized or garbage geometry is made usable", () => {
  const r = clampToScreens({ x: -100, y: -100, w: 5000, h: 5000 }, [left]);
  assert.deepEqual(r, { x: 0, y: 0, w: 1920, h: 1040 });
  const g = clampToScreens({ x: NaN, y: Infinity, w: 10, h: 10 }, [left]);
  assert.ok(g.w >= 480 && g.h >= 360);
  assert.equal(suggestPlacement({ x: 100, y: 100, w: 1400, h: 900 }, [left, right]).x >= 1920, true);
});

// ---------- storage ----------

test("stored data falls back safely when corrupt or tampered", () => {
  assert.deepEqual(readStored("not json", MapState, MapState.parse({})), MapState.parse({}));
  assert.equal(readStored(null, WorkspacesState, WorkspacesState.parse({})).list[0]!.id, "default");
  const bad = JSON.stringify({ runs: [{ id: "x" }] });
  assert.deepEqual(readStored(bad, ViceLabState, ViceLabState.parse({})).runs, []);
  const plans = JSON.stringify({ plans: [{ ...createPlan(), schema: 9 }] });
  assert.deepEqual(readStored(plans, HeistState, HeistState.parse({})).plans, []);
});

test("ids are random and url-safe", () => {
  const a = uid();
  assert.match(a, /^[a-z0-9]{12}$/);
  assert.notEqual(a, uid());
});

test("every roadmap item is gated", () => {
  assert.ok(ROADMAP.length >= 12);
  assert.ok(ROADMAP.every((r) => r.gates.length > 0));
});
