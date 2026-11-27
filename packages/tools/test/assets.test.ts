import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/* Every artwork, screenshot, font, dataset and media file must be in docs/assets.json. */

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const MEDIA = /\.(png|jpe?g|webp|gif|svg|ico|icns|mp4|webm|mov|mp3|wav|ogg|ttf|otf|woff2?)$/i;
const ROOTS = ["apps/studio/assets", "apps/studio/public", "brand", "site/assets", "docs/screenshots", "docs/design", "desktop/build", "desktop/icon.png"];

function walk(rel: string): string[] {
  const abs = join(ROOT, rel);
  if (statSync(abs, { throwIfNoEntry: false })?.isFile()) return [rel];
  try {
    return readdirSync(abs, { withFileTypes: true }).flatMap((d) => walk(`${rel}/${d.name}`));
  } catch {
    return [];
  }
}

function trackedAssets(): string[] {
  let files: string[];
  try {
    files = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\n").filter(Boolean);
  } catch {
    files = ROOTS.flatMap(walk); // no git: check the folders assets live in
  }
  return files.filter((f) => (MEDIA.test(f) || f.startsWith("apps/studio/assets/") || f === "brand/wordmark-paths.json") && !f.startsWith("node_modules/"));
}

const toRegex = (glob: string) =>
  new RegExp(`^${glob.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*")}$`);

const register = JSON.parse(readFileSync(join(ROOT, "docs/assets.json"), "utf8")) as {
  assets: { id: string; paths: string[]; license: string; credit: string; owner: string; source: string }[];
};

test("every asset file is in the asset register exactly once", () => {
  const files = trackedAssets();
  assert.ok(files.length > 100, "found the assets");
  const unregistered: string[] = [];
  const twice: string[] = [];
  for (const f of files) {
    const hits = register.assets.filter((a) => a.paths.some((p) => toRegex(p).test(f)));
    if (hits.length === 0) unregistered.push(f);
    if (hits.length > 1) twice.push(`${f} (${hits.map((h) => h.id).join(", ")})`);
  }
  assert.deepEqual(unregistered, [], "Add these to docs/assets.json");
  assert.deepEqual(twice, []);
});

test("every asset says who made it, where it's from and how it's credited", () => {
  const ids = new Set<string>();
  for (const a of register.assets) {
    assert.ok(!ids.has(a.id), `duplicate id ${a.id}`);
    ids.add(a.id);
    for (const k of ["license", "credit", "owner", "source"] as const) assert.ok(a[k]?.trim(), `${a.id} needs ${k}`);
  }
});

test("the place count on the website and in the README matches the bundled place data", () => {
  const places = JSON.parse(readFileSync(join(ROOT, "apps/studio/assets/map/leonida/places.json"), "utf8")).places.length as number;
  const shown = places.toLocaleString("en-US");
  const site = readFileSync(join(ROOT, "site/index.html"), "utf8");
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  assert.ok(site.includes(`<b>${shown}</b> places to find`) && site.includes(`data-count="${places}"`), `site/index.html should say ${shown} places`);
  assert.ok(readme.includes(`${shown} places to find`), `README.md should say ${shown} places`);
});
