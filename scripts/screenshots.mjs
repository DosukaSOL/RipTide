// Renders every Studio screen to docs/screenshots. Run after build:studio.
// Usage: node scripts/screenshots.mjs [--chrome /path/to/chrome]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const root = resolve("apps/studio/dist");
const outDir = resolve("docs/screenshots");
mkdirSync(outDir, { recursive: true });

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".otf": "font/otf" };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  const file = join(root, path || "index.html");
  if (!file.startsWith(root + sep) && file !== root) return res.writeHead(403).end();
  try {
    const body = await readFile(file.endsWith(sep) ? join(file, "index.html") : file);
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const chromeFlag = process.argv.indexOf("--chrome");
const browser = await chromium.launch(chromeFlag > 0 ? { executablePath: process.argv[chromeFlag + 1] } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark" });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

const shots = [
  { route: "overview", name: "overview" },
  { route: "economy", name: "economy" },
  { route: "rules", name: "rulebook" },
  { route: "mods", name: "mods", action: async () => { await page.click('.cat-tabs button:has-text("Framework")'); await page.click('button[aria-label="Add ESX Legacy"]'); await page.waitForTimeout(700); } },
  { route: "roles", name: "roles" },
  { route: "world", name: "world" },
  { route: "access", name: "joining" },
  { route: "deploy", name: "deploy", height: 1080, action: async () => { await page.click(".launch"); await page.waitForTimeout(2900); } },
];

// The startup animation, caught mid-build and at rest.
await page.goto(`${base}/#/overview`);
await page.waitForTimeout(1250);
await page.screenshot({ path: join(outDir, "splash.png") });
console.log("  splash.png");

for (const s of shots) {
  // Fresh document per shot so edits from one screen never leak into the next.
  await page.goto(`${base}/?reset=1`);
  await page.evaluate(() => localStorage.clear());
  await page.setViewportSize({ width: 1440, height: s.height ?? 900 });
  await page.goto(`${base}/?splash=0&shot=${s.name}#/${s.route}`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  if (s.action) await s.action();
  await page.screenshot({ path: join(outDir, `${s.name}.png`) });
  console.log(`  ${s.name}.png`);
}

await browser.close();
server.close();
if (errors.length) {
  console.error("Console errors:\n" + errors.join("\n"));
  process.exit(1);
}
