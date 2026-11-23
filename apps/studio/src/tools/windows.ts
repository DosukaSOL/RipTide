import { useEffect, useState } from "react";
import { clampToScreens, suggestPlacement, type Rect } from "@riptide/tools";
import type { ToolId } from "@riptide/tools";

/**
 * Detached tool windows.
 *
 * In the browser, "detach" opens the tool in its own same-origin window. Windows
 * announce themselves on a BroadcastChannel so the main window knows what's open
 * and where. State is shared through each tool's persisted storage key, so a
 * popped-out map keeps its filters and markers.
 *
 * No remote content ever runs in these windows, and they have no extra privileges.
 */

export const DETACHABLE: ToolId[] = ["vicelab", "heist", "map"];
const CHANNEL = "riptide-windows";
const BEAT_MS = 2000;
const STALE_MS = 6500;

type Msg =
  | { type: "beat"; tool: ToolId; geometry: Rect }
  | { type: "bye"; tool: ToolId }
  | { type: "dock"; tool: ToolId }
  | { type: "focus"; tool: ToolId }
  | { type: "close-all" }
  | { type: "ping" };

function channel(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
  } catch {
    return null;
  }
}

export interface OpenWindow {
  tool: ToolId;
  geometry: Rect;
  seen: number;
}

const handles = new Map<ToolId, Window>();

/** Main window: live list of detached tool windows. */
export function useOpenWindows(): OpenWindow[] {
  const [wins, setWins] = useState<Record<string, OpenWindow>>({});
  useEffect(() => {
    const ch = channel();
    if (!ch) return;
    ch.onmessage = (e: MessageEvent<Msg>) => {
      const m = e.data;
      if (!m || typeof m !== "object") return;
      if (m.type === "beat" && DETACHABLE.includes(m.tool)) {
        setWins((w) => ({ ...w, [m.tool]: { tool: m.tool, geometry: m.geometry, seen: Date.now() } }));
      } else if (m.type === "bye" && DETACHABLE.includes(m.tool)) {
        setWins((w) => {
          const n = { ...w };
          delete n[m.tool];
          return n;
        });
        handles.delete(m.tool);
      }
    };
    ch.postMessage({ type: "ping" } satisfies Msg);
    const prune = setInterval(() => {
      const now = Date.now();
      setWins((w) => {
        const n = Object.fromEntries(Object.entries(w).filter(([, v]) => now - v.seen < STALE_MS));
        return Object.keys(n).length === Object.keys(w).length ? w : n;
      });
    }, 2000);
    return () => {
      clearInterval(prune);
      ch.close();
    };
  }, []);
  return Object.values(wins);
}

/** Screens the browser lets us see. Multi-screen details need the user's permission. */
export async function detectScreens(ask: boolean): Promise<{ screens: Rect[]; detailed: boolean }> {
  const w = window as Window & { getScreenDetails?: () => Promise<{ screens: { availLeft: number; availTop: number; availWidth: number; availHeight: number; isPrimary?: boolean }[] }> };
  if (ask && typeof w.getScreenDetails === "function") {
    try {
      const d = await w.getScreenDetails();
      const list = [...d.screens].sort((a, b) => Number(!!b.isPrimary) - Number(!!a.isPrimary));
      return { screens: list.map((s) => ({ x: s.availLeft, y: s.availTop, w: s.availWidth, h: s.availHeight })), detailed: true };
    } catch {
      /* permission denied: fall back to the current screen */
    }
  }
  const s = window.screen as Screen & { availLeft?: number; availTop?: number };
  return { screens: [{ x: s.availLeft ?? 0, y: s.availTop ?? 0, w: s.availWidth, h: s.availHeight }], detailed: false };
}

/**
 * Open a tool in its own window. Must be called from a click or key press.
 *
 * The window is opened straight away, before anything is awaited: browsers only allow pop-ups
 * during the click that asked for them, and asking for display details first could let that
 * moment pass and get the window blocked. It opens on the current display (or its saved spot),
 * then moves to another display once the browser says where they are.
 */
