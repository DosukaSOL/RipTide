import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LuPanelLeftClose, LuPanelLeftOpen, LuArrowDownLeft, LuMenu } from "react-icons/lu";
import { ToolId } from "@riptide/tools";
import { MODULES, moduleById } from "./registry";
import { Shell, useToasts } from "./ui";
import { ToolsDataProvider, useToolsData } from "./data";
import { closeAllDetached, useDetachedRuntime, useOpenWindows, DETACHABLE, type OpenWindow } from "./windows";
import "./tools.css";
import { UpdatePill, UpdatePrompt } from "./Updates";
import { InstallButton } from "./install";

/** Tools in the phone tab bar; everything else is under More. */
const BOTTOM: ToolId[] = ["home", "today", "map", "journal"];
const SHORT: Partial<Record<ToolId, string>> = { map: "Map" };

const STUDIO_SECTIONS = ["overview", "world", "economy", "rules", "roles", "mods", "access", "deploy"];

/** Parse "#/map" or "#/studio/economy". Old classic Studio links move under studio/. */
function readRoute(): ToolId {
  const h = location.hash.replace(/^#\/?/, "");
  const first = h.split("/")[0] ?? "";
  if (STUDIO_SECTIONS.includes(first)) {
    history.replaceState(null, "", `#/studio/${h}`);
    return "studio";
  }
  const r = ToolId.safeParse(first);
  return r.success ? r.data : "home";
}

/** Windows open elsewhere, shared with modules so they can show "open in its own window". */
export const OpenWindows = createContext<OpenWindow[]>([]);
export const useOpenWindowsList = () => useContext(OpenWindows);

function motionClass(motion: string) {
  return motion === "reduced" ? " rt-reduced" : motion === "full" ? " rt-motion-full" : "";
}

function Main() {
  const { settings, activeWorkspace, setWorkspaces, storageError } = useToolsData();
  const [active, setActive] = useState<ToolId>(readRoute);
  const [mounted, setMounted] = useState<ToolId[]>(() => [readRoute()]);
  const { toast, view: toasts } = useToasts();
  const windows = useOpenWindows();

  // Sidebar collapses automatically on narrow windows or high display scaling.
  const narrow = () => window.matchMedia("(max-width: 1180px)").matches;
  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(null);
  const [isNarrow, setIsNarrow] = useState(narrow);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1180px)");
    const on = () => setIsNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const [drawer, setDrawer] = useState(false);
  const collapsed = drawer ? false : userCollapsed ?? isNarrow;

  useEffect(() => {
    const on = () => {
      const r = readRoute();
      setActive(r);
      setMounted((m) => (m.includes(r) ? m : [...m, r]));
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const go = useCallback((tool: ToolId) => {
    if (tool === "studio" && location.hash.startsWith("#/studio/")) {
      setActive("studio");
      return;
    }
    location.hash = `/${tool}`;
  }, []);
  const unmount = useCallback((tool: ToolId) => {
    setMounted((m) => m.filter((x) => x !== tool));
    if (tool === active) location.hash = "/home";
  }, [active]);

  // Keyboard: Ctrl/Cmd+B toggles the sidebar, Alt+1..9 jumps between modules.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true]")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setUserCollapsed(!collapsed);
      }
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const m = MODULES[Number(e.key) - 1];
        if (m) {
          e.preventDefault();
          go(m.id);
        }
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [collapsed, go]);

  // Remember where detached windows sit, if the workspace asks for it.
  useEffect(() => {
    if (!activeWorkspace.rememberPositions || !windows.length) return;
    setWorkspaces((d) => {
      const ws = d.list.find((w) => w.id === d.activeId);
      if (!ws) return;
      for (const w of windows) {
        const entry = ws.detached.find((x) => x.tool === w.tool);
        const g = w.geometry;
        if (entry && (!entry.geometry || Math.abs(entry.geometry.x - g.x) + Math.abs(entry.geometry.y - g.y) + Math.abs(entry.geometry.w - g.w) + Math.abs(entry.geometry.h - g.h) > 4)) {
          entry.geometry = g;
        }
      }
    });
  }, [windows, activeWorkspace.rememberPositions, setWorkspaces]);

  // When windows shouldn't outlive the main app, close them with it.
  useEffect(() => {
    if (activeWorkspace.keepIndependent) return;
    const on = () => closeAllDetached();
    window.addEventListener("pagehide", on);
    return () => window.removeEventListener("pagehide", on);
  }, [activeWorkspace.keepIndependent]);

  // Sliding active indicator in the sidebar.
  const navRef = useRef<HTMLElement>(null);
  const [indY, setIndY] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = navRef.current?.querySelector<HTMLElement>(`[data-tool="${active}"]`);
    setIndY(el ? el.offsetTop : null);
  }, [active, collapsed]);

  useEffect(() => setDrawer(false), [active]);
  const shell = useMemo(() => ({ active, go, mounted, unmount, toast, detached: false }), [active, go, mounted, unmount, toast]);
  const detachedTools = new Set(windows.map((w) => w.tool));

  return (
    <Shell.Provider value={shell}>
      <OpenWindows.Provider value={windows}>
        <div className={`rt-root${collapsed ? " rt-collapsed" : ""}${drawer ? " rt-drawer" : ""}${motionClass(settings.motion)}`}>
          <header className="rt-top">
            <button className="rt-iconbtn" onClick={() => setUserCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title="Toggle sidebar (Ctrl+B)">
              {collapsed ? <LuPanelLeftOpen /> : <LuPanelLeftClose />}
            </button>
            <a className="rt-top-brand" href="#/home" aria-label="RipTide Tools home">
              <img src="./brand/mark.svg" alt="" />
              <b>riptide</b> tools <span className="rt-top-ver">preview</span>
            </a>
            <div className="rt-top-spacer" />
            <UpdatePill />
            <InstallButton />
            <span className="rt-top-note">Independent companion app</span>
          </header>

          <aside className="rt-side" aria-label="RipTide Tools">
            <div className="rt-side-logo">
              {collapsed ? (
                <img src="./brand/mark.svg" alt="RipTide Tools" style={{ width: 36 }} />
              ) : (
                <>
                  <img src="./brand/lockup.png" alt="riptide" />
                  <span aria-hidden="true">TOOLS</span>
                </>
              )}
            </div>
            <nav className="rt-nav" ref={navRef} aria-label="Modules">
              {indY !== null && <span className="rt-nav-ind" style={{ transform: `translateY(${indY}px)` }} aria-hidden="true" />}
              {(["workspace", "account"] as const).map((group) => (
                <div key={group} style={{ display: "contents" }}>
                  <div className="rt-navlbl">{group === "workspace" ? "WORKSPACE" : "ACCOUNT"}</div>
                  {MODULES.filter((m) => m.group === group).map((m) => {
                    const Icon = m.icon;
                    const running = m.tool && (mounted.includes(m.id) || detachedTools.has(m.id)) && m.id !== active;
                    return (
                      <a
                        key={m.id}
                        className="rt-navitem"
                        href={m.id === "studio" ? "#/studio" : `#/${m.id}`}
                        data-tool={m.id}
                        aria-current={active === m.id ? "page" : undefined}
                        title={collapsed ? m.label : undefined}
                        onClick={(e) => {
                          if (m.id === "studio") {
                            e.preventDefault();
                            if (!location.hash.startsWith("#/studio")) location.hash = "/studio";
                            else setActive("studio");
                          }
                        }}
                      >
                        <Icon />
                        <span>{m.label}</span>
                        {m.tag ? <span className="rt-navtag">{m.tag}</span> : running ? <span className="rt-navdot" title="Running" /> : null}
                      </a>
                    );
                  })}
                </div>
              ))}
            </nav>
            <div className="rt-side-foot">
              <p><span className="rt-dot" style={{ marginRight: 8 }} />RipTide Studio · FiveM config export</p>
              <p><span className="rt-dot rt-sun" style={{ marginRight: 8 }} />GTA VI out on consoles · PC not announced</p>
              <p className="rt-legal">Independent companion software. Not affiliated with Rockstar Games or Take-Two Interactive.</p>
            </div>
          </aside>

          {drawer && <button className="rt-scrim" aria-label="Close menu" onClick={() => setDrawer(false)} />}
          <nav className="rt-bottomnav" aria-label="Main">
            {BOTTOM.map((id) => {
              const m = moduleById(id);
              const Icon = m.icon;
              return (
                <a key={id} href={`#/${id}`} data-bottom={id} aria-current={active === id && !drawer ? "page" : undefined} onClick={() => setDrawer(false)}>
                  <Icon /><span>{SHORT[id] ?? m.label}</span>
                </a>
              );
            })}
            <button aria-expanded={drawer} data-bottom="more" onClick={() => setDrawer(!drawer)}><LuMenu /><span>More</span></button>
          </nav>

          <main className="rt-main">
            {storageError && <div className="rt-banner rt-warn" role="alert" style={{ margin: "16px 24px 0" }}>{storageError}</div>}
            {MODULES.filter((m) => mounted.includes(m.id)).map((m) => {
              const C = m.component;
              const isActive = m.id === active;
              return (
                <section
                  key={m.id}
                  className={`rt-module${m.flush ? " rt-flush" : ""}`}
                  hidden={!isActive}
                  aria-label={m.label}
                  data-module={m.id}
                  data-detached={DETACHABLE.includes(m.id) && detachedTools.has(m.id) ? "true" : undefined}
                >
                  {/* The enter animation replays whenever the section is shown again; the module itself stays mounted. */}
                  <div className="rt-enter" style={{ height: m.flush ? "100%" : undefined }}>
                    <C />
                  </div>
                </section>
              );
            })}
          </main>
          {toasts}
          <UpdatePrompt />
        </div>
      </OpenWindows.Provider>
    </Shell.Provider>
  );
}

