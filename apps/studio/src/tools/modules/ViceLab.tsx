import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";
import { LuChartColumnIncreasing, LuDownload, LuUpload, LuTrash2, LuImage, LuCpu, LuX, LuPlus } from "react-icons/lu";
import {
  KEYS,
  ViceLabState,
  CaptureError,
  LIMITS,
  computeStats,
  downsample,
  parseCapture,
  recommend,
  uid,
  type Run,
  type Hardware,
  type Priority,
} from "@riptide/tools";
import { usePersisted, downloadText, readFileText } from "../persist";
import { DropZone, Field, PageHeader, Tabs, fmtDate, useShell } from "../ui";
import { DetachedGuard, HeaderRight } from "./common";

export const GAMES = [
  { id: "gtav", name: "Grand Theft Auto V (PC)" },
  { id: "rdr2", name: "Red Dead Redemption 2 (PC)" },
  { id: "other", name: "Another PC game" },
] as const;
const gameName = (id: string) => GAMES.find((g) => g.id === id)?.name ?? "Unknown game";
const PRESETS = ["low", "medium", "high", "ultra", "custom"] as const;
const PRIORITY: { id: Priority; label: string; hint: string }[] = [
  { id: "balanced", label: "Balanced quality", hint: "A good picture without sacrificing smoothness." },
  { id: "performance", label: "Smoothest gameplay", hint: "The steadiest frame rate, even if it costs detail." },
  { id: "quality", label: "Best picture", hint: "The highest preset that still feels playable." },
];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const vlDefault = () => ViceLabState.parse({});

type Tab = "bench" | "compare" | "recommend" | "history";

export function ViceLab() {
  const [tab, setTab] = useState<Tab>("bench");
  return (
    <DetachedGuard tool="vicelab">
      <div className="rt-page">
        <PageHeader crumb="ViceLab" title="Know your hardware." sub="Measure what matters, then choose the picture and performance you actually want." right={<HeaderRight />} />
        <ViceLabBody tab={tab} setTab={setTab} />
      </div>
    </DetachedGuard>
  );
}

function ViceLabBody({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const [s, set, storageError] = usePersisted(KEYS.vicelab, ViceLabState, vlDefault);
  const [selected, setSelected] = useState<string>("");
  const run = s.runs.find((r) => r.id === selected) ?? s.runs[0];
  return (
    <>
      <Tabs
        label="ViceLab sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "bench", label: "Benchmarks" },
          { id: "compare", label: "Image compare" },
          { id: "recommend", label: "Recommendations" },
          { id: "history", label: "History" },
        ]}
      />
      {storageError && <div className="rt-banner rt-warn" role="alert">{storageError}</div>}
      <div role="tabpanel" className="rt-enter" key={tab}>
        {tab === "bench" && <Benchmarks s={s} set={set} run={run} onSaved={(id) => setSelected(id)} />}
        {tab === "compare" && <Compare />}
        {tab === "recommend" && <Recommend s={s} set={set} />}
        {tab === "history" && <History s={s} set={set} selected={run?.id ?? ""} onSelect={(id) => (setSelected(id), setTab("bench"))} />}
      </div>
      <p className="rt-foot-note"><span>ViceLab runs locally and works with real recordings. No invented results or game telemetry.</span></p>
    </>
  );
}

type Set = (fn: (d: ViceLabState) => void) => void;

/* ---------- Benchmarks ---------- */