export function openToolWindow(tool: ToolId, saved?: Rect): Promise<{ ok: boolean; geometry?: Rect }> {
  if (!DETACHABLE.includes(tool)) return Promise.resolve({ ok: false });
  const existing = handles.get(tool);
  if (existing && !existing.closed) {
    existing.focus();
    return Promise.resolve({ ok: true });
  }
  const s = window.screen as Screen & { availLeft?: number; availTop?: number };
  const here: Rect[] = [{ x: s.availLeft ?? 0, y: s.availTop ?? 0, w: s.availWidth, h: s.availHeight }];
  const current: Rect = { x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight };
  const first = saved ? clampToScreens(saved, here) : suggestPlacement(current, here);
  const url = `${location.pathname}?window=${encodeURIComponent(tool)}${location.search.includes("splash=0") ? "&splash=0" : ""}`;
  const win = window.open(url, `riptide-${tool}`, `popup=yes,width=${first.w},height=${first.h},left=${first.x},top=${first.y}`);
  if (!win) return Promise.resolve({ ok: false });
  try {
    win.opener = null;
  } catch {
    /* ignore */
  }
  handles.set(tool, win);
  // Now place it properly, if the browser shares other displays.
  return detectScreens(true).then(({ screens, detailed }) => {
    if (!detailed) return { ok: true, geometry: first };
    const g = saved ? clampToScreens(saved, screens) : suggestPlacement(current, screens);
    if (g.x !== first.x || g.y !== first.y || g.w !== first.w || g.h !== first.h) {
      try {
        win.moveTo(g.x, g.y);
        win.resizeTo(g.w, g.h);
      } catch {
        /* the browser didn't allow moving it: it stays on this display */
      }
    }
    return { ok: true, geometry: g };
  });
}

/**
 * Open several tools from one click. All windows are opened before anything is awaited, so the
 * browser sees them as part of the click. Returns the tools the browser blocked.
 */
export async function openToolWindows(list: { tool: ToolId; geometry?: Rect }[]): Promise<{ blocked: ToolId[] }> {
  const pending = list.map((m) => ({ tool: m.tool, p: openToolWindow(m.tool, m.geometry) }));
  const blocked: ToolId[] = [];
  for (const { tool, p } of pending) if (!(await p).ok) blocked.push(tool);
  return { blocked };
}

export function dockTool(tool: ToolId) {
  const ch = channel();
  ch?.postMessage({ type: "dock", tool } satisfies Msg);
  ch?.close();
  const h = handles.get(tool);
  if (h && !h.closed) h.close();
  handles.delete(tool);
}

export function focusTool(tool: ToolId) {
  const h = handles.get(tool);
  if (h && !h.closed) return h.focus();
  const ch = channel();
  ch?.postMessage({ type: "focus", tool } satisfies Msg);
  ch?.close();
}

export function closeAllDetached() {
  const ch = channel();
  ch?.postMessage({ type: "close-all" } satisfies Msg);
  ch?.close();
}

/** Inside a detached window: announce ourselves and obey dock/focus requests. */
export function useDetachedRuntime(tool: ToolId, onDocked: () => void) {
  useEffect(() => {
    const ch = channel();
    if (!ch) return;
    const geometry = (): Rect => ({ x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight });
    const beat = () => ch.postMessage({ type: "beat", tool, geometry: geometry() } satisfies Msg);
    beat();
    const t = setInterval(beat, BEAT_MS);
    ch.onmessage = (e: MessageEvent<Msg>) => {
      const m = e.data;
      if (!m || typeof m !== "object") return;
      if (m.type === "ping") beat();
      if ((m.type === "dock" && m.tool === tool) || m.type === "close-all") {
        onDocked();
        window.close();
      }
      if (m.type === "focus" && m.tool === tool) window.focus();
    };
    const bye = () => ch.postMessage({ type: "bye", tool } satisfies Msg);
    window.addEventListener("pagehide", bye);
    return () => {
      clearInterval(t);
      window.removeEventListener("pagehide", bye);
      bye();
      ch.close();
    };
  }, [tool, onDocked]);
}
