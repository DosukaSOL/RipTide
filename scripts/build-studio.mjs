// Builds Riptide Studio into apps/studio/dist. Pass --serve for a local dev server.
import { context } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const out = "apps/studio/dist";
const serve = process.argv.includes("--serve");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync("apps/studio/index.html", `${out}/index.html`);
cpSync("apps/studio/public", out, { recursive: true });
cpSync("brand/mark.svg", `${out}/favicon.svg`);
// The shell uses the real brand files directly, never redrawn copies.
mkdirSync(`${out}/brand`, { recursive: true });
cpSync("brand/mark.svg", `${out}/brand/mark.svg`);
cpSync("brand/lockup.png", `${out}/brand/lockup.png`);

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
  define: { "process.env.NODE_ENV": serve ? '"development"' : '"production"' },
  legalComments: "none",
  logLevel: "info",
});

if (serve) {
  await ctx.watch();
  // Bound to localhost only, never exposed to the network.
  const { port } = await ctx.serve({ servedir: out, host: "127.0.0.1", port: 5173 });
  console.log(`Riptide Studio on http://127.0.0.1:${port}`);
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
