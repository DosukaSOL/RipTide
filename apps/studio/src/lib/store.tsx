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

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({ bp: initial(), past: [], future: [] }));
  const [savedAt, setSavedAt] = useState(Date.now());
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const nextId = useRef(1);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(state.bp));
      } catch {
        /* private mode: keep working in memory */
      }
      setSavedAt(Date.now());
    }, 300);
    return () => clearTimeout(t);
  }, [state.bp]);

  const toast = useCallback((msg: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
  const read = () => window.location.hash.replace(/^#\/?/, "") || "overview";
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return [route, (r) => (window.location.hash = `/${r}`)];
}
