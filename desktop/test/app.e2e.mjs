// Drives the packaged desktop app with Playwright. Needs a display (use xvfb-run on Linux).
// Usage: node desktop/test/app.e2e.mjs <path to the unpacked app executable>
import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const exe = process.argv[2];
if (!exe || !existsSync(exe)) throw new Error("Pass the path to the unpacked app executable.");
const dataDir = mkdtempSync(join(tmpdir(), "riptide-data-"));
const profile = mkdtempSync(join(tmpdir(), "riptide-profile-"));
const env = { ...process.env, RIPTIDE_DATA_DIR: dataDir, RIPTIDE_USER_DATA: profile };
const args = process.platform === "linux" ? ["--no-sandbox"] : []; // containers have no setuid sandbox helper
let passed = 0;
const step = async (name, fn) => {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
};
const launch = async () => {
  const app = await electron.launch({ executablePath: exe, args, env });
  const win = await app.firstWindow();
  const errors = [];
  win.on("pageerror", (e) => errors.push(String(e)));
  await win.waitForSelector(".rt-root", { timeout: 30000 });
  return { app, win, errors };
};
const go = (win, hash) => win.evaluate((h) => (location.hash = h), hash);

let { app, win, errors } = await launch();

await step("opens RipTide Tools from app://riptide", async () => {
  assert.match(win.url(), /^app:\/\/riptide\/index\.html\?shell=tools/);
  assert.equal(await win.title(), "RipTide Tools");
});

await step("the page has no Node access and no internet", async () => {
  assert.equal(await win.evaluate(() => typeof require + typeof process), "undefinedundefined");
  const blocked = await win.evaluate(() => fetch("https://example.com/").then(() => false, () => true));
  assert.equal(blocked, true);
});

await step("the map loads its tiles and places from inside the app", async () => {
  await go(win, "#/map");
  await win.getByText(/places shown/).waitFor({ timeout: 20000 });
  await win.waitForFunction(() => [...document.querySelectorAll(".rt-tiles image")].length > 0);
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
});

assert.deepEqual(errors, []);
await app.close();

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
await app.close();

// Damage the main file: the backup (the version before the last save) takes over.
writeFileSync(f, '{"plans": [');
({ app, win, errors } = await launch());
await step("a damaged file falls back to its backup", async () => {
  await go(win, "#/heist");
  await win.locator("#rt-plan-notes").waitFor();
  assert.equal(await win.inputValue("#rt-plan-notes"), "Edited on disk");
});
assert.deepEqual(errors, []);
await app.close();
console.log(`\n${passed} desktop checks passed (data in ${dataDir})`);
