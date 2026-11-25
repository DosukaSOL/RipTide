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
  // Two runs are two measurements: only the first is imported, never both joined together.
  assert.equal(r.frametimesMs.length, 50);
  assert.ok(r.notes.some((n) => /2 runs/.test(n)));
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

/* ---------- audit fixes: merging edits from two windows ---------- */
import { merge3, jsonEqual } from "../src/merge";
import { applyRestore, checksum, createBackup, planRestore, BACKUP_FORMAT } from "../src/backup";
import { HeistState as HeistStateSchema, MapState as MapStateSchema, Settings as SettingsSchema, KEYS as K, parseStored } from "../src/storage";

test("merge: edits to different fields in two windows both survive", () => {
  const base = { a: 1, b: { c: 1, d: 1 }, list: ["x"] };
  const local = { a: 2, b: { c: 1, d: 1 }, list: ["x", "y"] };
  const remote = { a: 1, b: { c: 1, d: 5 }, list: ["x", "z"] };
  assert.deepEqual(merge3(base, local, remote), { a: 2, b: { c: 1, d: 5 }, list: ["x", "z", "y"] });
});

test("merge: records with ids merge record by record", () => {
  const base = { plans: [{ id: "p1", name: "A", notes: "" }, { id: "p2", name: "B", notes: "" }] };
  const local = { plans: [{ id: "p1", name: "A renamed", notes: "" }, { id: "p2", name: "B", notes: "" }, { id: "p3", name: "New here", notes: "" }] };
  const remote = { plans: [{ id: "p1", name: "A", notes: "theirs" }, { id: "p4", name: "New there", notes: "" }] }; // p2 deleted there
  const out = merge3(base, local, remote);
  assert.deepEqual(out.plans.map((p) => p.id), ["p1", "p4", "p3"]);
  assert.deepEqual(out.plans[0], { id: "p1", name: "A renamed", notes: "theirs" });
});

test("merge: a deleted record stays deleted unless the other window edited it", () => {
  const base = { l: [{ id: "a", v: 1 }] };
  assert.deepEqual(merge3(base, { l: [] }, { l: [{ id: "a", v: 1 }] }), { l: [] });
  assert.deepEqual(merge3(base, { l: [] }, { l: [{ id: "a", v: 2 }] }), { l: [{ id: "a", v: 2 }] });
});

test("merge: sets of ids apply additions and removals from both windows", () => {
  assert.deepEqual(merge3(["a", "b"], ["a", "c"], ["a", "b", "d"]), ["a", "d", "c"]);
});

test("merge: the same field changed in both windows takes this window's edit, deterministically", () => {
  assert.deepEqual(merge3({ name: "x" }, { name: "mine" }, { name: "theirs" }), { name: "mine" });
  assert.deepEqual(merge3({ name: "x" }, { name: "theirs" }, { name: "mine" }), { name: "theirs" });
});

test("merge: 200 interleaved edits from two windows keep every unrelated change", () => {
  // Simulates two windows each saving a burst of edits while the other's storage event is in flight.
  let stored = { plans: [] as { id: string; done: string[]; name: string }[] };
  let baseA = structuredClone(stored);
  let baseB = structuredClone(stored);
  let a = structuredClone(stored);
  let b = structuredClone(stored);
  const save = (win: "A" | "B") => {
    const [mine, base] = win === "A" ? [a, baseA] : [b, baseB];
    const merged = merge3(base, mine, stored);
    stored = merged;
    if (win === "A") { a = structuredClone(merged); baseA = structuredClone(merged); } else { b = structuredClone(merged); baseB = structuredClone(merged); }
  };
  for (let i = 0; i < 100; i++) {
    a.plans.push({ id: `a${i}`, done: [], name: `A ${i}` });
    if (i % 3 === 0 && b.plans.length) b.plans[0]!.done.push(`b-step-${i}`);
    b.plans.push({ id: `b${i}`, done: [], name: `B ${i}` });
    if (i % 2 === 0) save("A");
    if (i % 5 === 0) save("B");
  }
  save("A");
  save("B");
  save("A");
  const ids = new Set(stored.plans.map((p) => p.id));
  for (let i = 0; i < 100; i++) {
    assert.ok(ids.has(`a${i}`), `a${i}`);
    assert.ok(ids.has(`b${i}`), `b${i}`);
  }
  assert.ok(jsonEqual(a, stored) && jsonEqual(b, stored) || jsonEqual(a, stored));
});

