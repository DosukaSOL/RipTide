import { useRef, useState } from "react";
import { LuDownload, LuUpload, LuRotateCcw, LuFolderOpen, LuHardDrive, LuGlobe } from "react-icons/lu";
import { desktopBridge, desktopWriteFailed } from "../../desktop";
import { KEYS, Settings } from "@riptide/tools";
import { PageHeader, SettingRow, Switch, useShell } from "../ui";
import { HeaderRight } from "./common";
import { readFlags, useToolsData, writeFlags } from "../data";
import { downloadText, readFileText } from "../persist";
import { UpdatesPanel } from "../Updates";

/** Everything RipTide keeps on this device, by owner. */
const DATA_KEYS: { key: string; label: string }[] = [
  { key: "riptide.blueprint.v1", label: "RipTide Studio Blueprint" },
  { key: KEYS.vicelab, label: "ViceLab runs and hardware" },
  { key: KEYS.heist, label: "Heist Ops plans" },
  { key: KEYS.map, label: "Map progress, markers, filters and packs" },
  { key: KEYS.workspaces, label: "Workspaces" },
  { key: KEYS.settings, label: "Settings" },
];

export function SettingsPage() {
  const { settings, setSettings } = useToolsData();
  const { toast } = useShell();
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const exportAll = () => {
    const out: Record<string, unknown> = { format: "riptide-tools-backup", version: 1, exportedAt: new Date().toISOString() };
    for (const { key } of DATA_KEYS) {
      try {
        const v = localStorage.getItem(key);
        if (v) out[key] = JSON.parse(v);
      } catch {
        /* skip unreadable entries */
      }
    }
    downloadText(`riptide-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(out, null, 2));
  };

  const importAll = async (f: File) => {
    setErr("");
    try {
      const data = JSON.parse(await readFileText(f, 40 * 1024 * 1024));
      if (data?.format !== "riptide-tools-backup") throw new Error();
      let n = 0;
      for (const { key } of DATA_KEYS) {
        if (data[key] === undefined) continue;
        // Each module validates its own data on load and ignores anything malformed.
        localStorage.setItem(key, JSON.stringify(data[key]));
        n++;
      }
      toast(`Restored ${n} item${n === 1 ? "" : "s"}. Reloading…`);
      setTimeout(() => location.reload(), 900);
    } catch {
      setErr("This isn't a RipTide backup file, or this device's storage is full.");
    }
  };

  const reset = (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    setConfirm("");
    location.reload();
  };

  return (
    <div className="rt-page">
      <PageHeader
        crumb="Settings"
        title="Settings"
        sub={desktopBridge()?.updates
          ? "RipTide keeps everything on this computer. The only thing it sends out is a check with GitHub for new versions, which you can switch off below."
          : "RipTide keeps everything on this device. Nothing is sent anywhere."}
        right={<HeaderRight />}
      />
      <div className="rt-two">
        <section className="rt-panel rt-pad" aria-labelledby="rt-st-ui">
          <h2 id="rt-st-ui" style={{ marginBottom: 8 }}>Interface</h2>
          <SettingRow title="Motion" hint="System follows your operating system's reduced-motion setting">
            <label className="rt-sr" htmlFor="rt-motion">Motion</label>
            <select id="rt-motion" className="rt-select" style={{ width: 150, height: 36 }} value={settings.motion} onChange={(e) => setSettings((d) => void (d.motion = e.target.value as Settings["motion"]))}>
              <option value="system">System</option>
              <option value="reduced">Reduced</option>
              <option value="full">Full</option>
            </select>
          </SettingRow>
          <SettingRow title="Startup animation" hint="The logo builds itself when RipTide opens">
            <Switch label="Startup animation" checked={settings.splash} onChange={(v) => setSettings((d) => void (d.splash = v))} />
          </SettingRow>
          <SettingRow title="RipTide Tools shell" hint="Preview. Turn off to go back to the classic Studio">
            <Switch label="RipTide Tools shell" checked onChange={() => {
              writeFlags({ ...readFlags(), toolsShell: false });
              location.href = `${location.pathname}#/overview`;
              location.reload();
            }} />
          </SettingRow>
        </section>

        <section className="rt-panel rt-pad" aria-labelledby="rt-st-data">
          <h2 id="rt-st-data" style={{ marginBottom: 8 }}>Your data</h2>
          <SaveLocation />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "8px 0 16px" }}>
            <button className="rt-btn rt-sm" onClick={exportAll}><LuDownload />Export everything</button>
            <button className="rt-btn rt-sm" onClick={() => input.current?.click()}><LuUpload />Restore a backup</button>
            <input ref={input} type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importAll(f); e.target.value = ""; }} />
          </div>
          {err && <div className="rt-error" role="alert">{err}</div>}
          {DATA_KEYS.map(({ key, label }) => (
            <SettingRow key={key} title={label}>
              {confirm === key ? (
                <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13.5 }}>
                  Erase?
                  <button className="rt-btn rt-sm rt-danger" onClick={() => reset(key)}>Erase</button>
                  <button className="rt-btn rt-sm rt-ghost" onClick={() => setConfirm("")}>Keep</button>
                </span>
              ) : (
                <button className="rt-btn rt-sm rt-ghost" onClick={() => setConfirm(key)}><LuRotateCcw />Reset</button>
              )}
            </SettingRow>
          ))}
          <p className="rt-hint">Export before resetting. Resets can't be undone.</p>
        </section>
        <UpdatesPanel />
      </div>
    </div>
  );
}

/** Where data is kept: real files in the desktop app, browser storage on the web. */
function SaveLocation() {
  const bridge = desktopBridge();
  if (bridge) {
    let dir = "";
    try {
      dir = bridge.dataDir();
    } catch {
      dir = "";
    }
    return (
      <div className={`rt-saveloc${desktopWriteFailed() ? " rt-warn" : ""}`}>
        <LuHardDrive aria-hidden="true" />
        <div>
          <b>{desktopWriteFailed() ? "Some changes couldn't be saved to disk" : "Saved as files on this computer"}</b>
          <span className="rt-saveloc-path" title={dir}>{dir}</span>
        </div>
        <button className="rt-btn rt-sm" onClick={() => bridge.openDataDir()}><LuFolderOpen />Open folder</button>
      </div>
    );
  }
  return (
    <div className="rt-saveloc">
      <LuGlobe aria-hidden="true" />
      <div>
        <b>Saved in this browser</b>
        <span>Clearing site data or using a private window removes it. Export a backup, or use the desktop app to keep everything as files on your computer.</span>
      </div>
      <a className="rt-btn rt-sm" href="https://dosukasol.github.io/RipTide/#download" target="_blank" rel="noopener noreferrer"><LuDownload />Get the app</a>
    </div>
  );
}
