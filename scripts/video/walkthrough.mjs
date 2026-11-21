// Records a frame-perfect walkthrough of RipTide Studio for the showcase video.
// The real app runs; every CSS animation and JS timer is stepped one frame at a time,
// so the result is smooth at any machine speed. A drawn cursor shows each action.
//
// Usage: node scripts/video/walkthrough.mjs [timeline.json]
//   Build the Studio first (npm run build). Writes JPEG frames to $FRAMES_DIR/walkthrough.
//   timeline.json (optional) sets per-section durations in seconds: {"overview": 9.5, ...}
// Env: FRAMES_DIR (default .video/frames), CHROME (optional Chrome executable path)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { chromium } from "playwright";

const ROOT = new URL("../../", import.meta.url).pathname;
const DIST = resolve(ROOT, "apps/studio/dist");
const OUT = `${process.env.FRAMES_DIR ?? resolve(ROOT, ".video/frames")}/walkthrough`;
const FPS = 30;
const DT = 1000 / FPS;
const durations = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], "utf8")) : {};

// ---------- static server (dist only) ----------
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".otf": "font/otf" };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  const file = join(DIST, path || "index.html");
  if (!file.startsWith(DIST + sep) && file !== DIST) return res.writeHead(403).end();
  try {
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
// 1440x810 CSS pixels rendered at 4/3 = 1920x1080 frames.
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3, colorScheme: "dark" });
await page.clock.install();
await page.goto(`${base}/?splash=0#/overview`);
await page.evaluate(() => {
  try { localStorage.clear(); } catch {}
});
await page.goto(`${base}/?splash=0&rec=1#/overview`);
await page.evaluate(() => document.fonts.ready);

