import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { validateBlueprint, type Blueprint } from "@riptide/core";
import starter from "../../../../examples/neon-coast.riptide.json";

const KEY = "riptide.blueprint.v1";

function initial(): Blueprint {
  // Stored data is untrusted: only accept it if it passes the full schema.
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      const r = validateBlueprint(JSON.parse(saved));
      if (r.ok) return r.blueprint;
    }
  } catch {
    /* storage unavailable or corrupt: fall back to the starter */
  }
  const r = validateBlueprint(starter);
  if (!r.ok) throw new Error("Starter Blueprint is invalid");
  return r.blueprint;
}

interface State {
  bp: Blueprint;
  past: Blueprint[];
  future: Blueprint[];
}

type Action = { type: "edit"; fn: (d: Blueprint) => void } | { type: "undo" } | { type: "redo" } | { type: "replace"; bp: Blueprint };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "edit": {
      const next = structuredClone(s.bp);
      a.fn(next);
      return { bp: next, past: [...s.past.slice(-49), s.bp], future: [] };
    }
    case "undo":
      return s.past.length ? { bp: s.past[s.past.length - 1]!, past: s.past.slice(0, -1), future: [s.bp, ...s.future] } : s;
    case "redo":
      return s.future.length ? { bp: s.future[0]!, past: [...s.past, s.bp], future: s.future.slice(1) } : s;
    case "replace":
      return { bp: a.bp, past: [...s.past, s.bp], future: [] };
  }
}

interface Store {
  bp: Blueprint;
  edit: (fn: (d: Blueprint) => void) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  savedAt: number;
  toast: (msg: string) => void;
}

const Ctx = createContext<Store | null>(null);

/**
 * Optional route prefix. Classic Studio uses none ("#/economy"); inside the
 * RipTide Tools shell Studio lives under "studio/" ("#/studio/economy").
 */
export const RouteBase = createContext("");

export function StoreProvider({ children, active = true }: { children: ReactNode; active?: boolean }) {
  const activeRef = useRef(active);
  activeRef.current = active;
  const [state, dispatch] = useReducer(reducer, undefined, () => ({ bp: initial(), past: [], future: [] }));
  const [savedAt, setSavedAt] = useState(Date.now());
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const nextId = useRef(1);

  const unsaved = useRef<typeof state.bp | null>(null);
  const warned = useRef(false);
  const save = useCallback((bp: typeof state.bp) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(bp));
      warned.current = false;
    } catch (e) {
      // Private mode keeps working in memory. A failed save to disk in the desktop app is said out loud, once.
      if (e instanceof Error && e.name === "DiskWriteError" && !warned.current) {
        warned.current = true;
        const id = nextId.current++;
        setToasts((t) => [...t, { id, msg: "Couldn't save your Blueprint to disk. Your changes are kept until you close RipTide." }]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
      }
    }
  }, []);
  useEffect(() => {
    unsaved.current = state.bp;
    const t = setTimeout(() => {
      unsaved.current = null;
      save(state.bp);
      setSavedAt(Date.now());
    }, 300);
    return () => clearTimeout(t);
  }, [state.bp, save]);
  // Save the last edit straight away if the page is closed or hidden before the timer runs.
  useEffect(() => {
    const flush = () => {
      if (unsaved.current === null) return;
      const bp = unsaved.current;
      unsaved.current = null;
      save(bp);
    };
    const onVis = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
      flush();
    };
  }, [save]);

  const toast = useCallback((msg: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // In the Tools shell Studio may be mounted but hidden: its shortcuts must not act then.
      if (!activeRef.current) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo<Store>(
    () => ({
      bp: state.bp,
      edit: (fn) => dispatch({ type: "edit", fn }),
      undo: () => dispatch({ type: "undo" }),
      redo: () => dispatch({ type: "redo" }),
      canUndo: state.past.length > 0,
      savedAt,
      toast,
    }),
    [state, savedAt, toast],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

export function useRoute(): [string, (r: string) => void] {
  const base = useContext(RouteBase);
  // Returns null when the hash belongs to another part of the shell, so Studio keeps its last section.
  const read = () => {
    const h = window.location.hash.replace(/^#\/?/, "");
    if (!base) return h || "overview";
    return h.startsWith(base) ? h.slice(base.length) || "overview" : null;
  };
  const [route, setRoute] = useState(() => read() ?? "overview");
  useEffect(() => {
    const on = () => {
      const r = read();
      if (r !== null) setRoute(r);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, [base]);
  return [route, (r) => (window.location.hash = `/${base}${r}`)];
}

/** Link target for a Studio section, respecting the route prefix. */
export function useHref(): (section: string) => string {
  const base = useContext(RouteBase);
  return (section) => `#/${base}${section}`;
}