test("merge results still pass the tools' schemas", () => {
  const base = HeistStateSchema.parse({});
  const local = HeistStateSchema.parse({ activeId: "x" });
  const remote = HeistStateSchema.parse({ plans: [] });
  assert.equal(HeistStateSchema.safeParse(merge3(base, local, remote)).success, true);
});

test("parseStored tells empty, valid and damaged apart", () => {
  assert.deepEqual(parseStored(null, SettingsSchema), { status: "empty" });
  assert.equal(parseStored('{"motion":"full"}', SettingsSchema).status, "ok");
  assert.deepEqual(parseStored("{cut", SettingsSchema), { status: "invalid" });
  assert.deepEqual(parseStored('{"motion":"sideways"}', SettingsSchema), { status: "invalid" });
});

/* ---------- audit fixes: backups ---------- */
const parts = [
  { key: K.settings, label: "Settings", schema: SettingsSchema },
  { key: K.heist, label: "Heist", schema: HeistStateSchema },
  { key: K.map, label: "Map", schema: MapStateSchema },
];
const memStore = (init: Record<string, string> = {}, failOn?: string) => {
  const data = new Map(Object.entries(init));
  return {
    data,
    get: (k: string) => data.get(k) ?? null,
    set: (k: string, v: string) => {
      if (k === failOn) throw new Error("QuotaExceededError");
      data.set(k, v);
    },
    remove: (k: string) => void data.delete(k),
  };
};

test("backup round trip restores exactly what was exported", () => {
  const src = memStore({ [K.settings]: '{"motion":"reduced","splash":false}', [K.heist]: JSON.stringify(HeistStateSchema.parse({ activeId: "a" })) });
  const { file } = createBackup(parts, src);
  const dst = memStore();
  const plan = planRestore(JSON.stringify(file), parts, dst);
  assert.equal(plan.ok, true);
  assert.ok(plan.ok && applyRestore(plan, dst).ok);
  assert.equal(dst.get(K.settings), src.get(K.settings));
  assert.equal(dst.get(K.heist), src.get(K.heist));
});

test("a damaged or invalid backup changes nothing", () => {
  const dst = memStore({ [K.settings]: '{"motion":"full","splash":true}' });
  const before = new Map(dst.data);
  for (const text of ["not json", "{}", JSON.stringify({ format: "other" }), JSON.stringify({ format: BACKUP_FORMAT, version: 99, parts: {} })]) {
    assert.equal(planRestore(text, parts, dst).ok, false, text);
  }
  // One valid part, one invalid part: all or nothing.
  const { file } = createBackup(parts, memStore({ [K.settings]: '{"motion":"reduced","splash":true}', [K.heist]: '{"plans":[]}' }));
  (file.parts[K.heist]!.data as Record<string, unknown>).plans = "nope";
  file.parts[K.heist]!.checksum = checksum(JSON.stringify(file.parts[K.heist]!.data));
  const plan = planRestore(JSON.stringify(file), parts, dst);
  assert.equal(plan.ok, false);
  assert.match(!plan.ok ? plan.error : "", /Heist/);
  // A part changed without updating its checksum.
  const { file: f2 } = createBackup(parts, memStore({ [K.settings]: '{"motion":"reduced","splash":true}' }));
  (f2.parts[K.settings]!.data as Record<string, unknown>).motion = "full";
  assert.equal(planRestore(JSON.stringify(f2), parts, dst).ok, false);
  assert.deepEqual(dst.data, before);
});

test("if storage fills up part-way through a restore, everything is put back", () => {
  const before = { [K.settings]: '{"motion":"full","splash":true}', [K.heist]: '{"plans":[],"activeId":"old"}' };
  const dst = memStore(before, K.map);
  const { file } = createBackup(parts, memStore({ [K.settings]: '{"motion":"reduced","splash":false}', [K.heist]: '{"plans":[],"activeId":"new"}', [K.map]: JSON.stringify(MapStateSchema.parse({})) }));
  const plan = planRestore(JSON.stringify(file), parts, dst);
  assert.ok(plan.ok);
  const r = applyRestore(plan as never, dst);
  assert.equal(r.ok, false);
  assert.deepEqual(Object.fromEntries(dst.data), before);
});

