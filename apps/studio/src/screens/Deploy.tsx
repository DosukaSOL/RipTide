import { useEffect, useMemo, useRef, useState } from "react";
import { LuDownload, LuTriangleAlert } from "react-icons/lu";
import { assessReadiness, bestRegion, estimateHosting, fivemAdapter, GTA6_CAPABILITIES, REGIONS } from "@riptide/core";
import { useStore } from "../lib/store";
import { MEMBER_SPREAD } from "../lib/sample";
import { PageHead, money } from "../components/ui";

type Target = "fivem" | "gta6" | "docker";

export function Deploy() {
  const { bp, edit, toast } = useStore();
  const [target, setTarget] = useState<Target>("fivem");
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<{ t: string; m: string; ok?: boolean }[]>([]);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const ranked = useMemo(() => bestRegion(MEMBER_SPREAD), []);
  const hosting = useMemo(() => estimateHosting(bp), [bp]);
  const readiness = useMemo(() => assessReadiness(bp), [bp]);
  const region = REGIONS.find((r) => r.id === bp.meta.region) ?? REGIONS[0]!;

  const steps = [
    "Checking Blueprint",
    `Compiling for FiveM, ${bp.mods.filter((m) => m.enabled).length} mods in start order`,
    "Writing server.cfg and runtime config",
    `Reserving ${hosting.vcpu} vCPU in ${region.city}`,
    "Restoring database snapshot",
    "Starting server",
    "Posting rules to Discord",
  ];

  const deploy = () => {
    if (state === "running") return;
    setState("running");
    setLog([]);
    setProgress(4);
    const start = Date.now();
    steps.forEach((m, i) => {
      timers.current.push(window.setTimeout(() => {
        const t = `${((Date.now() - start) / 1000).toFixed(1)}s`;
        setLog((l) => [...l, { t, m }]);
        setProgress(Math.round(((i + 1) / (steps.length + 1)) * 100));
      }, 450 + i * 520));
    });
    timers.current.push(window.setTimeout(() => {
      setLog((l) => [...l, { t: `${((Date.now() - start) / 1000).toFixed(1)}s`, m: `${bp.meta.name} is live`, ok: true }]);
      setProgress(100);
      setState("done");
      toast(`Deployed ${bp.meta.name}`);
    }, 450 + steps.length * 520));
  };

  const download = () => {
    const cfg = fivemAdapter.build(bp).files.find((f) => f.path === "server.cfg")!.contents;
    const url = URL.createObjectURL(new Blob([cfg], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "server.cfg";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHead title="Deploy" sub="Pick where your server runs. Riptide builds it, starts it and keeps every version so you can roll back." />
      <div className="grid g-main">
        <div className="grid">
          <section className="panel panel-pad">
            <h2 style={{ marginBottom: 14 }}>Game</h2>
            <button className="target" aria-pressed={target === "fivem"} onClick={() => setTarget("fivem")}>
              <span className="tic" style={{ color: "var(--seafoam)" }}>V</span>
              <span><b>GTA V on FiveM</b><span>Ready today. Your Blueprint moves to GTA VI when support lands.</span></span>
              <span className="chip sea">Ready</span>
            </button>
            <button className="target" aria-pressed={target === "gta6"} onClick={() => setTarget("gta6")}>
              <span className="tic" style={{ color: "var(--flamingo)" }}>VI</span>
              <span><b>GTA VI</b><span>Waiting for the PC release and Rockstar's server tools.</span></span>
              <span className="chip sun">Waiting</span>
            </button>
            <button className="target" aria-pressed={target === "docker"} onClick={() => setTarget("docker")}>
              <span className="tic" style={{ color: "var(--sky)", fontSize: 13 }}>Host</span>
              <span><b>Your own machine</b><span>Get a docker-compose stack and run it anywhere.</span></span>
              <span className="chip dim">CLI</span>
            </button>
          </section>

          {target === "gta6" ? (
            <section className="panel">
              <div className="panel-head"><h2>What we know about GTA VI</h2><span className="meta">Updated as Rockstar shares more</span></div>
              <div className="panel-pad grid" style={{ gap: 12 }}>
                <div className="notice">
                  <LuTriangleAlert />
                  <div><b>GTA VI servers can't be deployed yet.</b> Keep building here. Your Blueprint is engine-agnostic and Riptide will move it over on day one.</div>
                </div>
                {GTA6_CAPABILITIES.map((c) => (
                  <div className="cost-line" key={c.feature} style={{ alignItems: "center", gap: 16 }}>
                    <span style={{ minWidth: 170, color: "var(--sand)" }}>{c.feature}</span>
                    <span className="muted" style={{ flex: 1 }}>{c.note}</span>
                    <span className={`chip ${c.status === "confirmed" ? "sea" : c.status === "expected" ? "sun" : "dim"}`}>{c.status}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section className="panel panel-pad">
              <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
                <h2>Region</h2>
                <span className="muted small" style={{ marginLeft: "auto" }}>Ranked by distance to your Discord members</span>
              </div>
              <div className="regions">
                {ranked.map(({ region: r, avgKm }, i) => (
                  <button className="region" key={r.id} aria-pressed={bp.meta.region === r.id} onClick={() => edit((d) => void (d.meta.region = r.id))}>
                    <span className={`dot ${bp.meta.region === r.id ? "" : "off"}`} />
                    <span>
                      <div className="city">{r.city}</div>
                      {i === 0 ? <div className="best">Closest to your community</div> : <div className="muted small">{r.label}</div>}
                    </span>
                    <span className="km">{avgKm.toLocaleString("en-US")} km</span>
                  </button>
                ))}
              </div>
            </section>
          )}

        </div>

        <aside className="grid">
          <section className="panel panel-pad">
            <h2 style={{ marginBottom: 10 }}>Monthly estimate</h2>
            {hosting.breakdown.map((b) => (
              <div className="cost-line" key={b.label}><span>{b.label}</span><span className="num">{money(b.usd)}</span></div>
            ))}
            <div className="cost-total"><span className="muted">{region.city}</span><b className="num">${hosting.monthlyUsd.toFixed(2)}</b></div>
          </section>
          <section className="panel panel-pad grid" style={{ gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="muted small">Launch readiness</span>
              <span className="num" style={{ fontWeight: 600 }}>{readiness.score}/100</span>
            </div>
            <button
              className={`launch ${state === "running" ? "running" : ""}`}
              data-state={state}
              style={{ ["--fill" as string]: state === "idle" ? (target === "gta6" ? "0%" : "100%") : `${progress}%` }}
              onClick={deploy}
              disabled={target !== "fivem" || state === "running"}
            >
              <svg className="wave" viewBox="0 0 40 56" preserveAspectRatio="none" aria-hidden="true"><path d="M20 0 C 34 10 6 18 20 28 C 34 38 6 46 20 56 L 0 56 L 0 0 Z" fill="#ff4f9a" /></svg>
              <span className={state === "idle" && target === "fivem" ? "ink" : ""}>
                {target === "gta6" ? "Not available yet" : target === "docker" ? "Use riptide build --target docker" : state === "running" ? `Deploying… ${progress}%` : state === "done" ? "Live" : `Deploy to ${region.city}`}
              </span>
            </button>
            <button className="btn" onClick={download}><LuDownload />Download server.cfg</button>
          </section>
            <section className="panel panel-pad">
            <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
              <h2>Deploy log</h2>
              <span className="chip dim" style={{ marginLeft: "auto" }}>Simulated</span>
            </div>
            <p className="muted small" style={{ margin: "0 0 12px" }}>This preview build simulates deploys until Riptide hosting opens.</p>
            <div className="log" aria-live="polite">
              {!log.length && <span className="muted">Press Deploy to build and start {bp.meta.name}.</span>}
              {log.map((l, i) => (
                <div key={i} className={l.ok ? "ok" : ""}><span className="t">{l.t}</span>{l.ok ? "● " : "  "}{l.m}</div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
