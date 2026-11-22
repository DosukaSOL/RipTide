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

export interface DesktopBridge {
  /** Every saved key and its raw value, read from the data folder. */
  readAll(): Record<string, string>;
  /** Write one key to disk, or delete it with null. Returns false if it failed. */
  write(key: string, value: string | null): boolean;
  /** Where the files live, for display. */
  dataDir(): string;
  openDataDir(): void;
  version(): string;
}

const OURS = /^riptide\.[a-z0-9.-]{1,60}$/;

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

  // Files win. Keys only in this engine's storage (from before files existed) are copied to disk.
  let files: Record<string, string> = {};
  try {
    files = bridge.readAll() ?? {};
  } catch {
    files = {};
  }
  for (const [k, v] of Object.entries(files)) {
    if (OURS.test(k) && typeof v === "string" && ls.getItem(k) !== v) setItem.call(ls, k, v);
  }
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (k && OURS.test(k) && !(k in files)) {
      const v = ls.getItem(k);
      if (v !== null && !bridge.write(k, v)) failed = true;
    }
  }

  const save = (k: string, v: string | null) => {
    if (!OURS.test(k)) return;
    if (!bridge.write(k, v)) failed = true;
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
