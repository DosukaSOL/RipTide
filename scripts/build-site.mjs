// Assembles the RipTide website and the live app into .site/ for GitHub Pages.
// Run `npm run build` first so apps/studio/dist exists. Then: node scripts/build-site.mjs [--serve]
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const ROOT = resolve(new URL("../", import.meta.url).pathname);
const out = join(ROOT, ".site");
const app = join(ROOT, "apps/studio/dist");
if (!existsSync(join(app, "index.html"))) throw new Error("Build the app first: npm run build");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(ROOT, "site"), out, { recursive: true });
cpSync(join(ROOT, "apps/studio/public/fonts"), join(out, "fonts"), { recursive: true });
mkdirSync(join(out, "brand"), { recursive: true });
cpSync(join(ROOT, "brand/mark.svg"), join(out, "brand/mark.svg"));
cpSync(app, join(out, "app"), { recursive: true });
writeFileSync(join(out, ".nojekyll"), "");
console.log("site assembled in .site/");

if (process.argv.includes("--serve")) {
  const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".json": "application/json", ".ttf": "font/ttf", ".otf": "font/otf" };
  createServer((req, res) => {
    let p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
    let f = join(out, p);
    if (!f.startsWith(out + sep) && f !== out) return res.writeHead(403).end();
    if (!extname(f)) f = join(f, "index.html");
    try {
      res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }).end(readFileSync(f));
    } catch {
      res.writeHead(404).end();
    }
  }).listen(4173, "127.0.0.1", () => console.log("http://127.0.0.1:4173/"));
}
