import { useEffect, useRef, useState } from "react";
import { LuCircleArrowUp, LuDownload, LuExternalLink, LuRefreshCw } from "react-icons/lu";
import { desktopBridge, type UpdateState, type UpdatesBridge } from "../desktop";
import { SettingRow, Switch } from "./ui";

/** The desktop app's updater, or null in the browser and in builds from before updates. */
function updatesBridge(): UpdatesBridge | null {
  const u = desktopBridge()?.updates;
  return u && typeof u.get === "function" && typeof u.onChange === "function" ? u : null;
}

/** Live update status from the desktop app. Null in the browser, which is always up to date. */
export function useUpdates(): [UpdateState | null, UpdatesBridge | null] {
  const [bridge] = useState(updatesBridge);
  const [state, setState] = useState<UpdateState | null>(() => {
    try {
      return bridge?.get() ?? null;
    } catch {
      return null;
    }
  });
  useEffect(() => (bridge ? bridge.onChange(setState) : undefined), [bridge]);
  return [state, bridge];
}

const pct = (s: UpdateState) => Math.max(0, Math.min(100, s.percent ?? 0));

/**
 * The popup shown when a new version is found. One button: it downloads the update,
 * RipTide closes, installs it and opens again on the new version.
 */
export function UpdatePrompt() {
  const [s, bridge] = useUpdates();
  const primary = useRef<HTMLButtonElement>(null);
  const open = !!s && !!bridge && !s.dismissed && ["available", "downloading", "installing", "failed"].includes(s.status);
  const canClose = open && (s.status === "available" || s.status === "failed");

  useEffect(() => {
    if (open) primary.current?.focus();
  }, [open, s?.status]);
  useEffect(() => {
    if (!canClose) return;
    const on = (e: KeyboardEvent) => e.key === "Escape" && bridge?.later();
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [canClose, bridge]);

  if (!open || !s || !bridge) return null;
  const v = s.version ?? "";
  const manual = s.mode === "manual";

  let title: string;
  let body: string;
  if (s.status === "downloading") {
    title = `Downloading ${v}`;
    body = "RipTide restarts by itself as soon as it's ready. Your data stays where it is.";
  } else if (s.status === "installing") {
    title = "Restarting to update";
    body = `RipTide Tools closes, installs ${v} and opens again in a few seconds.`;
  } else if (s.status === "failed") {
    title = "The update didn't install";
    body = s.error ?? "Something went wrong. Try again, or download the update from GitHub.";
  } else {
    title = `RipTide Tools ${v} is ready`;
    body = manual
      ? `You're on ${s.current}. This copy can't update itself from where it's running, so download ${v} and install it over this one. Your data stays where it is.`
      : `You're on ${s.current}. Update now and RipTide closes, installs it and opens again on the new version. Your data stays where it is.`;
  }

  return (
    <div className="rt-upd-scrim">
      <div className="rt-upd" role="dialog" aria-modal="true" aria-labelledby="rt-upd-title" aria-describedby="rt-upd-body" data-status={s.status}>
        <img className="rt-upd-mark" src="./brand/mark.svg" alt="" />
        <h2 id="rt-upd-title">{title}</h2>
        <p id="rt-upd-body">{body}</p>
        {(s.status === "downloading" || s.status === "installing") && (
          <div className="rt-upd-bar" role="progressbar" aria-label="Update progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct(s)}>
            <span style={{ width: `${s.status === "installing" ? 100 : pct(s)}%` }} />
          </div>
        )}
        {s.status === "downloading" && <p className="rt-upd-pct" aria-hidden="true">{pct(s)}%</p>}
        {s.status === "available" && (
          <div className="rt-upd-actions">
            <button ref={primary} className="rt-btn rt-primary" onClick={() => bridge.install()}>
              {manual ? <><LuDownload />Download update</> : <><LuCircleArrowUp />Update now</>}
            </button>
            <button className="rt-btn rt-ghost" onClick={() => bridge.later()}>Later</button>
            <button className="rt-upd-link" onClick={() => bridge.openNotes()}>What's new<LuExternalLink aria-hidden="true" /></button>
          </div>
        )}
        {s.status === "failed" && (
          <div className="rt-upd-actions">
            <button ref={primary} className="rt-btn rt-primary" onClick={() => bridge.install()}><LuRefreshCw />Try again</button>
            <button className="rt-btn" onClick={() => bridge.openNotes()}><LuDownload />Download from GitHub</button>
            <button className="rt-btn rt-ghost" onClick={() => bridge.later()}>Later</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** A small button in the top bar after the popup was closed with "Later": one tap updates. */
export function UpdatePill() {
  const [s, bridge] = useUpdates();
  if (!s || !bridge || !s.dismissed || s.status !== "available" || !s.version) return null;
  return (
    <button className="rt-upd-pill" onClick={() => bridge.install()} title={s.mode === "manual" ? "Download the new version" : "Install the new version and restart"}>
      <LuCircleArrowUp aria-hidden="true" />Update to {s.version}
    </button>
  );
}

function statusLine(s: UpdateState): string {
  switch (s.status) {
    case "off":
      return `Version ${s.current}. Updates are switched off for this copy.`;
    case "unsupported":
      return `Version ${s.current}. This copy can't update itself. Get the latest version from the website.`;
    case "checking":
      return "Checking for a new version…";
    case "uptodate":
      return `You're up to date on version ${s.current}.`;
    case "available":
      return `Version ${s.version} is ready to install. You're on ${s.current}.`;
    case "downloading":
      return `Downloading version ${s.version}… ${pct(s)}%`;
    case "installing":
      return "Restarting to update…";
    case "failed":
      return s.error ?? "The update didn't install.";
    case "error":
      return s.error ?? `Version ${s.current}. The last check didn't get through.`;
    default:
      return `Version ${s.current}.`;
  }
}

/** Settings: the version, automatic checks, and a button to check now. Desktop app only. */
export function UpdatesPanel() {
  const [s, bridge] = useUpdates();
  if (!s || !bridge) return null;
  const busy = ["checking", "downloading", "installing"].includes(s.status);
  const blocked = s.status === "off" || s.status === "unsupported";
  return (
    <section className="rt-panel rt-pad" aria-labelledby="rt-st-upd">
      <h2 id="rt-st-upd" style={{ marginBottom: 8 }}>Updates</h2>
      <div className={`rt-saveloc${s.status === "error" || s.status === "failed" ? " rt-warn" : ""}`}>
        <LuCircleArrowUp aria-hidden="true" />
        <div>
          <b>RipTide Tools {s.current}</b>
          <span role="status">{statusLine(s)}</span>
        </div>
        {s.status === "available" || s.status === "failed" ? (
          <button className="rt-btn rt-sm rt-primary" onClick={() => bridge.install()}>{s.mode === "manual" ? <><LuDownload />Download</> : <><LuCircleArrowUp />Update now</>}</button>
        ) : (
          <button className="rt-btn rt-sm" disabled={busy || blocked} onClick={() => bridge.check()}><LuRefreshCw />Check now</button>
        )}
      </div>
      {!blocked && (
        <SettingRow title="Check for updates automatically" hint="When RipTide opens and every few hours. It only asks GitHub which version is newest.">
          <Switch label="Check for updates automatically" checked={s.auto} onChange={(on) => bridge.setAuto(on)} />
        </SettingRow>
      )}
    </section>
  );
}
