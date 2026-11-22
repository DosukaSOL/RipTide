// Captures the real RipTide Tools app for the trailer, in a realistic state.
// Build first (npm run build). Writes PNGs plus shots.json (element rectangles) to $OUT.
// Usage: node scripts/video/capture-tools.mjs [--chrome /path/to/chrome]
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const ROOT = resolve(new URL("../../", import.meta.url).pathname);
const dist = join(ROOT, "apps/studio/dist");
const OUT = resolve(process.env.OUT ?? join(ROOT, ".video/capture"));
await mkdir(OUT, { recursive: true });
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".ttf": "font/ttf", ".otf": "font/otf" };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  const f = join(dist, p || "index.html");
  if (!f.startsWith(dist + sep) && f !== dist) return res.writeHead(403).end();
  try {
    res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }).end(await readFile(f));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const ci = process.argv.indexOf("--chrome");
const browser = await chromium.launch(ci > 0 ? { executablePath: process.argv[ci + 1] } : {});
const VW = 1600;
const VH = 900;
const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2, reducedMotion: "reduce" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const shots = {};
const go = async (hash, fresh = false) => {
  await page.goto(`${base}/?shell=tools&splash=0#/${hash}`);
  if (fresh) await page.reload();
  await page.waitForSelector(`section[data-module]:not([hidden])`);
  await page.waitForTimeout(400);
};

/** Rectangles (CSS px in the 1600×900 viewport) for selectors or panel headings. */
async function rects(spec) {
  return page.evaluate((spec) => {
    const out = {};
    const vis = (el) => el && el.getClientRects().length && !el.closest("[hidden]");
    for (const [k, q] of Object.entries(spec)) {
      let el;
      if (q.startsWith("h:")) {
        const [text, sel] = q.slice(2).split("|");
        const h = [...document.querySelectorAll("h1,h2,h3,.rt-kicker")].find((x) => vis(x) && x.textContent.trim() === text);
        el = h?.closest(sel || ".rt-panel");
      } else el = [...document.querySelectorAll(q)].find(vis);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      out[k] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }
    return out;
  }, spec);
}
async function shoot(name, spec = {}, p = page) {
  await p.waitForTimeout(500);
  await p.screenshot({ path: join(OUT, `${name}.png`) });
  shots[name] = p === page ? await rects(spec) : {};
  console.log("captured", name, Object.keys(shots[name]).join(" "));
}

/* ---------- seed data ---------- */
await go("home");
const now = Date.UTC(2026, 10, 22, 18, 0);
await page.evaluate((now) => {
  const id = (s) => s;
  const plan = {
    schema: 1,
    id: id("plan-gellhorn"),
    name: "Port Gellhorn job",
    description: "Four-person crew. In through the docks, out by boat before sunrise.",
    createdAt: now - 86400000,
    updatedAt: now,
    roles: [
      { id: "r1", name: "Leader", assignee: "Dosuka" },
      { id: "r2", name: "Driver", assignee: "Nova" },
      { id: "r3", name: "Hacker", assignee: "Kade" },
      { id: "r4", name: "Lookout", assignee: "" },
    ],
    phases: [
      { id: "p1", title: "Briefing", summary: "Agree on the approach and the exit route", status: "done", checklist: [{ id: "c1", text: "Pick the entry point", done: true }, { id: "c2", text: "Agree on comms", done: true }] },
      { id: "p2", title: "Preparation", summary: "Boat at the marina, getaway car at the docks", status: "in-progress", checklist: [{ id: "c3", text: "Stash the boat", done: true }, { id: "c4", text: "Scout the guards", done: false }] },
      { id: "p3", title: "Execution", summary: "Follow the plan, keep comms short", status: "not-started", checklist: [] },
      { id: "p4", title: "Debrief", summary: "What worked, what to change next time", status: "not-started", checklist: [] },
    ],
    notes: "Meet at the marina at 9. Kade brings the laptop. If anything goes wrong, regroup at Y Vice City.",
  };
  localStorage.setItem("riptide.heist.v1", JSON.stringify({ plans: [plan], activeId: plan.id }));
}, now);

// Real frame-time captures, imported through the app (PresentMon format).
function capture(fps, jitter, stutterEvery, file) {
  const rows = ["Application,ProcessID,SwapChainAddress,Runtime,SyncInterval,PresentFlags,Dropped,TimeInSeconds,MsBetweenPresents"];
  let t = 0;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 6000; i++) {
    let ms = 1000 / fps + (rnd() - 0.5) * jitter;
    if (i % stutterEvery === 0) ms *= 2.6;
    t += ms / 1000;
    rows.push(`GTA5.exe,4242,0x1,DXGI,0,0,0,${t.toFixed(5)},${ms.toFixed(3)}`);
  }
  return writeFile(file, rows.join("\n"));
}
const runs = [
  ["low", 168, 2.2, 900],
  ["medium", 131, 3.0, 600],
  ["high", 97, 4.2, 320],
];
await go("vicelab");
for (const [preset, fps, jitter, stutter] of runs) {
  const f = join(OUT, `presentmon-${preset}.csv`);
  await capture(fps, jitter, stutter, f);
  await page.getByLabel("Game").selectOption("gtav");
  await page.getByLabel("Graphics preset").selectOption(preset);
  await page.getByRole("button", { name: "Import a capture" }).click();
  await page.locator('input[type="file"]').first().setInputFiles(f);
  await page.locator(".rt-chart svg").waitFor();
  await page.waitForTimeout(300);
}

