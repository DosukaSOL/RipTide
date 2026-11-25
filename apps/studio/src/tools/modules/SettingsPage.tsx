import { useRef, useState } from "react";
import { LuDownload, LuUpload, LuRotateCcw, LuFolderOpen, LuHardDrive, LuGlobe } from "react-icons/lu";
import { commitKeys, desktopBridge, desktopWriteFailed } from "../../desktop";
import { z } from "zod";
import { Blueprint } from "@riptide/core";
import { applyRestore, availableBasemaps, BACKUP_MAX_BYTES, createBackup, Flags, HeistState, KEYS, LEGACY_KEYS, MapState, planRestore, Settings, ViceLabState, WorkspacesState, type BackupPart, type RestorePlan } from "@riptide/tools";
import { PageHeader, SettingRow, Switch, useShell } from "../ui";
import { HeaderRight } from "./common";
import { readFlags, useToolsData, writeFlags } from "../data";
import { downloadText, readFileText } from "../persist";
import { UpdatesPanel } from "../Updates";
import { MAP_ART_BUILT } from "../mapdata";

/** Everything RipTide keeps on this device, by owner, with the schema each part must pass to be restored. */
const DATA_KEYS: BackupPart[] = [
  { key: "riptide.blueprint.v1", label: "RipTide Studio Blueprint", schema: Blueprint },
  { key: KEYS.vicelab, label: "ViceLab runs and hardware", schema: ViceLabState },
  { key: KEYS.heist, label: "Heist Ops plans", schema: HeistState },
  { key: KEYS.map, label: "Map progress, markers, filters and packs", schema: MapState },
  { key: KEYS.workspaces, label: "Workspaces", schema: WorkspacesState },
  { key: KEYS.settings, label: "Settings", schema: Settings },
];
/** Also in backups, but not offered for reset on their own. */
const EXTRA_KEYS: BackupPart[] = [
  { key: KEYS.flags, label: "Interface choice (Tools or classic Studio)", schema: Flags },
  // Map data from an earlier preview. The map moves it to the current format when it opens.
  { key: LEGACY_KEYS.map, label: "Map data from an earlier preview", schema: z.record(z.unknown()) },
];
const BACKUP_PARTS = [...DATA_KEYS, ...EXTRA_KEYS];

const store = {
  get: (k: string) => localStorage.getItem(k),
  set: (k: string, v: string) => localStorage.setItem(k, v),
  remove: (k: string) => localStorage.removeItem(k),
  // Success is only reported once the restore is really saved (on disk in the desktop app).
  commit: commitKeys,
};

export function SettingsPage() {
  const { settings, setSettings } = useToolsData();
  const { toast } = useShell();
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState("");
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const exportAll = () => {
    const { file, skipped } = createBackup(BACKUP_PARTS, store);
    downloadText(`riptide-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(file, null, 2));
    if (skipped.length) setErr(`Exported, but ${skipped.map((x) => `${x.label} was left out because ${x.reason}`).join("; ")}. A copy is kept in the file for support, but it can't be restored.`);
  };

  // Restoring is two steps: check the file and show what will change, then restore on confirm.
  const checkBackup = async (f: File) => {
    setErr("");
    setPlan(null);
    try {
      const p = planRestore(await readFileText(f, BACKUP_MAX_BYTES), BACKUP_PARTS, store);
      if (!p.ok) setErr(p.error);
      setPlan(p);
    } catch (e) {
      setErr((e as Error).message || "Couldn't read that file.");
    }
  };

  const restore = () => {
    if (!plan?.ok) return;
    const r = applyRestore(plan, store);
    if (!r.ok) {
      setErr(r.error);
      setPlan(null);
      return;
    }
    toast(r.restored ? `Restored ${r.restored} part${r.restored === 1 ? "" : "s"}. Reloading…` : "Nothing to change: this device already matches the backup.");
    setPlan(null);
    if (r.restored) setTimeout(() => location.reload(), 900);
  };

  const reset = (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      setConfirm("");
      setErr(e instanceof Error && e.message ? e.message : "Couldn't reset that data. Try again.");
      return;
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
          <SettingRow
            title="Map background"
            hint={MAP_ART_BUILT
              ? "Map art: Rockstar's map of Leonida. Schematic grid: RipTide's own grid, no game art. Your places, markers and progress stay the same."
              : "This copy of RipTide doesn't include map art, so the map uses RipTide's own schematic grid. Your places, markers and progress are unaffected."}
          >
            <label className="rt-sr" htmlFor="rt-basemap">Map background</label>
            <select id="rt-basemap" className="rt-select" style={{ width: 170, height: 36 }} value={MAP_ART_BUILT ? settings.basemap : "schematic"} disabled={!MAP_ART_BUILT} onChange={(e) => setSettings((d) => void (d.basemap = e.target.value as Settings["basemap"]))}>
              {availableBasemaps(MAP_ART_BUILT).map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
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
            <input ref={input} type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void checkBackup(f); e.target.value = ""; }} />
          </div>
          {err && <div className="rt-error" role="alert">{err}</div>}
          {plan && (
            <div className="rt-restore" role="region" aria-label="Backup check">
              <b>{plan.ok ? "This backup is valid. Restoring will:" : "Nothing will be changed:"}</b>
              <ul>
                {plan.items.map((i) => (
                  <li key={i.key} data-status={i.status}>
                    {i.label}: {i.status === "replace" ? "replace what's on this device" : i.status === "same" ? "already the same" : `not valid (${"error" in i ? i.error : ""})`}
                  </li>
                ))}
              </ul>
              {plan.ok && plan.unknown.length > 0 && <p className="rt-hint">Ignored {plan.unknown.length} part{plan.unknown.length === 1 ? "" : "s"} RipTide doesn't recognise.</p>}
              <div style={{ display: "flex", gap: 8 }}>
                {plan.ok && <button className="rt-btn rt-sm rt-primary" onClick={restore}>Restore</button>}
                <button className="rt-btn rt-sm rt-ghost" onClick={() => setPlan(null)}>{plan.ok ? "Cancel" : "Close"}</button>
              </div>
            </div>
          )}
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
