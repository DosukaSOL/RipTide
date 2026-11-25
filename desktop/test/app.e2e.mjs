// Drives the packaged desktop app with Playwright. Needs a display (use xvfb-run on Linux).
// Usage: node desktop/test/app.e2e.mjs <path to the unpacked app executable>
import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

const exe = process.argv[2];
if (!exe || !existsSync(exe)) throw new Error("Pass the path to the unpacked app executable.");
const dataDir = mkdtempSync(join(tmpdir(), "riptide-data-"));
const profile = mkdtempSync(join(tmpdir(), "riptide-profile-"));
// A stand-in for the system's "open in browser" command, so clicking a website link records the
// address instead of starting a real browser (which would also keep the test from finishing).
const fakeBin = mkdtempSync(join(tmpdir(), "riptide-bin-"));
const opened = join(fakeBin, "opened.txt");
for (const cmd of ["xdg-open", "open"]) writeFileSync(join(fakeBin, cmd), `#!/bin/sh\necho "$1" >> "${opened}"\n`, { mode: 0o755 });
const env = { ...process.env, PATH: `${fakeBin}${delimiter}${process.env.PATH}`, BROWSER: join(fakeBin, "xdg-open"), RIPTIDE_DATA_DIR: dataDir, RIPTIDE_USER_DATA: profile, RIPTIDE_UPDATES: "off" }; // tests never ask GitHub for updates
const args = process.platform === "linux" ? ["--no-sandbox"] : []; // containers have no setuid sandbox helper
let passed = 0;
// Never hang a CI job: give up after 8 minutes and say which check was running.
let current = "starting";
const step = async (name, fn) => {
  current = name;
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
};
/** Close the app, and force it if it doesn't exit within 20 s, so a stuck close fails loudly instead of hanging. */
const closeApp = async (a) => {
  let timer;
  const forced = new Promise((r) => (timer = setTimeout(() => r("forced"), 20000)));
  const how = await Promise.race([a.close().then(() => "closed"), forced]);
  clearTimeout(timer);
  if (how === "forced") {
    a.process().kill("SIGKILL");
    throw new Error("The app didn't close within 20 seconds");
  }
};
setTimeout(() => {
  console.error(`\nTimed out during: ${current}`);
  process.exit(1);
}, 8 * 60 * 1000).unref();

const launch = async (ready = ".rt-root") => {
  const app = await electron.launch({ executablePath: exe, args, env });
  const win = await app.firstWindow();
  const errors = [];
  win.on("pageerror", (e) => errors.push(String(e)));
  await win.waitForSelector(ready, { timeout: 30000 });
  return { app, win, errors };
};
const go = (win, hash) => win.evaluate((h) => (location.hash = h), hash);

let { app, win, errors } = await launch();

await step("opens RipTide Tools from app://riptide", async () => {
  assert.match(win.url(), /^app:\/\/riptide\/index\.html/);
  assert.equal(await win.locator(".rt-root").count(), 1, "the Tools shell on first start");
  assert.equal(await win.title(), "RipTide Tools");
});

await step("app:// only serves the app's own files", async () => {
  const codes = await win.evaluate(async () => {
    const st = (u) => fetch(u).then((r) => r.status, () => "error");
    return [await st("app://riptide/index.html"), await st("app://riptide/%2e%2e/package.json"), await st("app://riptide/..%2f..%2fpackage.json"), await st("app://riptide/%E0%A4%A"), await st("app://riptide/nope.js")];
  });
  assert.equal(codes[0], 200);
  assert.ok(codes.slice(1, 3).every((c) => c === 403 || c === 404), `traversal gave ${codes}`);
  assert.equal(codes[3], 400);
  assert.equal(codes[4], 404);
});

await step("the page has no Node access and no internet", async () => {
  assert.equal(await win.evaluate(() => typeof require + typeof process), "undefinedundefined");
  const blocked = await win.evaluate(() => fetch("https://example.com/").then(() => false, () => true));
  assert.equal(blocked, true);
});

await step("the map loads its background and places from inside the app", async () => {
  await go(win, "#/map");
  await win.getByText(/places shown/).waitFor({ timeout: 20000 });
  // Builds made with RIPTIDE_MAP_ART=off draw RipTide's own grid instead of map tiles.
  const basemap = await win.locator(".rt-map-stage").getAttribute("data-basemap");
  if (basemap === "official") await win.waitForFunction(() => [...document.querySelectorAll(".rt-tiles image")].length > 0);
  else await win.locator(".rt-grid").waitFor({ state: "attached" });
});

await step("changes are written to files on disk", async () => {
  await go(win, "#/heist");
  await win.getByRole("button", { name: "Create plan" }).click();
  await win.fill("#rt-plan-notes", "Meet at the marina at 9");
  await win.waitForTimeout(600);
  const f = join(dataDir, "riptide.heist.v1.json");
  assert.ok(existsSync(f), "heist file exists");
  assert.match(readFileSync(f, "utf8"), /Meet at the marina at 9/);
});

await step("settings show the data folder", async () => {
  await go(win, "#/settings");
  await win.getByText("Saved as files on this computer").waitFor();
  await win.getByText(dataDir).waitFor();
});

await step("the map pops out into its own app window", async () => {
  await go(win, "#/map");
  await win.getByText(/places shown/).waitFor();
  const [pop] = await Promise.all([app.waitForEvent("window"), win.getByRole("button", { name: /Pop out map/ }).click()]);
  await pop.waitForSelector('section[data-module="map"]', { timeout: 20000 });
  assert.match(pop.url(), /^app:\/\/riptide\/index\.html\?window=map/);
  await pop.getByText(/places shown/).waitFor({ timeout: 20000 });
  await pop.close();
});