/** A tool running in its own window. */
function Detached({ tool }: { tool: ToolId }) {
  const { settings } = useToolsData();
  const { toast, view: toasts } = useToasts();
  const m = moduleById(tool);
  const C = m.component;
  const onDocked = useCallback(() => {}, []);
  useDetachedRuntime(tool, onDocked);
  useEffect(() => {
    document.title = `${m.label} · RipTide Tools`;
  }, [m.label]);
  const shell = useMemo(() => ({ active: tool, go: () => {}, mounted: [tool], unmount: () => {}, toast, detached: true }), [tool, toast]);
  return (
    <Shell.Provider value={shell}>
      <div className={`rt-root rt-popout${motionClass(settings.motion)}`}>
        <header className="rt-top">
          <span className="rt-top-brand">
            <img src="./brand/mark.svg" alt="" />
            <b>riptide</b> tools <span className="rt-top-ver">· {m.label}</span>
          </span>
          <div className="rt-top-spacer" />
          <span className="rt-top-note">Separate window</span>
          <button className="rt-btn rt-sm" onClick={() => window.close()}>
            <LuArrowDownLeft />Dock back
          </button>
        </header>
        <main className="rt-main">
          <section className="rt-module" aria-label={m.label} data-module={tool}>
            <C />
          </section>
        </main>
        {toasts}
      </div>
    </Shell.Provider>
  );
}

export function ToolsApp() {
  const w = new URLSearchParams(location.search).get("window");
  const parsed = ToolId.safeParse(w);
  const detached = parsed.success && DETACHABLE.includes(parsed.data) ? parsed.data : null;
  return <ToolsDataProvider>{detached ? <Detached tool={detached} /> : <Main />}</ToolsDataProvider>;
}
