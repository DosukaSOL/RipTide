import { useEffect, useMemo, useRef, useState } from "react";
import { LuDownload, LuTriangleAlert } from "react-icons/lu";
import { assessReadiness, fivemAdapter, GTA6_CAPABILITIES, GTA6_CHECKED, deployPreflight } from "@riptide/core";
import { useStore } from "../lib/store";
import { PageHead } from "../components/ui";

type Target = "fivem" | "gta6";

export function Deploy() {
  const { bp, edit, toast } = useStore();
  const [target, setTarget] = useState<Target>("fivem");
  const [state, setState] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<{ t: string; m: string; ok?: boolean; bad?: boolean }[]>([]);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const readiness = useMemo(() => assessReadiness(bp), [bp]);

  // Both steps really run, here in the app: the Blueprint is validated and the FiveM build is
  // made. Nothing is uploaded, reserved or started: RipTide doesn't host servers.
  const deploy = () => {
    if (state === "running") return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const stop = (m: string) => {
      setLog((l) => [...l, { t: "0.0s", m, bad: true }]);
      setProgress(0);
      setState("failed");
      toast("The build stopped: fix the problems in the log first.");
    };
    setLog([]);
    const pre = deployPreflight(bp);
    if (!pre.ok) return stop(pre.message);
    const left = pre.enabled - pre.started;
    const real = [
      { m: "Checked Blueprint: no problems", ok: true },
      { m: `Built server.cfg: ${pre.started} of ${pre.enabled} enabled mods start${left > 0 ? ` (${left} left out, see Mods)` : ""}, plus roles and settings${pre.notes.length ? `. ${pre.notes.length} note${pre.notes.length === 1 ? "" : "s"} from the build` : ""}`, ok: true },
    ];
    setState("running");
    setProgress(4);
    const start = Date.now();
    const steps = real;
    steps.forEach(({ m, ok }, i) => {
      timers.current.push(window.setTimeout(() => {
        const t = `${((Date.now() - start) / 1000).toFixed(1)}s`;
        setLog((l) => [...l, { t, m, ok }]);
        setProgress(Math.round(((i + 1) / (steps.length + 1)) * 100));
      }, 450 + i * 520));
    });
    timers.current.push(window.setTimeout(() => {
      setLog((l) => [...l, { t: `${((Date.now() - start) / 1000).toFixed(1)}s`, m: "Ready: download server.cfg and run it on your own FiveM server.", ok: true }]);
      setProgress(100);
      setState("done");
      toast("Built. Download server.cfg to use it.");
    }, 450 + steps.length * 520));
  };

  const download = () => {
    let cfg: string;
    try {
      cfg = fivemAdapter.build(bp).files.find((f) => f.path === "server.cfg")!.contents;
    } catch (e) {
      toast((e as Error).message);
      return;
    }
    const url = URL.createObjectURL(new Blob([cfg], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "server.cfg";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHead title="Deploy" sub="Check your Blueprint and download the FiveM server.cfg it builds. RipTide doesn't host servers: you run the file on your own FiveM server." />
      <div className="grid g-main">
        <div className="grid">
          <section className="panel panel-pad">
            <h2 style={{ marginBottom: 14 }}>Game</h2>
            <button className="target" aria-pressed={target === "fivem"} onClick={() => setTarget("fivem")}>
              <span className="tic" style={{ color: "var(--seafoam)" }}>V</span>
              <span><b>GTA V on FiveM</b><span>Exports server.cfg with your mods, roles and settings. World, economy and rules aren't applied in-game yet.</span></span>
              <span className="chip sea">Config export</span>
            </button>
            {target === "fivem" && (
              <div className="edition" role="group" aria-label="FiveM edition">
                <button aria-pressed={bp.engine.edition !== "enhanced"} onClick={() => edit((d) => void (d.engine.edition = "legacy"))}><b>GTA V Legacy</b><span>What most servers run</span></button>
                <button aria-pressed={bp.engine.edition === "enhanced"} onClick={() => edit((d) => void (d.engine.edition = "enhanced"))}><b>GTA V Enhanced</b><span>Early access, Cfx Server</span></button>
              </div>
            )}
            <button className="target" aria-pressed={target === "gta6"} onClick={() => setTarget("gta6")}>
              <span className="tic" style={{ color: "var(--flamingo)" }}>VI</span>
              <span><b>GTA VI</b><span>Out on consoles. Servers need a PC release and Rockstar's server tools, and neither is announced.</span></span>
              <span className="chip sun">Waiting</span>
            </button>
          </section>

          {target === "gta6" ? (
            <section className="panel">
              <div className="panel-head"><h2>What we know about GTA VI</h2><span className="meta">Checked {new Date(GTA6_CHECKED).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</span></div>
              <div className="panel-pad grid" style={{ gap: 12 }}>
                <div className="notice">
                  <LuTriangleAlert />
                  <div><b>GTA VI servers can't be deployed.</b> Keep building here: your Blueprint isn't tied to one game, so it's ready to move if Rockstar releases official server tools.</div>
                </div>
                {GTA6_CAPABILITIES.map((c) => (
                  <div className="cost-line" key={c.feature} style={{ alignItems: "center", gap: 16 }}>
                    <span style={{ minWidth: 170, color: "var(--sand)" }}>{c.feature}</span>
                    <span className="muted" style={{ flex: 1 }}>{c.note}</span>
                    <span className={`chip ${c.status === "confirmed" ? "sea" : c.status === "reported" ? "sun" : "dim"}`}>{c.status === "reported" ? "reported, unconfirmed" : c.status === "unknown" ? "not announced" : "confirmed"}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

        </div>

        <aside className="grid">
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
              aria-describedby="rt-sim-note"
            >
              <svg className="wave" viewBox="0 0 40 56" preserveAspectRatio="none" aria-hidden="true"><path d="M20 0 C 34 10 6 18 20 28 C 34 38 6 46 20 56 L 0 56 L 0 0 Z" fill="#ff4f9a" /></svg>
              <span className={state === "idle" && target === "fivem" ? "ink" : ""}>
                {target === "gta6" ? "Not available yet" : state === "running" ? `Checking… ${progress}%` : state === "done" ? "Built" : "Check and build"}
              </span>
            </button>
            <p id="rt-sim-note" className="muted small" style={{ margin: 0 }}>Runs here in RipTide. Nothing is uploaded or started.</p>
            <button className="btn" onClick={download}><LuDownload />Download server.cfg</button>
          </section>
            <section className="panel panel-pad">
            <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
              <h2>Build log</h2>
            </div>
            <div className="log" aria-live="polite">
              {!log.length && <span className="muted">Check and build to see what goes into {bp.meta.name}'s server.cfg.</span>}
              {log.map((l, i) => (
                <div key={i} className={l.bad ? "bad" : l.ok ? "ok" : ""}><span className="t">{l.t}</span>{l.bad ? "✕ " : l.ok ? "● " : "  "}{l.m}</div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
