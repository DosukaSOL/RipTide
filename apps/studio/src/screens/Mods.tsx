import { useMemo, useState, type ComponentType } from "react";
import {
  LuBox, LuLibrary, LuDatabase, LuBackpack, LuMic, LuSmartphone, LuGauge, LuHouse, LuCar, LuBriefcase, LuMap, LuShirt, LuShield,
  LuWrench, LuMessageCircle, LuRadio, LuStore, LuChartLine, LuPalette, LuAccessibility, LuSearch, LuPlus, LuMinus,
} from "react-icons/lu";
import { CATALOG, CATEGORY_LABELS, checkCompatibility, type Category, type CompatIssue } from "@riptide/core";
import { useStore } from "../lib/store";
import { PageHead } from "../components/ui";

const ICONS: Record<Category, ComponentType> = {
  framework: LuBox, library: LuLibrary, database: LuDatabase, inventory: LuBackpack, voice: LuMic, phone: LuSmartphone, hud: LuGauge,
  housing: LuHouse, vehicles: LuCar, jobs: LuBriefcase, maps: LuMap, clothing: LuShirt, anticheat: LuShield,
  admin: LuWrench, community: LuMessageCircle, streaming: LuRadio, store: LuStore, analytics: LuChartLine,
  visuals: LuPalette, accessibility: LuAccessibility,
};

export function Mods() {
  const { bp, edit, toast } = useStore();
  const [filter, setFilter] = useState<"installed" | "all" | Category>("installed");
  const [q, setQ] = useState("");
  const compat = useMemo(() => checkCompatibility(bp), [bp]);
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
        sub="Real, public FiveM resources, with the folder name, source and licence of each. Riptide checks what each one needs and what conflicts. Mods with problems are left out of the server.cfg it exports."
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
                        {m.engines.includes("gta6") && <span className="chip dim" title="Its author plans a GTA VI version. Nothing runs on GTA VI yet.">Aims for GTA VI</span>}
                      </div>
                      <div className="mod-sum">{m.summary}</div>
                      <div className="mod-meta muted small">
                        <code>{m.resource}</code> · {m.author} · {m.license} · <a href={m.source} target="_blank" rel="noopener noreferrer">Source</a>
                      </div>
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
          <section className="panel">
            <div className="panel-head"><h2>Start order</h2><span className="meta">Worked out for you</span></div>
            <ol style={{ margin: 0, padding: "12px 20px 14px 40px", color: "var(--sand-2)", fontSize: 13, lineHeight: 1.9 }}>
              {compat.loadOrder.slice(0, 8).map((id) => <li key={id}><code>{CATALOG.find((c) => c.id === id)?.resource ?? id}</code></li>)}
              {compat.loadOrder.length > 8 && <li style={{ listStyle: "none", marginLeft: -20 }} className="muted">and {compat.loadOrder.length - 8} more</li>}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
