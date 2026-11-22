import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type WheelEvent } from "react";
import { LuSearch, LuMap, LuPlus, LuMinus, LuLocateFixed, LuExternalLink, LuBookmark, LuX, LuUpload, LuStar, LuTrash2, LuMapPin, LuFilter } from "react-icons/lu";
import {
  KEYS,
  MapState,
  CATEGORIES,
  PROVENANCE_LABEL,
  MAP_SIZE,
  DEFAULT_VIEW,
  categoryCounts,
  clampView,
  createMarker,
  importMapPack,
  visibleRecords,
  zoomAt,
  uid,
  type DataCategory,
  type MapRecord,
  type View,
} from "@riptide/tools";
import { usePersisted, readFileText } from "../persist";
import { PageHeader, useShell } from "../ui";
import { DetachedGuard, HeaderRight } from "./common";
import { useToolsData } from "../data";
import { openToolWindow } from "../windows";

const mapDefault = () => MapState.parse({});
const clean = (s: string, max: number) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, max);
const PROV_TONE: Record<string, string> = { official: "rt-sea", verified: "rt-sea", community: "rt-sun", personal: "rt-pink" };
const CAT_COLOR: Record<string, string> = { missions: "#FF4F9A", activities: "#FFB36B", collectibles: "#B69CFF", businesses: "#5AA9FF", personal: "#3DF2D0" };

export function MapTool() {
  const { detached } = useShell();
  return (
    <DetachedGuard tool="map">
      <div className="rt-page" style={detached ? { maxWidth: "none" } : undefined}>
        <PageHeader crumb="Interactive Map" title="Find your next discovery." sub="Search. Filter. Save places. Move the map to your second screen whenever you want." right={<HeaderRight />} />
        <MapBody />
      </div>
    </DetachedGuard>
  );
}