function Benchmarks({ s, set, run, onSaved }: { s: ViceLabState; set: Set; run?: Run; onSaved: (id: string) => void }) {
  const { toast } = useShell();
  const [preset, setPreset] = useState<string>("high");
  const [hardwareId, setHardwareId] = useState("");
  const [scene, setScene] = useState("");
  const [phase, setPhase] = useState<"form" | "timing" | "import">("form");
  const [left, setLeft] = useState(0);
  /** When the timed run ends, as a wall-clock time, so a background tab or sleep can't stretch it. */
  const deadline = useRef(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const priority = PRIORITY.find((p) => p.id === s.priority) ?? PRIORITY[0]!;

  // Count down from a fixed end time instead of subtracting a second per tick: browsers slow
  // timers in background tabs, and a computer can sleep, but the remaining time stays right.
  useEffect(() => {
    if (phase !== "timing") return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining <= 0) setPhase("import");
    };
    tick();
    const t = setInterval(tick, 250);
    const onVis = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [phase]);

  const importFile = async (f: File) => {
    setError("");
    setBusy(true);
    try {
      const text = await readFileText(f, LIMITS.maxBytes);
      const parsed = parseCapture(text, f.name);
      const stats = computeStats(parsed.frametimesMs);
      const shown = parsed.displayedMs ? computeStats(parsed.displayedMs) : null;
      const series = downsample(parsed.frametimesMs, 1200).map((p) => [Math.round(p.t * 1000) / 1000, Math.round(p.avg * 100) / 100, Math.round(p.max * 100) / 100] as [number, number, number]);
      const r: Run = {
        id: uid(),
        name: f.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Capture",
        game: s.game || "other",
        preset,
        scene: scene.trim().slice(0, 80),
        hardwareId,
        source: parsed.source,
        fileName: f.name.slice(0, 200),
        createdAt: Date.now(),
        metric: parsed.metric,
        stats,
        ...(shown ? { displayed: { avgFps: shown.avgFps, low1Fps: shown.low1Fps } } : {}),
        notes: parsed.notes.slice(0, 10).map((n) => n.slice(0, 300)),
        series,
      };
      set((d) => {
        d.runs.unshift(r);
        d.runs = d.runs.slice(0, 200);
      });
      onSaved(r.id);
      setPhase("form");
      toast(`Saved ${r.name}: ${stats.avgFps} FPS average (${parsed.metric})${parsed.skipped ? `, ${parsed.skipped} invalid rows skipped` : ""}${parsed.notes.length ? ". See the notes under the stats" : ""}`);
    } catch (e) {
      setError(e instanceof CaptureError || e instanceof Error ? e.message : "This file couldn't be read.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="rt-vl-grid">
        <section className="rt-panel rt-vl-overview" aria-labelledby="rt-perf">
          <div className="rt-panel-head">
            <h2 id="rt-perf">Performance overview</h2>
            <span className="rt-meta">{run ? `${run.name} · ${gameName(run.game)} · ${cap(run.preset)}` : "Not measured"}</span>
          </div>
          <div className={`rt-vl-canvas${run ? "" : " rt-gridbg"}`}>
            {run ? (
              <FrameChart run={run} />
            ) : (
              <div className="rt-empty">
                <LuChartColumnIncreasing />
                <h3>Your first benchmark starts here.</h3>
                <p>Capture a real run to see frame times, 1% lows and system load.</p>
              </div>
            )}
          </div>
        </section>

        <section className="rt-panel rt-pad" aria-labelledby="rt-new">
          {phase === "form" && (
            <>
              <h2 id="rt-new" style={{ marginBottom: 22 }}>New benchmark</h2>
              <Field label="What matters most?" hint={priority.hint}>
                {(id) => (
                  <select id={id} className="rt-select" value={s.priority} onChange={(e) => set((d) => void (d.priority = e.target.value as Priority))}>
                    {PRIORITY.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Game">
                {(id) => (
                  <select id={id} className="rt-select" value={s.game} onChange={(e) => set((d) => void (d.game = e.target.value))}>
                    <option value="" disabled>Select a supported PC game</option>
                    {GAMES.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    <option value="gta6" disabled>Grand Theft Auto VI: waiting for the PC release</option>
                  </select>
                )}
              </Field>
              <div className="rt-fieldrow">
                <Field label="Graphics preset">
                  {(id) => (
                    <select id={id} className="rt-select" value={preset} onChange={(e) => setPreset(e.target.value)}>
                      {PRESETS.map((p) => <option key={p} value={p}>{cap(p)}</option>)}
                    </select>
                  )}
                </Field>
                <Field label="Capture duration">
                  {(id) => (
                    <select id={id} className="rt-select" value={s.duration} onChange={(e) => set((d) => void (d.duration = Number(e.target.value)))}>
                      {[30, 60, 90, 120, 180].map((n) => <option key={n} value={n}>{n} seconds</option>)}
                    </select>
                  )}
                </Field>
              </div>
              <Field label="Test scene" hint="Name the place you test, like “Downtown drive”. Only runs of the same scene are compared.">
                {(id) => <input id={id} className="rt-input" value={scene} maxLength={80} placeholder="Downtown drive" onChange={(e) => setScene(e.target.value)} />}
              </Field>
              {s.hardware.length > 0 && (
                <Field label="Hardware profile">
                  {(id) => (
                    <select id={id} className="rt-select" value={hardwareId} onChange={(e) => setHardwareId(e.target.value)}>
                      <option value="">None</option>
                      {s.hardware.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                    </select>
                  )}
                </Field>
              )}
              <button className="rt-btn rt-primary rt-block" style={{ marginTop: 26 }} disabled={!s.game} onClick={() => ((deadline.current = Date.now() + s.duration * 1000), setLeft(s.duration), setPhase("timing"), setError(""))}>
                Start benchmark
              </button>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, gap: 12 }}>
                <span className="rt-hint" style={{ margin: 0 }}>{s.game ? "Already have a capture?" : "Pick a game to start."}</span>
                <button className="rt-link" disabled={!s.game} style={{ opacity: s.game ? 1 : 0.5 }} onClick={() => setPhase("import")}>Import a capture</button>
              </div>
              <p className="rt-hint" style={{ marginTop: 18 }}>GTA VI-specific presets will be added when the PC release is available.</p>
            </>
          )}

          {phase === "timing" && (
            <div aria-live="polite">
              <h2 id="rt-new">Recording · {gameName(s.game)}</h2>
              <ol className="rt-steps" style={{ marginTop: 16 }}>
                <li>Start your capture tool: PresentMon, CapFrameX, MangoHud, OCAT or FrameView.</li>
                <li>Play the same scene you always test, at the {cap(preset)} preset.</li>
                <li>Stop the capture when the timer ends, then import the file.</li>
              </ol>
              <div className="rt-timer" style={{ marginTop: 22 }}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</div>
              <div className="rt-progress" aria-hidden="true"><i style={{ width: `${(1 - left / s.duration) * 100}%` }} /></div>
              <p className="rt-hint">This is only a timer. RipTide doesn't record the game: your capture tool does, and RipTide analyses the file.</p>
              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button className="rt-btn" onClick={() => setPhase("import")}>I'm done</button>
                <button className="rt-btn rt-ghost" onClick={() => setPhase("form")}>Cancel</button>
              </div>
            </div>
          )}

          {phase === "import" && (
            <div>
              <h2 id="rt-new" style={{ marginBottom: 16 }}>Import your capture</h2>
              <DropZone accept=".csv,.json,.txt" label={busy ? "Reading capture…" : "Drop a capture file or browse"} hint="CSV from PresentMon, OCAT, FrameView or MangoHud, or CapFrameX JSON" onFile={importFile} />
              {error && <div className="rt-error" role="alert">{error}</div>}
              <p className="rt-hint">The file is read on this device and never uploaded. Only the results and a small chart are kept.</p>
              <button className="rt-btn rt-ghost" style={{ marginTop: 10 }} onClick={() => setPhase("form")}>Back</button>
            </div>
          )}
        </section>
      </div>

      <div className="rt-stats">
        <Stat label="Average FPS" value={run?.stats.avgFps} sub={run ? (run.metric === "displayed" ? "Displayed frames" : run.displayed ? `Presented frames. Displayed: ${run.displayed.avgFps}` : "Presented frames. Displayed FPS isn't in this capture") : undefined} />
        <Stat label="1% low FPS" value={run?.stats.low1Fps} sub={run ? `0.1% low ${run.stats.low01Fps}${run.displayed ? `. Displayed 1% low: ${run.displayed.low1Fps}` : ""}` : undefined} />
        <Stat label="Frame-time stability" value={run ? `±${run.stats.stddevMs}` : undefined} unit="ms" sub={run ? `99th percentile ${run.stats.p99Ms} ms` : undefined} />
      </div>
      {run && run.notes.length > 0 && (
        <ul className="rt-notes" aria-label="Notes about this capture">
          {run.notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
    </>
  );
}

function Stat({ label, value, unit, sub }: { label: string; value?: number | string; unit?: string; sub?: string }) {
  return (
    <div className="rt-panel rt-stat">
      <div className="rt-stat-label">{label}</div>
      <div className="rt-stat-v" aria-label={value === undefined ? `${label}: not measured` : undefined}>
        {value === undefined ? "—" : value}
        {value !== undefined && unit && <small>{unit}</small>}
      </div>
      {sub && <div className="rt-hint" style={{ marginTop: 10 }}>{sub}</div>}
    </div>
  );
}

function FrameChart({ run }: { run: Run }) {
  const W = 900;
  const H = 320;
  const m = { t: 14, r: 12, b: 28, l: 44 };
  const pts = run.series;
  const maxT = pts[pts.length - 1]?.[0] ?? 1;
  const yMax = Math.max(20, Math.min(200, Math.max(...pts.map((p) => p[2])) * 1.1));
  const x = scaleLinear().domain([0, maxT]).range([m.l, W - m.r]);
  const y = scaleLinear().domain([0, yMax]).nice().range([H - m.b, m.t]);
  const avg = line<[number, number, number]>().x((p) => x(p[0])).y((p) => y(Math.min(p[1], yMax)))(pts) ?? "";
  const spikes = area<[number, number, number]>().x((p) => x(p[0])).y0((p) => y(Math.min(p[1], yMax))).y1((p) => y(Math.min(p[2], yMax)))(pts) ?? "";
  const target = 1000 / 60;
  return (
    <div className="rt-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Frame times for ${run.name}: average ${run.stats.avgFps} FPS, 1% low ${run.stats.low1Fps} FPS`}>
        {y.ticks(5).map((t) => (
          <g key={t}>
            <line className="rt-gl" x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} />
            <text className="rt-ax" x={m.l - 8} y={y(t) + 4} textAnchor="end">{t}</text>
          </g>
        ))}
        {x.ticks(6).map((t) => (
          <text key={t} className="rt-ax" x={x(t)} y={H - 8} textAnchor="middle">{t}s</text>
        ))}
        {target < yMax && <line x1={m.l} x2={W - m.r} y1={y(target)} y2={y(target)} stroke="#3DF2D0" strokeOpacity=".5" strokeDasharray="4 5" />}
        <path d={spikes} fill="#FFB36B" fillOpacity=".22" />
        <path d={avg} fill="none" stroke="#FF4F9A" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{ display: "flex", gap: 18, fontSize: 12.5, color: "var(--rt-muted)", marginTop: 8 }}>
        <span><i style={{ display: "inline-block", width: 14, height: 2, background: "#FF4F9A", verticalAlign: "middle", marginRight: 6 }} />Frame time (ms, lower is better)</span>
        <span><i style={{ display: "inline-block", width: 14, height: 8, background: "rgba(255,179,107,.35)", verticalAlign: "middle", marginRight: 6 }} />Spikes</span>
        <span><i style={{ display: "inline-block", width: 14, height: 0, borderTop: "2px dashed rgba(61,242,208,.6)", verticalAlign: "middle", marginRight: 6 }} />60 FPS</span>
      </div>
    </div>
  );
}

/* ---------- Image compare ---------- */

function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!file) return setUrl("");
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

function Compare() {
  const [a, setA] = useState<File | null>(null);
  const [b, setB] = useState<File | null>(null);
  const [pos, setPos] = useState(50);
  const [err, setErr] = useState("");
  const ua = useObjectUrl(a);
  const ub = useObjectUrl(b);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const pick = (setter: (f: File) => void) => (f: File) => {
    if (!/^image\/(png|jpeg|webp|bmp|gif)$/.test(f.type)) return setErr("Use a PNG, JPG, WebP, BMP or GIF screenshot.");
    if (f.size > 40 * 1024 * 1024) return setErr("Screenshots must be under 40 MB.");
    setErr("");
    setter(f);
  };
  const move = (e: PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
  };
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - step));
    else if (e.key === "ArrowRight") setPos((p) => Math.min(100, p + step));
    else if (e.key === "Home") setPos(0);
    else if (e.key === "End") setPos(100);
    else return;
    e.preventDefault();
  };
  return (
    <div style={{ marginTop: 26 }}>
      {ua && ub ? (
        <section className="rt-panel rt-pad">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <h2>Compare</h2>
            <span className="rt-hint" style={{ margin: 0 }}>Drag the handle or use the arrow keys.</span>
            <button className="rt-btn rt-sm" style={{ marginLeft: "auto" }} onClick={() => (setA(null), setB(null))}>Choose other screenshots</button>
          </div>
          <div
            ref={box}
            className="rt-compare"
            role="slider"
            tabIndex={0}
            aria-label="Comparison position"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pos)}
            onKeyDown={onKey}
            onPointerDown={(e) => {
              dragging.current = true;
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              move(e);
            }}
            onPointerMove={(e) => dragging.current && move(e)}
            onPointerUp={() => (dragging.current = false)}
          >
            <img src={ub} alt={`B: ${b?.name}`} />
            <div className="rt-wipe" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
              <img src={ua} alt={`A: ${a?.name}`} />
            </div>
            <div className="rt-handle" style={{ left: `${pos}%` }}><span /></div>
            <span className="rt-tag" style={{ left: 12 }}>A · {a?.name}</span>
            <span className="rt-tag" style={{ right: 12 }}>B · {b?.name}</span>
          </div>
          <p className="rt-hint">Screenshots stay on this device and aren't saved after you leave this tab.</p>
        </section>
      ) : (
        <section className="rt-panel rt-pad">
          <h2 style={{ marginBottom: 6 }}>Compare two screenshots</h2>
          <p className="rt-hint" style={{ marginTop: 0, marginBottom: 18 }}>Take the same shot at two settings, then wipe between them to see what changed.</p>
          <div className="rt-two" style={{ marginTop: 0 }}>
            {a ? <SelectedFile label="A" file={a} onClear={() => setA(null)} /> : <DropZone accept="image/*" label="Screenshot A" hint="For example: High preset" onFile={pick(setA)} />}
            {b ? <SelectedFile label="B" file={b} onClear={() => setB(null)} /> : <DropZone accept="image/*" label="Screenshot B" hint="For example: Ultra preset" onFile={pick(setB)} />}
          </div>
          {err && <div className="rt-error" role="alert">{err}</div>}
        </section>
      )}
    </div>
  );
}

