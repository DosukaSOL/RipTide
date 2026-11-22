// RipTide Tools trailer: a frame-exact 1080p60 render of a scripted timeline over real app captures.
// 1. npm run build   2. node scripts/video/capture-tools.mjs   3. node scripts/video/tools-trailer.mjs
// Env: OUT (captures, default .video/capture), VIDEO (output dir, default .video/trailer), MUSIC (optional audio file)
// Flags: --chrome <path>  --preview <t1,t2,...> (write stills only)  --workers <n>
import { createServer } from "node:http";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { animatedLogoSvg } from "./animated-logo.mjs";

const ROOT = resolve(new URL("../../", import.meta.url).pathname);
const CAP = resolve(process.env.OUT ?? join(ROOT, ".video/capture"));
const VID = resolve(process.env.VIDEO ?? join(ROOT, ".video/trailer"));
await mkdir(VID, { recursive: true });
const arg = (n) => {
  const i = process.argv.indexOf(n);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const FPS = 60;
const W = 1920;
const H = 1080;
const { shots } = JSON.parse(readFileSync(join(CAP, "shots.json"), "utf8"));

/* ---------- beat grid: 112 BPM, first downbeat at 4.31 s ---------- */
const BEAT = 60 / 112;
const BAR = BEAT * 4;
const bar = (n) => +(4.31 + n * BAR).toFixed(3);
const END = 60;

/* ---------- timeline ---------- */
// Captions, camera moves and spotlights for the app scenes. Rects are in capture px (1600×900).
const R = (shot, key) => shots[shot]?.[key];
const focus = (r, z, dy = 0) => (r ? { fx: r.x + r.w / 2, fy: r.y + r.h / 2 + dy, z } : { fx: 800, fy: 450, z: 1 });
const SCENES = [
  { id: "intro", start: 0, end: bar(1) },
  {
    id: "home", start: bar(1), end: bar(4), badge: ["RipTide Tools", "pink"],
    shots: [{ t: 0, s: "home" }],
    cam: [{ t: 0, fx: 800, fy: 450, z: 1.0 }, { t: bar(2) - bar(1), fx: 420, fy: 470, z: 1.35 }, { t: bar(3) - bar(1), fx: 1150, fy: 560, z: 1.4 }],
    spot: [{ t: bar(2) - bar(1), r: R("home", "nav") }, { t: bar(3) - bar(1), r: R("home", "running") }],
    cap: [
      { t: 0.15, title: "Meet RipTide Tools", sub: "Studio, ViceLab, Heist Ops, the Interactive Map and Workspaces. One app." },
      { t: bar(2) - bar(1), title: "Every tool, one sidebar", sub: "Alt + 1–9 jumps straight to any of them" },
      { t: bar(3) - bar(1), title: "Keep them all running", sub: "Switch tools without losing your place" },
    ],
  },
  {
    id: "map", start: bar(4), end: bar(10), badge: ["Interactive Map", "sea"],
    shots: [{ t: 0, s: "map" }, { t: bar(6) - bar(4), s: "map-search" }, { t: bar(7) - bar(4), s: "map-place" }],
    cam: [
      { t: 0, fx: 935, fy: 560, z: 1.0 },
      { t: 0.05, fx: 1010, fy: 600, z: 1.3 },
      { t: bar(5) - bar(4), fx: 560, fy: 600, z: 1.5 },
      { t: bar(6) - bar(4), fx: 560, fy: 560, z: 1.6 },
      { t: bar(7) - bar(4), fx: 950, fy: 590, z: 1.5 },
      { t: bar(8) - bar(4), fx: 1290, fy: 580, z: 1.6 },
      { t: bar(9) - bar(4), fx: 1320, fy: 640, z: 1.75 },
    ],
    spot: [
      { t: bar(5) - bar(4), r: R("map", "progress") },
      { t: bar(6) - bar(4), r: R("map-search", "results") },
      { t: bar(7) - bar(4), r: null },
      { t: bar(8) - bar(4), r: R("map-place", "details") },
      { t: bar(9) - bar(4), r: R("map-place", "actions") },
    ],
    cap: [
      { t: 0.15, title: "The official map of Leonida", sub: "884 places to find: landmarks, shops, safehouses, garages and more" },
      { t: bar(5) - bar(4), title: "Track what you've found", sub: "Hide found, jump to the next one, up to eight playthroughs" },
      { t: bar(6) - bar(4), title: "Find anything fast", sub: "Search places, areas and shops" },
      { t: bar(7) - bar(4), title: "Right down to street level", sub: "Every marker sits on the building it belongs to" },
      { t: bar(8) - bar(4), title: "Real places, real details", sub: "What it is, what inspired it, and whether you can go inside" },
      { t: bar(9) - bar(4), title: "Mark it found. Save favourites.", sub: "Plus your own markers with notes, tags and categories" },
    ],
  },
  { id: "screens", start: bar(10), end: bar(12), badge: ["Workspaces", "sun"],
    cap: [
      { t: 0.15, title: "Pop it out to your second screen", sub: "The map keeps every filter. Your main window stays free." },
      { t: bar(11) - bar(10), title: "Windows come back where you left them", sub: "Even when a monitor gets unplugged" },
    ],
  },
  {
    id: "vicelab", start: bar(12), end: bar(16), badge: ["ViceLab", "pink"],
    shots: [{ t: 0, s: "vicelab" }, { t: bar(13) - bar(12), s: "vicelab-stats" }, { t: bar(14) - bar(12), s: "compare" }, { t: bar(15) - bar(12), s: "recommend" }],
    cam: [
      { t: 0, fx: 800, fy: 450, z: 1.0 },
      { t: 0.05, fx: 800, fy: 600, z: 1.3 },
      { t: bar(13) - bar(12), ...focus(R("vicelab-stats", "stats"), 1.22, -110) },
      { t: bar(14) - bar(12), fx: 934, fy: 660, z: 1.2 },
      { t: bar(15) - bar(12), fx: 724, fy: 590, z: 1.45 },
    ],
    spot: [{ t: bar(13) - bar(12) + 0.3, r: R("vicelab-stats", "stats") }, { t: bar(14) - bar(12), r: null }, { t: bar(15) - bar(12), r: R("recommend", "panel") }],
    wipe: { shot: "compare", rect: R("compare", "viewer") },
    cap: [
      { t: 0.15, title: "Know your hardware", sub: "Real frame times from PresentMon, CapFrameX, MangoHud, OCAT and FrameView" },
      { t: bar(13) - bar(12), title: "1% lows, not guesses", sub: "Average FPS, lows and frame-time stability from your own runs" },
      { t: bar(14) - bar(12), title: "Compare picture quality", sub: "Drag a line between two screenshots" },
      { t: bar(15) - bar(12), title: "Settings picked from your runs", sub: "Go for quality, balance or raw performance" },
    ],
  },
  {
    id: "heist", start: bar(16), end: bar(18), badge: ["Heist Ops", "sun"],
    shots: [{ t: 0, s: "heist" }],
    cam: [{ t: 0, fx: 800, fy: 450, z: 1.0 }, { t: 0.05, fx: 940, fy: 620, z: 1.3 }, { t: bar(17) - bar(16), fx: 1150, fy: 540, z: 1.5 }],
    spot: [{ t: bar(17) - bar(16), r: R("heist", "timeline") }],
    cap: [
      { t: 0.15, title: "Plan the job with your crew", sub: "Roles, phases, checklists and shared notes" },
      { t: bar(17) - bar(16), title: "Everyone knows the next move", sub: "Share plans as a file today. Live crew rooms are next." },
    ],
  },
  {
    id: "studio", start: bar(18), end: bar(20), badge: ["RipTide Studio", "sea"],
    shots: [{ t: 0, s: "studio" }, { t: bar(19) - bar(18), s: "economy" }],
    cam: [{ t: 0, fx: 800, fy: 450, z: 1.0 }, { t: 0.05, fx: 1058, fy: 470, z: 1.3 }, { t: bar(19) - bar(18), fx: 880, fy: 520, z: 1.4 }],
    spot: [],
    cap: [
      { t: 0.15, title: "Build your server without code", sub: "Rules, economy, mods and roles. FiveM today, GTA VI next." },
      { t: bar(19) - bar(18), title: "See inflation before your players do", sub: "60 days of player wallets, simulated before launch" },
    ],
  },
  { id: "why", start: bar(20), end: bar(23) },
  { id: "outro", start: bar(23), end: END },
];

const WHY = [
  ["All in one app", "Five tools, one window, one workspace"],
  ["Two screens, one setup", "Pop any tool out and it remembers where"],
  ["Stays on your PC", "No account needed. Nothing is uploaded"],
  ["Never touches the game", "No memory reads, no injection, no bots"],
  ["Honest data", "Your own captures and credited map data"],
  ["Ready for GTA VI on PC", "Built to support it the day PC tools land"],
];

/* ---------- page ---------- */
const font = (f) => `/fonts/${f}`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><style>
@font-face{font-family:Adventor;src:url(${font("Adventor-Bold.otf")})}
@font-face{font-family:"DM Sans";src:url(${font("DMSans.ttf")});font-weight:100 1000}
@font-face{font-family:Anon;src:url(${font("AnonymousPro.ttf")})}
*{margin:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#100c22}
body{position:relative;color:#F4E9DC;font-family:"DM Sans";-webkit-font-smoothing:antialiased}
.bg{position:absolute;inset:0;background:radial-gradient(60% 55% at 50% -12%,rgba(255,79,154,.22),transparent 70%),radial-gradient(40% 40% at 85% -5%,rgba(255,179,107,.10),transparent 70%),radial-gradient(70% 50% at 50% 115%,rgba(61,242,208,.05),transparent 70%),#110d24}
.scene{position:absolute;inset:0;opacity:0}
.win{position:absolute;left:210px;top:62px;width:1500px;height:843.75px;border-radius:18px;overflow:hidden;border:1px solid #33295c;box-shadow:0 40px 90px rgba(4,2,14,.7),0 0 0 1px rgba(255,255,255,.02)}
.cam{position:absolute;left:0;top:0;width:1600px;height:900px;transform-origin:0 0}
.cam img.shot{position:absolute;inset:0;width:1600px;height:900px}
.spot{position:absolute;border-radius:14px;opacity:0;box-shadow:0 0 0 9999px rgba(10,6,24,.62),0 0 0 2px #FF4F9A,0 0 26px 4px rgba(255,79,154,.55)}
.cap{position:absolute;left:210px;top:938px;padding-left:22px}
.cap:before{content:"";position:absolute;left:0;top:4px;bottom:4px;width:5px;border-radius:3px;background:linear-gradient(#FF4F9A,#FFB36B)}
.cap .t{font:700 40px/1.1 Adventor;letter-spacing:-.015em;white-space:nowrap}
.cap .s{font-size:22px;color:#CFC6E2;margin-top:8px;white-space:nowrap}
.badge{position:absolute;right:210px;top:950px;height:44px;padding:0 20px;border-radius:999px;display:flex;align-items:center;gap:10px;font:600 20px "DM Sans"}
.badge i{width:9px;height:9px;border-radius:50%;background:currentColor;box-shadow:0 0 10px currentColor}
.pink{background:rgba(255,79,154,.14);color:#FF7DB4;border:1px solid rgba(255,79,154,.35)}
.sea{background:rgba(61,242,208,.10);color:#3DF2D0;border:1px solid rgba(61,242,208,.32)}
.sun{background:rgba(255,179,107,.12);color:#FFB36B;border:1px solid rgba(255,179,107,.32)}
.line{height:3px;border-radius:2px;background:linear-gradient(90deg,transparent,#FFB36B 22%,#FF6F7D 50%,#FF4F9A 78%,transparent);box-shadow:0 0 18px rgba(255,79,154,.6)}
.mon{position:absolute;width:820px}
.mon .scr{position:relative;width:820px;height:461.25px;border-radius:14px;overflow:hidden;border:10px solid #1c1636;box-shadow:0 30px 70px rgba(4,2,14,.7),0 0 0 1px #3a2f66;background:#0f0c1f}
.mon .scr img{position:absolute;inset:0;width:100%;height:100%}
.mon .neck{width:90px;height:56px;margin:0 auto;background:linear-gradient(#251d46,#1a1433)}
.mon .foot{width:260px;height:12px;margin:0 auto;border-radius:6px;background:#251d46}
.mon .lbl{text-align:center;margin-top:18px;font-size:20px;color:#A79DC8;letter-spacing:.14em}
.card{position:absolute;width:500px;height:150px;border-radius:16px;padding:26px 28px 0 34px;background:linear-gradient(180deg,#1d1739,#17122f);border:1px solid #33295c}
.card:before{content:"";position:absolute;left:18px;top:28px;width:4px;height:34px;border-radius:2px;background:linear-gradient(#FF4F9A,#FFB36B)}
.card b{display:block;font:700 30px/1.15 Adventor;letter-spacing:-.01em}
.card span{display:block;margin-top:12px;font-size:20px;color:#C9BFDD}
.grad{background:linear-gradient(90deg,#FFB36B,#FF6F7D 45%,#FF4F9A);-webkit-background-clip:text;background-clip:text;color:transparent}
</style></head><body><div class="bg"></div>
${SCENES.map((s) => sceneHtml(s)).join("\n")}
<script>
const SCENES = ${JSON.stringify(SCENES)};
const WHY = ${JSON.stringify(WHY)};
const BEAT = ${BEAT};
${pageJs()}
</script></body></html>`;

function sceneHtml(s) {
  if (s.id === "intro")
    return `<div class="scene" id="s-intro">
      <div id="intro-glow" style="position:absolute;inset:0;background:radial-gradient(40% 40% at 50% 46%,rgba(255,79,154,.28),transparent 70%);opacity:0"></div>
      <div class="line" id="intro-line" style="position:absolute;left:660px;top:566px;width:600px;transform:scaleX(0)"></div>
      <div id="intro-logo" style="position:absolute;left:50%;top:410px;transform:translate(-50%,-50%)">${animatedLogoSvg({ id: "IL", scale: 1.9, delay: 0.55 })}</div>
      <div id="intro-tools" style="position:absolute;left:0;right:0;top:596px;text-align:center;font:600 30px 'DM Sans';letter-spacing:.42em;color:#E3D9F0;opacity:0">TOOLS</div>
      <div id="intro-tag" style="position:absolute;left:0;right:0;top:668px;text-align:center;font:700 46px Adventor;letter-spacing:-.01em;opacity:0">Every tool for your GTA life. <span class="grad">One app.</span></div>
    </div>`;
  if (s.id === "screens")
    return `<div class="scene" id="s-screens">
      <div class="mon" style="left:120px;top:220px"><div class="scr"><img id="mon-l-a" src="/cap/map.png"><img id="mon-l-b" src="/cap/vicelab.png" style="opacity:0"></div><div class="neck"></div><div class="foot"></div><div class="lbl">MAIN DISPLAY</div></div>
      <div class="mon" style="left:980px;top:220px"><div class="scr"><div style="position:absolute;inset:0;background:radial-gradient(60% 60% at 50% 50%,#1a1438,#0f0c1f)"></div><div id="mon-r-hint" style="position:absolute;inset:0;display:grid;place-items:center;font-size:22px;color:#6f6699">Second display</div></div><div class="neck"></div><div class="foot"></div><div class="lbl">SECOND DISPLAY</div></div>
      <div id="fly" style="position:absolute;left:130px;top:230px;width:800px;height:450px;border-radius:8px;overflow:hidden;box-shadow:0 30px 60px rgba(4,2,14,.6),0 0 0 2px rgba(61,242,208,.0);opacity:0"><img src="/cap/map-window.png" style="width:100%;height:100%"></div>
      ${capHtml(s)}
    </div>`;
  if (s.id === "why")
    return `<div class="scene" id="s-why">
      <div id="why-title" style="position:absolute;left:0;right:0;top:250px;text-align:center;font:700 64px Adventor;letter-spacing:-.02em">Why <span class="grad">RipTide</span></div>
      ${WHY.map(([t, d], i) => `<div class="card" id="why-${i}" style="left:${170 + (i % 3) * 540}px;top:${440 + Math.floor(i / 3) * 190}px;opacity:0"><b>${esc(t)}</b><span>${esc(d)}</span></div>`).join("")}
    </div>`;
  if (s.id === "outro")
    return `<div class="scene" id="s-outro">
      <div style="position:absolute;inset:0;background:radial-gradient(42% 40% at 50% 44%,rgba(255,79,154,.22),transparent 70%)"></div>
      <div id="outro-logo" style="position:absolute;left:50%;top:420px;transform:translate(-50%,-50%)">${animatedLogoSvg({ id: "OL", scale: 1.75, delay: 0.1 })}</div>
      <div class="line" id="outro-line" style="position:absolute;left:690px;top:550px;width:540px;transform:scaleX(0)"></div>
      <div id="outro-a" style="position:absolute;left:0;right:0;top:590px;text-align:center;font:700 54px Adventor;letter-spacing:-.015em;opacity:0">Tools <span class="grad">preview is out</span></div>
      <div id="outro-b" style="position:absolute;left:0;right:0;top:676px;text-align:center;font-size:26px;color:#CFC6E2;opacity:0">Free to try&nbsp;&nbsp;<span style="font-family:Anon;color:#F4E9DC">github.com/DosukaSOL/RipTide</span></div>
      <div id="outro-c" style="position:absolute;left:0;right:0;top:728px;text-align:center;font-size:22px;color:#A79DC8;opacity:0">by @DosukaSOL, creator of PushFPS</div>
      <div id="outro-d" style="position:absolute;left:0;right:0;bottom:46px;text-align:center;font-size:17px;color:#6f6699;opacity:0">Independent project. Not affiliated with Rockstar Games or Take-Two Interactive. Map of Leonida © Rockstar Games, places from gtadb.org (CC BY 4.0).</div>
    </div>`;
  // app scene
  const used = [...new Set(s.shots.map((x) => x.s))];
  const wipe = s.wipe
    ? `<div class="wipe" data-shot="${s.wipe.shot}" style="position:absolute;left:${s.wipe.rect.x}px;top:${s.wipe.rect.y}px;width:${s.wipe.rect.w}px;height:${s.wipe.rect.h}px;border-radius:12px;overflow:hidden;opacity:0">
        <img src="/cap/compare-ultra.jpg" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain">
        <div class="wipe-a" style="position:absolute;inset:0;overflow:hidden"><img src="/cap/compare-low.jpg" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain"></div>
        <div class="wipe-h" style="position:absolute;top:0;bottom:0;width:4px;margin-left:-2px;background:#FF4F9A;box-shadow:0 0 18px 4px rgba(255,79,154,.7)"></div>
        <div style="position:absolute;left:14px;top:12px;padding:4px 10px;border-radius:6px;background:rgba(19,15,38,.8);font-size:13px">Low</div>
        <div style="position:absolute;right:14px;top:12px;padding:4px 10px;border-radius:6px;background:rgba(19,15,38,.8);font-size:13px">Ultra</div>
      </div>`
    : "";
  return `<div class="scene" id="s-${s.id}">
    <div class="win"><div class="cam">
      ${used.map((u) => `<img class="shot" data-shot="${u}" src="/cap/${u}.png" style="opacity:0">`).join("")}
      ${wipe}
      <div class="spot"></div>
    </div></div>
    ${capHtml(s)}
  </div>`;
}

function capHtml(s) {
  return `${s.cap.map((c, i) => `<div class="cap" data-i="${i}" style="opacity:0"><div class="t">${esc(c.title)}</div><div class="s">${esc(c.sub)}</div></div>`).join("")}
    ${s.badge ? `<div class="badge ${s.badge[1]}" style="opacity:0"><i></i>${esc(s.badge[0])}</div>` : ""}`;
}

function pageJs() {
  return `
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const eo=(x)=>1-Math.pow(1-clamp(x),3);
const eio=(x)=>{x=clamp(x);return x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2};
const p=(t,a,d)=>eo((t-a)/d);
const lerp=(a,b,k)=>a+(b-a)*k;
const $=(q,r=document)=>r.querySelector(q);
const $$=(q,r=document)=>[...r.querySelectorAll(q)];
const K=1500/1600, WW=1500, WH=843.75;

function camAt(keys,t){
  let cur=keys[0];
  for(let i=1;i<keys.length;i++){
    const k=keys[i]; if(t<k.t) break;
    const prev=cur;
    const m=eio((t-k.t)/0.9);
    cur={fx:lerp(prev.fx,k.fx,m),fy:lerp(prev.fy,k.fy,m),z:lerp(prev.z,k.z,m)};
  }
  return cur;
}
function applyCam(el,c,drift){
  const z=c.z*(1+drift), s=K*z;
  let tx=WW/2-c.fx*s, ty=WH/2-c.fy*s;
  tx=clamp(tx,WW-1600*s,0); ty=clamp(ty,WH-900*s,0);
  el.style.transform='translate('+tx.toFixed(2)+'px,'+ty.toFixed(2)+'px) scale('+s.toFixed(5)+')';
}
function captions(root,s,lt,dur){
  const caps=$$('.cap',root);
  s.cap.forEach((c,i)=>{
    const next=s.cap[i+1]; const el=caps[i];
    const tin=p(lt,c.t,0.38);
    const tout=next?clamp((lt-next.t)/0.18):0;
    const o=tin*(1-tout);
    el.style.opacity=o.toFixed(3);
    el.style.transform='translateY('+((1-tin)*14-tout*8).toFixed(1)+'px)';
  });
  const b=$('.badge',root); if(b){const k=p(lt,0.2,0.4); b.style.opacity=k; b.style.transform='translateY('+((1-k)*10)+'px)';}
}
function appScene(root,s,lt,dur){
  const cam=$('.cam',root);
  const c=camAt(s.cam,lt);
  applyCam(cam,c,0.012*(lt/dur));
  // shots crossfade
  const imgs=$$('img.shot',root);
  let active=s.shots[0].s; s.shots.forEach(x=>{if(lt>=x.t) active=x.s;});
  imgs.forEach(im=>{
    const idx=s.shots.findIndex(x=>x.s===im.dataset.shot);
    const st=s.shots[idx].t, nx=s.shots[idx+1];
    let o=idx===0?1:p(lt,st,0.3);
    if(nx && lt>=nx.t) o=1-p(lt,nx.t,0.3);
    im.style.opacity=o.toFixed(3);
  });
  // spotlight
  const sp=$('.spot',root);
  let cur=null, start=0, prevR=null;
  (s.spot||[]).forEach(x=>{ if(lt>=x.t){ prevR=cur; cur=x.r; start=x.t; } });
  if(cur){
    const m=eio((lt-start)/0.5);
    const r=prevR?{x:lerp(prevR.x,cur.x,m),y:lerp(prevR.y,cur.y,m),w:lerp(prevR.w,cur.w,m),h:lerp(prevR.h,cur.h,m)}:cur;
    const pad=8;
    Object.assign(sp.style,{left:(r.x-pad)+'px',top:(r.y-pad)+'px',width:(r.w+pad*2)+'px',height:(r.h+pad*2)+'px'});
    sp.style.opacity=(prevR?1:p(lt,start,0.4)).toFixed(3);
  } else {
    const last=(s.spot||[]).filter(x=>x.t<=lt).pop();
    sp.style.opacity=last?(1-p(lt,last.t,0.3)).toFixed(3):'0';
  }
  // wipe (image compare)
  const wp=$('.wipe',root);
  if(wp){
    const sh=s.shots.find(x=>x.s===wp.dataset.shot), idx=s.shots.indexOf(sh), nx=s.shots[idx+1];
    let o=p(lt,sh.t,0.3); if(nx&&lt>=nx.t) o=1-p(lt,nx.t,0.3);
    wp.style.opacity=o.toFixed(3);
    const k=(lt-sh.t);
    const pos=k<0.5?50:k<1.25?lerp(50,18,eio((k-0.5)/0.75)):lerp(18,82,eio((k-1.25)/0.9));
    $('.wipe-a',wp).style.clipPath='inset(0 '+(100-pos).toFixed(2)+'% 0 0)';
    $('.wipe-h',wp).style.left=pos.toFixed(2)+'%';
  }
  captions(root,s,lt,dur);
}
function seekLogo(root,ms){ root.getAnimations({subtree:true}).forEach(a=>{a.pause(); a.currentTime=Math.max(0,ms);}); }

window.seek=function(t){
  for(const s of SCENES){
    const root=document.getElementById('s-'+s.id);
    const dur=s.end-s.start, lt=t-s.start;
    const on=t>=s.start-0.0001 && t<s.end;
    if(!on){root.style.opacity='0'; root.style.visibility='hidden'; continue;}
    root.style.visibility='visible';
    // fade through the background between scenes
    const fin=s.id==='intro'?1:clamp(lt/0.22), fout=s.id==='outro'?clamp((s.end-t)/0.9):clamp((s.end-t)/0.18);
    root.style.opacity=Math.min(fin,fout).toFixed(3);
    if(s.id==='intro'){
      $('#intro-line').style.transform='scaleX('+eio((lt-0.15)/1.3).toFixed(4)+')';
      seekLogo($('#intro-logo'),lt*1000);
      const tk=p(lt,2.55,0.6); $('#intro-tools').style.opacity=tk; $('#intro-tools').style.transform='translateY('+((1-tk)*12)+'px)';
      const tg=p(lt,4.31,0.45); $('#intro-tag').style.opacity=tg; $('#intro-tag').style.transform='translateY('+((1-tg)*18)+'px)';
      const pulse=lt<4.31?p(lt,0,3.8)*0.5:0.5+0.5*Math.exp(-(lt-4.31)*2.2);
      $('#intro-glow').style.opacity=pulse.toFixed(3);
    } else if(s.id==='screens'){
      const mv=eio((lt-0.75)/1.0);
      const fly=$('#fly');
      fly.style.opacity=(lt<0.75?p(lt,0.25,0.4):1).toFixed(3);
      fly.style.left=lerp(130,990,mv)+'px';
      fly.style.boxShadow='0 30px 60px rgba(4,2,14,.6),0 0 0 2px rgba(61,242,208,'+(0.9*Math.sin(Math.PI*mv)).toFixed(3)+'),0 0 40px rgba(61,242,208,'+(0.45*Math.sin(Math.PI*mv)).toFixed(3)+')';
      $('#mon-l-b').style.opacity=p(lt,1.1,0.5).toFixed(3);
      $('#mon-r-hint').style.opacity=(1-mv).toFixed(3);
      captions(root,s,lt,dur);
    } else if(s.id==='why'){
      const tt=p(lt,0.05,0.45); $('#why-title').style.opacity=tt; $('#why-title').style.transform='translateY('+((1-tt)*16)+'px)';
      WHY.forEach((_,i)=>{
        const at=0.45+i*BEAT, el=$('#why-'+i), k=p(lt,at,0.4);
        el.style.opacity=k.toFixed(3); el.style.transform='translateY('+((1-k)*20).toFixed(1)+'px)';
        const nextAt=at+BEAT, glow=lt>=at?(i===WHY.length-1?Math.max(0,1-(lt-at)/2.5):1-clamp((lt-nextAt)/0.4)):0;
        el.style.borderColor='rgba(255,79,154,'+(0.25+0.6*glow).toFixed(3)+')';
        el.style.boxShadow='0 0 '+(30*glow).toFixed(1)+'px rgba(255,79,154,'+(0.35*glow).toFixed(3)+')';
      });
    } else if(s.id==='outro'){
      seekLogo($('#outro-logo'),lt*1000);
      $('#outro-line').style.transform='scaleX('+eio((lt-1.1)/1.2).toFixed(4)+')';
      [['#outro-a',1.9],['#outro-b',2.3],['#outro-c',2.65],['#outro-d',3.0]].forEach(([q,a])=>{const k=p(lt,a,0.5); const el=$(q); el.style.opacity=k; el.style.transform='translateY('+((1-k)*14)+'px)';});
    } else appScene(root,s,lt,dur);
  }
};`;
}

/* ---------- serve and render ---------- */
const files = {
  "/index.html": () => html,
};
const types = { ".html": "text/html", ".png": "image/png", ".jpg": "image/jpeg", ".ttf": "font/ttf", ".otf": "font/otf" };
const server = createServer(async (req, res) => {
  const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
  try {
    if (files[u]) return res.writeHead(200, { "content-type": "text/html" }).end(files[u]());
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
const url = `http://127.0.0.1:${server.address().port}/index.html`;
const chrome = arg("--chrome");
const browser = await chromium.launch(chrome ? { executablePath: chrome } : {});

async function openPage() {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? 1 : new Promise((r) => (i.onload = i.onerror = r))))));
  await page.waitForTimeout(200);
  if (errs.length) throw new Error(errs.join("\n"));
  return page;
}

const preview = arg("--preview");
if (preview) {
  const page = await openPage();
  for (const t of preview.split(",").map(Number)) {
    await page.evaluate((t) => window.seek(t), t);
    await page.screenshot({ path: join(VID, `still-${t.toFixed(2)}.jpg`), type: "jpeg", quality: 90 });
  }
  console.log("stills written to", VID);
} else {
  // One encoded file per scene, rendered by a few pages in parallel.
  const workers = Number(arg("--workers") ?? 3);
  const queue = SCENES.map((s, i) => ({ ...s, i }));
  const encode = (file) =>
    spawn("ffmpeg", ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart", file], { stdio: ["pipe", "inherit", "inherit"] });
  const firstFrame = (s) => Math.round(s.start * FPS);
  const lastFrame = (s) => Math.round(s.end * FPS);
  async function worker() {
    const page = await openPage();
    for (let s; (s = queue.shift()); ) {
      const tmp = join(VID, `scene-${String(s.i).padStart(2, "0")}-${s.id}.tmp.mp4`);
      const ff = encode(tmp);
      const done = new Promise((r, j) => ff.on("close", (c) => (c === 0 ? r() : j(new Error(`ffmpeg ${c}`)))));
      for (let f = firstFrame(s); f < lastFrame(s); f++) {
        await page.evaluate((t) => window.seek(t), f / FPS);
        const buf = await page.screenshot({ type: "jpeg", quality: 93 });
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
      }
      ff.stdin.end();
      await done;
      await rename(tmp, tmp.replace(".tmp.mp4", ".mp4"));
      console.log(`scene ${s.id}: ${lastFrame(s) - firstFrame(s)} frames`);
    }
    await page.close();
  }
  await Promise.all(Array.from({ length: workers }, worker));
  const list = SCENES.map((s, i) => `file '${join(VID, `scene-${String(i).padStart(2, "0")}-${s.id}.mp4`)}'`).join("\n");
  await writeFile(join(VID, "scenes.txt"), list + "\n");
  const silent = join(VID, "riptide-tools-silent.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(VID, "scenes.txt"), "-c", "copy", silent]);
  const music = process.env.MUSIC;
  if (music && existsSync(music)) {
    const out = join(VID, "riptide-tools.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", silent, "-i", music, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-af", `afade=t=out:st=${END - 1.2}:d=1.2`, "-t", String(END), "-movflags", "+faststart", out]);
    console.log("wrote", out);
  } else console.log("wrote", silent);
}
await browser.close();
server.close();
