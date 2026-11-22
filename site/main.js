// RipTide site: background tide, tabs, trailer, counters and reveals. No dependencies.
(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- background: slow tide lines and a few stars ---------- */
  const canvas = document.getElementById("tide");
  const ctx = canvas.getContext("2d", { alpha: false });
  let w = 0, h = 0, dpr = 1, stars = [];
  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    stars = Array.from({ length: Math.round((w * h) / 26000) }, () => ({ x: rnd() * w, y: rnd() * h * 0.6, r: 0.4 + rnd() * 1.1, p: rnd() * Math.PI * 2, s: 0.3 + rnd() * 0.7 }));
  };
  const LINES = [
    { y: 0.70, a: 14, k: 0.0042, s: 0.10, c: "61,242,208", o: 0.10 },
    { y: 0.76, a: 18, k: 0.0033, s: -0.07, c: "255,79,154", o: 0.09 },
    { y: 0.82, a: 22, k: 0.0027, s: 0.05, c: "255,179,107", o: 0.07 },
    { y: 0.88, a: 26, k: 0.0022, s: -0.04, c: "61,242,208", o: 0.07 },
    { y: 0.94, a: 30, k: 0.0018, s: 0.03, c: "255,79,154", o: 0.06 },
  ];
  const draw = (t) => {
    const sec = t / 1000;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#130f26");
    g.addColorStop(0.65, "#100c22");
    g.addColorStop(1, "#0b0819");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(w * 0.5, -h * 0.1, 0, w * 0.5, -h * 0.1, Math.max(w, h) * 0.75);
    glow.addColorStop(0, "rgba(255,79,154,0.16)");
    glow.addColorStop(1, "rgba(255,79,154,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    for (const s of stars) {
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(s.p + sec * s.s));
      ctx.fillStyle = `rgba(244,233,220,${(0.5 * tw).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 1.4;
    for (const l of LINES) {
      ctx.strokeStyle = `rgba(${l.c},${l.o})`;
      ctx.beginPath();
      const base = h * l.y;
      for (let x = -10; x <= w + 10; x += 8) {
        const y = base + Math.sin(x * l.k + sec * l.s * 6) * l.a + Math.sin(x * l.k * 2.3 - sec * l.s * 4) * l.a * 0.35;
        x === -10 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  };
  let raf = 0, last = 0;
  const loop = (t) => {
    raf = requestAnimationFrame(loop);
    if (t - last < 1000 / 30) return; // 30 fps is plenty for a slow tide
    last = t;
    draw(t);
  };
  const start = () => {
    cancelAnimationFrame(raf);
    if (reduced.matches || document.hidden) draw(0);
    else raf = requestAnimationFrame(loop);
  };
  resize();
  start();
  window.addEventListener("resize", () => { resize(); if (reduced.matches) draw(0); });
  document.addEventListener("visibilitychange", start);
  reduced.addEventListener?.("change", start);

  /* ---------- nav border once you scroll ---------- */
  const nav = document.querySelector(".nav");
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- tools tabs (arrow keys move between tabs) ---------- */
  const tabs = [...document.querySelectorAll('.tool-list [role="tab"]')];
  const select = (tab, focus) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    }
    if (focus) tab.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => select(t, false));
    t.addEventListener("keydown", (e) => {
      const n = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (n) { e.preventDefault(); select(tabs[(i + n + tabs.length) % tabs.length], true); }
      if (e.key === "Home") { e.preventDefault(); select(tabs[0], true); }
      if (e.key === "End") { e.preventDefault(); select(tabs[tabs.length - 1], true); }
    });
  });

  /* ---------- trailer: plays muted on click, pauses when off-screen ---------- */
  const fig = document.querySelector(".video");
  const video = fig.querySelector("video");
  const play = fig.querySelector(".play");
  play.addEventListener("click", () => {
    video.play().then(() => fig.classList.add("playing")).catch(() => {});
  });
  video.addEventListener("click", () => {
    if (video.paused) video.play().catch(() => {});
    else { video.pause(); fig.classList.remove("playing"); }
  });

  /* ---------- reveal, counters, two-screen demo ---------- */
  const count = (el) => {
    const end = Number(el.dataset.count);
    if (reduced.matches || !Number.isFinite(end)) return;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 1200);
      el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3))).toLocaleString("en-US");
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  document.querySelectorAll(".frame:not(.float), .card, .st").forEach((el) => el.classList.add("reveal"));
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) {
          if (e.target === video && !video.paused) { video.pause(); fig.classList.remove("playing"); }
          continue;
        }
        const el = e.target;
        if (el.classList.contains("reveal")) { el.classList.add("in"); io.unobserve(el); }
        if (el.dataset.count) { count(el); io.unobserve(el); }
        if (el.id === "screens") { el.classList.add("go"); io.unobserve(el); }
      }
    }, { threshold: 0.25 });
    document.querySelectorAll(".reveal, [data-count], #screens").forEach((el) => io.observe(el));
    io.observe(video);
  } else {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
    document.getElementById("screens").classList.add("go");
  }
})();
