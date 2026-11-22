import { useId, type ReactNode } from "react";
import { LuArrowDownLeft, LuExternalLink } from "react-icons/lu";
import type { ToolId } from "@riptide/tools";
import { useToolsData } from "../data";
import { useShell } from "../ui";
import { useOpenWindowsList } from "../ToolsApp";
import { dockTool, focusTool } from "../windows";
import { moduleById } from "../registry";

/** Top-right of every page: preview badge and the workspace switcher. */
export function HeaderRight() {
  const { workspaces, setWorkspaces } = useToolsData();
  const { go, detached } = useShell();
  const id = useId();
  if (detached) return <span className="rt-preview-badge">PREVIEW BUILD</span>;
  return (
    <>
      <span className="rt-preview-badge" title="RipTide Tools is in preview. Features marked Preview work but may change.">PREVIEW BUILD</span>
      <label className="rt-ws-select" htmlFor={id}>
        Workspace:
        <select
          id={id}
          value={workspaces.activeId}
          onChange={(e) => {
            if (e.target.value === "__manage") return go("workspaces");
            const v = e.target.value;
            setWorkspaces((d) => void (d.activeId = v));
          }}
        >
          {workspaces.list.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
          <option value="__manage">Manage workspaces…</option>
        </select>
      </label>
    </>
  );
}

/** Shown in the main window when a tool is open in its own window. */
export function DetachedGuard({ tool, children }: { tool: ToolId; children: ReactNode }) {
  const windows = useOpenWindowsList();
  const { detached } = useShell();
  const m = moduleById(tool);
  if (detached || !windows.some((w) => w.tool === tool)) return <>{children}</>;
  return (
    <div className="rt-popped">
      <div className="rt-empty" style={{ maxWidth: 520 }}>
        <LuExternalLink />
        <h3>{m.label} is open in its own window</h3>
        <p>It keeps its filters, notes and data. Bring it back here whenever you like.</p>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button className="rt-btn rt-primary" onClick={() => focusTool(tool)}><LuExternalLink />Show window</button>
          <button className="rt-btn" onClick={() => dockTool(tool)}><LuArrowDownLeft />Dock back</button>
        </div>
      </div>
    </div>
  );
}
