import { useEffect, useMemo, useState } from "react";
import { LuArrowRight, LuMonitor, LuExternalLink, LuArrowDownLeft, LuPlus, LuTrash2 } from "react-icons/lu";
import { screenFor, uid, type Rect, type ToolId, type Workspace } from "@riptide/tools";
import { PageHeader, SettingRow, Switch, useShell } from "../ui";
import { HeaderRight } from "./common";
import { useToolsData } from "../data";
import { useOpenWindowsList } from "../ToolsApp";
import { DETACHABLE, detectScreens, dockTool, focusTool, openToolWindow, openToolWindows } from "../windows";
import { moduleById } from "../registry";

/** Offered on Home and Workspaces when a saved layout has windows that aren't open. */
export function RestoreBanner() {
  const { activeWorkspace } = useToolsData();
  const windows = useOpenWindowsList();
  const { toast, detached } = useShell();
  const [dismissed, setDismissed] = useState(false);
  const missing = activeWorkspace.detached.filter((d) => !windows.some((w) => w.tool === d.tool));
  // Windows announce themselves within a couple of seconds; wait before offering to reopen them.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 2600);
    return () => clearTimeout(t);
  }, []);
  if (detached || dismissed || !settled || !activeWorkspace.restoreOnStartup || missing.length === 0) return null;
  const names = missing.map((m) => moduleById(m.tool).label).join(" and ");
  return (
    <div className="rt-banner" role="status">
      <LuExternalLink style={{ width: 18, height: 18, color: "var(--rt-sea)", flex: "none" }} />
      <span>Your “{activeWorkspace.name}” workspace keeps {names} in {missing.length > 1 ? "their own windows" : "its own window"}.</span>
      <button
        className="rt-btn rt-sm"
        onClick={async () => {
          const { blocked } = await openToolWindows(missing.map((m) => ({ tool: m.tool, geometry: m.geometry })));
          if (blocked.length) {
            const which = blocked.map((t) => moduleById(t).label).join(" and ");
            toast(`Your browser blocked ${which}. Allow pop-ups for RipTide, or use Pop out in Workspaces to open ${blocked.length > 1 ? "them" : "it"} one at a time.`);
          }
        }}
      >
        Reopen {missing.length > 1 ? "windows" : "window"}
      </button>
      <button className="rt-btn rt-sm rt-ghost" onClick={() => setDismissed(true)}>Not now</button>
    </div>
  );
}

