// Brand video frames for RipTide intros, outros and trailers.
// Pauses every CSS animation and steps time frame by frame, so output is exact and smooth.
// Usage: node scripts/video/frames.mjs <scene>   (scenes listed in S below)
// Env: FRAMES_DIR (default .video/frames), CHROME (optional Chrome executable path)
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { chromium } from "playwright";
import { animatedLogoSvg } from "./animated-logo.mjs";

const R = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const b64 = (p) => readFileSync(p).toString("base64");
const font = (f, t) => `data:${t};base64,${b64(`${R}/apps/studio/public/fonts/${f}`)}`;
const shot = (n) => `data:image/png;base64,${b64(`${R}/docs/screenshots/${n}.png`)}`;
const mark = readFileSync(`${R}/brand/mark.svg`, "utf8");


const FPS = 30;
const base = `
@font-face{font-family:Adventor;src:url(${font("Adventor-Bold.otf", "font/otf")})}
@font-face{font-family:"DM Sans";src:url(${font("DMSans.ttf", "font/ttf")});font-weight:100 1000}
@font-face{font-family:Anon;src:url(${font("AnonymousPro.ttf", "font/ttf")})}
*{margin:0;box-sizing:border-box}
html,body{width:1920px;height:1080px;overflow:hidden}
body{position:relative;color:#F4E9DC;font-family:"DM Sans"}
.ease{animation-timing-function:cubic-bezier(.2,.8,.2,1)!important}
@keyframes in{from{opacity:0;transform:translateY(24px)}}
@keyframes out{to{opacity:0;transform:translateY(-12px)}}
@keyframes fade{from{opacity:0}}
@keyframes fadeout{to{opacity:0}}
@keyframes grow{from{transform:scaleX(0)}}
.cap{position:absolute;left:120px;bottom:120px}
.cap .t{font:700 84px/1.04 Adventor;letter-spacing:-.025em;text-shadow:0 4px 40px rgba(10,6,25,.6)}
.cap .s{font-size:34px;color:#E8DEF0;margin-top:18px;text-shadow:0 2px 20px rgba(10,6,25,.8)}
.scrim{position:absolute;inset:0;background:linear-gradient(0deg,rgba(13,9,28,.82),rgba(13,9,28,.15) 55%,transparent)}
.chip{display:inline-flex;align-items:center;gap:12px;height:48px;padding:0 22px;border-radius:999px;font-size:24px;font-weight:600}
.sea{background:rgba(61,242,208,.15);color:#3DF2D0}.pink{background:rgba(255,79,154,.16);color:#FF7DB4}.sun{background:rgba(255,179,107,.16);color:#FFB36B}
`;
const night = `background:radial-gradient(70% 60% at 80% 115%,rgba(255,79,154,.28),transparent 60%),radial-gradient(50% 50% at 100% 0%,rgba(255,179,107,.10),transparent 60%),#130F26;`;
const A = (name, dur, delay, extra = "") => `animation:${name} ${dur}s cubic-bezier(.2,.8,.2,1) ${delay}s both;${extra}`;

// Caption overlay (transparent) used over Higgsfield footage.
const caption = (t, s, dur, chip = "") => ({
  dur, alpha: true,
  html: `<div class="scrim" style="${A("fade", 0.6, 0)}"></div>
  <div class="cap">${chip ? `<div class="chip ${chip[0]}" style="margin-bottom:24px;${A("in", 0.7, 0.2)}">${chip[1]}</div>` : ""}
  <div class="t" style="${A("in", 0.8, 0.35)}">${t}</div>${s ? `<div class="s" style="${A("in", 0.8, 0.6)}">${s}</div>` : ""}</div>
  <div style="position:absolute;inset:0;${A("fadeout", 0.4, dur - 0.4)}"></div>`,
  // whole overlay fades out at the end
  wrapOut: dur - 0.45,
});

// UI scene: framed screenshot drifting slowly, caption at left.
const ui = (name, title, sub, chip, dur, { x = 0, y = 0, w = 2880, h = 1800, from = 1.0, to = 1.06 } = {}) => {
  const W = 1180;
  const scale = W / w;
  return {
    dur, alpha: false,
    html: `<div style="position:absolute;inset:0;${night}"></div>
    <div style="position:absolute;left:110px;top:300px;width:520px">
      <div class="chip ${chip[0]}" style="${A("in", 0.7, 0.1)}">${chip[1]}</div>
      <div style="font:700 72px/1.04 Adventor;letter-spacing:-.025em;margin-top:28px;${A("in", 0.8, 0.25)}">${title}</div>
      <div style="font-size:30px;line-height:1.4;color:#D9CFE6;margin-top:24px;${A("in", 0.8, 0.45)}">${sub}</div>
    </div>
    <div style="position:absolute;left:680px;top:${540 - (h * scale) / 2}px;width:${W}px;height:${h * scale}px;border-radius:22px;overflow:hidden;border:1px solid #2F2756;box-shadow:0 50px 100px rgba(5,3,15,.65);${A("in", 0.9, 0.15)}">
      <img src="${shot(name)}" style="position:absolute;left:${-x * scale}px;top:${-y * scale}px;width:${2880 * scale}px;max-width:none;transform-origin:30% 40%;animation:push ${dur}s linear 0s both">
    </div>
    <style>@keyframes push{from{transform:scale(${from})}to{transform:scale(${to})}}</style>`,
  };
};