test("version 1 backups from earlier previews still restore", () => {
  const v1 = { format: BACKUP_FORMAT, version: 1, exportedAt: "2026-11-20T00:00:00Z", [K.settings]: { motion: "reduced", splash: true }, "riptide.unknown.v9": {} };
  const dst = memStore();
  const plan = planRestore(JSON.stringify(v1), parts, dst);
  assert.ok(plan.ok);
  assert.deepEqual(plan.ok && plan.unknown, ["riptide.unknown.v9"]);
  assert.ok(plan.ok && applyRestore(plan, dst).ok);
  assert.deepEqual(JSON.parse(dst.get(K.settings)!), { motion: "reduced", splash: true });
});

test("export leaves out damaged parts and says so", () => {
  const { file, skipped } = createBackup(parts, memStore({ [K.settings]: "{cut", [K.heist]: '{"plans":[]}' }));
  assert.deepEqual(skipped.map((x) => x.label), ["Settings"]);
  assert.equal(file.quarantine?.[K.settings]?.raw, "{cut", "kept for support, outside the restorable parts");
  assert.ok(file.parts[K.heist] && !file.parts[K.settings]);
});

/* ---------- audit fixes: ViceLab measurement integrity ---------- */
const pmRows = (rows: [string, string, string, number, number?][]) =>
  ["Application,ProcessID,SwapChainAddress,MsBetweenPresents,MsBetweenDisplayChange", ...rows.map(([a, p, s, ms, d]) => `${a},${p},${s},${ms},${d ?? ms}`)].join("\n");

test("presented and displayed frames are kept apart", () => {
  // 120 presented FPS, but frame generation doubles what reaches the screen.
  const rows: [string, string, string, number, number][] = Array.from({ length: 600 }, () => ["Game.exe", "100", "0xA", 8.333, 4.1665]);
  const p = parseCapture(pmRows(rows));
  assert.equal(p.metric, "presented");
  assert.equal(computeStats(p.frametimesMs).avgFps, 120);
  assert.ok(p.displayedMs);
  assert.equal(computeStats(p.displayedMs!).avgFps, 240);
});

test("missing displayed times are never filled in from presented ones", () => {
  const csv = ["MsBetweenPresents", ...Array.from({ length: 100 }, () => "16.667")].join("\n");
  const p = parseCapture(csv);
  assert.equal(p.metric, "presented");
  assert.equal(p.displayedMs, undefined);
  const only = parseCapture(["MsBetweenDisplayChange", ...Array.from({ length: 100 }, () => "16.667")].join("\n"));
  assert.equal(only.metric, "displayed");
  assert.ok(only.notes.some((n) => /displayed/.test(n)));
});

test("a second process or swap chain doesn't inflate or halve the frame rate", () => {
  // The game at 60 FPS interleaved with an overlay at 60 FPS: mixing them would read as ~120 FPS.
  const rows: [string, string, string, number][] = [];
  for (let i = 0; i < 600; i++) {
    rows.push(["Game.exe", "100", "0xA", 16.667]);
    if (i % 2 === 0) rows.push(["Overlay.exe", "200", "0xB", 16.667]);
  }
  const p = parseCapture(pmRows(rows));
  assert.equal(p.frametimesMs.length, 600);
  assert.equal(p.filtered, 300);
  assert.equal(computeStats(p.frametimesMs).avgFps, 60);
  assert.ok(p.notes.some((n) => /2 processes or swap chains/.test(n) && /Game\.exe/.test(n)));
});

test("frames presented but never displayed are counted, not shown as display time", () => {
  const rows: [string, string, string, number, number][] = Array.from({ length: 200 }, (_, i) => ["G", "1", "0x1", 10, i % 10 === 0 ? 0 : 10]);
  const p = parseCapture(pmRows(rows));
  assert.equal(p.displayedMs!.length, 180);
  assert.ok(p.notes.some((n) => /20 presented frames never reached the screen/.test(n)));
});

test("CapFrameX files with several runs aren't joined into one", () => {
  const run = (ms: number) => ({ CaptureData: { MsBetweenPresents: Array.from({ length: 300 }, () => ms) } });
  const p = parseCapture(JSON.stringify({ Runs: [run(10), run(20)] }), "x.json");
  assert.equal(p.frametimesMs.length, 300);
  assert.equal(computeStats(p.frametimesMs).avgFps, 100);
  assert.ok(p.notes.some((n) => /2 runs/.test(n)));
});