export function Workspaces() {
  const { workspaces, setWorkspaces, activeWorkspace: ws } = useToolsData();
  const windows = useOpenWindowsList();
  const { toast, go } = useShell();
  const [screens, setScreens] = useState<Rect[]>([]);
  const [detailed, setDetailed] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    detectScreens(false).then((r) => (setScreens(r.screens), setDetailed(r.detailed)));
  }, []);

  const patch = (fn: (w: Workspace) => void) => setWorkspaces((d) => { const w = d.list.find((x) => x.id === d.activeId); if (w) fn(w); });

  // Which display each window is on, as far as the browser lets us know.
  const placement = useMemo(() => {
    const main: Rect = { x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight };
    const mainScreen = Math.max(0, screenFor(main, screens));
    const items: { tool: ToolId | "main"; screen: number }[] = [{ tool: "main", screen: mainScreen }];
    for (const w of windows) items.push({ tool: w.tool, screen: Math.max(0, screenFor(w.geometry, screens)) });
    return items;
  }, [windows, screens]);

  const displayCount = Math.max(screens.length, 1);
  const shownDisplays = displayCount > 1 ? displayCount : ws.preset === "dual" ? 2 : 1;

  const applyPreset = async (preset: Workspace["preset"]) => {
    patch((w) => void (w.preset = preset));
    if (preset === "single") {
      for (const w of windows) dockTool(w.tool);
      patch((w) => void (w.detached = []));
      toast("All tools docked in the main window");
    } else if (preset === "dual") {
      const saved = ws.detached.find((d) => d.tool === "map")?.geometry;
      const r = await openToolWindow("map", saved);
      if (!r.ok) return toast("Your browser blocked the new window. Allow pop-ups for RipTide and try again.");
      patch((w) => { if (!w.detached.some((d) => d.tool === "map")) w.detached.push({ tool: "map", geometry: r.geometry }); });
    }
  };

  const save = () => {
    patch((w) => {
      w.detached = windows.map((x) => ({ tool: x.tool, geometry: w.rememberPositions ? x.geometry : undefined }));
      w.preset = windows.length === 0 ? "single" : windows.length === 1 && windows[0]!.tool === "map" ? "dual" : "custom";
      w.savedAt = Date.now();
    });
    toast(`Saved “${ws.name}”`);
  };

  const labelFor = (t: ToolId | "main") => (t === "main" ? "RipTide Tools" : moduleById(t).label);

  return (
    <div className="rt-page">
      <PageHeader crumb="Workspaces" title="Make room for your tools." sub="Pop out the map, keep your analysis open, and make every display work for you." right={<HeaderRight />} />
      <RestoreBanner />
      <div className="rt-ws-grid">
        <section className="rt-panel" aria-labelledby="rt-wsprev" style={{ display: "flex", flexDirection: "column" }}>
          <div className="rt-panel-head">
            <h2 id="rt-wsprev">Workspace preview</h2>
            <span className="rt-meta" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="rt-badge">{displayCount > 1 ? `${displayCount} displays detected` : detailed ? "1 display detected" : "Display layout"}</span>
            </span>
          </div>
          <div className="rt-displays" style={{ flex: 1 }}>
            {Array.from({ length: shownDisplays }, (_, i) => {
              const here = placement.filter((p) => p.screen === i || (i >= displayCount && p.tool !== "main"));
              const tools = here.filter((p) => p.tool !== "main");
              const hot = tools.length > 0;
              return (
                <div className="rt-display" key={i}>
                  <div className={`rt-screen${hot ? " rt-hot" : ""}`}>
                    <div className="rt-screen-in">
                      <LuMonitor />
                      <b>{here.length ? here.map((p) => labelFor(p.tool)).join(" + ") : "Empty"}</b>
                      <small>{i === 0 ? "Main display" : `Display ${i + 1}`} · {here.some((p) => p.tool === "main") ? "Docked tools" : tools.length ? "Detached" : "Nothing open"}</small>
                    </div>
                  </div>
                  <div className="rt-stand" aria-hidden="true" />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "0 22px 18px" }}>
            {DETACHABLE.map((t) => {
              const open = windows.some((w) => w.tool === t);
              const m = moduleById(t);
              return open ? (
                <span key={t} style={{ display: "inline-flex", gap: 6 }}>
                  <button className="rt-btn rt-sm" onClick={() => focusTool(t)}><LuExternalLink />Show {m.label}</button>
                  <button className="rt-btn rt-sm rt-ghost" onClick={() => dockTool(t)}><LuArrowDownLeft />Dock</button>
                </span>
              ) : (
                <button key={t} className="rt-btn rt-sm" onClick={async () => {
                  const r = await openToolWindow(t, ws.detached.find((d) => d.tool === t)?.geometry);
                  if (!r.ok) toast("Your browser blocked the new window. Allow pop-ups for RipTide and try again.");
                }}><LuExternalLink />Pop out {m.label}</button>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "14px 22px", borderTop: "1px solid var(--rt-line)", fontSize: 13.5, color: "var(--rt-muted)" }}>
            <span>
              {detailed ? "Positions come from your displays." : "Your browser shows one display until you allow display detection."}{" "}
              {!detailed && (
                <button className="rt-link" onClick={async () => { const r = await detectScreens(true); setScreens(r.screens); setDetailed(r.detailed); if (!r.detailed) toast("Display detection isn't available in this browser. Drag windows to another screen yourself."); }}>Detect displays</button>
              )}
            </span>
            <span>{windows.length + 1} window{windows.length ? "s" : ""}</span>
          </div>
        </section>

        <section className="rt-panel rt-pad" aria-labelledby="rt-wsset" style={{ display: "flex", flexDirection: "column" }}>
          <h2 id="rt-wsset" style={{ fontSize: 20 }}>Layout settings</h2>
          <p style={{ margin: "8px 0 18px", color: "var(--rt-muted)", fontSize: 14.5 }}>Start with a preset, then place tools exactly where you need them. Reopen the same layout next time.</p>
          <SettingRow title="Active preset">
            <label className="rt-sr" htmlFor="rt-preset">Active preset</label>
            <select id="rt-preset" className="rt-select" style={{ width: 160, height: 36 }} value={ws.preset} onChange={(e) => applyPreset(e.target.value as Workspace["preset"])}>
              <option value="single">Single display</option>
              <option value="dual">Dual display</option>
              <option value="custom" disabled={ws.preset !== "custom"}>Custom</option>
            </select>
          </SettingRow>
          <SettingRow title="Restore on startup" hint="Offer to reopen detached windows">
            <Switch label="Restore on startup" checked={ws.restoreOnStartup} onChange={(v) => patch((w) => void (w.restoreOnStartup = v))} />
          </SettingRow>
          <SettingRow title="Keep windows independent" hint="Detached windows stay open if the main app closes">
            <Switch label="Keep windows independent" checked={ws.keepIndependent} onChange={(v) => patch((w) => void (w.keepIndependent = v))} />
          </SettingRow>
          <SettingRow title="Remember window positions" hint="Moved to a missing display? It comes back to your main one">
            <Switch label="Remember window positions" checked={ws.rememberPositions} onChange={(v) => patch((w) => void (w.rememberPositions = v))} />
          </SettingRow>

          <div className="rt-label" style={{ marginTop: 22 }}>Saved workspaces</div>
          <ul className="rt-mini-list">
            {workspaces.list.map((w) => (
              <li key={w.id}>
                <span className={`rt-dot${w.id === ws.id ? "" : " rt-off"}`} />
                <button className="rt-link" style={{ color: w.id === ws.id ? "var(--rt-sand)" : undefined }} onClick={() => setWorkspaces((d) => void (d.activeId = w.id))}>{w.name}</button>
                <span className="rt-hint" style={{ margin: 0 }}>{w.detached.length ? `${w.detached.length} detached` : "All docked"}</span>
                {workspaces.list.length > 1 && w.id !== "default" && (
                  <button className="rt-iconbtn" aria-label={`Delete workspace ${w.name}`} onClick={() => setWorkspaces((d) => { d.list = d.list.filter((x) => x.id !== w.id); if (d.activeId === w.id) d.activeId = d.list[0]!.id; })}><LuTrash2 /></button>
                )}
              </li>
            ))}
          </ul>
          <form className="rt-inline-row" onSubmit={(e) => {
            e.preventDefault();
            const name = newName.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 40);
            if (!name || workspaces.list.length >= 20) return;
            const id = uid();
            setWorkspaces((d) => { d.list.push({ ...ws, id, name, savedAt: 0 }); d.activeId = id; });
            setNewName("");
            toast(`Created “${name}”`);
          }}>
            <label className="rt-sr" htmlFor="rt-ws-new">New workspace name</label>
            <input id="rt-ws-new" className="rt-input" style={{ height: 38 }} placeholder="New workspace, like 'Streaming'" maxLength={40} value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button className="rt-btn rt-sm" type="submit" disabled={!newName.trim()}><LuPlus />Add</button>
          </form>

          <div style={{ flex: 1 }} />
          <button className="rt-btn rt-primary rt-block" style={{ marginTop: 24 }} onClick={save}>Save workspace</button>
        </section>
      </div>
      <div className="rt-horizon-row">
        <div>
          <h3>No more switching back and forth.</h3>
          <p>Workspaces belong to RipTide Tools, not to a single module. Every tool you've opened keeps running while you use another.</p>
        </div>
        <button className="rt-iconbtn" aria-label="Back to Home" onClick={() => go("home")}><LuArrowRight style={{ color: "var(--rt-pink)" }} /></button>
      </div>
      <p className="rt-foot-note"><span>In the browser, detached tools open as separate windows. A native desktop app with docking is planned.</span></p>
    </div>
  );
}