const S = {
  // Intro/outro: exact animated logo + tagline, transparent.
  logo: {
    dur: 6, alpha: true,
    html: `<div style="position:absolute;inset:0;background:radial-gradient(36% 26% at 50% 36%,rgba(13,9,28,.55),transparent 75%);${A("fade", 1, 0)}"></div>
    <div style="position:absolute;left:50%;top:330px;transform:translate(-50%,-50%)">${animatedLogoSvg({ id: "L", scale: 1.75 })}</div>
    <div style="position:absolute;left:50%;top:482px;width:520px;margin-left:-260px;height:2px;background:linear-gradient(90deg,transparent,#FFB36B 25%,#FF6F7D 50%,#FF4F9A 75%,transparent);transform-origin:center;${A("grow", 1.4, 1.2)}"></div>
    <div style="position:absolute;left:0;right:0;top:508px;text-align:center;font:600 28px 'DM Sans';letter-spacing:.32em;color:#E8DEF0;${A("in", 0.9, 1.9)}">RIPTIDE&nbsp;TOOLS</div>`,
  },
  cap1: caption("GTA VI is coming to PC.", "And everyone will want their own server.", 4, ["sun", "Heads up"]),
  cap2: caption("Most will spend weeks<br>fighting config files.", "", 3.5),
  meet: {
    dur: 3.5, alpha: false,
    html: `<div style="position:absolute;inset:0;${night}"></div>
    <div style="position:absolute;left:0;right:0;top:330px;text-align:center;font:600 34px 'DM Sans';color:#D9CFE6;${A("in", 0.7, 0.1)}">Meet</div>
    <div style="position:absolute;left:50%;top:540px;transform:translate(-50%,-50%)">${animatedLogoSvg({ id: "M", scale: 1.6, delay: -0.3 })}</div>
    <div style="position:absolute;left:0;right:0;top:700px;text-align:center;font-size:34px;color:#D9CFE6;${A("in", 0.8, 1.6)}">The no-code server studio.</div>`,
  },
  ui1: ui("overview", "Your whole server on one screen.", "Rules, roles, economy, mods and visuals. No code.", ["pink", "RipTide Studio"], 3.2),
  ui2: ui("economy", "See inflation before your players do.", "60 days of player wallets, simulated before launch.", ["sun", "Economy forecast"], 3.2, { x: 540, y: 380, w: 2160, h: 1150, from: 1, to: 1.07 }),
  ui3: ui("rulebook", "Rules in plain English. Enforced.", "Plus your rules page and Discord post, always in sync.", ["sea", "Rulebook"], 3.2, { x: 540, y: 420, w: 2280, h: 1180 }),
  ui4: ui("mods", "Conflicts caught before install.", "One-click fixes and a live performance budget.", ["pink", "Mods"], 3.2, { x: 540, y: 280, w: 2320, h: 1200 }),
  ui5: ui("deploy", "Pick a region. Deploy.", "Hosting closest to your community. Preview servers. Rollbacks.", ["sea", "Deploy"], 3.2, { x: 500, y: 330, w: 2350, h: 1440 }),
  cap5: caption("One click. Live in minutes.", "Preview servers, rollbacks and backups built in.", 3.5, ["sea", "Coming with RipTide hosting"]),
  cap6: caption("Ready for GTA VI on day one.", "When GTA VI Online drops, we aim to be first to support it.", 4, ["pink", "GTA VI"]),
  cta: {
    dur: 4.5, alpha: false,
    html: `<div style="position:absolute;inset:0;${night}"></div>
    <div style="position:absolute;left:50%;top:400px;transform:translate(-50%,-50%)">${animatedLogoSvg({ id: "C", scale: 1.5, delay: -0.2 })}</div>
    <div style="position:absolute;left:0;right:0;top:560px;text-align:center;${A("in", 0.8, 1.5)}"><span class="chip pink" style="font-size:28px;height:56px">Testers wanted for GTA V presets</span></div>
    <div style="position:absolute;left:0;right:0;top:665px;text-align:center;font:700 44px Adventor;${A("in", 0.8, 1.8)}">DM @DosukaSOL</div>
    <div style="position:absolute;left:0;right:0;top:740px;text-align:center;font:28px Anon;color:#A69DC9;${A("in", 0.8, 2.0)}">github.com/DosukaSOL/RipTide</div>
    <div style="position:absolute;left:0;right:0;bottom:56px;text-align:center;font-size:20px;color:#7A71A3;${A("fade", 0.8, 2.2)}">Not affiliated with Rockstar Games or Take-Two Interactive.</div>`,
  },
};

const name = process.argv[2];
const scene = S[name];
if (!scene) throw new Error(`unknown scene ${name}`);
const dir = `${process.env.FRAMES_DIR ?? `${R}/.video/frames`}/${name}`;
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const bg = scene.alpha ? "html,body{background:transparent}" : "body{background:#130F26}";
await page.setContent(`<html><head><style>${base}${bg}</style></head><body><div id="root" style="position:absolute;inset:0">${scene.html}</div></body></html>`);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
const frames = Math.round(scene.dur * FPS);
for (let i = 0; i < frames; i++) {
  const t = (i / FPS) * 1000;
  await page.evaluate(([t, outAt]) => {
    document.getAnimations().forEach((a) => (a.currentTime = t));
    if (outAt) {
      const root = document.getElementById("root");
      root.style.opacity = String(Math.max(0, Math.min(1, 1 - (t / 1000 - outAt) / 0.45)));
    }
  }, [t, scene.wrapOut ?? 0]);
  const f = `${dir}/f${String(i + 1).padStart(4, "0")}`;
  if (scene.alpha) await page.screenshot({ path: `${f}.png`, omitBackground: true });
  else await page.screenshot({ path: `${f}.jpg`, type: "jpeg", quality: 92 });
}
await browser.close();
console.log(`${name}: ${frames} frames`);