test("decimal commas in ';' separated files are read", () => {
  const p = parseCapture(["MsBetweenPresents;Other", ...Array.from({ length: 100 }, () => "16,667;x")].join("\n"));
  assert.equal(computeStats(p.frametimesMs).avgFps, 60);
});

test("recommendations never compare runs from different hardware, resolutions or scenes", () => {
  const r = (id: string, preset: string, avg: number, low: number, ctx: Partial<{ hardwareId: string; scene: string; resolution: string }>) => ({ id, game: "gtav", preset, stats: { avgFps: avg, low1Fps: low }, ...ctx });
  const pc1 = { hardwareId: "pc1", scene: "Downtown", resolution: "2560x1440" };
  // A 1080p run on another PC looks great, but must not be compared with the 1440p runs.
  const mixed = [r("a", "high", 70, 55, pc1), r("b", "low", 120, 90, { hardwareId: "pc2", scene: "Downtown", resolution: "1920x1080" })];
  assert.equal(recommend(mixed, "gtav", "balanced", 60), null, "no two comparable presets");
  const scenes = [r("a", "high", 70, 55, pc1), r("b", "ultra", 90, 70, { ...pc1, scene: "Countryside" })];
  assert.equal(recommend(scenes, "gtav", "balanced", 60), null);
  const res = [r("a", "high", 70, 55, pc1), r("b", "ultra", 90, 70, { ...pc1, resolution: "1920x1080" })];
  assert.equal(recommend(res, "gtav", "balanced", 60), null);
  // Comparable runs, measured twice each: a confident pick, with the outsider excluded.
  const good = [r("a1", "high", 75, 58, pc1), r("a2", "high", 74, 57, pc1), r("u1", "ultra", 58, 40, pc1), r("u2", "ultra", 57, 41, pc1), r("x", "ultra", 200, 150, { hardwareId: "pc9", scene: "Downtown", resolution: "1920x1080" })];
  const rec = recommend(good, "gtav", "balanced", 60)!;
  assert.equal(rec.run.preset, "high");
  assert.equal(rec.confidence, "ok");
  assert.equal(rec.excluded, 1);
  assert.ok(!rec.compared.includes("x"));
});

test("recommendations without hardware or scene, or with single runs, say they're low confidence", () => {
  const rec = recommend([{ id: "a", game: "g", preset: "low", stats: { avgFps: 100, low1Fps: 80 } }, { id: "b", game: "g", preset: "high", stats: { avgFps: 70, low1Fps: 50 } }], "g", "balanced", 60)!;
  assert.equal(rec.confidence, "low");
  assert.equal(rec.caveats.length, 3);
});

/* ---------- durable saves: backups only contain what restores ---------- */

