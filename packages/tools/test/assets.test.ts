import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/* Every artwork, screenshot, font, dataset and media file must be in docs/legal/assets.json. */

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

const register = JSON.parse(readFileSync(join(ROOT, "docs/legal/assets.json"), "utf8")) as {
  assets: { id: string; paths: string[]; license: string; risk: string; mapArt: boolean; removal: string }[];
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
  assert.deepEqual(unregistered, [], "Add these to docs/legal/assets.json");
  assert.deepEqual(twice, []);
});

test("the register is honest about the map art", () => {
  const ids = new Set<string>();
  for (const a of register.assets) {
    assert.ok(!ids.has(a.id), `duplicate id ${a.id}`);
    ids.add(a.id);
    assert.ok(["low", "medium", "high"].includes(a.risk), a.id);
    assert.ok(a.license && a.removal, a.id);
    // Nothing that contains Rockstar's art may be recorded as licensed until a licence exists.
    if (a.mapArt) assert.match(a.license, /LicenseRef-Rockstar-Unlicensed/, a.id);
    if (a.mapArt) assert.equal(a.risk, "high", a.id);
  }
});
