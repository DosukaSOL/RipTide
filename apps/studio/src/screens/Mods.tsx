import { useMemo, useState, type ComponentType } from "react";
import {
  LuBox, LuDatabase, LuBackpack, LuMic, LuSmartphone, LuGauge, LuHouse, LuCar, LuBriefcase, LuMap, LuShirt, LuShield,
  LuWrench, LuMessageCircle, LuRadio, LuStore, LuChartLine, LuPalette, LuAccessibility, LuSearch, LuPlus, LuMinus,
} from "react-icons/lu";
import { CATALOG, CATEGORY_LABELS, checkCompatibility, estimateBudget, type Category, type CompatIssue } from "@riptide/core";
import { useStore } from "../lib/store";
import { Meter, PageHead } from "../components/ui";

const ICONS: Record<Category, ComponentType> = {
  framework: LuBox, database: LuDatabase, inventory: LuBackpack, voice: LuMic, phone: LuSmartphone, hud: LuGauge,
  housing: LuHouse, vehicles: LuCar, jobs: LuBriefcase, maps: LuMap, clothing: LuShirt, anticheat: LuShield,
  admin: LuWrench, community: LuMessageCircle, streaming: LuRadio, store: LuStore, analytics: LuChartLine,
  visuals: LuPalette, accessibility: LuAccessibility,
};

