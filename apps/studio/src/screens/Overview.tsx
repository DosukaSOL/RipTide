import { useMemo } from "react";
import { LuRocket, LuShare2 } from "react-icons/lu";
import { assessReadiness, checkCompatibility, compileRulebook, deployPreflight, encodeBlueprint } from "@riptide/core";
import { useHref, useStore } from "../lib/store";
import { Sunrise } from "../components/Sunrise";
import { Check, Cross } from "../components/ui";

export function Overview() {
  const { bp, toast } = useStore();
  const href = useHref();
  const readiness = useMemo(() => assessReadiness(bp), [bp]);
  const compat = useMemo(() => checkCompatibility(bp), [bp]);
  const rules = useMemo(() => compileRulebook(bp.rulebook), [bp.rulebook]);
  const build = useMemo(() => deployPreflight(bp), [bp]);
  const started = build.ok ? [...build.serverCfg.matchAll(/^ensure (\S+)$/gm)].map((m) => m[1]!) : [];
  const problems = compat.issues.filter((i) => i.level === "error").length;
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
            {bp.meta.slug === "neon-coast" && <span className="chip sun" title="RipTide's starter Blueprint. Rename it and change anything: it's yours.">Starter template</span>}
            <span className="chip sea"><span className="dot" />FiveM config export</span>
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
          <div className="muted small">Mods</div>
          <div className="stat-v">{started.length} start</div>
          <div className="stat-s">{problems ? `${problems} problem${problems === 1 ? "" : "s"} to fix in Mods` : "No compatibility problems"}</div>
        </div>
        <div className="panel stat">
          <div className="muted small">Rulebook</div>
          <div className="stat-v">{rules.rules.length} rules</div>
          <div className="stat-s">{rules.enforced} RipTide can read as settings</div>
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

        <section className="panel">
          <div className="panel-head">
            <h2>Your server.cfg</h2>
            <span className="meta">Built from this Blueprint just now</span>
          </div>
          {build.ok ? (
            <div style={{ padding: "4px 20px 16px" }}>
              <p className="muted small" style={{ margin: "6px 0 10px" }}>These resources start, in this order. Download the file from Deploy.</p>
              <ol className="cfg-list">
                {started.map((r) => <li key={r}><code>{r}</code></li>)}
              </ol>
              {build.notes.length > 0 && <p className="muted small">{build.notes.length} note{build.notes.length === 1 ? "" : "s"} from the build. See Deploy.</p>}
            </div>
          ) : (
            <p className="muted" style={{ padding: "4px 20px 16px" }}>{build.message}</p>
          )}
        </section>
      </div>
    </>
  );
}

export function sectionRoute(section: string) {
  return ({ identity: "overview", rules: "rules", roles: "roles", economy: "economy", mods: "mods", world: "world", access: "access", deploy: "deploy" } as Record<string, string>)[section] ?? "overview";
}
