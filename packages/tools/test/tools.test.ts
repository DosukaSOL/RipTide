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
    map: "schematic-v1",
    publisher: "Tester",
    provenance: "official",
    records: [
      { id: "a", title: "Pier", category: "activities", x: 100, y: 200 },
      { id: "b", title: "Shop", category: "businesses", x: 300, y: 400, tags: ["food"] },
      { id: "a", title: "Dup", category: "missions", x: 1, y: 1 },
    ],
    ...over,
  });

test("map packs are downgraded to community, unapproved, de-duplicated", () => {
  const { pack: p, warnings } = importMapPack(pack(), []);
  assert.equal(p.claimed, "official");
  assert.equal(p.provenance, "community");
  assert.equal(p.approved, false);
  assert.equal(p.records.length, 2);
  assert.ok(p.records.every((r) => r.provenance === "community" && r.id.startsWith("test-pack:")));
  assert.equal(warnings.length, 2);
});

test("map pack validation and versioning", () => {
  assert.throws(() => importMapPack("nope", []));
  assert.throws(() => importMapPack(pack({ format: "other" }), []));
  assert.throws(() => importMapPack(pack({ records: [{ id: "x", title: "Far", category: "missions", x: 5000, y: 1 }] }), []));
  assert.throws(() => importMapPack(pack({ map: "gta6-real" }), []));
  const { pack: p } = importMapPack(pack(), []);
  assert.throws(() => importMapPack(pack(), [p]), /already installed/);
  assert.equal(importMapPack(pack({ version: "1.1.0" }), [p]).pack.version, "1.1.0");
  assert.ok(compareVersions("1.10.0", "1.9.9") > 0);
});

test("filters, search and counts only show real data", () => {
  const { pack: p } = importMapPack(pack(), []);
  assert.equal(categoryCounts([p]).activities, null, "unapproved packs don't count");
  p.approved = true;
  const counts = categoryCounts([p]);
  assert.equal(counts.activities, 1);
  assert.equal(counts.missions, null);
  const me = createMarker(500, 500, "Hideout");
  me.notes = "food truck nearby";
  assert.equal(visibleRecords([p], [me], EMPTY_FILTER).length, 3);
  assert.equal(visibleRecords([p], [me], { ...EMPTY_FILTER, categories: ["businesses"] }).length, 1);
  assert.equal(visibleRecords([p], [me], { ...EMPTY_FILTER, notesOnly: true }).length, 1);
  assert.equal(visibleRecords([p], [me], { ...EMPTY_FILTER, query: "food" }).length, 2);
  me.saved = true;
  assert.equal(visibleRecords([p], [me], { ...EMPTY_FILTER, savedOnly: true })[0]!.title, "Hideout");
});

test("markers clamp to the map and zoom keeps the cursor point", () => {
  const m = createMarker(-50, 2000);
  assert.equal(m.x, 0);
  assert.equal(m.y, 1000);
  const v = zoomAt(DEFAULT_VIEW, 2, 0.5, 0.5, 16 / 9);
  assert.equal(v.k, 2);
  assert.equal(v.x, 500);
  const edge = zoomAt(DEFAULT_VIEW, 2, 1, 0.5, 16 / 9);
  assert.ok(edge.x > 500);
  assert.deepEqual(clampView({ x: NaN, y: -5, k: 99 }), { x: 500, y: 0, k: 8 });
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
