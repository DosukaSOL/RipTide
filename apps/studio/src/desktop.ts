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
  /** Write several keys as one change: all or nothing. Missing in older builds. */
  writeMany?(entries: { key: string; value: string | null }[]): { ok: boolean; error?: string; partial?: boolean };
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

/** Thrown by localStorage writes in the desktop app when the file on disk couldn't be saved. */
export class DiskWriteError extends Error {
  name = "DiskWriteError";
}

const diskMessage = (code?: string) =>
  code === "ENOSPC"
    ? "The disk is full, so nothing was changed. Free up some space and try again."
    : code === "EPERM" || code === "EACCES" || code === "EROFS"
      ? "RipTide isn't allowed to write to its data folder, so nothing was changed. Check the folder's permissions in Settings."
      : "RipTide couldn't save to disk, so nothing was changed. Try again.";

type Entry = { key: string; value: string | null };
type Commit = { ok: true } | { ok: false; error: string };
let commitImpl: ((entries: Entry[]) => Commit) | null = null;

/**
 * Save several keys as one change, and only report success once it's really saved.
 * Desktop: one all-or-nothing change on disk, then read back to check. Browser: written one by
 * one, checked, and put back if any write fails.
 */
export function commitKeys(entries: Entry[]): Commit {
  if (commitImpl) return commitImpl(entries);
  const ls = window.localStorage;
  const before = new Map<string, string | null>();
  for (const e of entries) before.set(e.key, ls.getItem(e.key));
  const done: string[] = [];
  try {
    for (const e of entries) {
      if (e.value === null) ls.removeItem(e.key);
      else ls.setItem(e.key, e.value);
      if (ls.getItem(e.key) !== e.value) throw new Error("not saved");
      done.push(e.key);
    }
    return { ok: true };
  } catch {
    for (const k of done.reverse()) {
      try {
        const prev = before.get(k) ?? null;
        if (prev === null) ls.removeItem(k);
        else ls.setItem(k, prev);
      } catch {
        /* best effort: the previous value was smaller */
      }
    }
    return { ok: false, error: "This browser's storage is full, so nothing was changed. Free up space or use the desktop app." };
  }
}

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

  /** Save to disk first. Returns false if the file couldn't be written. */
  const save = (k: string, v: string | null): boolean => {
    if (!OURS.test(k) || held.has(k)) return true;
    if (!bridge.write(k, v)) {
      failed = true;
      return false;
    }
    if (v === null ? known.delete(k) : !known.has(k) && known.add(k)) saveKnown();
    return true;
  };
  // The file is written before the working copy, and a failed file write throws, so code that
  // saves only reports success once the data is really on disk.
  Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
    if (this === ls && !save(String(key), String(value))) throw new DiskWriteError(diskMessage());
    setItem.call(this, key, value);
  };
  Storage.prototype.removeItem = function (this: Storage, key: string) {
    if (this === ls && !save(String(key), null)) throw new DiskWriteError(diskMessage());
    removeItem.call(this, key);
  };
  commitImpl = (entries) => {
    if (typeof bridge.writeMany !== "function") {
      // Older desktop build: save one by one, putting earlier keys back if one fails.
      const before = entries.map((e) => ({ key: e.key, value: ls.getItem(e.key) }));
      const done: Entry[] = [];
      for (const e of entries) {
        if (!bridge.write(e.key, e.value)) {
          for (const d of done.reverse()) bridge.write(d.key, before.find((b) => b.key === d.key)!.value);
          return { ok: false, error: diskMessage() };
        }
        done.push(e);
      }
    } else {
      const r = bridge.writeMany(entries);
      if (!r?.ok) {
        failed = true;
        return { ok: false, error: r?.partial ? "RipTide couldn't finish saving. It will complete the change the next time it starts." : diskMessage(r?.error) };
      }
    }
    // Check what's on disk now matches, then update the working copy.
    let disk: Record<string, string> = {};
    try {
      disk = bridge.readAll() ?? {};
    } catch {
      return { ok: false, error: "RipTide saved the change but couldn't read it back to check it. Restart RipTide before using it." };
    }
    for (const e of entries) {
      if ((disk[e.key] ?? null) !== e.value) return { ok: false, error: "RipTide saved the change but it didn't read back the same. Restart RipTide and check your data." };
    }
    for (const e of entries) {
      try {
        if (e.value === null) removeItem.call(ls, e.key);
        else setItem.call(ls, e.key, e.value);
      } catch {
        /* the files are right; the working copy is reloaded from them on the next start */
      }
      if (e.value === null) known.delete(e.key);
      else known.add(e.key);
    }
    saveKnown();
    return { ok: true };
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
