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

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (external.current) {
      external.current = false;
      return;
    }
    const t = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(state));
        setError("");
      } catch {
        setError("This device's storage is full or blocked, so recent changes are only kept until you close RipTide. Export your data to keep it.");
      }
    }, 120);
    return () => clearTimeout(t);
  }, [key, state]);

  useEffect(() => {
    const on = (e: StorageEvent) => {
      if (e.key !== key) return;
      external.current = true;
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
