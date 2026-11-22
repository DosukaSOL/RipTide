import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { readStored } from "@riptide/tools";

/**
 * Module-level persistence. Each tool owns one key in localStorage.
 * - Stored data is validated on read and on every cross-window update.
 * - Changes from other windows (a popped-out map, say) arrive through the
 *   storage event, so every window shows the same state.
 * - If storage is full or blocked, the app keeps working in memory and says so.
 */
export function usePersisted<T>(key: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, fallback: () => T) {
  const [state, setState] = useState<T>(() => {
    try {
      return readStored(localStorage.getItem(key), schema, fallback());
    } catch {
      return fallback();
    }
  });
  const [error, setError] = useState("");
  const external = useRef(false);
  const first = useRef(true);
  /** State waiting to be written, so it can be saved at once if the page closes. */
  const pending = useRef<T | null>(null);

  const write = useCallback(
    (value: T) => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        setError("");
      } catch {
        setError("This device's storage is full or blocked, so recent changes are only kept until you close RipTide. Export your data to keep it.");
      }
    },
    [key],
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
    const on = (e: StorageEvent) => {
      if (e.key !== key) return;
      external.current = true;
      pending.current = null; // the other window's newer state wins
      setState(readStored(e.newValue, schema, fallback()));
    };
    window.addEventListener("storage", on);
    return () => window.removeEventListener("storage", on);
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
