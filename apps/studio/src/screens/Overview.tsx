import { useMemo } from "react";
import { LuRocket, LuShare2, LuGitBranch, LuGitMerge } from "react-icons/lu";
import { assessReadiness, estimateBudget, estimateHosting, encodeBlueprint, REGIONS } from "@riptide/core";
import { useHref, useStore } from "../lib/store";
import { Sunrise } from "../components/Sunrise";
import { Check, Cross, money } from "../components/ui";
import { DEPLOY_HISTORY, PREVIEWS } from "../lib/sample";

export function Overview() {
  const { bp, toast } = useStore();
  const href = useHref();
  const readiness = useMemo(() => assessReadiness(bp), [bp]);
  const budget = useMemo(() => estimateBudget(bp), [bp]);
  const hosting = useMemo(() => estimateHosting(bp), [bp]);
  const region = REGIONS.find((r) => r.id === bp.meta.region);
  const enabled = bp.mods.filter((m) => m.enabled).length;

  const share = async () => {
    try {
      await navigator.clipboard.writeText(encodeBlueprint(bp));
      toast("Share code copied");
    } catch {
      toast("Couldn't reach the clipboard. Use riptide share in the CLI.");
    }
  };

  const label = readiness.score >= 90 ? "Ready to launch" : readiness.score >= 70 ? "Almost there" : "Still setting up";

  return (
    <>
      <section className="hero">
        <div>
          <div className="hero-row">
            <span className="chip sea"><span className="dot" />FiveM config export</span>
            <span className="chip dim">{region?.city ?? bp.meta.region}</span>
            {bp.access.whitelist && <span className="chip dim">Whitelisted</span>}
          </div>
          <h1>{bp.meta.name}</h1>
          <p>{bp.meta.tagline}</p>
          <div className="hero-actions">
            <a className="btn primary" href={href("deploy")} style={{ textDecoration: "none" }}><LuRocket />Deploy</a>
            <button className="btn" onClick={share}><LuShare2 />Copy share code</button>
          </div>
        </div>
        <div>
          <Sunrise score={readiness.score} />
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 6 }}>
            <span className="sunrise-score">{readiness.score}</span>
            <span className="sunrise-label">{label}</span>
          </div>
        </div>
      </section>

      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <div className="panel stat">
          <div className="muted small">Players</div>
          <div className="stat-v">{bp.meta.maxPlayers} slots</div>
          <div className="stat-s">{bp.roles.length} roles, {enabled} mods</div>
        </div>
        <div className="panel stat">
          <div className="muted small">Hosting estimate</div>
          <div className="stat-v">{money(hosting.monthlyUsd)}<span className="muted" style={{ fontSize: 15 }}> /month</span></div>
          <div className="stat-s">{hosting.vcpu} vCPU, {hosting.ramGB} GB memory</div>
        </div>
        <div className="panel stat">
          <div className="muted small">First join</div>
          <div className="stat-v">{Math.round(budget.firstJoinSeconds / 6) / 10} min</div>
          <div className="stat-s">{budget.totals.streamMB} MB download on 50 Mbit/s</div>
        </div>
      </div>

      <div className="grid g-2">
        <section className="panel">
          <div className="panel-head">
            <h2>Launch checklist</h2>
            <span className="meta">{readiness.checks.filter((c) => c.passed).length} of {readiness.checks.length} done</span>
          </div>
          <ul className="checks" style={{ padding: "4px 20px 10px" }}>
            {readiness.checks.map((c) => (
              <li key={c.id}>
                <span className={`ic ${c.passed ? "ok" : "no"}`}>{c.passed ? <Check /> : <Cross />}</span>
                <a href={href(sectionRoute(c.section))}>
                  <span className="t">{c.label}</span>
                  {!c.passed && <span className="hint">{c.hint}</span>}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <div className="grid" style={{ alignContent: "start" }}>
          <section className="panel">
            <div className="panel-head">
              <h2>Preview servers</h2>
              <span className="chip dim" title="Preview servers arrive with RipTide hosting">Example data</span>
              <span className="meta">Test changes before players see them</span>
            </div>
            {PREVIEWS.map((p) => (
              <div className="preview-row" key={p.branch}>
                <LuGitBranch className="muted" />
                <div style={{ flex: 1 }}>
                  <div className="br">{p.branch}</div>
                  <div className="muted small">{p.summary}</div>
                </div>
                <span className={`chip ${p.state === "live" ? "sea" : "dim"}`}>{p.state === "live" ? `${p.players} testing` : "Paused"}</span>
                <button className="btn small" onClick={() => toast(`Merged ${p.branch} into ${bp.meta.name}`)}><LuGitMerge />Merge</button>
              </div>
            ))}
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Deploy history</h2><span className="chip dim" title="Deploy history arrives with RipTide hosting">Example data</span><span className="meta">Roll back to any point</span></div>
            <ul className="timeline">
              {DEPLOY_HISTORY.map((d, i) => (
                <li key={d.id}>
                  <span className={`tdot ${i === 0 ? "live" : ""}`} />
                  <div>
                    <div className="what">{d.title}</div>
                    <div className="sub">{d.detail}</div>
                  </div>
                  <span className="when">{d.when}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}

export function sectionRoute(section: string) {
  return ({ identity: "overview", rules: "rules", roles: "roles", economy: "economy", mods: "mods", world: "world", access: "access", deploy: "deploy" } as Record<string, string>)[section] ?? "overview";
}
