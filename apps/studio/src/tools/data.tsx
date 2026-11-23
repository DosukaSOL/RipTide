import { desktopBridge } from "../desktop";
import { createContext, useContext, type ReactNode } from "react";
import { Flags, KEYS, Settings, WorkspacesState, type Workspace } from "@riptide/tools";
import { usePersisted } from "./persist";

/** App-wide state shared by the shell and several modules in one window. */
interface ToolsData {
  settings: Settings;
  setSettings: (fn: (d: Settings) => void) => void;
  workspaces: WorkspacesState;
  setWorkspaces: (fn: (d: WorkspacesState) => void) => void;
  activeWorkspace: Workspace;
  storageError: string;
}

const Ctx = createContext<ToolsData | null>(null);
const settingsDefault = () => Settings.parse({});
const workspacesDefault = () => WorkspacesState.parse({});

export function ToolsDataProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings, e1] = usePersisted(KEYS.settings, Settings, settingsDefault);
  const [workspaces, setWorkspaces, e2] = usePersisted(KEYS.workspaces, WorkspacesState, workspacesDefault);
  const activeWorkspace = workspaces.list.find((w) => w.id === workspaces.activeId) ?? workspaces.list[0]!;
  return (
    <Ctx.Provider value={{ settings, setSettings, workspaces, setWorkspaces, activeWorkspace, storageError: e1 || e2 }}>
      {children}
    </Ctx.Provider>
  );
}

export function useToolsData() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToolsData outside ToolsDataProvider");
  return c;
}

/* ---------- feature flag ---------- */

export function readFlags(): Flags {
  try {
    const r = Flags.safeParse(JSON.parse(localStorage.getItem(KEYS.flags) ?? "{}"));
    return r.success ? r.data : Flags.parse({});
  } catch {
    return Flags.parse({});
  }
}

export function writeFlags(f: Flags) {
  try {
    localStorage.setItem(KEYS.flags, JSON.stringify(f));
  } catch {
    /* storage blocked: the flag only lasts for this visit */
  }
}

/**
 * The new shell is opt-in in the browser while it's in preview. `?shell=tools` turns it on,
 * `?shell=classic` turns it off; the choice is remembered. The desktop app starts in the Tools
 * shell the first time, then remembers whichever shell you picked, across restarts.
 */
export function wantsToolsShell(): boolean {
  const p = new URLSearchParams(location.search).get("shell");
  let chosen = true;
  try {
    chosen = localStorage.getItem(KEYS.flags) !== null;
  } catch {
    chosen = true;
  }
  if (!p && !chosen && desktopBridge()) {
    writeFlags({ ...readFlags(), toolsShell: true });
    return true;
  }
  const flags = readFlags();
  if (p === "tools" && !flags.toolsShell) writeFlags({ ...flags, toolsShell: true });
  if (p === "classic" && flags.toolsShell) writeFlags({ ...flags, toolsShell: false });
  return p === "tools" ? true : p === "classic" ? false : flags.toolsShell;
}