function MapBody() {
  const { toast, detached } = useShell();
  const { activeWorkspace, setWorkspaces } = useToolsData();
  const [s, set, storageError] = usePersisted(KEYS.map, MapState, mapDefault);
  const [view, setView] = useState<View>(() => clampView(s.view));
  const [placing, setPlacing] = useState(false);
  const [packErr, setPackErr] = useState("");
  const [packWarn, setPackWarn] = useState<string[]>([]);
  const packInput = useRef<HTMLInputElement>(null);
  const search = useRef<HTMLInputElement>(null);

  // Persist the view only once interaction settles: dragging stays smooth.
  useEffect(() => {
    const t = setTimeout(() => set((d) => void (d.view = view)), 400);
    return () => clearTimeout(t);
  }, [view, set]);
  // Follow view changes made in another window.
  const lastStored = useRef(s.view);
  useEffect(() => {
    if (s.view.x !== lastStored.current.x || s.view.y !== lastStored.current.y || s.view.k !== lastStored.current.k) {
      lastStored.current = s.view;
      setView((v) => (v.x === s.view.x && v.y === s.view.y && v.k === s.view.k ? v : clampView(s.view)));
    }
  }, [s.view]);

  const filter = { categories: s.filter.categories as DataCategory[], savedOnly: s.filter.savedOnly, notesOnly: s.filter.notesOnly, query: s.filter.query };
  const records = useMemo(() => visibleRecords(s.packs as never, s.markers, filter), [s.packs, s.markers, filter.categories.join(), filter.savedOnly, filter.notesOnly, filter.query]);
  const counts = useMemo(() => categoryCounts(s.packs as never), [s.packs]);
  const allRecords = useMemo(() => [...s.packs.filter((p) => p.approved).flatMap((p) => p.records), ...s.markers], [s.packs, s.markers]);
  const savedCount = allRecords.filter((r) => r.saved).length;
  const selected = allRecords.find((r) => r.id === s.selectedId);
  const anyFilter = filter.categories.length > 0 || filter.savedOnly || filter.notesOnly || !!filter.query.trim();

  const toggleCat = (c: DataCategory) => set((d) => void (d.filter.categories = d.filter.categories.includes(c) ? d.filter.categories.filter((x) => x !== c) : [...d.filter.categories, c]));

  const placeAt = (x: number, y: number) => {
    const m = createMarker(x, y, `Marker ${s.markers.length + 1}`);
    set((d) => {
      d.markers.push(m);
      d.selectedId = m.id;
    });
    setPlacing(false);
    toast("Marker added. Name it in Place details.");
  };

  const updateRecord = (id: string, fn: (r: MapRecord) => void) =>
    set((d) => {
      const r = d.markers.find((m) => m.id === id) ?? d.packs.flatMap((p) => p.records).find((m) => m.id === id);
      if (r) fn(r);
    });

  const importPack = async (f: File) => {
    setPackErr("");
    setPackWarn([]);
    try {
      const { pack, warnings } = importMapPack(await readFileText(f, 20 * 1024 * 1024), s.packs as never);
      set((d) => {
        d.packs = [...d.packs.filter((p) => p.id !== pack.id), pack as never];
      });
      setPackWarn(warnings);
      toast(`Imported ${pack.name}. Review it before it shows on the map.`);
    } catch (e) {
      setPackErr(e instanceof Error ? e.message : "This map pack couldn't be imported.");
    }
  };

  const popOut = async () => {
    const saved = activeWorkspace.detached.find((d) => d.tool === "map")?.geometry;
    const r = await openToolWindow("map", saved);
    if (!r.ok) return toast("Your browser blocked the new window. Allow pop-ups for RipTide and try again.");
    setWorkspaces((d) => {
      const ws = d.list.find((w) => w.id === d.activeId);
      if (ws && !ws.detached.some((x) => x.tool === "map")) ws.detached.push({ tool: "map", geometry: r.geometry });
    });
  };

  // "/" focuses search from anywhere in the map.
  useEffect(() => {
    const on = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "/" || (e.target as HTMLElement).closest("input, textarea, select")) return;
      if (!search.current?.offsetParent) return;
      e.preventDefault();
      search.current.focus();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  return (
    <>
      {storageError && <div className="rt-banner rt-warn" role="alert">{storageError}</div>}
      <div className="rt-map-grid">
        {/* ---------- Discover ---------- */}
        <section className="rt-panel rt-map-col" aria-labelledby="rt-discover">
          <div className="rt-pad">
            <h2 id="rt-discover" style={{ marginBottom: 14 }}>Discover</h2>
            <div className="rt-search">
              <LuSearch />
              <label className="rt-sr" htmlFor="rt-map-q">Search locations</label>
              <input id="rt-map-q" ref={search} className="rt-input" placeholder="Search locations" maxLength={120} value={s.filter.query} onChange={(e) => { const v = clean(e.target.value, 120); set((d) => void (d.filter.query = v)); }} />
            </div>
          </div>
          <div className="rt-pad">
            <div className="rt-kicker" style={{ marginBottom: 8 }}>FILTERS</div>
            {CATEGORIES.map((c) => (
              <label className="rt-check" key={c.id}>
                <input type="checkbox" checked={s.filter.categories.includes(c.id)} onChange={() => toggleCat(c.id)} />
                {c.label}
                <span className="rt-count" title={counts[c.id] === null ? "No data for this category yet" : undefined}>{counts[c.id] ?? "—"}</span>
              </label>
            ))}
            <label className="rt-check">
              <input type="checkbox" checked={s.filter.savedOnly} onChange={() => set((d) => void (d.filter.savedOnly = !d.filter.savedOnly))} />
              My saved places<span className="rt-count">{savedCount}</span>
            </label>
            <label className="rt-check">
              <input type="checkbox" checked={s.filter.notesOnly} onChange={() => set((d) => void (d.filter.notesOnly = !d.filter.notesOnly))} />
              My notes<span className="rt-count">{s.markers.length}</span>
            </label>
            <p className="rt-hint">Category filters are ready for location data. Counts only appear when verified records exist.</p>
            <SavedFilters s={s} set={set} anyFilter={anyFilter} />
          </div>
          <div className="rt-pad">
            <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
              <div className="rt-kicker">BOOKMARKS</div>
              <button className="rt-btn rt-sm rt-ghost" style={{ marginLeft: "auto" }} onClick={() => set((d) => void d.bookmarks.push({ id: uid(), name: `View ${d.bookmarks.length + 1}`, ...view }))} disabled={s.bookmarks.length >= 50}><LuBookmark />Save view</button>
            </div>
            {s.bookmarks.length === 0 ? (
              <p className="rt-hint" style={{ margin: 0 }}>Save the current view to jump back to it later.</p>
            ) : (
              <ul className="rt-mini-list">
                {s.bookmarks.map((b) => (
                  <li key={b.id}>
                    <button className="rt-link" onClick={() => setView(clampView(b))}>{b.name}</button>
                    <button className="rt-iconbtn" aria-label={`Delete bookmark ${b.name}`} onClick={() => set((d) => void (d.bookmarks = d.bookmarks.filter((x) => x.id !== b.id)))}><LuX /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rt-pad">
            <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
              <div className="rt-kicker">MAP PACKS</div>
              <button className="rt-btn rt-sm rt-ghost" style={{ marginLeft: "auto" }} onClick={() => packInput.current?.click()}><LuUpload />Import</button>
              <input ref={packInput} type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importPack(f); e.target.value = ""; }} />
            </div>
            {s.packs.length === 0 ? (
              <p className="rt-hint" style={{ margin: 0 }}>No map data installed. RipTide doesn't ship GTA VI locations; packs can be added when verified data exists.</p>
            ) : (
              s.packs.map((p) => (
                <div key={p.id} style={{ padding: "10px 0", borderTop: "1px solid var(--rt-line)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <b style={{ fontSize: 14 }}>{p.name}</b>
                    <span className="rt-hint" style={{ margin: 0 }}>v{p.version}</span>
                    <button className="rt-iconbtn" style={{ marginLeft: "auto", width: 28, height: 28 }} aria-label={`Remove ${p.name}`} onClick={() => set((d) => void (d.packs = d.packs.filter((x) => x.id !== p.id)))}><LuTrash2 /></button>
                  </div>
                  <div className="rt-pill-row" style={{ marginTop: 6 }}>
                    <span className={`rt-badge ${PROV_TONE[p.provenance]}`}>{PROVENANCE_LABEL[p.provenance]}</span>
                    <span className="rt-badge">{p.records.length} places</span>
                    <span className="rt-badge">By {p.publisher}</span>
                  </div>
                  <label className="rt-check" style={{ minHeight: 34, fontSize: 13.5 }}>
                    <input type="checkbox" checked={p.approved} onChange={() => set((d) => { const x = d.packs.find((y) => y.id === p.id); if (x) x.approved = !x.approved; })} />
                    {p.approved ? "Showing on the map" : "Reviewed, show on the map"}
                  </label>
                </div>
              ))
            )}
            {packErr && <div className="rt-error" role="alert">{packErr}</div>}
            {packWarn.map((w) => <p key={w} className="rt-hint" style={{ color: "var(--rt-sun)" }}>{w}</p>)}
          </div>
        </section>

        {/* ---------- Canvas ---------- */}
        <MapCanvas
          view={view}
          setView={setView}
          records={records}
          selectedId={s.selectedId}
          onSelect={(id) => set((d) => void (d.selectedId = id))}
          placing={placing}
          onPlace={placeAt}
          center={
            records.length === 0 ? (
              allRecords.length === 0 || !anyFilter ? (
                <div className="rt-empty" style={{ maxWidth: 420, padding: "30px 34px" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#FFB36B" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ width: 22, height: 22 }}><path d="M3 14c3-4 5-4 7 0s4 4 7 0 4-3 4-3" /></svg>
                  <h3>{placing ? "Click the map to place it." : "The world is still being mapped."}</h3>
                  <p>{placing ? "Press Escape to cancel." : "This is the map workspace, not a claim about GTA VI locations. Verified map layers can be added when available."}</p>
                  {!placing && <button className="rt-btn" onClick={() => setPlacing(true)}>Create a personal marker<LuPlus /></button>}
                </div>
              ) : (
                <div className="rt-empty">
                  <LuFilter />
                  <h3>Nothing matches these filters.</h3>
                  <p>Try another search or clear your filters.</p>
                  <button className="rt-btn" onClick={() => set((d) => void (d.filter = { categories: [], savedOnly: false, notesOnly: false, query: "" }))}>Clear filters</button>
                </div>
              )
            ) : null
          }
          onCancelPlacing={() => setPlacing(false)}
          onStartPlacing={() => setPlacing(true)}
        />

        {/* ---------- Place details ---------- */}
        <section className="rt-panel rt-map-col" aria-labelledby="rt-details">
          <div className="rt-pad" style={{ flex: 1 }}>
            <h2 id="rt-details" style={{ marginBottom: 16 }}>Place details</h2>
            {selected ? (
              <Details record={selected} update={updateRecord} onDelete={() => set((d) => { d.markers = d.markers.filter((m) => m.id !== selected.id); d.selectedId = ""; })} onClose={() => set((d) => void (d.selectedId = ""))} />
            ) : (
              <div className="rt-details-empty">
                <LuMap />
                Select a verified location or add your own marker to see notes, tags and route options.
              </div>
            )}
          </div>
          <div className="rt-pad">
            {detached ? (
              <p className="rt-hint" style={{ margin: 0 }}>This map has its own window. Use Dock back at the top to return it to the main app.</p>
            ) : (
              <>
                <button className="rt-btn rt-primary rt-block" onClick={popOut}>Pop out map<LuExternalLink /></button>
                <p className="rt-hint">Works in its own window while ViceLab or Heist Ops stays open in the main app.</p>
              </>
            )}
          </div>
        </section>
      </div>
      <div className="rt-foot-note"><span>Schematic canvas · no GTA VI geography is shown or implied.</span><span>Drag to pan · scroll or +/− to zoom · / to search</span></div>
    </>
  );
}

/* ---------- canvas ---------- */

function MapCanvas(props: {
  view: View;
  setView: (fn: View | ((v: View) => View)) => void;
  records: MapRecord[];
  selectedId: string;
  onSelect: (id: string) => void;
  placing: boolean;
  onPlace: (x: number, y: number) => void;
  center: ReactNode;
  onCancelPlacing: () => void;
  onStartPlacing: () => void;
}) {
  const { view, setView, records, placing } = props;
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setSize({ w: Math.max(1, e.contentRect.width), h: Math.max(1, e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const aspect = size.w / size.h;
  const spanX = MAP_SIZE / view.k;
  const spanY = spanX / aspect;
  const vb = [view.x - spanX / 2, view.y - spanY / 2, spanX, spanY];
  const upp = spanX / size.w; // map units per pixel

  const toMap = useCallback((clientX: number, clientY: number) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: vb[0]! + ((clientX - r.left) / r.width) * spanX, y: vb[1]! + ((clientY - r.top) / r.height) * spanY };
  }, [vb[0], vb[1], spanX, spanY]);

  const onWheel = (e: WheelEvent) => {
    const r = stage.current!.getBoundingClientRect();
    const f = Math.exp(-e.deltaY * 0.0015);
    setView((v) => zoomAt(v, f, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, aspect));
  };
  // React's wheel listener is passive; stop the page scrolling while zooming the map.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const stop = (e: globalThis.WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", stop, { passive: false });
    return () => el.removeEventListener("wheel", stop);
  }, []);

  const onDown = (e: PointerEvent) => {
    if ((e.target as Element).closest(".rt-marker, .rt-map-zoom, .rt-empty")) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
    stage.current?.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    setDragging(true);
    setView(clampView({ x: d.vx - dx * upp, y: d.vy - dy * upp, k: view.k }));
  };
  const onUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (d && !d.moved && placing) {
      const p = toMap(e.clientX, e.clientY);
      props.onPlace(p.x, p.y);
    }
  };

  const onKey = (e: KeyboardEvent) => {
    const step = 0.08;
    let handled = true;
    if (e.key === "ArrowLeft") setView((v) => clampView({ ...v, x: v.x - spanX * step }));
    else if (e.key === "ArrowRight") setView((v) => clampView({ ...v, x: v.x + spanX * step }));
    else if (e.key === "ArrowUp") setView((v) => clampView({ ...v, y: v.y - spanY * step }));
    else if (e.key === "ArrowDown") setView((v) => clampView({ ...v, y: v.y + spanY * step }));
    else if (e.key === "+" || e.key === "=") setView((v) => zoomAt(v, 1.25, 0.5, 0.5, aspect));
    else if (e.key === "-" || e.key === "_") setView((v) => zoomAt(v, 0.8, 0.5, 0.5, aspect));
    else if (e.key === "0") setView(DEFAULT_VIEW);
    else if (e.key === "Escape" && placing) props.onCancelPlacing();
    else if ((e.key === "Enter" || e.key === "m") && placing && e.target === stage.current) props.onPlace(view.x, view.y);
    else handled = false;
    if (handled) e.preventDefault();
  };

  const r = 7 * upp;
  return (
    <div
      ref={stage}
      className={`rt-panel rt-map-stage rt-gridbg${dragging ? " rt-dragging" : ""}${placing ? " rt-placing" : ""}`}
      tabIndex={0}
      role="application"
      aria-label={`Map canvas, zoom ${view.k.toFixed(1)}x. Arrow keys pan, plus and minus zoom, 0 resets.${placing ? " Press Enter to place a marker at the centre." : ""}`}
      onWheel={onWheel}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => ((drag.current = null), setDragging(false))}
      onKeyDown={onKey}
    >
      <svg className="rt-map-svg" viewBox={vb.join(" ")} preserveAspectRatio="xMidYMid meet" aria-hidden={records.length === 0}>
        <defs>
          <linearGradient id="rt-land" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2a2350" stopOpacity=".55" />
            <stop offset="1" stopColor="#1b1638" stopOpacity=".2" />
          </linearGradient>
        </defs>
        {/* Illustrative shape only. Not real geography. */}
        <path d="M410 60 C 560 40 760 70 840 190 C 930 320 900 520 840 640 C 790 760 700 900 520 930 C 380 955 260 900 200 800 C 140 700 170 600 150 500 C 130 380 190 260 270 170 C 320 110 360 70 410 60 Z" fill="url(#rt-land)" stroke="#5a4c86" strokeOpacity=".6" strokeWidth={1.2 * upp} />
        {records.map((rec) => {
          const sel = rec.id === props.selectedId;
          return (
            <g
              key={rec.id}
              className="rt-marker"
              role="button"
              tabIndex={0}
              aria-label={`${rec.title}, ${PROVENANCE_LABEL[rec.provenance]}${rec.saved ? ", saved" : ""}`}
              aria-pressed={sel}
              onClick={() => props.onSelect(rec.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), props.onSelect(rec.id))}
            >
              <circle className="rt-ring" cx={rec.x} cy={rec.y} r={sel ? r * 1.9 : r * 1.4} fill="none" stroke={sel ? "#F4E9DC" : "transparent"} strokeWidth={1.5 * upp} />
              <circle cx={rec.x} cy={rec.y} r={sel ? r * 1.15 : r} fill={CAT_COLOR[rec.category]} stroke="#130F26" strokeWidth={2 * upp} />
              {rec.saved && <circle cx={rec.x + r} cy={rec.y - r} r={r * 0.45} fill="#FFB36B" stroke="#130F26" strokeWidth={upp} />}
            </g>
          );
        })}
      </svg>
      <div className="rt-map-badges">
        <span className="rt-badge">Schematic canvas</span>
        <span className="rt-badge">No official map data</span>
      </div>
      {props.center && <div className="rt-map-center">{props.center}</div>}
      {placing && !props.center && (
        <div className="rt-map-badges" style={{ top: "auto", bottom: 46, left: "50%", transform: "translateX(-50%)" }}>
          <span className="rt-badge rt-pink">Click to place your marker · Esc to cancel</span>
        </div>
      )}
      <div className="rt-map-zoom">
        <button className="rt-iconbtn" aria-label="Zoom in" onClick={() => setView((v) => zoomAt(v, 1.25, 0.5, 0.5, aspect))}><LuPlus /></button>
        <button className="rt-iconbtn" aria-label="Zoom out" onClick={() => setView((v) => zoomAt(v, 0.8, 0.5, 0.5, aspect))}><LuMinus /></button>
        <button className="rt-iconbtn" aria-label="Reset view" onClick={() => setView(DEFAULT_VIEW)}><LuLocateFixed /></button>
        <button className="rt-iconbtn" aria-label="Add a personal marker" aria-pressed={placing} style={placing ? { color: "var(--rt-pink)" } : undefined} onClick={() => (placing ? props.onCancelPlacing() : props.onStartPlacing())}><LuMapPin /></button>
      </div>
      <div className="rt-map-caption">SCHEMATIC DEMO · NOT GTA VI GEOGRAPHY</div>
    </div>
  );
}

/* ---------- details ---------- */

function Details({ record, update, onDelete, onClose }: { record: MapRecord; update: (id: string, fn: (r: MapRecord) => void) => void; onDelete: () => void; onClose: () => void }) {
  const personal = record.provenance === "personal";
  const [tag, setTag] = useState("");
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className={`rt-badge ${PROV_TONE[record.provenance]}`}>{PROVENANCE_LABEL[record.provenance]}</span>
        {!personal && <span className="rt-badge">{CATEGORIES.find((c) => c.id === record.category)?.label}</span>}
        <button className="rt-iconbtn" style={{ marginLeft: "auto" }} aria-label="Close details" onClick={onClose}><LuX /></button>
      </div>
      {personal ? (
        <>
          <label className="rt-label" htmlFor="rt-mk-t" style={{ marginTop: 16 }}>Name</label>
          <input id="rt-mk-t" className="rt-input" maxLength={80} value={record.title} onChange={(e) => { const v = clean(e.target.value, 80) || "Untitled"; update(record.id, (r) => void (r.title = v)); }} />
          <label className="rt-label" htmlFor="rt-mk-n" style={{ marginTop: 14 }}>Notes</label>
          <textarea id="rt-mk-n" className="rt-textarea" style={{ minHeight: 90 }} maxLength={2000} value={record.notes} onChange={(e) => { const v = clean(e.target.value, 2000); update(record.id, (r) => void (r.notes = v)); }} />
        </>
      ) : (
        <>
          <h3 style={{ margin: "16px 0 6px", fontSize: 19 }}>{record.title}</h3>
          <p style={{ margin: 0, color: "var(--rt-sub)", fontSize: 14 }}>{record.notes || "No notes in this map pack."}</p>
        </>
      )}
      <div className="rt-label" style={{ marginTop: 14 }}>Tags</div>
      <div className="rt-pill-row">
        {record.tags.map((t) => (
          <span className="rt-badge" key={t}>
            {t}
            {personal && <button className="rt-link" style={{ color: "var(--rt-muted)" }} aria-label={`Remove tag ${t}`} onClick={() => update(record.id, (r) => void (r.tags = r.tags.filter((x) => x !== t)))}><LuX /></button>}
          </span>
        ))}
        {!record.tags.length && <span className="rt-hint" style={{ margin: 0 }}>No tags</span>}
      </div>
      {personal && record.tags.length < 12 && (
        <form className="rt-inline-row" onSubmit={(e) => { e.preventDefault(); const t = clean(tag.trim(), 24); if (t && !record.tags.includes(t)) update(record.id, (r) => void r.tags.push(t)); setTag(""); }}>
          <label className="rt-sr" htmlFor="rt-mk-tag">Add tag</label>
          <input id="rt-mk-tag" className="rt-input" style={{ height: 36 }} maxLength={24} placeholder="Add a tag" value={tag} onChange={(e) => setTag(e.target.value)} />
          <button className="rt-btn rt-sm" type="submit" disabled={!tag.trim()}>Add</button>
        </form>
      )}
      <p className="rt-hint">Position {Math.round(record.x)}, {Math.round(record.y)} on the schematic canvas</p>
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button className="rt-btn rt-sm" aria-pressed={record.saved} onClick={() => update(record.id, (r) => void (r.saved = !r.saved))}>
          <LuStar style={record.saved ? { color: "var(--rt-sun)" } : undefined} />{record.saved ? "Saved" : "Save place"}
        </button>
        {personal && <button className="rt-btn rt-sm rt-danger" onClick={onDelete}><LuTrash2 />Delete</button>}
      </div>
    </div>
  );
}

/* ---------- saved filters ---------- */

function SavedFilters({ s, set, anyFilter }: { s: MapState; set: (fn: (d: MapState) => void) => void; anyFilter: boolean }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <div className="rt-kicker">SAVED FILTERS</div>
        <button className="rt-btn rt-sm rt-ghost" style={{ marginLeft: "auto" }} disabled={!anyFilter || s.savedFilters.length >= 30} onClick={() => set((d) => void d.savedFilters.push({ id: uid(), name: d.filter.query.trim() ? `“${d.filter.query.trim().slice(0, 30)}”` : `Filter ${d.savedFilters.length + 1}`, ...d.filter }))}>
          <LuPlus />Save
        </button>
      </div>
      {s.savedFilters.length === 0 ? (
        <p className="rt-hint" style={{ margin: "4px 0 0" }}>Pick filters, then save them for one-click reuse.</p>
      ) : (
        <ul className="rt-mini-list">
          {s.savedFilters.map((f) => (
            <li key={f.id}>
              <button className="rt-link" onClick={() => set((d) => void (d.filter = { categories: f.categories, savedOnly: f.savedOnly, notesOnly: f.notesOnly, query: f.query }))}>{f.name}</button>
              <button className="rt-iconbtn" aria-label={`Delete saved filter ${f.name}`} onClick={() => set((d) => void (d.savedFilters = d.savedFilters.filter((x) => x.id !== f.id)))}><LuX /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
