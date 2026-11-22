// Copies the built web app (apps/studio/dist) into desktop/app for packaging.
import { cpSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
const here = resolve(new URL("..", import.meta.url).pathname);
const src = resolve(here, "../apps/studio/dist");
if (!existsSync(resolve(src, "index.html"))) {
  console.error("Build the app first: run `npm run build` in the repository root.");
  process.exit(1);
}
rmSync(resolve(here, "app"), { recursive: true, force: true });
cpSync(src, resolve(here, "app"), { recursive: true });
console.log("copied app into desktop/app");
