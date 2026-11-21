// Renders brand images (readme banner, social preview, logo PNGs) from brand/mark.svg.
// Usage: node scripts/brand.mjs [--chrome /path/to/chrome]
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const mark = readFileSync("brand/mark.svg", "utf8");
// Inline the fonts: pages made with setContent can't load file:// URLs.
const font = (f, type) => `data:${type};base64,${readFileSync(resolve("apps/studio/public/fonts", f)).toString("base64")}`;

const css = `
@font-face { font-family: Adventor; src: url(${font("Adventor-Bold.otf", "font/otf")}); }
@font-face { font-family: "DM Sans"; src: url(${font("DMSans.ttf", "font/ttf")}); font-weight: 100 1000; }
* { margin: 0; box-sizing: border-box; }
body { background: #130f26; color: #f4e9dc; font-family: "DM Sans"; overflow: hidden; }
.word { font-family: Adventor; letter-spacing: -.02em; line-height: 1; }
.sea { position: absolute; left: 0; right: 0; bottom: 0; }
`;

const scene = (w, h, horizon) => `
<svg class="sea" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <radialGradient id="g" cx=".78" cy="${horizon / h}" r=".55">
      <stop offset="0" stop-color="#ff4f9a" stop-opacity=".38"/><stop offset="1" stop-color="#ff4f9a" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFB36B"/><stop offset=".6" stop-color="#FF6F7D"/><stop offset="1" stop-color="#FF3D9A"/></linearGradient>
    <linearGradient id="hz" x1="0" x2="1"><stop offset="0" stop-color="#FFB36B" stop-opacity="0"/><stop offset=".5" stop-color="#FF6F7D"/><stop offset="1" stop-color="#FF4F9A" stop-opacity=".2"/></linearGradient>
    <clipPath id="sky"><rect width="${w}" height="${horizon}"/></clipPath>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <circle cx="${w * 0.78}" cy="${horizon + 30}" r="${h * 0.26}" fill="url(#sun)" clip-path="url(#sky)"/>
  <line x1="0" x2="${w}" y1="${horizon}" y2="${horizon}" stroke="url(#hz)" stroke-width="2"/>
  ${[0, 1, 2, 3, 4].map((i) => `<rect x="${w * 0.78 - (130 - i * 22)}" y="${horizon + 14 + i * 14}" width="${(130 - i * 22) * 2}" height="4" rx="2" fill="#FF6F7D" opacity="${0.5 - i * 0.09}"/>`).join("")}
</svg>`;

const pages = {
  "brand/banner.png": {
    w: 1600, h: 560,
    html: (w, h) => `${scene(w, h, 380)}
      <div style="position:absolute;left:110px;top:150px;display:flex;align-items:center;gap:28px">
        <div style="width:132px;height:132px">${mark}</div>
        <div class="word" style="font-size:132px">riptide</div>
      </div>
      <div style="position:absolute;left:114px;top:322px;font-size:30px;color:#d9cfe6;max-width:760px;line-height:1.35">Design your server once. Deploy it anywhere.</div>`,
  },
  "brand/social-preview.png": {
    w: 1280, h: 640,
    html: (w, h) => `${scene(w, h, 430)}
      <div style="position:absolute;left:96px;top:170px;display:flex;align-items:center;gap:24px">
        <div style="width:112px;height:112px">${mark}</div>
        <div class="word" style="font-size:112px">riptide</div>
      </div>
      <div style="position:absolute;left:100px;top:320px;font-size:30px;color:#d9cfe6;max-width:640px;line-height:1.35">The no-code server studio, getting ready for GTA VI on PC.</div>`,
  },
  "brand/logo-512.png": { w: 512, h: 512, transparent: true, html: () => `<div style="width:512px;height:512px">${mark}</div>` },
  "brand/logo-tile-512.png": { w: 512, h: 512, html: () => `<div style="width:512px;height:512px;background:#130f26;border-radius:112px;padding:80px">${mark}</div>` },
  "brand/lockup.png": {
    w: 980, h: 240, transparent: true,
    html: () => `<div style="display:flex;align-items:center;gap:26px;padding:40px"><div style="width:160px;height:160px">${mark}</div><div class="word" style="font-size:150px">riptide</div></div>`,
  },
};

const chromeFlag = process.argv.indexOf("--chrome");
const browser = await chromium.launch(chromeFlag > 0 ? { executablePath: process.argv[chromeFlag + 1] } : {});
for (const [file, p] of Object.entries(pages)) {
  const page = await browser.newPage({ viewport: { width: p.w, height: p.h }, deviceScaleFactor: file.includes("logo") ? 1 : 2 });
  const bg = p.transparent ? "body{background:transparent}" : "";
  await page.setContent(`<html><head><style>${css}${bg}</style></head><body style="width:${p.w}px;height:${p.h}px;position:relative">${p.html(p.w, p.h)}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await page.screenshot({ path: file, omitBackground: !!p.transparent });
  await page.close();
  console.log(`  ${file}`);
}
await browser.close();
