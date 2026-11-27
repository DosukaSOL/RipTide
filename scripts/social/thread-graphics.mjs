// Branded graphics for the RipTide Tools launch thread on X (1600×900, rendered at 1.5×).
// Needs captures from scripts/video/capture-tools.mjs. Usage:
//   OUT=.video/capture SOCIAL=.video/social node scripts/social/thread-graphics.mjs [--chrome path]
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { animatedLogoSvg } from "../video/animated-logo.mjs";

const ROOT = resolve(new URL("../../", import.meta.url).pathname);
const CAP = resolve(process.env.OUT ?? join(ROOT, ".video/capture"));
const DEST = resolve(process.env.SOCIAL ?? join(ROOT, ".video/social"));
await mkdir(DEST, { recursive: true });
const logo = (scale, id) => animatedLogoSvg({ id, scale, delay: -20 }); // final frame

const css = `
@font-face{font-family:Adventor;src:url(/fonts/Adventor-Bold.otf)}
@font-face{font-family:"DM Sans";src:url(/fonts/DMSans.ttf);font-weight:100 1000}
@font-face{font-family:Anon;src:url(/fonts/AnonymousPro.ttf)}
*{margin:0;box-sizing:border-box}
html,body{width:1600px;height:900px;overflow:hidden}
body{position:relative;color:#F4E9DC;font-family:"DM Sans";-webkit-font-smoothing:antialiased;
 background:radial-gradient(70% 60% at 50% -15%,rgba(255,79,154,.26),transparent 70%),radial-gradient(40% 40% at 90% 0%,rgba(255,179,107,.12),transparent 70%),linear-gradient(#150f2b,#0e0b1e)}
.tide{position:absolute;left:0;right:0;bottom:0;height:260px;opacity:.9}
.foot{position:absolute;left:72px;right:72px;bottom:44px;display:flex;align-items:center;justify-content:space-between;font-size:22px;color:#A79DC8}
.foot .url{font-family:Anon;font-size:23px;color:#D5CCE6}
.eyebrow{display:inline-flex;align-items:center;gap:12px;height:46px;padding:0 20px;border-radius:999px;font-size:21px;font-weight:700}
.eyebrow i{width:10px;height:10px;border-radius:50%;background:currentColor;box-shadow:0 0 12px currentColor}
.pink{color:#FF8CBD;background:rgba(255,79,154,.13);border:1px solid rgba(255,79,154,.38)}
.sea{color:#3DF2D0;background:rgba(61,242,208,.10);border:1px solid rgba(61,242,208,.35)}
.sun{color:#FFB36B;background:rgba(255,179,107,.12);border:1px solid rgba(255,179,107,.35)}
h1{font:700 76px/1.02 Adventor;letter-spacing:-.03em}
h1 .g,.g{background:linear-gradient(90deg,#FFB36B,#FF6F7D 45%,#FF4F9A);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{font-size:28px;line-height:1.4;color:#D5CCE6}
.frame{border-radius:18px;overflow:hidden;border:1px solid #3a2f66;box-shadow:0 40px 90px rgba(4,2,14,.7);background:#110d24}
.frame img{display:block;width:100%}
.card{border-radius:20px;background:linear-gradient(180deg,#221a42,#19132f);border:1px solid #33295c;position:relative}
.bar{position:absolute;left:20px;top:30px;width:5px;height:34px;border-radius:3px;background:linear-gradient(#FF4F9A,#FFB36B)}
`;
const tide = `<svg class="tide" viewBox="0 0 1600 260" preserveAspectRatio="none" aria-hidden="true">
${[[60, 14, "61,242,208", 0.14], [110, 18, "255,79,154", 0.12], [160, 22, "255,179,107", 0.1], [210, 26, "61,242,208", 0.08]]
  .map(([y, a, c, o], i) => {
    let d = "";
    for (let x = 0; x <= 1600; x += 20) d += `${x ? "L" : "M"}${x},${(y + Math.sin(x * (0.006 - i * 0.0008) + i) * a).toFixed(1)}`;
    return `<path d="${d}" fill="none" stroke="rgba(${c},${o})" stroke-width="2"/>`;
  })
  .join("")}</svg>`;
