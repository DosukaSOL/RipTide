// Builds Riptide Studio into apps/studio/dist. Pass --serve for a local dev server.
import { context } from "esbuild";
import { writeLicenses } from "./licenses.mjs";
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";

const out = process.env.RIPTIDE_STUDIO_OUT || "apps/studio/dist";
const serve = process.argv.includes("--serve");
// RIPTIDE_MAP_ART=off builds without the Leonida map art (© Rockstar Games): only the place data
// ships, and the map uses RipTide's own schematic grid. See docs/legal/MAP_RIGHTS_DECISION.md.
const mapArt = !/^(off|false|0|no)$/i.test(process.env.RIPTIDE_MAP_ART ?? "on");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync("apps/studio/index.html", `${out}/index.html`);
cpSync("apps/studio/public", out, { recursive: true });
cpSync("brand/mark.svg", `${out}/favicon.svg`);
// The shell uses the real brand files directly, never redrawn copies.
mkdirSync(`${out}/brand`, { recursive: true });
cpSync("brand/mark.svg", `${out}/brand/mark.svg`);
cpSync("brand/lockup.png", `${out}/brand/lockup.png`);
// Leonida places, and the map art unless it's switched off (see THIRD_PARTY_NOTICES.md).
const mapSrc = "apps/studio/assets/map/leonida";
mkdirSync(`${out}/map/leonida`, { recursive: true });
for (const name of readdirSync(mapSrc)) {
  const art = name === "manifest.json" || /^\d+$/.test(name);
  if (art && !mapArt) continue;
  cpSync(`${mapSrc}/${name}`, `${out}/map/leonida/${name}`, { recursive: true });
}
console.log(mapArt ? "Map art: included" : "Map art: left out (RIPTIDE_MAP_ART=off)");

const ctx = await context({
  entryPoints: { app: "apps/studio/src/main.tsx" },
  outdir: out,
  bundle: true,
  format: "esm",
  target: "es2022",
  jsx: "automatic",
  tsconfig: "tsconfig.json",
  minify: !serve,
  sourcemap: serve,
  loader: { ".otf": "file", ".ttf": "file" },
  external: ["./fonts/*"],
  define: { "process.env.NODE_ENV": serve ? '"development"' : '"production"', __MAP_ART__: String(mapArt) },
  legalComments: "none", // notices go to THIRD_PARTY_LICENSES.txt instead (scripts/licenses.mjs)
  metafile: true,
  logLevel: "info",
});

if (serve) {
  await ctx.watch();
  // Bound to localhost only, never exposed to the network.
  const { port } = await ctx.serve({ servedir: out, host: "127.0.0.1", port: 5173 });
  console.log(`Riptide Studio on http://127.0.0.1:${port}`);
} else {
  const result = await ctx.rebuild();
  await ctx.dispose();
  const pkgs = writeLicenses(result.metafile, `${out}/THIRD_PARTY_LICENSES.txt`);
  console.log(`Licences: ${pkgs.map((p) => p.name).join(", ")}`);
}