await step("links to websites never open inside the app", async () => {
  const before = app.windows().length;
  await go(win, "#/help");
  await win.getByRole("link", { name: /Report a problem/ }).click();
  await win.waitForTimeout(800);
  assert.equal(app.windows().length, before);
  assert.match(win.url(), /^app:\/\/riptide\//);
  if (process.platform === "linux") assert.match(readFileSync(opened, "utf8"), /^https:\/\/github\.com\//m, "handed to the system browser");
});

assert.deepEqual(errors, []);
await closeApp(app);

// Edit the file while the app is closed: the file must win on the next start.
const f = join(dataDir, "riptide.heist.v1.json");
const plan = JSON.parse(readFileSync(f, "utf8"));
plan.plans[0].notes = "Edited on disk";
writeFileSync(f, JSON.stringify(plan));

({ app, win, errors } = await launch());
await step("after a restart, the files on disk are what the app shows", async () => {
  await go(win, "#/heist");
  await win.locator("#rt-plan-notes").waitFor();
  assert.equal(await win.inputValue("#rt-plan-notes"), "Edited on disk");
});
await step("saving again keeps the previous version as a backup", async () => {
  await win.fill("#rt-plan-notes", "Second edit");
  await win.waitForTimeout(600);
  assert.match(readFileSync(f, "utf8"), /Second edit/);
  assert.match(readFileSync(`${f}.bak`, "utf8"), /Edited on disk/);
});
await closeApp(app);

// Damage the main file: the backup (the version before the last save) takes over.
writeFileSync(f, '{"plans": [');
({ app, win, errors } = await launch());
await step("a damaged file falls back to its backup", async () => {
  await go(win, "#/heist");
  await win.locator("#rt-plan-notes").waitFor();
  assert.equal(await win.inputValue("#rt-plan-notes"), "Edited on disk");
});
assert.deepEqual(errors, []);
await closeApp(app);

// Valid JSON in the wrong shape (not cut off): the schema check catches it and the backup is used.
writeFileSync(f, JSON.stringify({ plans: [{ schema: 99 }] }));
writeFileSync(`${f}.bak`, JSON.stringify({ plans: [{ schema: 1, id: "p1", name: "From backup", description: "", createdAt: 1, updatedAt: 1, roles: [], phases: [], notes: "Recovered from backup" }], activeId: "p1" }));
({ app, win, errors } = await launch());
await step("a file in the wrong shape is recovered from its backup, and the app says so", async () => {
  await go(win, "#/heist");
  await win.locator("#rt-plan-notes").waitFor();
  assert.equal(await win.inputValue("#rt-plan-notes"), "Recovered from backup");
  await win.getByText(/restored the previous version from its backup/).waitFor();
  await win.waitForTimeout(600);
  assert.match(readFileSync(f, "utf8"), /Recovered from backup/, "the recovered version is saved");
});
await step("switching to the classic Studio is remembered after a restart", async () => {
  await go(win, "#/settings");
  await win.getByRole("switch", { name: "RipTide Tools shell" }).click();
  await win.waitForSelector(".shell .nav", { timeout: 20000 });
});
assert.deepEqual(errors, []);
await closeApp(app);

// Delete the heist file while the app is closed: it must stay deleted, not come back from the
// browser engine's copy.
rmSync(f, { force: true });
rmSync(`${f}.bak`, { force: true });
({ app, win, errors } = await launch(".shell .nav, .rt-root"));
await step("the shell choice survived the restart", async () => {
  assert.equal(await win.locator(".shell .nav").count(), 1, "opened in the classic Studio");
});
await step("a data file deleted outside the app stays deleted", async () => {
  await win.evaluate(() => (location.href = "index.html?shell=tools#/heist"));
  await win.waitForSelector(".rt-root", { timeout: 20000 });
  await win.getByRole("button", { name: "Create plan" }).waitFor();
  await win.waitForTimeout(600);
  assert.equal(existsSync(f), false, "not written back");
});
await step("restoring a backup writes every part to disk as one change", async () => {
  await go(win, "#/settings");
  const backup = join(tmpdir(), `riptide-restore-${process.pid}.json`);
  const plan = { schema: 1, id: "r1", name: "Restored plan", description: "", createdAt: 1, updatedAt: 1, roles: [], phases: [], notes: "from the backup" };
  writeFileSync(backup, JSON.stringify({ format: "riptide-tools-backup", version: 1, "riptide.heist.v1": { plans: [plan], activeId: "r1" }, "riptide.settings.v1": { motion: "reduced", splash: false } }));
  await win.setInputFiles('section[data-module="settings"] input[type="file"]', backup);
  await win.getByRole("button", { name: "Restore", exact: true }).click();
  await win.getByText(/Restored 2 parts/).waitFor();
  assert.match(readFileSync(f, "utf8"), /from the backup/);
  assert.match(readFileSync(join(dataDir, "riptide.settings.v1.json"), "utf8"), /reduced/);
  assert.deepEqual(readdirSync(dataDir).filter((n) => /commit|journal/.test(n)), [], "no leftover working files");
});
if (process.platform !== "win32" && process.getuid?.() !== 0) {
  await step("when the data folder can't be written, the app says so instead of pretending to save", async () => {
    await win.waitForTimeout(1500); // let the reload after the restore finish
    await go(win, "#/heist");
    await win.locator("#rt-plan-notes").waitFor();
    chmodSync(dataDir, 0o555);
    try {
      await win.fill("#rt-plan-notes", "the folder is read-only");
      await win.getByText(/couldn't save your latest change to disk/).waitFor();
      assert.doesNotMatch(readFileSync(f, "utf8"), /read-only/);
    } finally {
      chmodSync(dataDir, 0o755);
    }
  });
}
await closeApp(app);
console.log(`\n${passed} desktop checks passed (data in ${dataDir})`);
