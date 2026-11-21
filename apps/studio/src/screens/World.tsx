import { useMemo } from "react";
import { mulberry32 } from "@riptide/core";
import { useStore } from "../lib/store";
import { PageHead, Segmented, Slider, Toggle } from "../components/ui";

const PRESETS = [
  { id: "graphics-neon", name: "Neon Nights", note: "Pink-cyan glow", sky: ["#2a1b5c", "#ff4f9a", "#ffb36b"] },
  { id: "graphics-film", name: "Film Stock", note: "Muted, grainy", sky: ["#2b2a3a", "#9a6f74", "#d9b48f"] },
  { id: "graphics-natural", name: "Natural Light", note: "True to life", sky: ["#3a6ea8", "#9cc3e6", "#f3dcc0"] },
];

function Scene({ preset, bloom, grain, saturation }: { preset: (typeof PRESETS)[number]; bloom: number; grain: number; saturation: number }) {
  const buildings = useMemo(() => {
    const r = mulberry32(42);
    const out: { x: number; w: number; h: number; win: { x: number; y: number; c: string }[] }[] = [];
    let x = 360;
    while (x < 1000) {
      const w = 26 + r() * 38;
      const h = 60 + r() * 170;
      const win: { x: number; y: number; c: string }[] = [];
      for (let wy = 300 - h + 10; wy < 290; wy += 12) for (let wx = x + 5; wx < x + w - 6; wx += 9) if (r() > 0.62) win.push({ x: wx, y: wy, c: r() > 0.7 ? "#3df2d0" : r() > 0.5 ? "#ff7db4" : "#ffd9a8" });
      out.push({ x, w, h, win });
      x += w + 3 + r() * 8;
    }
    return out;
  }, []);
  const [top, mid, low] = preset.sky;
  return (
    <svg viewBox="0 0 1000 438" preserveAspectRatio="xMidYMid slice" style={{ filter: `saturate(${saturation}) brightness(${1 + bloom * 0.18}) contrast(${1 - bloom * 0.08})` }} role="img" aria-label={`${preset.name} preview`}>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset=".62" stopColor={mid} />
          <stop offset="1" stopColor={low} />
        </linearGradient>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={mid} stopOpacity=".55" />
          <stop offset="1" stopColor="#0c0a1c" />
        </linearGradient>
        <radialGradient id="sunglow" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#ffd9a8" stopOpacity={0.5 + bloom * 0.5} />
          <stop offset="1" stopColor="#ffd9a8" stopOpacity="0" />
        </radialGradient>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0" />
        </filter>
      </defs>
      <rect width="1000" height="300" fill="url(#sky)" />
      <circle cx="230" cy="250" r={110 + bloom * 70} fill="url(#sunglow)" />
      <circle cx="230" cy="262" r="62" fill="#ffc48a" />
      {[0, 1, 2, 3, 4].map((i) => <rect key={i} x="160" y={262 + i * 9} width="140" height={2 + i * 0.6} fill={mid} opacity=".9" />)}
      {buildings.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={300 - b.h} width={b.w} height={b.h} fill="#16112e" />
          {b.win.map((w, k) => <rect key={k} x={w.x} y={w.y} width="4" height="5" fill={w.c} opacity=".85" />)}
        </g>
      ))}
      {/* palms */}
      {[{ x: 70, s: 1 }, { x: 128, s: 0.8 }, { x: 900, s: 1.1 }].map((p, i) => (
        <g key={i} transform={`translate(${p.x} 300) scale(${p.s})`} fill="#0e0b20" stroke="#0e0b20">
          <path d="M0 0 C 4 -60 10 -110 22 -150" fill="none" strokeWidth="7" strokeLinecap="round" />
          <path d="M22 -150 c -30 -10 -55 0 -72 18 c 22 -8 44 -10 72 -18z M22 -150 c 26 -16 56 -12 74 4 c -24 -4 -48 -4 -74 -4z M22 -150 c -10 -24 -32 -36 -56 -38 c 20 8 38 20 56 38z M22 -150 c 16 -24 40 -30 62 -26 c -22 4 -42 12 -62 26z M22 -150 c 2 26 -8 50 -24 64 c 8 -22 14 -42 24 -64z" strokeWidth="2" />
        </g>
      ))}
      <rect y="300" width="1000" height="138" fill="url(#sea)" />
      {buildings.filter((_, i) => i % 2 === 0).map((b, i) => <rect key={i} x={b.x + 4} y={306 + (i % 3) * 14} width={b.w * 0.6} height="2" fill="#ff7db4" opacity=".35" />)}
      {[0, 1, 2, 3].map((i) => <rect key={i} x={200 - i * 14} y={312 + i * 16} width={60 + i * 28} height="3" rx="1.5" fill="#ffc48a" opacity={0.6 - i * 0.12} />)}
      <rect width="1000" height="438" filter="url(#grain)" opacity={grain * 0.5} style={{ mixBlendMode: "overlay" }} />
    </svg>
  );
}