const foot = (right = "dosukasol.github.io/RipTide") => `<div class="foot"><div style="display:flex;align-items:center;gap:14px">${logo(0.42, "F")}<span style="font:700 22px DM Sans;letter-spacing:.3em;color:#CFC6E2">TOOLS</span></div><span class="url">${right}</span></div>`;
const page = (body, n) => `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><style>${css}</style></head><body>${tide}${body}${n === "09-try-it" ? "" : foot()}</body></html>`;

const G = {
  // 2: what it is
  "02-what-it-is": `
  <div style="position:absolute;left:72px;top:70px;width:1456px">
    <span class="eyebrow pink"><i></i>RipTide Tools</span>
    <h1 style="margin-top:22px">Five tools. <span class="g">One window.</span></h1>
    <p class="sub" style="margin-top:14px">All running at once, so you never lose your place.</p>
  </div>
  <div style="position:absolute;left:72px;right:72px;top:320px;display:grid;grid-template-columns:repeat(5,1fr);gap:20px">
    ${[["map", "Interactive Map", "Official map of Leonida", "sea"], ["vicelab-stats", "ViceLab", "Real FPS and 1% lows", "pink"], ["heist", "Heist Ops", "Plan the job together", "sun"], ["studio", "RipTide Studio", "Servers without code", "sea"], ["workspaces", "Workspaces", "Every monitor, used", "sun"]]
      .map(([img, t, s, c]) => `<div class="card" style="padding:14px 14px 22px">
        <div class="frame" style="border-radius:12px;box-shadow:none"><img src="/cap/${img}.png" style="aspect-ratio:1/1;object-fit:cover;object-position:66% 40%"></div>
        <div style="margin:18px 6px 0;font:700 27px/1.15 Adventor;letter-spacing:-.01em">${t}</div>
        <div style="margin:8px 6px 0;font-size:19px;color:#C9BFDD">${s}</div>
        <span class="eyebrow ${c}" style="position:absolute;right:20px;top:22px;height:12px;width:12px;padding:0;border-radius:50%"></span>
      </div>`)
      .join("")}
  </div>`,
  // 3: map
  "03-map": `
  <div style="position:absolute;left:72px;top:96px;width:560px">
    <span class="eyebrow sea"><i></i>Interactive Map</span>
    <h1 style="margin-top:24px">The official map of <span class="g">Leonida.</span></h1>
    <p class="sub" style="margin-top:22px">Search anything, filter by region and tick places off as you find them.</p>
    <div style="display:flex;gap:40px;margin-top:40px">
      ${[["1,028", "places to find"], ["9", "categories"], ["8", "playthroughs"]].map(([n, l]) => `<div><div class="g" style="font:700 64px/1 Adventor">${n}</div><div style="font-size:20px;color:#A79DC8;margin-top:8px">${l}</div></div>`).join("")}
    </div>
  </div>
  <div class="frame" style="position:absolute;left:690px;top:110px;width:850px"><img src="/cap/map-place.png"></div>`,
  // 4: second screen
  "04-second-screen": `
  <div style="position:absolute;left:0;right:0;top:70px;text-align:center">
    <span class="eyebrow sun"><i></i>Workspaces</span>
    <h1 style="margin-top:22px;font-size:66px">Map on screen two. <span class="g">Everything else on one.</span></h1>
    <p class="sub" style="margin-top:14px">Pop it out, keep every filter. Windows come back where you left them.</p>
  </div>
  ${[["vicelab-stats", 140, "MAIN DISPLAY", false], ["map-window", 830, "SECOND DISPLAY", true]]
    .map(([img, x, l, glow]) => `<div style="position:absolute;left:${x}px;top:300px;width:620px;text-align:center">
      <div style="border:10px solid #1c1636;border-radius:14px;overflow:hidden;box-shadow:0 30px 70px rgba(4,2,14,.7),0 0 0 ${glow ? 3 : 1}px ${glow ? "rgba(61,242,208,.8)" : "#3a2f66"}${glow ? ",0 0 50px rgba(61,242,208,.35)" : ""}"><img src="/cap/${img}.png" style="display:block;width:100%"></div>
      <div style="width:80px;height:36px;margin:0 auto;background:linear-gradient(#251d46,#1a1433)"></div>
      <div style="width:220px;height:10px;margin:0 auto;border-radius:6px;background:#251d46"></div>
      <div style="margin-top:14px;font-size:17px;letter-spacing:.18em;color:#8a80ad">${l}</div></div>`)
    .join("")}
  <svg style="position:absolute;left:760px;top:460px" width="80" height="40" viewBox="0 0 80 40"><path d="M4 20h64M54 6l14 14-14 14" fill="none" stroke="#3DF2D0" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  // 5: vicelab
  "05-vicelab": `
  <div class="frame" style="position:absolute;left:60px;top:110px;width:850px"><img src="/cap/vicelab-stats.png"></div>
  <div style="position:absolute;left:970px;top:110px;width:570px">
    <span class="eyebrow pink"><i></i>ViceLab</span>
    <h1 style="margin-top:24px">Know what your PC <span class="g">really does.</span></h1>
    <p class="sub" style="margin-top:22px">Real FPS, 1% lows and frame-time stability from your own captures. Then settings picked from your own runs.</p>
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:30px">
      ${["PresentMon", "CapFrameX", "MangoHud", "OCAT", "FrameView"].map((t) => `<span style="padding:9px 16px;border-radius:10px;background:#221a42;border:1px solid #3a2f66;font-size:19px;font-weight:600">${t}</span>`).join("")}
    </div>
  </div>`,
  // 6: heist + studio
  "06-heist-studio": `
  <div style="position:absolute;left:0;right:0;top:66px;text-align:center">
    <h1>Plan the job. <span class="g">Build the server.</span></h1>
  </div>
  ${[["heist", 72, "Heist Ops", "sun", "Roles, phases, checklists and shared notes for your crew."], ["studio", 818, "RipTide Studio", "sea", "Rules, economy, mods and roles with no code. FiveM today."]]
    .map(([img, x, t, c, s]) => `<div style="position:absolute;left:${x}px;top:210px;width:710px">
      <div class="frame"><img src="/cap/${img}.png"></div>
      <div style="display:flex;align-items:center;gap:14px;margin-top:24px"><span class="eyebrow ${c}"><i></i>${t}</span></div>
      <p style="margin-top:14px;font-size:24px;line-height:1.4;color:#D5CCE6">${s}</p></div>`)
    .join("")}`,
  // 7: honest status
  "07-whats-next": `
  <div style="position:absolute;left:72px;top:70px;width:1456px">
    <span class="eyebrow pink"><i></i>The honest part</span>
    <h1 style="margin-top:22px">Built ahead of <span class="g">GTA 6 on PC.</span></h1>
    <p class="sub" style="margin-top:14px">The rest gets fully built as Rockstar shares more info and access.</p>
  </div>
  <div style="position:absolute;left:72px;right:72px;top:380px;display:grid;grid-template-columns:repeat(3,1fr);gap:22px">
    ${[["Works today", "#3DF2D0", ["Official map of Leonida", "ViceLab with your captures", "Heist Ops crew plans", "Studio builds for FiveM", "Pop-out windows"]], ["Coming next", "#FFB36B", ["Live crew rooms", "One-click server hosting", "A desktop app", "Collectibles on the map"]], ["When GTA 6 PC & Online land", "#FF4F9A", ["GTA 6 benchmarks and presets", "GTA 6 server support", "Everything that needs Online"]]]
      .map(([t, c, items]) => `<div class="card" style="padding:28px 30px">
        <div style="display:flex;align-items:center;gap:12px;font:700 26px Adventor"><span style="width:12px;height:12px;border-radius:50%;background:${c};box-shadow:0 0 14px ${c}"></span>${t}</div>
        <ul style="margin:18px 0 0;padding-left:22px;font-size:21px;line-height:1.6;color:#D5CCE6">${items.map((i) => `<li>${i}</li>`).join("")}</ul></div>`)
      .join("")}
  </div>`,
  // 8: why
  "08-why-riptide": `
  <div style="position:absolute;left:0;right:0;top:72px;text-align:center">
    <h1>Why <span class="g">RipTide</span></h1>
  </div>
  <div style="position:absolute;left:72px;right:72px;top:230px;display:grid;grid-template-columns:repeat(3,1fr);gap:22px">
    ${[["All in one app", "Five tools, one window, one workspace"], ["Two screens, one setup", "Pop any tool out and it remembers where"], ["Stays on your PC", "No account. Nothing uploaded"], ["Never touches the game", "No memory reads, no injection, no bots"], ["Honest data", "Your own captures, credited map data"], ["Ready for GTA 6 on PC", "Built to support it the day PC tools land"]]
      .map(([t, s]) => `<div class="card" style="padding:30px 30px 30px 44px;height:200px"><span class="bar"></span>
        <div style="font:700 32px/1.15 Adventor;letter-spacing:-.01em">${t}</div>
        <div style="margin-top:14px;font-size:22px;line-height:1.45;color:#C9BFDD">${s}</div></div>`)
      .join("")}
  </div>`,
  // 9: try it
  "09-try-it": `
  <div style="position:absolute;inset:0;background:radial-gradient(40% 42% at 50% 40%,rgba(255,79,154,.22),transparent 70%)"></div>
  <div style="position:absolute;left:50%;top:230px;transform:translate(-50%,-50%)">${logo(1.7, "C")}</div>
  <div style="position:absolute;left:560px;top:340px;width:480px;height:3px;border-radius:2px;background:linear-gradient(90deg,transparent,#FFB36B 22%,#FF6F7D 50%,#FF4F9A 78%,transparent);box-shadow:0 0 18px rgba(255,79,154,.6)"></div>
  <div style="position:absolute;left:0;right:0;top:380px;text-align:center">
    <h1 style="font-size:64px">Try it free. <span class="g">Right in your browser.</span></h1>
    <p class="sub" style="margin-top:16px">No account. No install. Nothing uploaded.</p>
  </div>
  <div style="position:absolute;left:0;right:0;top:590px;display:flex;justify-content:center;gap:24px">
    ${[["Website", "dosukasol.github.io/RipTide"], ["Source", "github.com/DosukaSOL/RipTide"]]
      .map(([l, u]) => `<div class="card" style="padding:22px 30px;text-align:left"><div style="font-size:18px;letter-spacing:.16em;color:#A79DC8">${l.toUpperCase()}</div><div style="margin-top:8px;font:700 28px Anon;color:#F4E9DC">${u}</div></div>`)
      .join("")}
  </div>`,
};

const types = { ".png": "image/png", ".ttf": "font/ttf", ".otf": "font/otf" };
let current = "";
const server = createServer(async (req, res) => {
  const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
  try {
    if (u === "/g") return res.writeHead(200, { "content-type": "text/html" }).end(page(G[current], current));
    let base, rel;
    if (u.startsWith("/cap/")) (base = CAP), (rel = u.slice(5));
    else if (u.startsWith("/fonts/")) (base = join(ROOT, "apps/studio/public/fonts")), (rel = u.slice(7));
    else return res.writeHead(404).end();
    const f = join(base, normalize(rel).replace(/^([/\\])+/, ""));
    if (!f.startsWith(base + sep)) return res.writeHead(403).end();
    res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" }).end(await readFile(f));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ci = process.argv.indexOf("--chrome");
const browser = await chromium.launch(ci > 0 ? { executablePath: process.argv[ci + 1] } : {});
const p = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.5 });
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
p.on("response", (r) => r.status() >= 400 && errs.push(`${r.status()} ${r.url()}`));
for (const name of Object.keys(G)) {
  current = name;
  await p.goto(`http://127.0.0.1:${server.address().port}/g?${name}`);
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? 1 : new Promise((r) => (i.onload = i.onerror = r))))));
  await p.waitForTimeout(150);
  await p.screenshot({ path: join(DEST, `${name}.png`) });
  console.log("wrote", name);
}
await browser.close();
server.close();
if (errs.length) {
  console.error(errs);
  process.exit(1);
}