// Map: a playthrough with some progress, a favourite and one of your own markers.
const places = JSON.parse(await readFile(join(dist, "map/leonida/places.json"), "utf8")).places;
const foundIds = places.filter((_, i) => i % 7 === 0).slice(0, 96).map((p) => `gtadb:${p[0]}`);
await page.evaluate((found) => {
  const st = JSON.parse(localStorage.getItem("riptide.map.v2") || "{}");
  st.profiles = [{ id: "main", name: "Main playthrough", found }, { id: "p2", name: "Second run", found: [] }];
  st.activeProfile = "main";
  st.favorites = ["gtadb:L16", "gtadb:L120"];
  st.markers = [{ id: "me:hideout", title: "Hideout", category: "personal", x: 1420, y: 980, area: "", region: "", kind: "", inspiredBy: "", enterable: false, notes: "Safe spot after the job", tags: ["crew"], provenance: "personal", source: "me", createdAt: 0 }];
  localStorage.setItem("riptide.map.v2", JSON.stringify(st));
}, foundIds);

/* ---------- shots ---------- */
await go("vicelab", true);
await go("heist");
await go("map");
await go("home");
await shoot("home", { nav: ".rt-nav", cards: ".rt-cards", running: "h:Running tools", title: ".rt-title" });

await go("studio/overview");
await shoot("studio", { hero: ".hero", main: ".main" });
await go("studio/economy");
await shoot("economy", { chart: ".panel" });

await go("vicelab");
await shoot("vicelab", { chart: "h:Performance overview", stats: ".rt-stats", form: "h:New benchmark" });
await page.mouse.move(900, 600);
await page.mouse.wheel(0, 600);
await page.waitForTimeout(500);
await shoot("vicelab-stats", { chart: "h:Performance overview", stats: ".rt-stats" });
await page.getByRole("tab", { name: "Recommendations" }).click();
await shoot("recommend", { panel: "[role=tabpanel] .rt-panel" });
await page.getByRole("tab", { name: "Image compare" }).click();
// Two screenshots of the same spot: soft (Low) and sharp (Ultra), cut from the bundled map tiles.
execFileSync("python3", ["-I", "-c", `
import sys
from PIL import Image, ImageFilter
base=sys.argv[1]; out=sys.argv[2]
im=Image.new("RGB",(4*256,3*256))
for r in range(3):
  for c in range(4):
    try: im.paste(Image.open(f"{base}/4/{29+r}-{31+c}.jpg"),(c*256,r*256))
    except FileNotFoundError: pass
im=im.resize((1600,1200),Image.LANCZOS).crop((0,150,1600,1050))
im.save(out+"/compare-ultra.jpg",quality=92)
soft=im.resize((400,225),Image.BILINEAR).resize((1600,900),Image.BILINEAR).filter(ImageFilter.GaussianBlur(1.2))
soft.save(out+"/compare-low.jpg",quality=92)
`, join(dist, "map/leonida"), OUT]);
await page.locator('input[type="file"]').nth(0).setInputFiles(join(OUT, "compare-low.jpg"));
await page.locator('input[type="file"]').nth(0).setInputFiles(join(OUT, "compare-ultra.jpg"));
await page.locator(".rt-compare").waitFor();
await shoot("compare", { viewer: ".rt-compare" });

await go("heist");
await shoot("heist", { roles: "h:Crew roles", timeline: "h:Operation timeline", plan: "h:Port Gellhorn job", notes: "h:SHARED NOTES|.rt-panel" });

await go("map");
await page.getByText(/places shown/).waitFor();
await page.waitForTimeout(600);
await shoot("map", { stage: ".rt-map-stage", discover: "h:Discover", progress: "h:PROGRESS|.rt-pad", cats: "h:CATEGORIES|.rt-pad", details: "h:Place details" });
await page.fill("#rt-map-q", "gas");
await page.waitForTimeout(300);
await shoot("map-search", { search: ".rt-search", results: ".rt-results", stage: ".rt-map-stage" });
await page.fill("#rt-map-q", "");
await page.locator("#rt-map-q").blur();
await page.waitForTimeout(800); // let the app finish saving before editing storage
await page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem("riptide.map.v2"));
  st.view = { x: 1650, y: 1350, z: 3.9 };
  st.selectedId = "gtadb:L16";
  localStorage.setItem("riptide.map.v2", JSON.stringify(st));
});
await go("map", true);
await page.getByText(/places shown/).waitFor();
await page.waitForTimeout(800);
await shoot("map-place", { stage: ".rt-map-stage", details: "h:Place details", actions: ".rt-place-actions", facts: ".rt-place-facts", title: ".rt-place-title" });

// Pop the map out: the second window keeps every filter and the view.
const [popup] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: /Pop out map/ }).click()]);
await popup.setViewportSize({ width: VW, height: VH });
await popup.waitForSelector('section[data-module="map"]');
await popup.getByText(/places shown/).waitFor();
await popup.waitForTimeout(900);
await popup.screenshot({ path: join(OUT, "map-window.png") });
shots["map-window"] = {};
console.log("captured map-window");
await go("workspaces");
await page.waitForTimeout(600);
await shoot("workspaces", { preview: "h:Workspace preview", layout: "h:Layout settings" });
await popup.close();

await writeFile(join(OUT, "shots.json"), JSON.stringify({ viewport: { w: VW, h: VH, dpr: 2 }, shots }, null, 1));
await browser.close();
server.close();
if (errors.length) {
  console.error("page errors:", errors);
  process.exit(1);
}
console.log(`done: ${Object.keys(shots).length} shots in ${OUT}`);