export function World() {
  const { bp, edit } = useStore();
  const w = bp.world;
  const v = bp.visuals;
  const preset = PRESETS.find((p) => p.id === v.preset) ?? PRESETS[0]!;
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <>
      <PageHead title="World & look" sub="Set the mood of the city: time, weather, traffic, police and the visual style every player sees." />
      <div className="grid g-main">
        <div className="grid">
          <div className="scene">
            <Scene preset={preset} bloom={v.bloom} grain={v.grain} saturation={v.saturation} />
            <span className="scene-badge chip dim" style={{ background: "rgba(19,15,38,.6)", backdropFilter: "blur(6px)" }}>Live preview</span>
          </div>
          <section className="panel panel-pad grid" style={{ gap: 16 }}>
            <h2>Visual style</h2>
            <div className="preset-row">
              {PRESETS.map((p) => (
                <button key={p.id} className="preset" aria-pressed={v.preset === p.id} onClick={() => edit((d) => {
                  d.visuals.preset = p.id;
                  d.mods = d.mods.filter((m) => !PRESETS.some((x) => x.id === m.id));
                  d.mods.push({ id: p.id, enabled: true });
                })}>
                  <div className="sw" style={{ background: `linear-gradient(180deg, ${p.sky.join(",")})` }} />
                  <b>{p.name}</b>
                  <span>{p.note}</span>
                </button>
              ))}
            </div>
            <div className="grid g-3" style={{ gap: 20 }}>
              <Slider label="Glow" value={v.bloom} min={0} max={1} step={0.05} format={pct} onChange={(n) => edit((d) => void (d.visuals.bloom = n))} />
              <Slider label="Film grain" value={v.grain} min={0} max={1} step={0.05} format={pct} onChange={(n) => edit((d) => void (d.visuals.grain = n))} />
              <Slider label="Colour" value={v.saturation} min={0} max={2} step={0.05} format={pct} onChange={(n) => edit((d) => void (d.visuals.saturation = n))} />
            </div>
            <Toggle label="Let players turn it off" hint="Some players need the default look for comfort or performance" checked={v.allowOptOut} onChange={(b) => edit((d) => void (d.visuals.allowOptOut = b))} />
          </section>
        </div>

        <aside className="grid">
          <section className="panel panel-pad grid" style={{ gap: 18 }}>
            <h2>Time & weather</h2>
            <div className="field">
              <span className="label">Clock</span>
              <Segmented label="Clock" value={w.time.mode} onChange={(m) => edit((d) => void (d.world.time.mode = m))} options={[{ value: "realtime", label: "Real time" }, { value: "accelerated", label: "Faster" }, { value: "locked", label: "Locked" }]} />
            </div>
            {w.time.mode === "accelerated" && (
              <Slider label="Day length" value={w.time.scale} min={1} max={12} format={(n) => `${Math.round(24 / n * 10) / 10} h`} onChange={(n) => edit((d) => void (d.world.time.scale = n))} />
            )}
            <div className="field">
              <span className="label">Weather</span>
              <Segmented label="Weather" value={w.weather.mode} onChange={(m) => edit((d) => void (d.world.weather.mode = m))} options={[{ value: "dynamic", label: "Dynamic" }, { value: "synced", label: "Same for all" }, { value: "locked", label: "Locked" }]} />
            </div>
          </section>
          <section className="panel panel-pad grid" style={{ gap: 18 }}>
            <h2>Streets</h2>
            <Slider label="Traffic" value={w.trafficDensity} min={0} max={1} step={0.05} format={pct} onChange={(n) => edit((d) => void (d.world.trafficDensity = n))} />
            <Slider label="Pedestrians" value={w.pedDensity} min={0} max={1} step={0.05} format={pct} onChange={(n) => edit((d) => void (d.world.pedDensity = n))} />
            <div className="field">
              <span className="label">Police</span>
              <Segmented label="Police" value={w.police} onChange={(m) => edit((d) => void (d.world.police = m))} options={[{ value: "off", label: "Off" }, { value: "npc", label: "AI" }, { value: "players", label: "Players" }, { value: "hybrid", label: "Both" }]} />
            </div>
            <Toggle label="Player vs player" checked={w.pvp} onChange={(b) => edit((d) => void (d.world.pvp = b))} />
          </section>
          <section className="panel">
            <div className="panel-head"><h2>Zones</h2><span className="meta">Set in your rulebook too</span></div>
            {w.zones.map((z) => (
              <div className="role-card" key={z.id} style={{ gridTemplateColumns: "1fr auto" }}>
                <span style={{ fontWeight: 500 }}>{z.label}</span>
                <span style={{ display: "flex", gap: 6 }}>
                  {Object.entries(z.flags).map(([k, val]) => <span className="chip dim" key={k}>{typeof val === "boolean" ? `${val ? "" : "no "}${k}` : `${k === "speedLimit" ? "limit" : k} ${val}`}</span>)}
                </span>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}
