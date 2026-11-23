// Prepares desktop/ for packaging:
// - copies the built web app (apps/studio/dist) into desktop/app
// - bundles electron-updater and its dependencies into one file, desktop/vendor/electron-updater.cjs,
//   so the packaged app needs no node_modules folder.
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { build } from "esbuild";

const here = resolve(new URL("..", import.meta.url).pathname);
const src = resolve(here, "../apps/studio/dist");
if (!existsSync(resolve(src, "index.html"))) {
  console.error("Build the app first: run `npm run build` in the repository root.");
  process.exit(1);
}
rmSync(resolve(here, "app"), { recursive: true, force: true });
cpSync(src, resolve(here, "app"), { recursive: true });
console.log("copied app into desktop/app");

let entry;
try {
  entry = createRequire(resolve(here, "package.json")).resolve("electron-updater");
} catch {
  console.error("Install the desktop dependencies first: run `npm install` in desktop/.");
  process.exit(1);
}
const result = await build({
  entryPoints: [entry],
  metafile: true,
  outfile: resolve(here, "vendor/electron-updater.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  legalComments: "eof",
  logLevel: "warning",
});

// Keep the license of every package that went into the bundle next to it.
const pkgs = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  const m = /^(.*node_modules\/((?:@[^/]+\/)?[^/]+))\//.exec(input);
  if (m && !pkgs.has(m[2])) pkgs.set(m[2], resolve(here, m[1]));
}
const notices = [...pkgs].sort(([a], [b]) => a.localeCompare(b)).map(([name, dir]) => {
  const meta = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)/i.test(f));
  const text = file ? readFileSync(join(dir, file), "utf8").trim() : `License: ${meta.license}`;
  return `${name}@${meta.version} (${meta.license})\n${"-".repeat(60)}\n${text}\n`;
});
writeFileSync(resolve(here, "vendor/electron-updater.LICENSES.txt"), `Packages bundled into electron-updater.cjs\n\n${notices.join("\n")}`);
console.log(`bundled electron-updater (${pkgs.size} packages) into desktop/vendor`);
