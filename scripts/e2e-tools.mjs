// End-to-end checks for the RipTide Tools shell and classic Studio.
// Run after `npm run build`:  node scripts/e2e-tools.mjs [--chrome /path/to/chrome] [--shots dir]
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const root = resolve("apps/studio/dist");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ttf": "font/ttf", ".otf": "font/otf" };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  const f = join(root, p || "index.html");
  if (!f.startsWith(root + sep) && f !== root) return res.writeHead(403).end();
  try {
    res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }).end(await readFile(f));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const arg = (n) => {
  const i = process.argv.indexOf(n);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const shots = arg("--shots");
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch(arg("--chrome") ? { executablePath: arg("--chrome") } : {});

let passed = 0;
const failures = [];
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  ✗ ${name}\n    ${String(e.message ?? e).split("\n").slice(0, 4).join("\n    ")}`);
  }
}

async function fresh(viewport = { width: 1920, height: 1080 }, dpr = 1, extra = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, ...extra });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  return { ctx, page, errors };
}
const tools = (hash) => `${base}/?shell=tools&splash=0#/${hash}`;

// A realistic PresentMon capture: steady 120 fps with a few stutters.
const fixture = join(tmpdir(), `riptide-presentmon-${process.pid}.csv`);
{
  const rows = ["Application,ProcessID,SwapChainAddress,Runtime,SyncInterval,PresentFlags,Dropped,TimeInSeconds,MsBetweenPresents"];
  let t = 0;
  for (let i = 0; i < 3600; i++) {
    const ms = i % 400 === 0 ? 33.4 : 8.33 + ((i * 7) % 5) * 0.1;
    t += ms / 1000;
    rows.push(`GTA5.exe,4242,0x1,DXGI,0,0,0,${t.toFixed(5)},${ms.toFixed(3)}`);
  }
  await writeFile(fixture, rows.join("\n"));
}

console.log("\nClassic Studio");
await check("classic Studio is still the default and works", async () => {
  const { ctx, page, errors } = await fresh();
  await page.goto(`${base}/?splash=0#/economy`);
  await page.waitForSelector(".shell .nav");
  assert.equal(await page.locator(".rt-root").count(), 0, "new shell must not load without the flag");
  await page.getByRole("heading", { name: "Economy" }).waitFor();
  await page.click('a[data-id="rules"]');
  await page.getByRole("heading", { name: "Rulebook" }).waitFor();
  assert.ok(await page.locator(".try-tools").isVisible(), "preview link offered");
  assert.deepEqual(errors, []);
  await ctx.close();
});

console.log("\nShell, flag and routing");
await check("?shell=tools turns the shell on and remembers it", async () => {
  const { ctx, page, errors } = await fresh();
  await page.goto(tools("home"));
  await page.waitForSelector(".rt-root .rt-nav");
  await page.goto(`${base}/?splash=0#/home`);
  await page.waitForSelector(".rt-root");
  await page.goto(`${base}/?shell=classic&splash=0#/overview`);
  await page.waitForSelector(".shell .nav");
  assert.equal(await page.locator(".rt-root").count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

await check("every module opens from the sidebar without errors", async () => {
  const { ctx, page, errors } = await fresh();
  await page.goto(tools("home"));
  for (const id of ["studio", "vicelab", "heist", "map", "workspaces", "roadmap", "settings", "help", "home"]) {
    await page.click(`.rt-navitem[data-tool="${id}"]`);
    await page.waitForSelector(`section[data-module="${id}"]:not([hidden])`);
    assert.equal(await page.locator(`.rt-navitem[data-tool="${id}"]`).getAttribute("aria-current"), "page");
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

await check("old Studio links move under #/studio and Studio keeps its section", async () => {
  const { ctx, page, errors } = await fresh();
  await page.goto(`${base}/?shell=tools&splash=0#/economy`);
  await page.waitForFunction(() => location.hash === "#/studio/economy");
  await page.getByRole("heading", { name: "Economy" }).waitFor();
  await page.click('.rt-navitem[data-tool="map"]');
  await page.click('.rt-navitem[data-tool="studio"]');
  await page.getByRole("heading", { name: "Economy" }).waitFor();
  assert.deepEqual(errors, []);
  await ctx.close();
});

await check("tools stay mounted and keep state while another tool is used", async () => {
  const { ctx, page, errors } = await fresh();
  await page.goto(tools("heist"));
  await page.getByRole("button", { name: "Create plan" }).click();
  await page.fill("#rt-plan-notes", "Meet at the pier at 9");
  await page.click('.rt-navitem[data-tool="vicelab"]');
  assert.equal(await page.locator('section[data-module="heist"]').count(), 1, "Heist Ops still mounted");
  assert.equal(await page.locator('section[data-module="vicelab"]:not([hidden])').count(), 1);
  await page.click('.rt-navitem[data-tool="home"]');
  await page.getByText("2 active").waitFor();
  await page.click('.rt-navitem[data-tool="heist"]');
  assert.equal(await page.inputValue("#rt-plan-notes"), "Meet at the pier at 9");
  await page.reload();
  await page.waitForSelector("#rt-plan-notes");
  assert.equal(await page.inputValue("#rt-plan-notes"), "Meet at the pier at 9", "persisted");
  assert.deepEqual(errors, []);
  await ctx.close();
});

console.log("\nViceLab");
await check("imports a PresentMon capture and computes real stats", async () => {
  const { ctx, page, errors } = await fresh();
  await page.goto(tools("vicelab"));
  assert.ok(await page.getByRole("button", { name: "Start benchmark" }).isDisabled(), "needs a game first");
  await page.getByLabel("Game").selectOption("gtav");
  await page.getByRole("button", { name: "Import a capture" }).click();
  await page.locator('input[type="file"]').first().setInputFiles(fixture);
  await page.locator(".rt-chart svg").waitFor();
  const avg = Number(await page.locator(".rt-stat-v").first().innerText());
  assert.ok(avg > 110 && avg < 125, `average fps ${avg}`);
  await page.getByRole("tab", { name: "History" }).click();
  await page.getByRole("cell", { name: /Grand Theft Auto V/ }).waitFor();
  assert.deepEqual(errors, []);
  await ctx.close();
});

await check("rejects a file that isn't a capture with a readable message", async () => {
  const { ctx, page } = await fresh();
  await page.goto(tools("vicelab"));
  await page.getByLabel("Game").selectOption("gtav");
  await page.getByRole("button", { name: "Import a capture" }).click();
  const bad = join(tmpdir(), `riptide-bad-${process.pid}.csv`);
  await writeFile(bad, "hello,world\n1,2");
  await page.locator('input[type="file"]').first().setInputFiles(bad);
  await page.getByRole("alert").filter({ hasText: /usable frames|couldn't/ }).waitFor();
  await ctx.close();
});

await check("start benchmark runs an honest timed session", async () => {
  const { ctx, page } = await fresh();
  await page.goto(tools("vicelab"));
  await page.getByLabel("Game").selectOption("rdr2");
  await page.getByRole("button", { name: "Start benchmark" }).click();
  await page.getByText(/doesn't record the game itself/).waitFor();
  await page.getByRole("button", { name: "I'm done" }).click();
  await page.getByRole("heading", { name: "Import your capture" }).waitFor();
  await ctx.close();
});

console.log("\nInteractive Map and detached windows");
await check("personal marker, filters and pop-out keep their state", async () => {
  const { ctx, page, errors } = await fresh();
  await page.goto(tools("map"));
  await page.getByRole("button", { name: "Create a personal marker" }).click();
  const stage = page.locator(".rt-map-stage");
  const box = await stage.boundingBox();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await page.locator(".rt-marker").first().waitFor();
  await page.fill("#rt-mk-t", "Hideout");
  await page.getByLabel("My notes").check();
  await page.waitForTimeout(300);
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: /Pop out map/ }).click()]);
  await popup.waitForSelector('section[data-module="map"]');
  assert.ok(await popup.getByLabel("My notes").isChecked(), "filter preserved in the new window");
  await popup.getByRole("button", { name: /Hideout/ }).waitFor();
  await page.getByText("Interactive Map is open in its own window").waitFor();
  await popup.close();
  await page.locator(".rt-map-stage").waitFor({ timeout: 10000 });
  assert.ok(await page.getByLabel("My notes").isChecked(), "filter still set after docking");
  assert.deepEqual(errors, []);
  await ctx.close();
});

await check("map packs are reviewed before they show, and count honestly", async () => {
  const { ctx, page } = await fresh();
  await page.goto(tools("map"));
  const pack = join(tmpdir(), `riptide-pack-${process.pid}.json`);
  await writeFile(pack, JSON.stringify({ format: "riptide-map-pack", schema: 1, id: "test", name: "Test pack", version: "1.0.0", map: "schematic-v1", publisher: "QA", provenance: "official", records: [{ id: "a", title: "Pier", category: "activities", x: 400, y: 400 }] }));
  await page.locator('input[type="file"]').last().setInputFiles(pack);
  await page.getByText(/isn't signed/).waitFor();
  assert.equal(await page.locator(".rt-marker").count(), 0, "hidden until reviewed");
  await page.getByText("Reviewed, show on the map").click();
  await page.locator(".rt-marker").first().waitFor();
  await page.getByText("Community").first().waitFor();
  await ctx.close();
});

await check("keyboard: map pans/zooms, Alt+number switches tools, focus is visible", async () => {
  const { ctx, page } = await fresh();
  await page.goto(tools("map"));
  await page.locator(".rt-map-stage").focus();
  await page.keyboard.press("+");
  await page.waitForFunction(() => /zoom 1\.3x/.test(document.querySelector(".rt-map-stage")?.getAttribute("aria-label") ?? ""));
  await page.keyboard.press("0");
  await page.keyboard.press("Alt+3");
  await page.waitForFunction(() => location.hash === "#/vicelab");
  await page.goto(tools("home"));
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  assert.notEqual(outline, "none", "focus ring visible");
  await ctx.close();
});

console.log("\nResilience");
await check("corrupt stored data never breaks the app", async () => {
  const { ctx, page, errors } = await fresh();
  await page.goto(tools("home"));
  await page.evaluate(() => {
    localStorage.setItem("riptide.map.v1", "{not json");
    localStorage.setItem("riptide.heist.v1", JSON.stringify({ plans: [{ schema: 99 }] }));
    localStorage.setItem("riptide.workspaces.v1", JSON.stringify({ list: [] }));
    localStorage.setItem("riptide.blueprint.v1", "garbage");
  });
  for (const id of ["map", "heist", "workspaces", "studio"]) {
    await page.goto(tools(id));
    await page.waitForSelector(`section[data-module="${id}"]`);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

await check("reduced motion skips the startup animation", async () => {
  const { ctx, page } = await fresh({ width: 1600, height: 900 }, 1, { reducedMotion: "reduce" });
  await page.goto(`${base}/?shell=tools#/home`);
  await page.waitForSelector(".rt-root");
  assert.equal(await page.locator(".splash").count(), 0);
  await ctx.close();
});

console.log("\nLayouts and display scaling");
const SIZES = [
  { name: "1920x1080", vp: { width: 1920, height: 1080 }, dpr: 1 },
  { name: "1600x900", vp: { width: 1600, height: 900 }, dpr: 1 },
  { name: "1366x768", vp: { width: 1366, height: 768 }, dpr: 1 },
  { name: "1080p at 125%", vp: { width: 1536, height: 864 }, dpr: 1.25 },
  { name: "1080p at 150%", vp: { width: 1280, height: 720 }, dpr: 1.5 },
  { name: "1080p at 200%", vp: { width: 960, height: 540 }, dpr: 2 },
];
for (const s of SIZES) {
  await check(`${s.name}: every tool fits with no sideways scrolling`, async () => {
    const { ctx, page, errors } = await fresh(s.vp, s.dpr);
    for (const id of ["home", "vicelab", "heist", "map", "workspaces", "roadmap", "settings", "help", "studio"]) {
      await page.goto(tools(id));
      await page.waitForSelector(`section[data-module="${id}"]:not([hidden])`);
      await page.waitForTimeout(250);
      const over = await page.evaluate((m) => {
        const sec = document.querySelector(`section[data-module="${m}"]`);
        const doc = document.documentElement;
        return { doc: doc.scrollWidth - doc.clientWidth, sec: sec.scrollWidth - sec.clientWidth };
      }, id);
      assert.ok(over.doc <= 1 && over.sec <= 1, `${id} overflows sideways by ${Math.max(over.doc, over.sec)}px`);
      if (shots && ["home", "map"].includes(id)) await page.screenshot({ path: join(shots, `${s.name.replace(/\W+/g, "-")}-${id}.png`) });
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

await browser.close();
server.close();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
