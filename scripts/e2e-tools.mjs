// End-to-end checks for the RipTide Tools shell and classic Studio.
// Run after `npm run build`:  node scripts/e2e-tools.mjs [--chrome /path/to/chrome] [--shots dir]
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const root = resolve("apps/studio/dist");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".ttf": "font/ttf", ".otf": "font/otf" };
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
const only = arg("--only");
async function check(name, fn) {
  if (only && !name.toLowerCase().includes(only.toLowerCase())) return;
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
  const watch = (p) => {
    p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    p.on("pageerror", (e) => errors.push(String(e)));
    p.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${new URL(r.url()).pathname}`));
    p.on("requestfailed", (r) => errors.push(`failed ${new URL(r.url()).pathname}`));
  };
  watch(page);
  ctx.on("page", watch);
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
  await page.clock.install();
  await page.goto(tools("vicelab"));
  await page.getByLabel("Game").selectOption("rdr2");
  await page.getByRole("button", { name: "Start benchmark" }).click();
  await page.getByText(/This is only a timer\. RipTide doesn't record the game/).waitFor();
  assert.equal(await page.locator(".rt-timer").innerText(), "1:00");
  // The countdown follows the clock, not the number of timer ticks: jumping 25 s ahead (as after
  // a background tab or sleep) shows 0:35 straight away.
  await page.clock.fastForward(25_000);
  await page.waitForFunction(() => document.querySelector(".rt-timer")?.textContent === "0:35");
  await page.getByRole("button", { name: "I'm done" }).click();
  await page.getByRole("heading", { name: "Import your capture" }).waitFor();
  await ctx.close();
});

console.log("\nInteractive Map");
const placesJson = JSON.parse(await readFile(join(root, "map/leonida/places.json"), "utf8"));
const safehouse = placesJson.places.find((p) => p[0] === "L16");
const stageCentre = async (page) => {
  const b = await page.locator(".rt-map-stage").boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

await check("official map loads tiles, places and credits with no failed requests", async () => {
  const { ctx, page, errors } = await fresh();
  await page.goto(tools("map"));
  await page.locator(".rt-tiles image").first().waitFor({ state: "attached" });
  await page.getByText(new RegExp(`${placesJson.places.length.toLocaleString("en-US")} places shown`)).waitFor();
  assert.ok((await page.locator(".rt-marker").count()) >= placesJson.places.length);
  await page.locator(".rt-map-credit").getByText(/Rockstar Games/).waitFor();
  assert.equal(await page.locator('.rt-map-credit a[href="https://map.gtadb.org"]').getAttribute("rel"), "noopener noreferrer");
  // Zoom all the way in and pan around: every tile requested must exist.
  const c = await stageCentre(page);
  await page.mouse.move(c.x, c.y);
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -400);
  for (const [dx, dy] of [[300, 0], [0, 300], [-600, 0], [0, -600]]) {
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + dx, c.y + dy, { steps: 5 });
    await page.mouse.up();
  }
  await page.waitForTimeout(500);
  assert.deepEqual(errors, []);
  await ctx.close();
});

await check("search finds a place and the map centres exactly on its marker", async () => {
  const { ctx, page, errors } = await fresh({ width: 1920, height: 1080 }, 1, { reducedMotion: "reduce" });
  await page.goto(tools("map"));
  await page.getByText(/places shown/).waitFor();
  await page.fill("#rt-map-q", "y vice");
  await page.getByRole("option", { name: /Y Vice City.*Safehouse/ }).click();
  await page.getByRole("heading", { name: "Y Vice City" }).waitFor();
  await page.getByText(safehouse[8]).waitFor(); // real-world inspiration
  await page.getByText("You can go in").waitFor();
  await page.waitForTimeout(300);
  const m = await page.locator(".rt-selected circle").nth(1).boundingBox();
  const c = await stageCentre(page);
  assert.ok(Math.abs(m.x + m.width / 2 - c.x) < 2 && Math.abs(m.y + m.height / 2 - c.y) < 2, "marker is drawn where the projection says");
  await page.locator(".rt-place-pos").getByText(`X ${Math.round(safehouse[5]).toLocaleString("en-US")} · Y ${Math.round(safehouse[6]).toLocaleString("en-US")}`).waitFor();
  await page.fill("#rt-map-q", "qqqqzzzz");
  await page.getByText("Nothing matches these filters.").waitFor();
  assert.deepEqual(errors, []);
  await ctx.close();
});

await check("found tracking, hide found and separate playthroughs", async () => {
  const { ctx, page, errors } = await fresh();
  await page.goto(tools("map"));
  await page.getByText(/places shown/).waitFor();
  await page.fill("#rt-map-q", "Y Vice City");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Mark as found" }).click();
  await page.locator(".rt-progress-head").getByText(/^1$/).waitFor();
  await page.locator(".rt-cat", { hasText: "Safehouses" }).getByText(/^1\/\d+$/).waitFor();
  await page.fill("#rt-map-q", "");
  await page.getByLabel("Hide found").check();
  await page.getByText(new RegExp(`${(placesJson.places.length - 1).toLocaleString("en-US")} places shown`)).waitFor();
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.fill("#rt-prof-name", "Second run");
  await page.keyboard.press("Enter");
  await page.locator(".rt-progress-head").getByText(/^0$/).waitFor();
  await page.selectOption("#rt-prof", { label: "Main playthrough" });
  await page.locator(".rt-progress-head").getByText(/^1$/).waitFor();
  await page.reload();
  await page.locator(".rt-progress-head").getByText(/^1$/).waitFor();
  await page.locator(".rt-map-stage").focus();
  await page.keyboard.press("n");
  await page.locator(".rt-place-title").waitFor();
  assert.notEqual(await page.locator(".rt-place-title").innerText(), "Y Vice City", "next unfound skips found places");
  assert.deepEqual(errors, []);
  await ctx.close();
});

await check("personal marker, categories and pop-out keep their state", async () => {
  const { ctx, page, errors } = await fresh();
  await page.goto(tools("map"));
  await page.getByText(/places shown/).waitFor();
  await page.getByRole("button", { name: "Add a personal marker" }).click();
  const c = await stageCentre(page);
  await page.mouse.click(c.x + 40, c.y + 30);
  await page.locator("#rt-mk-t").waitFor();
  await page.fill("#rt-mk-t", "Hideout");
  await page.selectOption("#rt-mk-c", "collectibles");
  await page.locator(".rt-cat", { hasText: "Collectibles" }).getByText("0/1").waitFor();
  await page.getByRole("button", { name: "Mark as found" }).click();
  await page.locator(".rt-cat", { hasText: "Collectibles" }).getByText("1/1").waitFor();
  await page.locator(".rt-cat", { hasText: "My markers" }).getByText("1").waitFor();
  await page.locator(".rt-cat", { hasText: "Landmarks" }).locator("input").uncheck();
  await page.waitForTimeout(400);
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: /Pop out map/ }).click()]);
  await popup.waitForSelector('section[data-module="map"]');
  await popup.getByText(/places shown/).waitFor();
  assert.equal(await popup.locator(".rt-cat", { hasText: "Landmarks" }).locator("input").isChecked(), false, "filter kept in the new window");
  await popup.fill("#rt-map-q", "hideout");
  await popup.getByRole("option", { name: /Hideout/ }).waitFor();
  await page.getByText("Interactive Map is open in its own window").waitFor();
  await popup.close();
  await page.locator(".rt-map-stage").waitFor({ timeout: 10000 });
  assert.equal(await page.locator(".rt-cat", { hasText: "Landmarks" }).locator("input").isChecked(), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

await check("map packs are reviewed first; packs for the old placeholder map are refused", async () => {
  const { ctx, page } = await fresh();
  await page.goto(tools("map"));
  await page.getByText(/places shown/).waitFor();
  const before = await page.locator(".rt-marker").count();
  const pack = join(tmpdir(), `riptide-pack-${process.pid}.json`);
  await writeFile(pack, JSON.stringify({ format: "riptide-map-pack", schema: 1, id: "test", name: "Test pack", version: "1.0.0", map: "leonida-v1", publisher: "QA", provenance: "official", records: [{ id: "a", title: "QA Pier", category: "activities", x: 1500, y: 300 }] }));
  await page.locator('input[type="file"]').last().setInputFiles(pack);
  await page.getByText(/isn't signed/).waitFor();
  assert.equal(await page.locator(".rt-marker").count(), before, "hidden until reviewed");
  await page.getByText("Reviewed, show on the map").click();
  await page.waitForFunction((n) => document.querySelectorAll(".rt-marker").length === n + 1, before);
  const old = join(tmpdir(), `riptide-oldpack-${process.pid}.json`);
  await writeFile(old, JSON.stringify({ format: "riptide-map-pack", schema: 1, id: "old", name: "Old", version: "1.0.0", map: "schematic-v1", provenance: "community", records: [] }));
  await page.locator('input[type="file"]').last().setInputFiles(old);
  await page.getByRole("alert").filter({ hasText: /old placeholder map/ }).waitFor();
  await ctx.close();
});

await check("old placeholder-map data is cleaned up honestly", async () => {
  const { ctx, page, errors } = await fresh();
  await page.goto(tools("home"));
  await page.evaluate(() => localStorage.setItem("riptide.map.v1", JSON.stringify({ markers: [{ id: "me:1" }, { id: "me:2" }] })));
  await page.goto(tools("map"));
  await page.getByText("You have 2 markers from the old placeholder map").waitFor();
  await page.getByRole("button", { name: "Remove old markers" }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem("riptide.map.v1")), null);
  await page.evaluate(() => localStorage.setItem("riptide.map.v1", JSON.stringify({ markers: [] })));
  await page.reload();
  await page.getByText(/places shown/).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("riptide.map.v1")), null, "empty old data removed silently");
  assert.equal(await page.getByText(/old placeholder map/).count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

await check("keyboard: map pans and zooms, Alt+number switches tools, focus is visible", async () => {
  const { ctx, page } = await fresh();
  await page.goto(tools("map"));
  const zoomOf = () => page.evaluate(() => Number(/zoom (-?[\d.]+)/.exec(document.querySelector(".rt-map-stage")?.getAttribute("aria-label") ?? "")?.[1]));
  await page.getByText(/places shown/).waitFor();
  await page.waitForTimeout(300);
  const home = await zoomOf();
  await page.locator(".rt-map-stage").focus();
  await page.keyboard.press("+");
  await page.waitForFunction((z) => Number(/zoom (-?[\d.]+)/.exec(document.querySelector(".rt-map-stage")?.getAttribute("aria-label") ?? "")?.[1]) >= z + 0.4, home);
  await page.keyboard.press("0");
  await page.waitForTimeout(400);
  assert.equal(await zoomOf(), home, "0 shows all of Leonida again");
  await page.keyboard.press("/");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "rt-map-q");
  await page.locator(".rt-map-stage").focus(); // tool shortcuts are ignored while typing
  await page.keyboard.press("Alt+3");
  await page.waitForFunction(() => location.hash === "#/vicelab");
  await page.goto(tools("home"));
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  assert.notEqual(outline, "none", "focus ring visible");
  await ctx.close();
});

console.log("\nDesktop app storage");
await check("desktop: saved files load first and every change is written to disk", async () => {
  const { ctx, page, errors } = await fresh();
  // A stand-in for the desktop preload bridge, backed by an object instead of files.
  await ctx.addInitScript(() => {
    const files = JSON.parse(sessionStorage.getItem("__files") || "null") ?? {
      "riptide.heist.v1": JSON.stringify({ plans: [{ schema: 1, id: "p1", name: "From disk", description: "", createdAt: 1, updatedAt: 1, roles: [], phases: [], notes: "saved on disk" }], activeId: "p1" }),
    };
    window.__writes = [];
    window.riptideDesktop = {
      readAll: () => ({ ...files }),
      write: (k, v) => {
        window.__writes.push([k, v]);
        if (v === null) delete files[k];
        else files[k] = v;
        sessionStorage.setItem("__files", JSON.stringify(files));
        return true;
      },
      dataDir: () => "C:\\Users\\you\\Documents\\RipTide",
      openDataDir: () => (window.__opened = true),
      version: () => "0.1.0",
    };
  });
  await page.goto(tools("heist"));
  await page.getByRole("heading", { name: "From disk" }).waitFor();
  assert.equal(await page.inputValue("#rt-plan-notes"), "saved on disk", "files win over browser storage");
  await page.fill("#rt-plan-notes", "changed in the app");
  await page.waitForFunction(() => window.__writes.some(([k, v]) => k === "riptide.heist.v1" && v && v.includes("changed in the app")));
  assert.ok(!(await page.evaluate(() => window.__writes.some(([k]) => !k.startsWith("riptide.")))), "only RipTide keys are written");
  await page.goto(tools("settings"));
  await page.getByText("Saved as files on this computer").waitFor();
  await page.getByRole("button", { name: "Open folder" }).click();
  assert.equal(await page.evaluate(() => window.__opened), true);
  await page.reload();
  await page.goto(tools("heist"));
  assert.equal(await page.inputValue("#rt-plan-notes"), "changed in the app", "survives a restart");
  assert.deepEqual(errors, []);
  await ctx.close();
});

async function withDesktop(ctx, { files, backups = {}, ls = {}, failWrites = false, failCommit = null }) {
  await ctx.addInitScript(({ files, backups, ls, failWrites, failCommit }) => {
    if (!sessionStorage.getItem("__seeded")) {
      sessionStorage.setItem("__seeded", "1");
      sessionStorage.setItem("__files", JSON.stringify(files));
      for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
    }
    const store = JSON.parse(sessionStorage.getItem("__files"));
    window.__writes = [];
    window.riptideDesktop = {
      readAll: () => ({ ...store }),
      readBackup: (k) => backups[k] ?? null,
      write: (k, v) => {
        if (failWrites || window.__failWrites) return false;
        window.__writes.push([k, v]);
        if (v === null) delete store[k];
        else store[k] = v;
        sessionStorage.setItem("__files", JSON.stringify(store));
        return true;
      },
      writeMany: (entries) => {
        if (failCommit) return { ok: false, error: failCommit };
        for (const { key, value } of entries) {
          window.__writes.push([key, value]);
          if (value === null) delete store[key];
          else store[key] = value;
        }
        sessionStorage.setItem("__files", JSON.stringify(store));
        return { ok: true };
      },
      dataDir: () => "C:\\Users\\you\\Documents\\RipTide",
      openDataDir: () => {},
      version: () => "0.1.0",
    };
  }, { files, backups, ls, failWrites, failCommit });
}
const plan = (id, name, notes) => ({ schema: 1, id, name, description: "", createdAt: 1, updatedAt: 1, roles: [], phases: [], notes });

await check("desktop: a data file deleted outside the app isn't brought back", async () => {
  const { ctx, page, errors } = await fresh();
  // This key had a file before; now the file is gone but the browser engine still has a copy.
  await withDesktop(ctx, {
    files: {},
    ls: { "riptide.heist.v1": JSON.stringify({ plans: [plan("p1", "Stale copy", "old")], activeId: "p1" }), "rt-desktop-on-disk-v1": JSON.stringify(["riptide.heist.v1"]) },
  });
  await page.goto(tools("heist"));
  await page.getByRole("button", { name: "Create plan" }).waitFor();
  assert.equal(await page.getByText("Stale copy").count(), 0, "stale copy not shown");
  assert.ok(!(await page.evaluate(() => window.__writes.some(([k]) => k === "riptide.heist.v1"))), "stale copy not written back");
  assert.deepEqual(errors, []);
  await ctx.close();
});

await check("desktop: data that never reached disk is copied there once", async () => {
  const { ctx, page } = await fresh();
  await withDesktop(ctx, { files: {}, ls: { "riptide.heist.v1": JSON.stringify({ plans: [plan("p1", "From the browser era", "keep me")], activeId: "p1" }) } });
  await page.goto(tools("heist"));
  await page.getByRole("heading", { name: "From the browser era" }).waitFor();
  assert.ok(await page.evaluate(() => window.__writes.some(([k, v]) => k === "riptide.heist.v1" && v.includes("keep me"))));
  await ctx.close();
});

await check("desktop: a damaged save is recovered from its backup, and says so", async () => {
  const { ctx, page, errors } = await fresh();
  await withDesktop(ctx, {
    files: { "riptide.heist.v1": JSON.stringify({ plans: [{ schema: 99 }] }) }, // valid JSON, wrong shape
    backups: { "riptide.heist.v1": JSON.stringify({ plans: [plan("p1", "Good backup", "recovered")], activeId: "p1" }) },
  });
  await page.goto(tools("heist"));
  await page.getByRole("heading", { name: "Good backup" }).waitFor();
  await page.getByText(/restored the previous version from its backup/).waitFor();
  await page.waitForFunction(() => window.__writes.some(([k, v]) => k === "riptide.heist.v1" && v && v.includes("recovered")));
  assert.deepEqual(errors, []);
  await ctx.close();
});

await check("desktop: a change that can't be saved to disk says so and isn't treated as saved", async () => {
  const { ctx, page, errors } = await fresh();
  await withDesktop(ctx, { files: {} });
  await page.goto(tools("heist"));
  await page.getByRole("button", { name: "Create plan" }).click();
  await page.waitForTimeout(400);
  await page.evaluate(() => (window.__failWrites = true));
  await page.fill("#rt-plan-notes", "this can't reach the disk");
  await page.getByText(/couldn't save your latest change to disk/).waitFor();
  // The working copy wasn't updated either, so it never claims a save that didn't happen.
  assert.doesNotMatch((await page.evaluate(() => localStorage.getItem("riptide.heist.v1"))) ?? "", /can't reach the disk/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

await check("desktop: a restore the disk refuses shows why and changes nothing", async () => {
  const { ctx, page, errors } = await fresh();
  await withDesktop(ctx, { files: { "riptide.settings.v1": JSON.stringify({ motion: "full", splash: true }) }, failCommit: "ENOSPC" });
  await page.goto(tools("settings"));
  const backup = { format: "riptide-tools-backup", version: 1, exportedAt: "2026-11-20T00:00:00Z", "riptide.settings.v1": { motion: "reduced", splash: false } };
  const file = join(tmpdir(), `riptide-backup-full-${process.pid}.json`);
  await writeFile(file, JSON.stringify(backup));
  await page.setInputFiles('section[data-module="settings"] input[type="file"]', file);
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.getByText(/The disk is full, so nothing was changed/).waitFor();
  assert.equal(await page.getByText(/Reloading/).count(), 0, "no success message");
  assert.match(await page.evaluate(() => localStorage.getItem("riptide.settings.v1")), /"full"/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

await check("two windows editing the same tool at once keep both changes", async () => {
  const { ctx, page, errors } = await fresh();
  await page.goto(tools("heist"));
  await page.getByRole("button", { name: "Create plan" }).click();
  await page.fill("#rt-plan-notes", "start");
  await page.waitForTimeout(300);
  const other = await ctx.newPage();
  await other.goto(tools("heist"));
  await other.waitForSelector("#rt-plan-notes");
  // Within the save delay: one window edits notes, the other adds a plan.
  await Promise.all([page.fill("#rt-plan-notes", "notes from window one"), other.getByRole("button", { name: "New plan" }).click()]);
  await page.waitForTimeout(800);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("riptide.heist.v1")));
  assert.equal(stored.plans.length, 2, "the plan added in window two survived");
  assert.ok(stored.plans.some((p) => p.notes === "notes from window one"), "the notes typed in window one survived");
  for (const p of [page, other]) {
    await p.reload();
    await p.waitForSelector("#rt-plan-pick");
    assert.equal(await p.locator("#rt-plan-pick option").count(), 2);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

await check("backups: checked before restoring, all or nothing, and complete", async () => {
  const { ctx, page, errors } = await fresh({ width: 1920, height: 1080 }, 1, { acceptDownloads: true });
  await page.goto(tools("heist"));
  await page.getByRole("button", { name: "Create plan" }).click();
  await page.fill("#rt-plan-notes", "in the backup");
  await page.waitForTimeout(300);
  await page.goto(tools("settings"));
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export everything" }).click()]);
  const backup = JSON.parse(await readFile(await dl.path(), "utf8"));
  assert.equal(backup.version, 2);
  assert.ok(backup.parts["riptide.heist.v1"].checksum, "parts carry checksums");
  assert.ok(backup.parts["riptide.flags.v1"], "interface choice is included");
  // Change the plan, then restore the backup.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("riptide.heist.v1"));
    s.plans[0].notes = "changed after the backup";
    localStorage.setItem("riptide.heist.v1", JSON.stringify(s));
  });
  const good = join(tmpdir(), `riptide-backup-${process.pid}.json`);
  await writeFile(good, JSON.stringify(backup));
  // A damaged copy: one part edited without its checksum. Must change nothing.
  const bad = join(tmpdir(), `riptide-backup-bad-${process.pid}.json`);
  const tampered = structuredClone(backup);
  tampered.parts["riptide.heist.v1"].data.plans[0].notes = "tampered";
  await writeFile(bad, JSON.stringify(tampered));
  await page.setInputFiles('section[data-module="settings"] input[type="file"]', bad);
  await page.getByText(/Nothing was restored/).waitFor();
  assert.equal(await page.getByRole("button", { name: "Restore", exact: true }).count(), 0);
  assert.match(await page.evaluate(() => localStorage.getItem("riptide.heist.v1")), /changed after the backup/);
  await page.setInputFiles('section[data-module="settings"] input[type="file"]', good);
  await page.getByText("This backup is valid. Restoring will:").waitFor();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.waitForTimeout(1500);
  await page.goto(tools("heist"));
  assert.equal(await page.inputValue("#rt-plan-notes"), "in the backup");
  assert.deepEqual(errors, []);
  await ctx.close();
});

await check("browser: settings explain where data is kept", async () => {
  const { ctx, page } = await fresh();
  await page.goto(tools("settings"));
  await page.getByText("Saved in this browser").waitFor();
  assert.equal(await page.getByRole("link", { name: /Get the app/ }).getAttribute("href"), "https://dosukasol.github.io/RipTide/#download");
  await ctx.close();
});

console.log("\nResilience");
await check("corrupt stored data never breaks the app", async () => {
  const { ctx, page, errors } = await fresh();
  await page.goto(tools("home"));
  await page.evaluate(() => {
    localStorage.setItem("riptide.map.v2", "{not json");
    localStorage.setItem("riptide.map.v1", "{also not json");
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
