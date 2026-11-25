import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { jsonEqual, merge3, parseStored } from "@riptide/tools";
import { desktopBridge } from "../desktop";

type Loaded<T> = { value: T; notice: string; repair: boolean };

/**
 * Read a tool's saved data. If it's damaged, try the desktop app's backup copy before falling
 * back to defaults, and say which happened, so good data is never silently replaced.
 */
function load<T>(key: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, fallback: () => T): Loaded<T> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return { value: fallback(), notice: "", repair: false };
  }
  const main = parseStored(raw, schema);
  if (main.status === "ok") return { value: main.value, notice: "", repair: false };
  if (main.status === "empty") return { value: fallback(), notice: "", repair: false };
  let backup: string | null = null;
  try {
    backup = desktopBridge()?.readBackup?.(key) ?? null;
  } catch {
    backup = null;
  }
  const bak = parseStored(backup, schema);
  if (bak.status === "ok") {
    return { value: bak.value, notice: "Your latest save was damaged, so RipTide restored the previous version from its backup.", repair: true };
  }
  // Keep the unreadable copy so nothing is lost, then start from defaults.
  try {
    if (raw !== null && localStorage.getItem(`${key}.unreadable`) === null) localStorage.setItem(`${key}.unreadable`, raw);
  } catch {
    /* storage full: the original stays in place until something new is saved */
  }
  return { value: fallback(), notice: "Your saved data for this tool couldn't be read, so it started fresh. The unreadable copy is kept alongside it.", repair: false };
}

/**
 * Module-level persistence. Each tool owns one key in localStorage.
 * - Stored data is validated on read and on every cross-window update.
 * - Two windows can edit the same tool: changes from the other window are merged with this
 *   window's unsaved changes (see merge3) instead of one overwriting the other.
 * - If storage is full or blocked, the app keeps working in memory and says so.
 */
const LOCAL_SAVE = "riptide:saved";

export function usePersisted<T>(key: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, fallback: () => T) {
  const [initial] = useState(() => load(key, schema, fallback));
  const [state, setState] = useState<T>(initial.value);
  const [error, setError] = useState(initial.notice);
  const external = useRef(false);
  const first = useRef(!initial.repair); // a repaired value is saved straight away
  /** The last version this window and storage agreed on: the base for merges. */
  const base = useRef<T>(initial.value);
  /** State waiting to be written, so it can be saved at once if the page closes. */
  const pending = useRef<T | null>(null);
  /** Tells other users of the same key in this window apart from this one. */
  const self = useRef<object>({});

  const write = useCallback(
    (value: T) => {
      let out = value;
      try {
        // Another window may have saved since this one last synced, before its storage event
        // arrived here. Merge with what's stored now instead of overwriting it.
        const now = parseStored(localStorage.getItem(key), schema);
        if (now.status === "ok" && !jsonEqual(now.value, base.current)) {
          const merged = schema.safeParse(merge3(base.current, value, now.value));
          if (merged.success) {
            out = merged.data;
            if (!jsonEqual(out, value)) {
              external.current = true;
              setState(out);
            }
          }
        }
        const text = JSON.stringify(out);
        localStorage.setItem(key, text);
        base.current = out;
        setError("");
        // Storage events only reach other windows: tell other tools in this window too.
        window.dispatchEvent(new CustomEvent(LOCAL_SAVE, { detail: { key, text, from: self.current } }));
      } catch (e) {
        setError(
          e instanceof Error && e.name === "DiskWriteError"
            ? "RipTide couldn't save your latest change to disk. It's kept in this window until you close it, and RipTide tries again with your next change."
            : "This device's storage is full or blocked, so recent changes are only kept until you close RipTide. Export your data to keep it.",
        );
      }
    },
    [key, schema],
  );

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (external.current) {
      external.current = false;
      return;
    }
    pending.current = state;
    const t = setTimeout(() => {
      pending.current = null;
      write(state);
    }, 120);
    return () => clearTimeout(t);
  }, [state, write]);

  // Never lose the last change: write immediately when the page is hidden, closed or unmounted.
  useEffect(() => {
    const flush = () => {
      if (pending.current === null) return;
      const v = pending.current;
      pending.current = null;
      write(v);
    };
    const onVis = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
      flush();
    };
  }, [write]);

  useEffect(() => {
    const apply = (newValue: string | null) => {
      const remote = parseStored(newValue, schema);
      if (remote.status === "invalid") return; // never adopt damaged data from elsewhere
      const theirs = remote.status === "ok" ? remote.value : fallback(); // empty: reset in another window
      const mine = pending.current;
      if (mine !== null && remote.status === "ok") {
        // Unsaved changes here: merge them with the other window's save, then save the result.
        const merged = schema.safeParse(merge3(base.current, mine, theirs));
        base.current = theirs;
        if (merged.success && !jsonEqual(merged.data, theirs)) {
          setState(merged.data); // the effect saves it
          return;
        }
      }
      base.current = theirs;
      pending.current = null;
      external.current = true;
      setState(theirs);
    };
    const on = (e: StorageEvent) => {
      if (e.key !== key && e.key !== null) return;
      apply(e.key === null ? null : e.newValue);
    };
    const onLocal = (e: Event) => {
      const d = (e as CustomEvent<{ key: string; text: string; from: object }>).detail;
      if (d?.key === key && d.from !== self.current) apply(d.text);
    };
    window.addEventListener("storage", on);
    window.addEventListener(LOCAL_SAVE, onLocal);
    return () => {
      window.removeEventListener("storage", on);
      window.removeEventListener(LOCAL_SAVE, onLocal);
    };
  }, [key, schema, fallback]);

  const update = useCallback((fn: (draft: T) => void | T) => {
    setState((prev) => {
      const draft = structuredClone(prev);
      const out = fn(draft);
      return (out === undefined ? draft : out) as T;
    });
  }, []);

  return [state, update, error] as const;
}

/** Download text as a file without any network request. */
export function downloadText(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Read a user-picked file as text, with a size cap. */
export async function readFileText(file: File, maxBytes: number): Promise<string> {
  if (file.size > maxBytes) throw new Error(`This file is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  return file.text();
}