test("export skips parts that wouldn't restore, and says why", () => {
  const { file, skipped } = createBackup(parts, memStore({ [K.settings]: '{"motion":"sideways"}', [K.heist]: '{"plans":[]}' }));
  assert.ok(!file.parts[K.settings]);
  assert.match(skipped[0]!.reason, /doesn't match/);
  // The quarantine section is never restored.
  const plan = planRestore(JSON.stringify(file), parts, memStore());
  assert.ok(plan.ok && plan.items.every((i) => i.key !== K.settings));
});

test("every backup RipTide exports restores, and the restore reproduces it exactly", () => {
  const samples: Record<string, string>[] = [
    {},
    { [K.settings]: JSON.stringify(SettingsSchema.parse({})) },
    { [K.settings]: '{"motion":"reduced","splash":false}', [K.heist]: JSON.stringify(HeistStateSchema.parse({ activeId: "x" })), [K.map]: JSON.stringify(MapStateSchema.parse({})) },
    { [K.heist]: JSON.stringify({ plans: [{ schema: 1, id: "p1", name: "Ünïcödé \u2028 \"quotes\" <b>", description: "", createdAt: 1, updatedAt: 2, roles: [], phases: [], notes: "x".repeat(5000) }], activeId: "p1" }) },
  ];
  for (const sample of samples) {
    const src = memStore(sample);
    const { file, skipped } = createBackup(parts, src);
    assert.deepEqual(skipped, []);
    const dst = memStore();
    const plan = planRestore(JSON.stringify(file), parts, dst);
    if (!Object.keys(sample).length) {
      assert.equal(plan.ok, false, "an empty backup has nothing to restore");
      continue;
    }
    assert.ok(plan.ok, JSON.stringify(!plan.ok && plan.error));
    assert.ok(plan.ok && applyRestore(plan, dst).ok);
    for (const [k, v] of Object.entries(sample)) assert.deepEqual(JSON.parse(dst.get(k)!), JSON.parse(v), k);
  }
});

test("restore uses a durable commit when the store has one, and reports its failure", () => {
  const { file } = createBackup(parts, memStore({ [K.settings]: '{"motion":"reduced","splash":false}', [K.heist]: '{"plans":[]}' }));
  const dst = memStore();
  const plan = planRestore(JSON.stringify(file), parts, dst);
  assert.ok(plan.ok);
  const calls: unknown[] = [];
  const failing = { ...dst, commit: (entries: unknown) => (calls.push(entries), { ok: false as const, error: "The disk is full" }) };
  assert.deepEqual(applyRestore(plan as never, failing), { ok: false, error: "The disk is full" });
  assert.equal(calls.length, 1);
  assert.equal(dst.data.size, 0, "nothing written outside the commit");
  const working = { ...dst, commit: () => ({ ok: true as const }) };
  assert.deepEqual(applyRestore(plan as never, working), { ok: true, restored: 2 });
});

test("a store that silently drops writes is caught and rolled back", () => {
  const before = { [K.settings]: '{"motion":"full","splash":true}' };
  const dst = memStore(before);
  const lossy = { ...dst, set: (k: string, v: string) => { if (k !== K.heist) dst.set(k, v); } }; // heist never sticks
  const { file } = createBackup(parts, memStore({ [K.settings]: '{"motion":"reduced","splash":false}', [K.heist]: '{"plans":[]}' }));
  const plan = planRestore(JSON.stringify(file), parts, dst);
  assert.ok(plan.ok);
  assert.equal(applyRestore(plan as never, lossy).ok, false);
  assert.deepEqual(Object.fromEntries(dst.data), before);
});

/* ---------- map backgrounds ---------- */
import { availableBasemaps, BASEMAPS, gridLabel, gridLines, pickBasemap } from "../src/basemap";

test("the map art is only drawn when it's chosen, built in and loaded; otherwise the grid", () => {
  assert.equal(pickBasemap("official", { artBuilt: true, tilesLoaded: true }).id, "official");
  assert.equal(pickBasemap("official", { artBuilt: false, tilesLoaded: true }).id, "schematic");
  assert.equal(pickBasemap("official", { artBuilt: true, tilesLoaded: false }).id, "schematic");
  assert.equal(pickBasemap("schematic", { artBuilt: true, tilesLoaded: true }).id, "schematic");
  assert.deepEqual(availableBasemaps(false).map((b) => b.id), ["custom", "schematic"]);
  assert.deepEqual(availableBasemaps(true).map((b) => b.id), ["official", "custom", "schematic"]);
  // Your own image is used once it's loaded; until then (or after removing it) the art or the grid.
  assert.equal(pickBasemap("custom", { artBuilt: true, tilesLoaded: true, customLoaded: true }).id, "custom");
  assert.equal(pickBasemap("custom", { artBuilt: true, tilesLoaded: true, customLoaded: false }).id, "official");
  assert.equal(pickBasemap("custom", { artBuilt: false, tilesLoaded: false, customLoaded: false }).id, "schematic");
  assert.equal(BASEMAPS.custom.attribution, null);
  // The grid is RipTide's own and credits nobody else.
  assert.equal(BASEMAPS.official.status, "bundled");
  assert.equal(BASEMAPS.schematic.attribution, null);
  assert.equal(BASEMAPS.schematic.tiles, false);
});

test("schematic grid lines stay readable at every zoom and inside the map", () => {
  for (const z of [-0.5, 0, 1, 2, 3, 4, 5.5]) {
    const { step, lines } = gridLines({ x: -3100, y: 1000, z }, 1600, 900);
    assert.ok(step * (2 ** z / 32) >= 56 || step === 8000, `lines ${step} m apart at zoom ${z}`);
    assert.ok(lines.length > 0 && lines.length <= 400);
    assert.ok(lines.every((l) => Math.abs(l.at) <= 16384 && l.at % step === 0));
    assert.ok(lines.some((l) => l.major) || step >= 4000);
  }
  assert.equal(gridLabel(0), "0");
  assert.equal(gridLabel(-2000), "-2 km");
  assert.equal(gridLabel(500), "500 m");
});

test("settings from before map backgrounds existed still load, with the art as before", () => {
  assert.equal(SettingsSchema.parse({ motion: "reduced", splash: false }).basemap, "official");
  assert.equal(SettingsSchema.safeParse({ basemap: "satellite" }).success, false);
});

/* ---------- licences for the built app ---------- */
test("every bundled package's licence is checked and shipped", async () => {
  const { bundledPackages, collect, ALLOWED } = await import("../../../scripts/licenses.mjs");
  assert.deepEqual(bundledPackages(["node_modules/react/index.js", "node_modules/@scope/pkg/a.js", "node_modules/react/cjs/x.js", "apps/studio/src/main.tsx"]), ["node_modules/@scope/pkg", "node_modules/react"]);
  const { packages, problems } = collect(["node_modules/react/index.js", "node_modules/zod/index.js"]);
  assert.deepEqual(problems, []);
  assert.ok(packages.every((p) => ALLOWED.has(p.license) && p.text.length > 100));
  assert.ok(!ALLOWED.has("GPL-3.0") && !ALLOWED.has("AGPL-3.0"));
});

/* ---------- Today: routes and suggestions ---------- */
import { dist, formatDistance, orderStops, pathLength } from "../src/routes";
import { createObjective, debrief, exportRoute, JourneyState, lastFinishedPlace, optimiseRoute, placeRef, suggest, typeForCategory, type Objective } from "../src/journey";

test("route ordering is deterministic, never longer than the input order, and respects anchors", () => {
  // A zig-zag that nearest neighbour + 2-opt straightens into a line.
  const pts = [0, 4, 1, 3, 2].map((k) => ({ x: k * 1000, y: (k % 2) * 10 }));
  const order = orderStops(pts);
  assert.deepEqual(order, orderStops(pts), "same input, same order");
  assert.equal(new Set(order).size, pts.length);
  const len = pathLength(order.map((i) => pts[i]!));
  assert.ok(len <= pathLength(pts));
  assert.ok(Math.abs(len - 4000) < 50, `straight line, got ${len}`);
  // From a start point, the nearest stop comes first.
  assert.equal(orderStops(pts, { start: { x: 4100, y: 0 } })[0], 1);
  // Anchors stay put.
  const anchored = orderStops(pts, { keepFirst: true, keepLast: true });
  assert.equal(anchored[0], 0);
  assert.equal(anchored.at(-1), 4);
  // 2-opt fixes a crossing nearest neighbour leaves behind.
  const square = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
  const sq = orderStops(square).map((i) => square[i]!);
  assert.ok(pathLength(sq) <= 30 + 1e-9);
  assert.deepEqual(orderStops([]), []);
  assert.equal(dist({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.equal(formatDistance(843), "840 m");
  assert.equal(formatDistance(3420), "3.4 km");
});

const goal = (o: Partial<Objective> & { title: string }, t: number): Objective => ({ ...createObjective({ profileId: "main", ...o }, t), ...o });

test("suggestions only use the player's own open goals, fit the time, and say why", () => {
  const a = goal({ title: "Garage A", type: "vehicle", priority: "high", place: placeRef({ id: "P1", title: "Garage A", x: 0, y: 0 }) }, 1);
  const b = goal({ title: "Photo spot", type: "photo", estimateMin: 25, place: placeRef({ id: "P2", title: "Pier", x: 5000, y: 0 }) }, 2);
  const c = goal({ title: "Near A", type: "discover", place: placeRef({ id: "P3", title: "Diner", x: 200, y: 0 }) }, 3);
  const done = goal({ title: "Old", status: "done", completedAt: 10, place: placeRef({ id: "P4", title: "Bar", x: 100, y: 0 }) }, 4);
  const other = goal({ title: "Other run", profileId: "second" }, 5);
  const plan = suggest([a, b, c, done, other], { profileId: "main", budgetMin: 30, focus: ["discover"] });
  const ids = plan.picks.map((p) => p.objective.title);
  assert.ok(!ids.includes("Old") && !ids.includes("Other run"));
  assert.ok(plan.totalMin <= 30);
  assert.deepEqual(new Set(ids), new Set(["Garage A", "Near A"]), "the 25-minute photo doesn't fit after the higher-value goals");
  assert.equal(plan.leftOut, 1);
  const ga = plan.picks.find((p) => p.objective.title === "Garage A")!;
  assert.ok(ga.reasons.includes("High priority"));
  assert.equal(ga.minutesFrom, "rough");
  assert.ok(plan.picks.find((p) => p.objective.title === "Near A")!.reasons.some((r) => /chose discover/.test(r)));
  assert.ok(plan.picks.some((p) => p.reasons.some((r) => /straight line/.test(r))));
  // Deterministic.
  assert.deepEqual(suggest([a, b, c], { profileId: "main", budgetMin: 30 }).picks.map((p) => p.objective.id), suggest([c, b, a], { profileId: "main", budgetMin: 30 }).picks.map((p) => p.objective.id));
  // A goal longer than the whole budget is still offered on its own rather than nothing.
  assert.equal(suggest([b], { profileId: "main", budgetMin: 15 }).picks.length, 1);
  assert.equal(suggest([], { profileId: "main", budgetMin: 60 }).picks.length, 0);
  assert.deepEqual(lastFinishedPlace([a, done], "main")?.placeId, "P4");
});

test("debrief counts only what was ticked, and routes export as RipTide JSON with straight-line metres", () => {
  const a = goal({ title: "A", status: "done" }, 1);
  const b = goal({ title: "B" }, 2);
  const d = debrief({ id: "s", profileId: "main", budgetMin: 30, startedAt: 0, endedAt: 45 * 60000, queue: [a.id, b.id], completed: [a.id], notes: "", revision: 0 }, [a, b]);
  assert.deepEqual([d.done.length, d.open.length, d.minutes, d.overBudget], [1, 1, 45, true]);
  const route = { id: "r", profileId: "main", name: "Loop", method: "straight-line" as const, map: "leonida-v1", createdAt: 0, revision: 0, stops: [placeRef({ id: "1", title: "A", x: 0, y: 0 }), placeRef({ id: "2", title: "C", x: 2000, y: 0 }), placeRef({ id: "3", title: "B", x: 1000, y: 0 })] };
  const better = optimiseRoute(route);
  assert.ok(pathLength(better.stops) < pathLength(route.stops));
  const file = JSON.parse(exportRoute(better));
  assert.equal(file.format, "riptide-route");
  assert.equal(file.method, "straight-line");
  assert.equal(file.straightLineMetres, 2000);
  assert.equal(typeForCategory("garages"), "vehicle");
});

test("Today data is validated: bad input is cleaned or refused, and old installs start empty", () => {
  assert.deepEqual(JourneyState.parse(undefined ?? {}).objectives, []);
  const t = createObjective({ title: "  <b>hi</b>\u0007  ", profileId: "main" });
  assert.equal(t.title, "<b>hi</b>", "control characters removed; React renders the rest as text");
  assert.equal(JourneyState.safeParse({ objectives: [{ id: "x", title: "a".repeat(500), createdAt: 1 }] }).success, false);
  assert.equal(JourneyState.safeParse({ routes: [{ id: "r", name: "r", createdAt: 1, method: "road" }] }).success, false, "only straight-line routes exist");
});

test("your own map image: whole-map fit and lining up with places", async () => {
  const { fitAffine, solveAffine, applyAffine, alignError, imageAffine, svgMatrix, MapImage } = await import("../src/basemap");
  const fit = fitAffine(4096, 4096);
  assert.deepEqual(applyAffine(fit, 0, 0), { x: -16384, y: 16384 });
  assert.deepEqual(applyAffine(fit, 4096, 4096), { x: 16384, y: -16384 });
  // A scaled, rotated, shifted image is recovered exactly from three or more places.
  const truth = { a: 3.2, b: 0.4, c: -0.3, d: -3.1, e: -9000, f: 8000 };
  const at = (px: number, py: number) => ({ px, py, x: truth.a * px + truth.c * py + truth.e, y: truth.b * px + truth.d * py + truth.f });
  const pts = [at(100, 120), at(2400, 300), at(900, 2600), at(1800, 1900)];
  const m = solveAffine(pts)!;
  assert.ok(alignError(m, pts) < 1e-6);
  const q = applyAffine(m, 1500, 1500);
  const want = at(1500, 1500);
  assert.ok(Math.hypot(q.x - want.x, q.y - want.y) < 1e-6);
  // Too few, or in a line: no transform.
  assert.equal(solveAffine(pts.slice(0, 2)), null);
  assert.equal(solveAffine([at(0, 0), at(100, 100), at(200, 200)]), null);
  // The image's transform falls back to the whole-map fit without enough places.
  const img = MapImage.parse({ type: "image/png", width: 4096, height: 4096, bytes: 10, addedAt: 1, mode: "points", points: [] });
  assert.deepEqual(imageAffine(img), fit);
  assert.match(svgMatrix(fit), /^matrix\(8 -?0 -?0 8 -16384 -16384\)$/);
  assert.equal(MapImage.safeParse({ type: "image/svg+xml", width: 1, height: 1, bytes: 1, addedAt: 1 }).success, false, "SVG is never accepted");
});

/* ---------- Journal and Garage ---------- */
import { createEntry, garageTotals, GarageState, JournalState, journalMarkdown, newProperty, newVehicle, parseAmount, purgeTrash, restoreEntry, searchEntries, tagCounts, trashEntry } from "../src/ledger";
import { Plan as PlanSchema } from "../src/heist";

test("journal: search by words and #tags, deleted entries can be restored for 30 days", () => {
  const s = JournalState.parse({});
  const a = createEntry({ profileId: "main", title: "Marina run", body: "Boat was gone", tags: ["Heist", "boats"] }, 1);
  const b = createEntry({ profileId: "main", body: "Found the diner", tags: ["food"], place: placeRef({ id: "P1", title: "Seven Seas Seafood", x: 1, y: 2 }) }, 2);
  s.entries.push(a, b);
  assert.deepEqual(a.tags, ["heist", "boats"], "tags are lower-case");
  assert.deepEqual(searchEntries(s.entries, "#heist").map((e) => e.id), [a.id]);
  assert.deepEqual(searchEntries(s.entries, "seafood").map((e) => e.id), [b.id], "matches the place name");
  assert.deepEqual(searchEntries(s.entries, "boat gone").map((e) => e.id), [a.id]);
  assert.equal(searchEntries(s.entries, "").length, 2);
  assert.deepEqual(tagCounts(s.entries)[0], ["boats", 1]);
  trashEntry(s, a.id, 1000);
  assert.equal(s.entries.length, 1);
  restoreEntry(s, a.id);
  assert.equal(s.entries.length, 2);
  assert.equal(s.trash.length, 0);
  trashEntry(s, b.id, 0);
  purgeTrash(s, 31 * 86400000);
  assert.equal(s.trash.length, 0, "gone after 30 days");
  assert.match(journalMarkdown([a]), /## 1970-01-01 · Marina run\n\nBoat was gone\n\n#heist #boats/);
  assert.equal(JournalState.safeParse({ entries: [{ id: "x", createdAt: 1, body: "x".repeat(5000) }] }).success, false);
});

test("garage: totals come only from the player's own numbers; amounts parse like people type them", () => {
  const g = GarageState.parse({});
  g.vehicles.push(newVehicle({ name: "Coupe", ownership: "owned", profileId: "main" }), newVehicle({ name: "Bike", ownership: "wanted", price: 50000, profileId: "main" }), newVehicle({ name: "Boat", ownership: "wanted", profileId: "main" }), newVehicle({ name: "Other run", ownership: "owned", profileId: "second" }));
  g.properties.push(newProperty({ name: "Garage", kind: "garage", owned: true, spaces: 10, profileId: "main" }));
  const t = garageTotals(g, "main");
  assert.deepEqual([t.owned, t.wanted, t.wantedCost, t.unpriced, t.spaces, t.spacesLeft], [1, 2, 50000, 1, 10, 9]);
  assert.equal(garageTotals(GarageState.parse({}), "main").spacesLeft, undefined, "no spaces entered, no count");
  assert.equal(parseAmount("1,250,000"), 1250000);
  assert.equal(parseAmount("$1.5m"), 1500000);
  assert.equal(parseAmount("250k"), 250000);
  assert.equal(parseAmount("lots"), null);
  assert.equal(parseAmount("-5"), null);
});

test("heist plans without a debrief still load; a debrief is checked", () => {
  const base = { schema: 1, id: "p1", name: "Job", description: "", createdAt: 1, updatedAt: 1, roles: [], phases: [], notes: "" };
  assert.ok(PlanSchema.safeParse(base).success);
  assert.ok(PlanSchema.safeParse({ ...base, debrief: { outcome: "partial", notes: "ok", at: 2 } }).success);
  assert.equal(PlanSchema.safeParse({ ...base, debrief: { outcome: "won-a-million", at: 2 } }).success, false);
});