function SelectedFile({ label, file, onClear }: { label: string; file: File; onClear: () => void }) {
  return (
    <div className="rt-drop" style={{ cursor: "default" }}>
      <LuImage />
      <b style={{ color: "var(--rt-sand)" }}>{label} · {file.name}</b>
      <button className="rt-link" onClick={onClear}>Remove</button>
    </div>
  );
}

/* ---------- Recommendations ---------- */

function Recommend({ s, set }: { s: ViceLabState; set: Set }) {
  const games = [...new Set(s.runs.map((r) => r.game))];
  const [game, setGame] = useState(games[0] ?? "");
  const rec = useMemo(() => {
    if (!game) return null;
    const res = new Map(s.hardware.map((h) => [h.id, h.resolution]));
    return recommend(s.runs.map((r) => ({ id: r.id, game: r.game, preset: r.preset, stats: r.stats, hardwareId: r.hardwareId, scene: r.scene, resolution: res.get(r.hardwareId) ?? "", metric: r.metric })), game, s.priority, s.targetFps);
  }, [s.runs, s.hardware, game, s.priority, s.targetFps]);
  const recRun = rec ? s.runs.find((r) => r.id === rec.run.id) : undefined;
  const pool = rec ? s.runs.filter((r) => rec.compared.includes(r.id)) : [];
  return (
    <div className="rt-vl-grid">
      <section className="rt-panel rt-pad">
        {!rec ? (
          <div className="rt-gridbg" style={{ display: "grid", placeItems: "center", minHeight: 320, borderRadius: 12 }}>
            <div className="rt-empty">
              <LuChartColumnIncreasing />
              <h3>Recommendations need comparable results.</h3>
              <p>Benchmark the same game, scene and hardware profile at two or more presets (Low, Medium, High or Ultra) and ViceLab will pick the best fit from those runs. Runs from different PCs, resolutions or scenes are never compared.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="rt-kicker">RECOMMENDED FROM YOUR RUNS</div>
            <h2 style={{ fontFamily: "var(--rt-display)", fontSize: 30, marginTop: 10 }}>{cap(rec.run.preset)} preset</h2>
            <p style={{ color: "var(--rt-sub)", marginTop: 8 }}>{rec.reason}</p>
            {recRun && <p className="rt-hint">From “{recRun.name}”: {recRun.stats.avgFps} FPS average, {recRun.stats.low1Fps} FPS 1% low.</p>}
            {rec.caveats.length > 0 && (
              <div className="rt-banner rt-warn" role="note" style={{ marginTop: 12 }}>
                <b>Low confidence.</b> {rec.caveats.join(" ")}
              </div>
            )}
            {rec.excluded > 0 && <p className="rt-hint">{rec.excluded} other run{rec.excluded === 1 ? " was" : "s were"} left out because {rec.excluded === 1 ? "it was" : "they were"} made on different hardware, at a different resolution or in a different scene.</p>}
            <table className="rt-table" style={{ marginTop: 20 }}>
              <thead><tr><th>Run</th><th>Preset</th><th>Average</th><th>1% low</th></tr></thead>
              <tbody>
                {pool.map((r) => (
                  <tr key={r.id} aria-selected={r.id === rec.run.id}>
                    <td>{r.name}</td><td>{cap(r.preset)}</td><td>{r.stats.avgFps}</td><td>{r.stats.low1Fps}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
      <section className="rt-panel rt-pad">
        <h2 style={{ marginBottom: 20 }}>Your goal</h2>
        <Field label="Game">
          {(id) => (
            <select id={id} className="rt-select" value={game} onChange={(e) => setGame(e.target.value)} disabled={!games.length}>
              {!games.length && <option value="">No runs yet</option>}
              {games.map((g) => <option key={g} value={g}>{gameName(g)}</option>)}
            </select>
          )}
        </Field>
        <Field label="What matters most?">
          {(id) => (
            <select id={id} className="rt-select" value={s.priority} onChange={(e) => set((d) => void (d.priority = e.target.value as Priority))}>
              {PRIORITY.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          )}
        </Field>
        <Field label="Target frame rate" hint="Usually your monitor's refresh rate, or 60.">
          {(id) => (
            <input id={id} className="rt-input" type="number" min={20} max={500} value={s.targetFps} onChange={(e) => {
              const v = Math.round(Number(e.target.value));
              if (Number.isFinite(v) && v >= 20 && v <= 500) set((d) => void (d.targetFps = v));
            }} />
          )}
        </Field>
        <p className="rt-hint" style={{ marginTop: 18 }}>ViceLab never guesses settings for hardware it hasn't measured, and doesn't change game settings for you.</p>
      </section>
    </div>
  );
}

/* ---------- History & hardware ---------- */

function History({ s, set, selected, onSelect }: { s: ViceLabState; set: Set; selected: string; onSelect: (id: string) => void }) {
  const { toast } = useShell();
  const [err, setErr] = useState("");
  const [hwName, setHwName] = useState("");
  const importInput = useRef<HTMLInputElement>(null);

  const exportAll = () => downloadText(`riptide-vicelab-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ format: "riptide-vicelab", ...s }, null, 2));
  const importAll = async (f: File) => {
    setErr("");
    try {
      const data = JSON.parse(await readFileText(f, 30 * 1024 * 1024));
      if (data?.format !== "riptide-vicelab") throw new Error();
      const parsed = ViceLabState.safeParse(data);
      if (!parsed.success) throw new Error();
      const have = new Set(s.runs.map((r) => r.id));
      const fresh = parsed.data.runs.filter((r) => !have.has(r.id));
      const haveHw = new Set(s.hardware.map((h) => h.id));
      set((d) => {
        d.runs = [...fresh, ...d.runs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 200);
        d.hardware = [...d.hardware, ...parsed.data.hardware.filter((h) => !haveHw.has(h.id))].slice(0, 20);
      });
      toast(`Imported ${fresh.length} run${fresh.length === 1 ? "" : "s"}`);
    } catch {
      setErr("This isn't a ViceLab export file.");
    }
  };

  const detect = (): Partial<Hardware> => {
    const out: Partial<Hardware> = {};
    const n = navigator as Navigator & { deviceMemory?: number };
    if (n.hardwareConcurrency) out.cpu = `${n.hardwareConcurrency} threads`;
    if (n.deviceMemory) out.ramGb = n.deviceMemory;
    try {
      const gl = document.createElement("canvas").getContext("webgl");
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      const name = ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
      if (name) out.gpu = name.slice(0, 120);
    } catch {
      /* not available */
    }
    out.resolution = `${screen.width * devicePixelRatio}×${screen.height * devicePixelRatio}`;
    return out;
  };

  return (
    <div style={{ display: "grid", gap: 24, marginTop: 26 }}>
      <section className="rt-panel">
        <div className="rt-panel-head">
          <h2>Runs</h2>
          <span className="rt-meta">{s.runs.length} saved</span>
          <button className="rt-btn rt-sm" onClick={() => importInput.current?.click()}><LuUpload />Import</button>
          <button className="rt-btn rt-sm" onClick={exportAll} disabled={!s.runs.length}><LuDownload />Export</button>
          <input ref={importInput} type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importAll(f); e.target.value = ""; }} />
        </div>
        {err && <div className="rt-error rt-pad" role="alert" style={{ paddingBottom: 0 }}>{err}</div>}
        {s.runs.length === 0 ? (
          <p className="rt-pad" style={{ color: "var(--rt-muted)", margin: 0 }}>No runs yet. Import a capture from the Benchmarks tab.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="rt-table">
              <thead><tr><th>Name</th><th>Game</th><th>Preset</th><th>Average</th><th>1% low</th><th>Stability</th><th>Date</th><th className="rt-actions"><span className="rt-sr">Actions</span></th></tr></thead>
              <tbody>
                {s.runs.map((r) => (
                  <tr key={r.id} aria-selected={r.id === selected}>
                    <td><button className="rt-link" style={{ color: "var(--rt-sand)", fontWeight: 600 }} onClick={() => onSelect(r.id)}>{r.name}</button></td>
                    <td>{gameName(r.game)}</td>
                    <td>{cap(r.preset)}</td>
                    <td>{r.stats.avgFps}</td>
                    <td>{r.stats.low1Fps}</td>
                    <td>±{r.stats.stddevMs} ms</td>
                    <td>{fmtDate(r.createdAt)}</td>
                    <td className="rt-actions">
                      <button className="rt-iconbtn" aria-label={`Delete ${r.name}`} title="Delete run" onClick={() => set((d) => void (d.runs = d.runs.filter((x) => x.id !== r.id)))}><LuTrash2 /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rt-panel">
        <div className="rt-panel-head"><h2>Hardware profiles</h2><span className="rt-meta">Tag runs with the machine they came from</span></div>
        <div className="rt-pad">
          {s.hardware.map((h) => (
            <div className="rt-setting" key={h.id}>
              <div className="rt-setting-text">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><LuCpu />{h.name}</span>
                <small>{[h.cpu, h.gpu, h.ramGb ? `${h.ramGb} GB+ memory` : "", h.resolution].filter(Boolean).join(" · ") || "No details"}</small>
              </div>
              <button className="rt-iconbtn" aria-label={`Remove ${h.name}`} onClick={() => set((d) => void (d.hardware = d.hardware.filter((x) => x.id !== h.id)))}><LuX /></button>
            </div>
          ))}
          <form
            className="rt-inline-row"
            style={{ marginTop: s.hardware.length ? 16 : 0 }}
            onSubmit={(e) => {
              e.preventDefault();
              const name = hwName.trim().slice(0, 60);
              if (!name) return;
              const h: Hardware = { id: uid(), name, cpu: "", gpu: "", ramGb: 0, resolution: "", notes: "", ...detect() };
              set((d) => void d.hardware.push(h));
              setHwName("");
              toast(`Added ${name}`);
            }}
          >
            <label className="rt-sr" htmlFor="rt-hw-name">Profile name</label>
            <input id="rt-hw-name" className="rt-input" placeholder="Name this PC, like 'Desk rig'" value={hwName} maxLength={60} onChange={(e) => setHwName(e.target.value)} />
            <button className="rt-btn" type="submit" disabled={!hwName.trim() || s.hardware.length >= 20}><LuPlus />Add this device</button>
          </form>
          <p className="rt-hint">Fills in what your browser can see: thread count, approximate memory, graphics adapter and screen resolution. Edit the name to suit.</p>
        </div>
      </section>
    </div>
  );
}
