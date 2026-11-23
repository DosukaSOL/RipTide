import { useLayoutEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  LuLayoutDashboard,
  LuSun,
  LuCoins,
  LuScrollText,
  LuUsers,
  LuPuzzle,
  LuDoorOpen,
  LuRocket,
  LuChevronsUpDown,
  LuUndo2,
  LuCloud,
} from "react-icons/lu";
import { assessReadiness, checkCompatibility, compileRulebook } from "@riptide/core";
import { useHref, useRoute, useStore } from "./lib/store";
import { Logo } from "./components/ui";
import { Overview } from "./screens/Overview";
import { World } from "./screens/World";
import { Economy } from "./screens/Economy";
import { Rulebook } from "./screens/Rulebook";
import { Roles } from "./screens/Roles";
import { Mods } from "./screens/Mods";
import { Access } from "./screens/Access";
import { Deploy } from "./screens/Deploy";
import { ServerArt } from "./components/ServerArt";

interface NavItem {
  id: string;
  label: string;
  icon: ComponentType;
  screen: ComponentType;
  group: "server" | "ship";
}

const NAV: NavItem[] = [
  { id: "overview", label: "Overview", icon: LuLayoutDashboard, screen: Overview, group: "server" },
  { id: "world", label: "World & look", icon: LuSun, screen: World, group: "server" },
  { id: "economy", label: "Economy", icon: LuCoins, screen: Economy, group: "server" },
  { id: "rules", label: "Rulebook", icon: LuScrollText, screen: Rulebook, group: "server" },
  { id: "roles", label: "Roles", icon: LuUsers, screen: Roles, group: "server" },
  { id: "mods", label: "Mods", icon: LuPuzzle, screen: Mods, group: "server" },
  { id: "access", label: "Joining", icon: LuDoorOpen, screen: Access, group: "server" },
  { id: "deploy", label: "Deploy", icon: LuRocket, screen: Deploy, group: "ship" },
];

export function App({ embedded = false }: { embedded?: boolean } = {}) {
  const { bp, undo, canUndo } = useStore();
  const href = useHref();
  const [route] = useRoute();
  const current = NAV.find((n) => n.id === route) ?? NAV[0]!;
  const Screen = current.screen;

  const readiness = useMemo(() => assessReadiness(bp), [bp]);
  const compat = useMemo(() => checkCompatibility(bp), [bp]);
  const rules = useMemo(() => compileRulebook(bp.rulebook), [bp.rulebook]);
  const errors = compat.issues.filter((i) => i.level === "error").length;

  const navRef = useRef<HTMLElement>(null);
  const [indicatorY, setIndicatorY] = useState(0);
  useLayoutEffect(() => {
    const el = navRef.current?.querySelector<HTMLElement>(`a[data-id="${current.id}"]`);
    if (el) setIndicatorY(el.offsetTop);
  }, [current.id]);

  const counts: Record<string, { n: number | string; bad?: boolean } | undefined> = {
    mods: { n: errors || bp.mods.filter((m) => m.enabled).length, bad: errors > 0 },
    rules: { n: rules.enforced },
    roles: { n: bp.roles.length },
  };

  return (
    <div className={`shell${embedded ? " embedded" : ""}`}>
      <aside className="side">
        {!embedded && (
          <div className="brand">
            <Logo size={30} />
            <span className="brand-word">riptide</span>
          </div>
        )}
        <button className="switcher" aria-label="Switch server">
          <span className="switcher-art"><ServerArt seed={bp.meta.slug} /></span>
          <span>
            <div className="switcher-name">{bp.meta.name}</div>
            <div className="switcher-sub">{bp.meta.maxPlayers} slots</div>
          </span>
          <LuChevronsUpDown className="chev" />
        </button>
        <nav className="nav" ref={navRef} aria-label="Blueprint">
          <span className="nav-indicator" style={{ transform: `translateY(${indicatorY}px)`, top: 0 }} aria-hidden="true" />
          {NAV.map((n, i) => {
            const Icon = n.icon;
            const c = counts[n.id];
            const groupStart = i === 0 || NAV[i - 1]!.group !== n.group;
            return (
              <div key={n.id} style={{ display: "contents" }}>
                {groupStart && n.group === "ship" && <div className="nav-group">Ship it</div>}
                <a href={href(n.id)} data-id={n.id} aria-current={current.id === n.id ? "page" : undefined}>
                  <Icon />
                  {n.label}
                  {c && <span className={`count ${c.bad ? "bad" : ""}`}>{c.n}</span>}
                </a>
              </div>
            );
          })}
        </nav>
        <div className="side-foot">
          <span className="engine-pill"><span className="dot" />FiveM server.cfg export</span>
          <span className="engine-pill"><span className="dot warn" />GTA VI waiting on Rockstar</span>
          {!embedded && (
            <a href="?shell=tools" className="try-tools">Try the RipTide Tools preview</a>
          )}
        </div>
      </aside>

      <main className="main">
        <header className="topbar" style={{ ["--tide" as string]: readiness.score / 100 }}>
          <div className="crumbs">
            <span>{bp.meta.name}</span>
            <span aria-hidden="true">/</span>
            <strong>{current.label}</strong>
          </div>
          <div className="spacer" />
          <span className="saved"><LuCloud size={14} />Saved</span>
          <button className="btn ghost small" onClick={undo} disabled={!canUndo} aria-label="Undo">
            <LuUndo2 />Undo
          </button>
          {current.id !== "deploy" && (
            <a className="btn primary small" href={href("deploy")} style={{ textDecoration: "none" }}>
              <LuRocket />Deploy
            </a>
          )}
        </header>
        <div className="page" key={current.id}>
          <div className="page-inner screen-enter">
            <Screen />
          </div>
        </div>
      </main>
    </div>
  );
}