// Cursor, click ripple and subtitle layer, drawn on top of the app.
await page.addStyleTag({
  content: `
  #rec-cursor{position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;filter:drop-shadow(0 4px 10px rgba(0,0,0,.45));transform:translate(-3px,-2px)}
  #rec-ripple{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:2px solid #FF4F9A;z-index:2147483646;pointer-events:none;opacity:0}
  #rec-ripple.go{animation:rec-ripple .5s cubic-bezier(.2,.8,.2,1) forwards}
  @keyframes rec-ripple{0%{opacity:.9;transform:scale(.3)}100%{opacity:0;transform:scale(1.4)}}
  #rec-sub{position:fixed;left:calc(50% + 124px);bottom:18px;transform:translateX(-50%);max-width:820px;padding:9px 18px;border-radius:12px;background:rgba(13,9,28,.9);border:1px solid #2F2756;color:#F4E9DC;font:500 17px/1.4 "DM Sans",sans-serif;text-align:center;z-index:2147483645;pointer-events:none;opacity:0;transition:opacity .35s ease}
  #rec-sub.on{opacity:1}
  .toasts{bottom:96px!important}
`,
});
await page.evaluate(() => {
  const c = document.createElement("div");
  c.id = "rec-cursor";
  c.innerHTML = `<svg viewBox="0 0 26 26" width="26" height="26"><path d="M3 2l18 9.5-7.6 1.9-3.4 7.6z" fill="#F4E9DC" stroke="#130F26" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  document.body.appendChild(c);
  const r = document.createElement("div");
  r.id = "rec-ripple";
  document.body.appendChild(r);
  const s = document.createElement("div");
  s.id = "rec-sub";
  document.body.appendChild(s);
});

// ---------- frame stepping ----------
let frame = 0;
const cursor = { x: 1300, y: 760 };
async function tick() {
  await page.clock.runFor(DT);
  await page.evaluate(([dt, cx, cy]) => {
    const w = window;
    w.__recT = (w.__recT ?? 0) + dt;
    w.__recSeen ??= new WeakMap();
    for (const a of document.getAnimations()) {
      if (!w.__recSeen.has(a)) {
        w.__recSeen.set(a, w.__recT - dt);
        a.pause();
      }
      a.currentTime = w.__recT - w.__recSeen.get(a);
    }
    const c = document.getElementById("rec-cursor");
    c.style.left = cx + "px";
    c.style.top = cy + "px";
  }, [DT, cursor.x, cursor.y]);
  const name = `${OUT}/f${String(++frame).padStart(5, "0")}.jpg`;
  await page.screenshot({ path: name, type: "jpeg", quality: 92 });
}
const hold = async (sec) => {
  for (let i = 0; i < Math.round(sec * FPS); i++) await tick();
};
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
async function center(sel, dx = 0, dy = 0) {
  const box = await page.locator(sel).first().boundingBox();
  if (!box) throw new Error(`not visible: ${sel}`);
  return { x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 + dy };
}
async function moveTo(target, sec = 0.7, drag = false) {
  const to = typeof target === "string" ? await center(target) : target;
  const from = { ...cursor };
  const n = Math.max(1, Math.round(sec * FPS));
  for (let i = 1; i <= n; i++) {
    const k = ease(i / n);
    cursor.x = from.x + (to.x - from.x) * k;
    cursor.y = from.y + (to.y - from.y) * k;
    if (drag) await page.mouse.move(cursor.x, cursor.y);
    await tick();
  }
}
async function click(target, sec = 0.6) {
  if (target) await moveTo(target, sec);
  await page.evaluate(([x, y]) => {
    const r = document.getElementById("rec-ripple");
    r.classList.remove("go");
    r.style.left = x + "px";
    r.style.top = y + "px";
    void r.offsetWidth;
    r.classList.add("go");
  }, [cursor.x, cursor.y]);
  await page.mouse.click(cursor.x, cursor.y);
  await tick();
}
async function dragSlider(sel, toFraction, sec = 1.2) {
  const box = await page.locator(sel).first().boundingBox();
  const val = await page.locator(sel).first().evaluate((el) => (Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min)));
  const thumb = { x: box.x + 8 + (box.width - 16) * val, y: box.y + box.height / 2 };
  await moveTo(thumb, 0.6);
  await page.mouse.move(cursor.x, cursor.y);
  await page.mouse.down();
  await tick();
  await moveTo({ x: box.x + 8 + (box.width - 16) * toFraction, y: thumb.y }, sec, true);
  await page.mouse.up();
  await tick();
}
async function typeInto(text, cps = 22) {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await hold(1 / cps);
  }
}
async function scrollEl(sel, dy, sec = 0.8) {
  const n = Math.round(sec * FPS);
  const start = await page.locator(sel).first().evaluate((el) => el.scrollTop);
  for (let i = 1; i <= n; i++) {
    const y = start + dy * ease(i / n);
    await page.locator(sel).first().evaluate((el, y) => (el.scrollTop = y), y);
    await tick();
  }
}
async function subtitle(text) {
  await page.evaluate((t) => {
    const s = document.getElementById("rec-sub");
    if (!t) return s.classList.remove("on");
    s.textContent = t;
    s.classList.add("on");
  }, text);
}
const nav = (id) => click(`a[data-id="${id}"]`, 0.7);

// ---------- the walkthrough ----------
// Each section runs its actions, then holds so it lasts at least its timeline duration.
const SUBS = {
  overview: "Your whole server lives in one place. Launch readiness rises like a sun, next to your hosting cost, download size, and a checklist of what's left.",
  world: "Set the mood of your city. Time, weather, traffic, police, and the visual style, with a live preview.",
  economy: "RipTide simulates sixty days of player wallets. Push job pay too high, and it warns you about inflation, before a single player joins.",
  rules: "Write rules in plain English. RipTide enforces the ones it understands, and keeps your rules page and Discord post in sync.",
  mods: "Add mods, and RipTide checks them against each other and your performance budget. Conflicts come with a one-click fix.",
  roles: "Roles and permissions, with inheritance you can see at a glance.",
  deploy: "Pick a region close to your community, and deploy in one click.",
};
const sections = [];
async function section(id, fn) {
  const startFrame = frame;
  await subtitle(SUBS[id]);
  await fn();
  const want = Math.round((durations[id] ?? 0) * FPS);
  while (frame - startFrame < want) await tick();
  sections.push({ id, start: startFrame / FPS, end: frame / FPS });
}

await hold(0.4);
await section("overview", async () => {
  await hold(1.2);
  await moveTo(".hero .sunrise", 0.9);
  await hold(0.8);
  await moveTo(".grid.g-3 .stat:nth-child(2)", 0.8);
  await hold(0.6);
  await moveTo(".checks li:nth-child(3)", 0.8);
  await hold(0.6);
  await moveTo(".checks li:nth-child(7)", 0.7);
  await hold(0.5);
});

await section("world", async () => {
  await nav("world");
  await hold(0.6);
  await click('.preset:nth-child(2)', 0.7);
  await hold(0.9);
  await click('.preset:nth-child(1)', 0.6);
  await hold(0.4);
  await dragSlider('.scene ~ .panel input[type=range] >> nth=0', 0.85, 1.0);
  await hold(0.6);
  await click('.seg button:has-text("Both")', 0.8);
  await hold(0.4);
});

await section("economy", async () => {
  await nav("economy");
  await hold(0.9);
  // Bring the job sliders on screen, keeping the verdict in view.
  await scrollEl(".page", 250, 0.8);
  await hold(0.3);
  // Triple delivery pay: the forecast flips to "Money is piling up".
  await dragSlider(".job-row:nth-child(1) input[type=range]", 0.85, 1.2);
  await hold(0.6);
  await moveTo(".verdict-title", 0.7);
  await hold(1.3);
  // Bring it back down and the economy settles.
  await dragSlider(".job-row:nth-child(1) input[type=range]", 0.225, 1.0);
  await hold(0.8);
});

await section("rules", async () => {
  await nav("rules");
  await hold(0.8);
  await scrollEl(".page", 230, 0.7);
  await click("#rulebook-src", 0.8);
  await page.locator("#rulebook-src").evaluate((el) => {
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.scrollTop = el.scrollHeight;
  });
  await page.keyboard.press("Enter");
  await typeInto("No PvP at the beach club.", 20);
  await hold(0.6);
  await page.keyboard.press("Enter");
  await typeInto("Max 4 members per crew.", 20);
  await hold(0.4);
  await scrollEl(".compiled", 900, 1.0);
  await moveTo(".compiled .rule.auto >> nth=-1", 0.7);
  await hold(1.0);
});

await section("mods", async () => {
  await nav("mods");
  await hold(0.6);
  await click('.cat-tabs button:has-text("Framework")', 0.8);
  await hold(0.5);
  await click('button[aria-label="Add ESX Legacy"]', 0.8);
  await hold(1.2);
  await moveTo(".issue .t", 0.7);
  await hold(0.6);
  await click('.issue button:has-text("Keep")', 0.6);
  await hold(1.0);
  await moveTo(".meter >> nth=0", 0.8);
  await hold(0.8);
});

await section("roles", async () => {
  await nav("roles");
  await hold(0.7);
  await click('button[aria-label^="Moderator: Kick players"]', 0.9);
  await hold(0.5);
  await click('button[aria-label^="Moderator: Kick players"]', 0.4);
  await hold(0.4);
  await moveTo('button[aria-label^="Admin: Kick players"]', 0.6);
  await hold(0.8);
});

await section("deploy", async () => {
  await nav("deploy");
  await hold(0.6);
  await click('.region:has-text("Dallas")', 0.8);
  await hold(0.4);
  await click('.region:has-text("Miami")', 0.6);
  await hold(0.3);
  await click(".launch", 0.8);
  await hold(4.6);
  await moveTo(".log", 0.6);
  await hold(1.0);
});
await subtitle("");
await hold(0.5);

writeFileSync(`${OUT}/sections.json`, JSON.stringify({ fps: FPS, frames: frame, sections }, null, 2));
await browser.close();
server.close();
console.log(`walkthrough: ${frame} frames, ${(frame / FPS).toFixed(1)}s`);
console.log(sections.map((s) => `${s.id} ${s.start.toFixed(2)}-${s.end.toFixed(2)}`).join("\n"));