export function Mods() {
  const { bp, edit, toast } = useStore();
  const [filter, setFilter] = useState<"installed" | "all" | Category>("installed");
  const [q, setQ] = useState("");
  const compat = useMemo(() => checkCompatibility(bp), [bp]);
  const budget = useMemo(() => estimateBudget(bp), [bp]);
  const installed = new Set(bp.mods.filter((m) => m.enabled).map((m) => m.id));
  const flagged = new Set(compat.issues.filter((i) => i.level === "error").flatMap((i) => i.mods));

  const categories = [...new Set(CATALOG.map((c) => c.category))];
  const list = CATALOG.filter((c) => (filter === "installed" ? installed.has(c.id) : filter === "all" ? true : c.category === filter))
    .filter((c) => c.engines.includes(bp.engine.target) || installed.has(c.id))
    .filter((c) => !q || `${c.name} ${c.summary} ${c.category}`.toLowerCase().includes(q.toLowerCase()));

  const setInstalled = (id: string, on: boolean) =>
    edit((d) => {
      const m = d.mods.find((x) => x.id === id);
      if (m) m.enabled = on;
      else if (on) d.mods.push({ id, enabled: true });
    });

  const applyFix = (issue: CompatIssue) => {
    if (!issue.fix) return;
    edit((d) => {
      issue.fix!.remove?.forEach((id) => d.mods.forEach((m) => m.id === id && (m.enabled = false)));
      issue.fix!.add?.forEach((id) => {
        const m = d.mods.find((x) => x.id === id);
        if (m) m.enabled = true;
        else d.mods.push({ id, enabled: true });
      });
    });
    toast(`Applied: ${issue.fix.label}`);
  };

  return (
    <>
      <PageHead
        title="Mods"
        sub="Riptide checks every mod against the others and against your performance budget before anything is installed."
      />
      <div className="grid g-main">
        <div>
          {compat.issues.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {compat.issues.map((i, k) => (
                <div className={`issue ${i.level === "error" ? "" : "info"}`} key={`${i.code}-${i.mods.join()}-${k}`}>
                  <span className={`chip ${i.level === "error" ? "pink" : "dim"}`}>{i.level === "error" ? "Conflict" : "Note"}</span>
                  <span className="t">{i.message}</span>
                  {i.fix && <button className="btn small" onClick={() => applyFix(i)}>{i.fix.label}</button>}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
            <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
              <LuSearch style={{ position: "absolute", left: 12, top: 11, color: "var(--haze-2)" }} />
              <input className="input" style={{ paddingLeft: 36 }} placeholder="Search mods" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search mods" />
            </div>
            <span className="muted small">{CATALOG.length} in catalog</span>
          </div>
          <div className="cat-tabs" role="group" aria-label="Filter by category">
            <button aria-pressed={filter === "installed"} onClick={() => setFilter("installed")}>Installed {installed.size}</button>
            <button aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button>
            {categories.map((c) => (
              <button key={c} aria-pressed={filter === c} onClick={() => setFilter(c)}>{CATEGORY_LABELS[c]}</button>
            ))}
          </div>

          <section className="panel">
            <div className="mod-list">
              {list.map((m) => {
                const Icon = ICONS[m.category];
                const on = installed.has(m.id);
                return (
                  <div className={`mod ${flagged.has(m.id) ? "flagged" : ""}`} key={m.id}>
                    <span className="mod-ic"><Icon /></span>
                    <div style={{ minWidth: 0 }}>
                      <div className="mod-name">
                        {m.name}
                        {m.status !== "ready" && <span className={`chip ${m.status === "beta" ? "sun" : "dim"}`}>{m.status === "beta" ? "Beta" : "Planned"}</span>}
                        {m.engines.includes("gta6") && <span className="chip dim">GTA VI ready</span>}
                      </div>
                      <div className="mod-sum">{m.summary}</div>
                    </div>
                    <div className="mod-cost">
                      <div>{(m.cost.serverMs + (m.cost.serverMsPer100 * bp.meta.maxPlayers) / 100).toFixed(2)} ms</div>
                      <div>{m.cost.streamMB} MB</div>
                    </div>
                    <button className={`btn small ${on ? "" : "primary"}`} onClick={() => setInstalled(m.id, !on)} aria-label={`${on ? "Remove" : "Add"} ${m.name}`}>
                      {on ? <><LuMinus />Remove</> : <><LuPlus />Add</>}
                    </button>
                  </div>
                );
              })}
              {!list.length && <div className="panel-pad muted">Nothing matches "{q}". Try a category instead.</div>}
            </div>
          </section>
        </div>

        <aside className="grid">
          <section className="panel panel-pad grid" style={{ gap: 18 }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <h2>Performance budget</h2>
              <span className={`chip ${budget.verdict === "comfortable" ? "sea" : budget.verdict === "tight" ? "sun" : "pink"}`} style={{ marginLeft: "auto" }}>{budget.verdict}</span>
            </div>
            <Meter label="Server time per tick" used={budget.totals.serverMs} limit={budget.limits.serverMs} unit="ms" />
            <Meter label="Player memory" used={budget.totals.clientMB} limit={budget.limits.clientMB} unit="MB" />
            <Meter label="Download size" used={budget.totals.streamMB} limit={budget.limits.streamMB} unit="MB" />
            <p className="muted small" style={{ margin: 0 }}>Estimates for {bp.meta.maxPlayers} players. Riptide measures the real numbers after your first deploy.</p>
          </section>
          <section className="panel">
            <div className="panel-head"><h2>Heaviest mods</h2></div>
            <div style={{ padding: "4px 20px 12px" }}>
              {budget.lines.slice(0, 6).map((l) => (
                <div className="cost-line" key={l.id}>
                  <span>{l.name}</span>
                  <span className="num muted">{l.serverMs.toFixed(2)} ms</span>
                </div>
              ))}
            </div>
          </section>
          <section className="panel">
            <div className="panel-head"><h2>Start order</h2><span className="meta">Worked out for you</span></div>
            <ol style={{ margin: 0, padding: "12px 20px 14px 40px", color: "var(--sand-2)", fontSize: 13, lineHeight: 1.9 }}>
              {compat.loadOrder.slice(0, 8).map((id) => <li key={id}>{CATALOG.find((c) => c.id === id)?.name ?? id}</li>)}
              {compat.loadOrder.length > 8 && <li style={{ listStyle: "none", marginLeft: -20 }} className="muted">and {compat.loadOrder.length - 8} more</li>}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
