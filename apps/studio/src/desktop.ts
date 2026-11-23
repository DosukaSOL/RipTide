/**
 * Storage durability, run before anything else reads storage.
 *
 * Desktop app: the preload script exposes `window.riptideDesktop`. Files in the
 * RipTide data folder are the source of truth. They're loaded into localStorage
 * here, and every later write to a `riptide.*` key is written straight back to
 * its file, so data lives on disk and survives anything the browser engine does.
 *
 * Browser: ask the browser to keep RipTide's storage instead of clearing it
 * when space runs low.
 */

export type UpdateStatus = "off" | "unsupported" | "idle" | "checking" | "uptodate" | "available" | "downloading" | "installing" | "error" | "failed";

/** What the desktop app tells the page about updates. Set by desktop/updater.cjs. */
export interface UpdateState {
  status: UpdateStatus;
  /** The version running now. */
  current: string;
  /** The newer version, once one is found. */
  version: string | null;
  percent: number | null;
  error: string | null;
  /** auto: installs itself. mac: swaps itself in. manual: the button opens the download page. */
  mode: "auto" | "mac" | "manual";
  /** Check when the app opens and every few hours. */
  auto: boolean;
  /** The popup was closed for this version until the next launch. */
  dismissed: boolean;
  checkedAt: number | null;
}

export interface UpdatesBridge {
  get(): UpdateState | null;
  check(): void;
  /** Download, install and restart (or open the download page in manual mode). */
  install(): void;
  later(): void;
  openNotes(): void;
  setAuto(on: boolean): void;
  onChange(cb: (s: UpdateState) => void): () => void;
}

export interface DesktopBridge {
  /** Every saved key and its raw value, read from the data folder. */
  readAll(): Record<string, string>;
  /** The previous saved version of one key (its .bak file), or null. Missing in older builds. */
  readBackup?(key: string): string | null;
  /** Write one key to disk, or delete it with null. Returns false if it failed. */
  write(key: string, value: string | null): boolean;
  /** Where the files live, for display. */
  dataDir(): string;
  openDataDir(): void;
  version(): string;
  /** Missing in desktop builds from before updates existed. */
  updates?: UpdatesBridge;
}

const OURS = /^riptide\.[a-z0-9.-]{1,60}$/;
/** Keys that have had a file on disk. Not a riptide.* key, so it's never saved to disk itself. */
const ON_DISK = "rt-desktop-on-disk-v1";

export function desktopBridge(): DesktopBridge | null {
  const b = (globalThis as { riptideDesktop?: DesktopBridge }).riptideDesktop;
  return b && typeof b.readAll === "function" && typeof b.write === "function" ? b : null;
}

let failed = false;
/** True once a write to disk has failed in this window. */
export const desktopWriteFailed = () => failed;

export function initStorage(): "desktop" | "browser" | "none" {
  let ls: Storage;
  try {
    ls = window.localStorage;
  } catch {
    return "none";
  }
  const bridge = desktopBridge();
  if (!bridge) {
    try {
      void navigator.storage?.persist?.();
    } catch {
      /* not supported: nothing to do */
    }
    return "browser";
  }

  const setItem = Storage.prototype.setItem;
  const removeItem = Storage.prototype.removeItem;
  const clear = Storage.prototype.clear;

  // The files are the truth. Browser-engine storage is only a working copy of them.
  let files: Record<string, string> | null;
  try {
    files = bridge.readAll() ?? {};
  } catch {
    files = null;
  }
  // Keys that have had a file on disk, remembered in the working copy (never written to disk).
  const known = new Set<string>();
  try {
    const list = JSON.parse(ls.getItem(ON_DISK) ?? "[]");
    if (Array.isArray(list)) list.filter((k) => typeof k === "string" && OURS.test(k)).forEach((k) => known.add(k));
  } catch {
    /* unreadable: start empty, which only means stale copies get saved instead of dropped */
  }
  const onDiskBefore = new Set(known);
  const saveKnown = () => {
    try {
      setItem.call(ls, ON_DISK, JSON.stringify([...known]));
    } catch {
      /* storage full: worst case, a deleted file's stale copy is saved again next launch */
    }
  };
  // Keys whose file couldn't be loaded into the working copy (storage full). The app must not
  // save over those files from a stale or empty copy, so their writes are held back.
  const held = new Set<string>();
  if (files === null) {
    // Can't read the data folder at all: don't let anything overwrite it this session.
    failed = true;
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && OURS.test(k)) held.add(k);
    }
  } else {
    for (const [k, v] of Object.entries(files)) {
      if (!OURS.test(k) || typeof v !== "string" || ls.getItem(k) === v) continue;
      try {
        setItem.call(ls, k, v);
      } catch {
        held.add(k);
        failed = true;
      }
    }
    // Keys in the working copy without a file. If the key had a file before, the file was
    // deleted on purpose (outside the app), so the stale copy is dropped instead of brought back.
    // Otherwise it's data that never reached disk (from before files existed, or a save that
    // failed), so it's copied to disk now.
    for (const k of Object.keys(files)) known.add(k);
    const orphans: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && OURS.test(k) && !(k in files)) orphans.push(k);
    }
    for (const k of orphans) {
      if (onDiskBefore.has(k)) {
        removeItem.call(ls, k);
        known.delete(k);
        continue;
      }
      const v = ls.getItem(k);
      if (v !== null && bridge.write(k, v)) known.add(k);
      else failed = true;
    }
    saveKnown();
  }

  const save = (k: string, v: string | null) => {
    if (!OURS.test(k) || held.has(k)) return;
    if (!bridge.write(k, v)) {
      failed = true;
      return;
    }
    if (v === null ? known.delete(k) : !known.has(k) && known.add(k)) saveKnown();
  };
  Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
    setItem.call(this, key, value);
    if (this === ls) save(String(key), String(value));
  };
  Storage.prototype.removeItem = function (this: Storage, key: string) {
    removeItem.call(this, key);
    if (this === ls) save(String(key), null);
  };
  Storage.prototype.clear = function (this: Storage) {
    if (this === ls) {
      const keys: string[] = [];
      for (let i = 0; i < this.length; i++) keys.push(this.key(i)!);
      clear.call(this);
      keys.forEach((k) => save(k, null));
    } else clear.call(this);
  };
  return "desktop";
}

export const storageMode = initStorage();
