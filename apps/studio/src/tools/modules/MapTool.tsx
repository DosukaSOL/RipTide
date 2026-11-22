import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type WheelEvent } from "react";
import {
  LuSearch,
  LuMap,
  LuPlus,
  LuMinus,
  LuLocateFixed,
  LuExternalLink,
  LuBookmark,
  LuX,
  LuUpload,
  LuStar,
  LuTrash2,
  LuMapPin,
  LuFilter,
  LuCheck,
  LuCopy,
  LuCrosshair,
  LuDoorOpen,
  LuNavigation,
} from "react-icons/lu";
import {
  KEYS,
  LEGACY_KEYS,
  MapState,
  CATEGORIES,
  PERSONAL_COLOR,
  PROVENANCE_LABEL,
  DEFAULT_VIEW,
  categoryById,
  categoryCounts,
  cleanText,
  clampView,
  createMarker,
  fitView,
  homeView,
  importMapPack,
  isTrackable,
  nextUnfound,
  pxPerMetre,
  regionsOf,
  screenToWorld,
  searchRecords,
  tileLevel,
  visibleRecords,
  visibleTiles,
  zoomAt,
  uid,
  type CategoryId,
  type HiddenId,
  type MapFilter,
  type MapRecord,
  type View,
} from "@riptide/tools";
import { usePersisted, readFileText } from "../persist";
import { PageHeader, useShell } from "../ui";
import { DetachedGuard, HeaderRight } from "./common";
import { useToolsData } from "../data";
import { openToolWindow } from "../windows";
import { MAP_BASE, useMapData, type MapData } from "../mapdata";

const mapDefault = () => MapState.parse({});
const PROV_TONE: Record<string, string> = { official: "rt-sea", verified: "rt-sea", community: "rt-sun", personal: "rt-pink" };
const colorOf = (r: Pick<MapRecord, "category">) => categoryById(r.category)?.color ?? PERSONAL_COLOR;
const fmt = (n: number) => n.toLocaleString("en-US");
const GTADB = "https://map.gtadb.org";
const CC_BY = "https://creativecommons.org/licenses/by/4.0/";

export function MapTool() {
  const { detached } = useShell();
  return (
    <DetachedGuard tool="map">
      <div className="rt-page" style={detached ? { maxWidth: "none" } : undefined}>
        <PageHeader crumb="Interactive Map" title="Find your next discovery." sub="The official map of Leonida, with places to find, progress to track and your own markers. Pop it out to a second screen any time." right={<HeaderRight />} />
        <MapBody />
      </div>
    </DetachedGuard>
  );
}

function prefersReducedMotion(setting: string) {
  if (setting === "reduced") return true;
  if (setting === "full") return false;
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function MapBody() {
  const { toast, detached } = useShell();
  const { activeWorkspace, setWorkspaces, settings } = useToolsData();
  const data = useMapData();
  const [s, set, storageError] = usePersisted(KEYS.map, MapState, mapDefault);
  const [view, setView] = useState<View>(() => clampView(s.view));
  const [placing, setPlacing] = useState(false);
  const [packErr, setPackErr] = useState("");
  const [packWarn, setPackWarn] = useState<string[]>([]);
  const packInput = useRef<HTMLInputElement>(null);
  const stageSize = useRef({ w: 900, h: 640 });
  const anim = useRef(0);

  // Persist the view once interaction settles, so dragging stays smooth.
  useEffect(() => {
    const t = setTimeout(() => set((d) => void (d.view = view)), 400);
    return () => clearTimeout(t);
  }, [view, set]);
  // Follow view changes made in another window.
  const lastStored = useRef(s.view);
  useEffect(() => {
    const a = lastStored.current;
    if (s.view.x !== a.x || s.view.y !== a.y || s.view.z !== a.z) {
      lastStored.current = s.view;
      setView((v) => (v.x === s.view.x && v.y === s.view.y && v.z === s.view.z ? v : clampView(s.view)));
    }
  }, [s.view]);

  /* ---------- earlier preview data ---------- */
  const [legacyCount, setLegacyCount] = useState(0);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LEGACY_KEYS.map);
      if (raw === null) return;
      const n = (() => {
        try {
          const m = (JSON.parse(raw) as { markers?: unknown }).markers;
          return Array.isArray(m) ? m.length : 0;
        } catch {
          return 0;
        }
      })();
      if (n === 0) localStorage.removeItem(LEGACY_KEYS.map);
      else setLegacyCount(n);
    } catch {
      /* storage blocked: nothing to clean up */
    }
  }, []);

  /* ---------- derived data ---------- */
  const profile = s.profiles.find((p) => p.id === s.activeProfile) ?? s.profiles[0]!;
  const found = useMemo(() => new Set(profile.found), [profile.found]);
  const favorites = useMemo(() => new Set(s.favorites), [s.favorites]);
  const places = data.places?.records;
  const pool = useMemo(() => [...(places ?? []), ...s.packs.filter((p) => p.approved).flatMap((p) => p.records as MapRecord[]), ...s.markers], [places, s.packs, s.markers]);
  const filter: MapFilter = s.filter;
  const records = useMemo(() => visibleRecords(pool, filter, favorites, found), [pool, filter, favorites, found]);
  const counts = useMemo(() => categoryCounts(pool, found, filter.region), [pool, found, filter.region]);
  const regions = useMemo(() => regionsOf(pool), [pool]);
  const trackable = useMemo(() => pool.filter(isTrackable), [pool]);
  const foundTotal = useMemo(() => trackable.reduce((n, r) => n + (found.has(r.id) ? 1 : 0), 0), [trackable, found]);
  const selected = pool.find((r) => r.id === s.selectedId);
  const anyFilter = filter.hidden.length > 0 || !!filter.region || filter.favoritesOnly || filter.hideFound || !!filter.query.trim();

  /* ---------- actions ---------- */
  const reduced = prefersReducedMotion(settings.motion);
  const viewRef = useRef(view);
  viewRef.current = view;
  const flyTo = useCallback(
    (target: View) => {
      cancelAnimationFrame(anim.current);
      const to = clampView(target);
      if (reduced) return setView(to);
      const from = viewRef.current;
      const t0 = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / 220);
        const e = 1 - (1 - k) ** 3;
        setView({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, z: from.z + (to.z - from.z) * e });
        if (k < 1) anim.current = requestAnimationFrame(step);
      };
      anim.current = requestAnimationFrame(step);
    },
    [reduced],
  );
  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  // First visit: fit all of Leonida to however much room the map has.
  const fitted = useRef(false);
  const onStageSize = useCallback((w: number, h: number) => {
    stageSize.current = { w, h };
    if (fitted.current) return;
    fitted.current = true;
    setView((v) => (v.x === DEFAULT_VIEW.x && v.y === DEFAULT_VIEW.y && v.z === DEFAULT_VIEW.z ? homeView(w, h) : v));
  }, []);
  const showAll = useCallback(() => flyTo(homeView(stageSize.current.w, stageSize.current.h)), [flyTo]);


  const select = useCallback((id: string) => set((d) => void (d.selectedId = id)), [set]);
  const focusRecord = useCallback(
    (r: MapRecord) => {
      select(r.id);
      flyTo({ x: r.x, y: r.y, z: Math.max(viewRef.current.z, 3.2) });
    },
    [select, flyTo],
  );

  const toggleFound = useCallback(
    (id: string) =>
      set((d) => {
        const p = d.profiles.find((x) => x.id === d.activeProfile) ?? d.profiles[0]!;
        const i = p.found.indexOf(id);
        if (i >= 0) p.found.splice(i, 1);
        else if (p.found.length < 50000) p.found.push(id);
      }),
    [set],
  );
  const toggleFavorite = useCallback(
    (id: string) =>
      set((d) => {
        const i = d.favorites.indexOf(id);
        if (i >= 0) d.favorites.splice(i, 1);
        else if (d.favorites.length < 20000) d.favorites.push(id);
      }),
    [set],
  );

  const goNextUnfound = useCallback(() => {
    const n = nextUnfound(records, found, viewRef.current, s.selectedId);
    if (!n) return toast(trackable.length ? "Everything shown here is found. Nice work." : "There's nothing to find yet.");
    focusRecord(n);
  }, [records, found, s.selectedId, focusRecord, toast, trackable.length]);

  const setHidden = (fn: (h: HiddenId[]) => HiddenId[]) => set((d) => void (d.filter.hidden = fn(d.filter.hidden)));
  const toggleHidden = (id: HiddenId) => setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));

  const placeAt = (x: number, y: number) => {
    const m = createMarker(x, y, `Marker ${s.markers.length + 1}`);
    if (s.markers.length >= 2000) return toast("You've reached 2,000 markers. Delete some to add more.");
    set((d) => {
      d.markers.push(m);
      d.selectedId = m.id;
      d.filter.hidden = d.filter.hidden.filter((h) => h !== "mine");
    });
    setPlacing(false);
    toast("Marker added. Name it in Place details.");
  };

  const updateMarker = (id: string, fn: (r: MapRecord) => void) =>
    set((d) => {
      const r = d.markers.find((m) => m.id === id);
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

  const pickRegion = (region: string) => {
    set((d) => void (d.filter.region = region));
    if (!region) return showAll();
    const inRegion = pool.filter((r) => r.region === region);
    if (!inRegion.length) return;
    const box = inRegion.reduce((b, r) => ({ minX: Math.min(b.minX, r.x), minY: Math.min(b.minY, r.y), maxX: Math.max(b.maxX, r.x), maxY: Math.max(b.maxY, r.y) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    const fit = fitView(box, stageSize.current.w, stageSize.current.h, 70);
    flyTo({ ...fit, z: Math.min(4, fit.z) });
  };

  return (
    <>
      {storageError && <div className="rt-banner rt-warn" role="alert">{storageError}</div>}
      {data.error && <div className="rt-banner rt-warn" role="alert">{data.error}</div>}
      {legacyCount > 0 && (
        <div className="rt-banner" role="status">
          <span>
            You have {legacyCount} marker{legacyCount === 1 ? "" : "s"} from the old placeholder map. Their positions don't match Leonida, so they weren't moved over.
          </span>
          <button
            className="rt-btn rt-sm"
            onClick={() => {
              try {
                localStorage.removeItem(LEGACY_KEYS.map);
              } catch {
                /* ignore */
              }
              setLegacyCount(0);
              toast("Old placeholder markers removed.");
            }}
          >
            Remove old markers
          </button>
        </div>
      )}
      <div className="rt-map-grid">
        {/* ---------- Discover ---------- */}
        <section className="rt-panel rt-map-col" aria-labelledby="rt-discover">
          <div className="rt-pad">
            <h2 id="rt-discover" style={{ marginBottom: 14 }}>Discover</h2>
            <SearchBox pool={pool} query={filter.query} onQuery={(v) => set((d) => void (d.filter.query = v))} onPick={focusRecord} found={found} />
          </div>

          <div className="rt-pad">
            <ProgressBlock s={s} set={set} total={trackable.length} found={foundTotal} onNext={goNextUnfound} />
          </div>

          <div className="rt-pad">
            <label className="rt-kicker" htmlFor="rt-map-region" style={{ display: "block", marginBottom: 8 }}>REGION</label>
            <select id="rt-map-region" className="rt-select" value={filter.region} onChange={(e) => pickRegion(e.target.value)}>
              <option value="">All of Leonida</option>
              {regions.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.name} ({r.count})
                </option>
              ))}
            </select>

            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px 12px", margin: "18px 0 4px" }}>
              <div className="rt-kicker" style={{ marginRight: "auto" }}>CATEGORIES</div>
              <span style={{ display: "inline-flex", alignItems: "center" }}>
              <button className="rt-link rt-tiny" onClick={() => setHidden((h) => h.filter((x) => x === "mine"))}>Show all</button>
              <span className="rt-dot-sep" aria-hidden="true" />
              <button className="rt-link rt-tiny" onClick={() => setHidden((h) => [...CATEGORIES.map((c) => c.id), ...(h.includes("mine") ? (["mine"] as const) : [])])}>Hide all</button>
              </span>
            </div>
            {CATEGORIES.map((c) => {
              const n = counts[c.id];
              return (
                <label className="rt-check rt-cat" key={c.id}>
                  <input type="checkbox" checked={!filter.hidden.includes(c.id)} onChange={() => toggleHidden(c.id)} />
                  <i className="rt-swatch" style={{ background: c.color }} aria-hidden="true" />
                  {c.label}
                  <span className="rt-count" title={n.total ? `${n.found} of ${n.total} found` : "Not mapped yet"}>{n.total ? `${fmt(n.found)}/${fmt(n.total)}` : "—"}</span>
                </label>
              );
            })}
            <label className="rt-check rt-cat">
              <input type="checkbox" checked={!filter.hidden.includes("mine")} onChange={() => toggleHidden("mine")} />
              <i className="rt-swatch rt-swatch-me" aria-hidden="true" />
              My markers<span className="rt-count">{fmt(s.markers.length)}</span>
            </label>
            <label className="rt-check rt-cat">
              <input type="checkbox" checked={filter.favoritesOnly} onChange={() => set((d) => void (d.filter.favoritesOnly = !d.filter.favoritesOnly))} />
              <LuStar className="rt-swatch-icon" aria-hidden="true" />
              Favourites only<span className="rt-count">{fmt(s.favorites.length)}</span>
            </label>
            {counts.collectibles.total === 0 && <p className="rt-hint">Collectibles aren't mapped yet. Add your own markers and set their category to Collectibles to track them here.</p>}
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
                    <button className="rt-link" onClick={() => flyTo(b)}>{b.name}</button>
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
              <input ref={packInput} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importPack(f); e.target.value = ""; }} />
            </div>
            {s.packs.length === 0 ? (
              <p className="rt-hint" style={{ margin: 0 }}>Add extra places from a RipTide map pack file. Packs stay hidden until you review them.</p>
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
                    <span className="rt-badge">{fmt(p.records.length)} places</span>
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

        {/* ---------- Map ---------- */}
        <MapCanvas
          data={data}
          view={view}
          setView={setView}
          onSize={onStageSize}
          records={records}
          selected={selected}
          found={found}
          favorites={favorites}
          onSelect={select}
          placing={placing}
          onPlace={placeAt}
          onCancelPlacing={() => setPlacing(false)}
          onStartPlacing={() => setPlacing(true)}
          onNext={goNextUnfound}
          onShowAll={showAll}
          onToggleFound={() => selected && isTrackable(selected) && toggleFound(selected.id)}
          onDeselect={() => select("")}
          empty={
            data.status === "ready" && records.length === 0 && anyFilter ? (
              <div className="rt-empty">
                <LuFilter />
                <h3>Nothing matches these filters.</h3>
                <p>Try another search or show more categories.</p>
                <button className="rt-btn" onClick={() => set((d) => void (d.filter = { hidden: [], region: "", query: "", favoritesOnly: false, hideFound: false }))}>Clear filters</button>
              </div>
            ) : null
          }
        />

        {/* ---------- Place details ---------- */}
        <section className="rt-panel rt-map-col" aria-labelledby="rt-details">
          <div className="rt-pad" style={{ flex: 1 }}>
            <h2 id="rt-details" style={{ marginBottom: 16 }}>Place details</h2>
            {selected ? (
              <Details
                record={selected}
                found={found.has(selected.id)}
                favorite={favorites.has(selected.id)}
                onFound={() => toggleFound(selected.id)}
                onFavorite={() => toggleFavorite(selected.id)}
                onCenter={() => flyTo({ x: selected.x, y: selected.y, z: Math.max(view.z, 3.2) })}
                update={updateMarker}
                onDelete={() => set((d) => { d.markers = d.markers.filter((m) => m.id !== selected.id); d.favorites = d.favorites.filter((f) => f !== selected.id); d.selectedId = ""; })}
                onClose={() => select("")}
                toast={toast}
              />
            ) : (
              <div className="rt-details-empty">
                <LuMap />
                Pick a place on the map or search for one to see what's there, mark it as found or save it as a favourite.
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
      <div className="rt-foot-note">
        <span>
          Map of Leonida © Rockstar Games. Places and tiles from <a href={GTADB} target="_blank" rel="noopener noreferrer">map.gtadb.org</a> (<a href={CC_BY} target="_blank" rel="noopener noreferrer">CC BY 4.0</a>), filtered by RipTide.
          {data.places ? ` Data from ${data.places.revisionDate}.` : ""}
        </span>
        <span>Drag to pan · scroll or +/− to zoom · N next unfound · F mark found · / to search</span>
      </div>
    </>
  );
}

/* ---------- search ---------- */

function SearchBox({ pool, query, onQuery, onPick, found }: { pool: MapRecord[]; query: string; onQuery: (v: string) => void; onPick: (r: MapRecord) => void; found: ReadonlySet<string> }) {
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => searchRecords(pool, query, 8), [pool, query]);
  const show = open && query.trim().length > 0;

  // "/" focuses search from anywhere in the map.
  useEffect(() => {
    const on = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      if (!input.current?.offsetParent) return;
      e.preventDefault();
      input.current.focus();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const pick = (r: MapRecord) => {
    onPick(r);
    setOpen(false);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && show && results[active]) {
      e.preventDefault();
      pick(results[active]!);
    } else if (e.key === "Escape") {
      if (show) setOpen(false);
      else if (query) onQuery("");
    }
  };

  return (
    <div className="rt-search" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOpen(false)}>
      <LuSearch />
      <label className="rt-sr" htmlFor="rt-map-q">Search places</label>
      <input
        id="rt-map-q"
        ref={input}
        className="rt-input"
        placeholder="Search places"
        maxLength={120}
        autoComplete="off"
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-activedescendant={show && results[active] ? `${listId}-${active}` : undefined}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onQuery(cleanText(e.target.value, 120));
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onKey}
      />
      {query && (
        <button className="rt-iconbtn rt-search-clear" aria-label="Clear search" onClick={() => (onQuery(""), input.current?.focus())}>
          <LuX />
        </button>
      )}
      {show && (
        <ul className="rt-results" id={listId} role="listbox" aria-label="Matching places">
          {results.length === 0 ? (
            <li className="rt-results-empty" role="option" aria-selected={false} aria-disabled="true">No places match “{query.trim()}”.</li>
          ) : (
            results.map((r, i) => (
              <li
                key={r.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? "rt-on" : undefined}
                tabIndex={-1}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(r)}
              >
                <i className="rt-swatch" style={{ background: colorOf(r) }} aria-hidden="true" />
                <span className="rt-results-t">
                  <b>{r.title}</b>
                  <small>{[r.kind && r.kind !== r.title ? r.kind : "", r.area].filter(Boolean).join(" · ") || (r.provenance === "personal" ? "Your marker" : categoryById(r.category)?.label)}</small>
                </span>
                {found.has(r.id) && <LuCheck className="rt-results-found" aria-label="Found" />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/* ---------- progress and playthroughs ---------- */

function ProgressBlock({ s, set, total, found, onNext }: { s: MapState; set: (fn: (d: MapState) => void) => void; total: number; found: number; onNext: () => void }) {
  const [editing, setEditing] = useState<"" | "rename" | "new" | "delete">("");
  const [name, setName] = useState("");
  const profile = s.profiles.find((p) => p.id === s.activeProfile) ?? s.profiles[0]!;
  const pct = total ? Math.round((found / total) * 1000) / 10 : 0;

  const save = () => {
    const n = cleanText(name.trim(), 40);
    if (!n) return;
    if (editing === "rename") set((d) => { const p = d.profiles.find((x) => x.id === profile.id); if (p) p.name = n; });
    if (editing === "new" && s.profiles.length < 8) {
      const id = uid();
      set((d) => { d.profiles.push({ id, name: n, found: [] }); d.activeProfile = id; });
    }
    setEditing("");
  };

  return (
    <div>
      <div className="rt-kicker" style={{ marginBottom: 8 }}>PROGRESS</div>
      <div className="rt-progress-head">
        <b>{fmt(found)}</b>
        <span>of {fmt(total)} found</span>
        <span className="rt-progress-pct">{pct}%</span>
      </div>
      <div className="rt-progress rt-progress-lg" role="progressbar" aria-label="Places found" aria-valuemin={0} aria-valuemax={total} aria-valuenow={found}>
        <i style={{ width: `${total ? (found / total) * 100 : 0}%` }} />
      </div>

      {editing === "rename" || editing === "new" ? (
        <form className="rt-inline-row" style={{ marginTop: 14 }} onSubmit={(e) => (e.preventDefault(), save())}>
          <label className="rt-sr" htmlFor="rt-prof-name">{editing === "new" ? "New playthrough name" : "Playthrough name"}</label>
          <input id="rt-prof-name" className="rt-input" style={{ height: 36 }} maxLength={40} autoFocus value={name} placeholder="Second playthrough" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setEditing("")} />
          <button className="rt-btn rt-sm" type="submit" disabled={!name.trim()}>Save</button>
          <button className="rt-iconbtn" type="button" aria-label="Cancel" onClick={() => setEditing("")}><LuX /></button>
        </form>
      ) : editing === "delete" ? (
        <div className="rt-inline-row" style={{ marginTop: 14, flexWrap: "wrap" }} role="alert">
          <span className="rt-hint" style={{ margin: 0, flex: "1 1 100%" }}>Delete “{profile.name}” and its {fmt(profile.found.length)} found places?</span>
          <button className="rt-btn rt-sm rt-danger" onClick={() => { set((d) => { d.profiles = d.profiles.filter((p) => p.id !== profile.id); d.activeProfile = d.profiles[0]?.id ?? "main"; }); setEditing(""); }}>Delete</button>
          <button className="rt-btn rt-sm rt-ghost" onClick={() => setEditing("")}>Keep</button>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
            <label className="rt-tiny" htmlFor="rt-prof" style={{ color: "var(--rt-muted)" }}>Playthrough</label>
            <button className="rt-link rt-tiny" style={{ marginLeft: "auto" }} onClick={() => (setName(profile.name), setEditing("rename"))}>Rename</button>
            <span className="rt-dot-sep" aria-hidden="true" />
            <button className="rt-link rt-tiny" disabled={s.profiles.length >= 8} onClick={() => (setName(""), setEditing("new"))}>New</button>
            {s.profiles.length > 1 && (
              <>
                <span className="rt-dot-sep" aria-hidden="true" />
                <button className="rt-link rt-tiny" onClick={() => setEditing("delete")}>Delete</button>
              </>
            )}
          </div>
          <select id="rt-prof" className="rt-select" style={{ height: 40 }} value={profile.id} onChange={(e) => set((d) => void (d.activeProfile = e.target.value))}>
            {s.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

      <label className="rt-check" style={{ minHeight: 36, marginTop: 8 }}>
        <input type="checkbox" checked={s.filter.hideFound} onChange={() => set((d) => void (d.filter.hideFound = !d.filter.hideFound))} />
        Hide found
      </label>
      <button className="rt-btn rt-sm rt-block" style={{ marginTop: 6 }} onClick={onNext} disabled={total === 0}><LuNavigation />Next unfound</button>
    </div>
  );
}

/* ---------- canvas ---------- */

function MapCanvas(props: {
  data: MapData;
  view: View;
  setView: (fn: View | ((v: View) => View)) => void;
  onSize: (w: number, h: number) => void;
  records: MapRecord[];
  selected: MapRecord | undefined;
  found: ReadonlySet<string>;
  favorites: ReadonlySet<string>;
  onSelect: (id: string) => void;
  placing: boolean;
  onPlace: (x: number, y: number) => void;
  onCancelPlacing: () => void;
  onStartPlacing: () => void;
  onNext: () => void;
  onShowAll: () => void;
  onToggleFound: () => void;
  onDeselect: () => void;
  empty: ReactNode;
}) {
  const { view, setView, placing, data, onSize } = props;
  const stage = useRef<HTMLDivElement>(null);
  const coords = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ w: 900, h: 640 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dpr, setDpr] = useState(() => (typeof devicePixelRatio === "number" ? devicePixelRatio : 1));

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (!e) return;
      const w = Math.max(1, e.contentRect.width);
      const h = Math.max(1, e.contentRect.height);
      setSize({ w, h });
      onSize(w, h);
      setDpr(devicePixelRatio || 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [onSize]);

  // React's wheel listener is passive; stop the page scrolling while zooming the map.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const stop = (e: globalThis.WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", stop, { passive: false });
    return () => el.removeEventListener("wheel", stop);
  }, []);

  const s = pxPerMetre(view.z);
  const vb = [view.x - size.w / 2 / s, -view.y - size.h / 2 / s, size.w / s, size.h / s];
  const local = (clientX: number, clientY: number) => {
    const r = stage.current!.getBoundingClientRect();
    return { px: clientX - r.left, py: clientY - r.top };
  };

  const onWheel = (e: WheelEvent) => {
    const { px, py } = local(e.clientX, e.clientY);
    const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? size.h : 1;
    const dz = Math.max(-1, Math.min(1, (-e.deltaY * unit) / 500));
    setView((v) => zoomAt(v, dz, px, py, size.w, size.h));
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || (e.target as Element).closest(".rt-marker, .rt-map-zoom, .rt-empty, .rt-map-credit a")) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
    stage.current?.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const { px, py } = local(e.clientX, e.clientY);
    if (coords.current) {
      const w = screenToWorld(view, px, py, size.w, size.h);
      coords.current.textContent = `X ${Math.round(w.x).toLocaleString("en-US")} · Y ${Math.round(w.y).toLocaleString("en-US")}`;
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    setDragging(true);
    setView(clampView({ x: d.vx - dx / s, y: d.vy + dy / s, z: view.z }));
  };
  const onUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (d && !d.moved) {
      if (placing) {
        const { px, py } = local(e.clientX, e.clientY);
        const w = screenToWorld(view, px, py, size.w, size.h);
        props.onPlace(w.x, w.y);
      } else if (props.selected) props.onDeselect();
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.target !== stage.current) return;
    const panX = (size.w * 0.15) / s;
    const panY = (size.h * 0.15) / s;
    let handled = true;
    if (e.key === "ArrowLeft") setView((v) => clampView({ ...v, x: v.x - panX }));
    else if (e.key === "ArrowRight") setView((v) => clampView({ ...v, x: v.x + panX }));
    else if (e.key === "ArrowUp") setView((v) => clampView({ ...v, y: v.y + panY }));
    else if (e.key === "ArrowDown") setView((v) => clampView({ ...v, y: v.y - panY }));
    else if (e.key === "+" || e.key === "=") setView((v) => zoomAt(v, 0.5, size.w / 2, size.h / 2, size.w, size.h));
    else if (e.key === "-" || e.key === "_") setView((v) => zoomAt(v, -0.5, size.w / 2, size.h / 2, size.w, size.h));
    else if (e.key === "0") props.onShowAll();
    else if (e.key === "n" || e.key === "N") props.onNext();
    else if ((e.key === "f" || e.key === "F") && props.selected) props.onToggleFound();
    else if (e.key === "Escape") placing ? props.onCancelPlacing() : props.onDeselect();
    else if ((e.key === "Enter" || e.key === "m") && placing) props.onPlace(view.x, view.y);
    else handled = false;
    if (handled) e.preventDefault();
  };

  /* tiles */
  const manifest = data.manifest;
  const tiles = useMemo(() => {
    if (!manifest) return [];
    const exists = (z: number, key: string) => data.tiles.get(z)?.has(key) ?? false;
    const level = tileLevel(view.z, dpr, manifest.maxZoom, manifest.minZoom);
    const levels = level >= 2 ? [level - 2, level] : [level];
    return levels.flatMap((l) => visibleTiles(view, size.w, size.h, l, exists));
  }, [manifest, data.tiles, view, size.w, size.h, dpr]);

  const rPx = view.z < 1 ? 3.5 : view.z < 2.2 ? 4.5 : view.z < 3.4 ? 6 : 7.5;
  const shown = useMemo(() => (props.selected && !props.records.some((r) => r.id === props.selected!.id) ? [...props.records, props.selected] : props.records), [props.records, props.selected]);

  return (
    <div
      ref={stage}
      className={`rt-panel rt-map-stage${dragging ? " rt-dragging" : ""}${placing ? " rt-placing" : ""}`}
      style={{ background: manifest?.background ?? "#2f90b0" }}
      tabIndex={0}
      role="application"
      aria-roledescription="map"
      aria-label={`Map of Leonida, zoom ${view.z.toFixed(1)}, ${props.records.length} places shown. Arrow keys pan, plus and minus zoom, 0 resets, N goes to the next unfound place.${placing ? " Press Enter to place a marker at the centre." : ""}`}
      onWheel={onWheel}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={() => coords.current && (coords.current.textContent = "")}
      onPointerCancel={() => ((drag.current = null), setDragging(false))}
      onKeyDown={onKey}
    >
      <svg className="rt-map-svg" viewBox={vb.join(" ")} preserveAspectRatio="xMidYMid meet">
        <g className="rt-tiles" aria-hidden="true">
          {tiles.map((t) => (
            <image key={`${t.z}/${t.key}`} href={`${MAP_BASE}/${t.z}/${t.key}.jpg`} x={t.x0} y={-t.yTop} width={t.size * 1.002} height={t.size * 1.002} preserveAspectRatio="none" />
          ))}
        </g>
        <MarkerLayer records={shown} selectedId={props.selected?.id ?? ""} found={props.found} favorites={props.favorites} scale={s} rPx={rPx} onSelect={props.onSelect} />
      </svg>

      <div className="rt-map-badges">
        <span className="rt-badge">Official map of Leonida</span>
        <span className="rt-badge">{data.status === "loading" ? "Loading places…" : data.places ? `${fmt(props.records.length)} places shown` : "No place data"}</span>
      </div>
      <span className="rt-map-coords" ref={coords} aria-hidden="true" />
      {props.empty && <div className="rt-map-center">{props.empty}</div>}
      {placing && (
        <div className="rt-map-badges rt-map-hint">
          <span className="rt-badge rt-pink">Click to place your marker · Esc to cancel</span>
        </div>
      )}
      <div className="rt-map-zoom">
        <button className="rt-iconbtn" aria-label="Zoom in" onClick={() => setView((v) => zoomAt(v, 0.5, size.w / 2, size.h / 2, size.w, size.h))}><LuPlus /></button>
        <button className="rt-iconbtn" aria-label="Zoom out" onClick={() => setView((v) => zoomAt(v, -0.5, size.w / 2, size.h / 2, size.w, size.h))}><LuMinus /></button>
        <button className="rt-iconbtn" aria-label="Show all of Leonida" onClick={props.onShowAll}><LuLocateFixed /></button>
        <button className="rt-iconbtn" aria-label="Next unfound place" onClick={props.onNext}><LuNavigation /></button>
        <button className="rt-iconbtn" aria-label="Add a personal marker" aria-pressed={placing} style={placing ? { color: "var(--rt-pink)" } : undefined} onClick={() => (placing ? props.onCancelPlacing() : props.onStartPlacing())}><LuMapPin /></button>
      </div>
      <div className="rt-map-credit">
        © Rockstar Games · <a href={GTADB} target="_blank" rel="noopener noreferrer">gtadb.org</a> · <a href={CC_BY} target="_blank" rel="noopener noreferrer">CC BY 4.0</a>
      </div>
    </div>
  );
}

const MarkerLayer = memo(function MarkerLayer({ records, selectedId, found, favorites, scale, rPx, onSelect }: { records: MapRecord[]; selectedId: string; found: ReadonlySet<string>; favorites: ReadonlySet<string>; scale: number; rPx: number; onSelect: (id: string) => void }) {
  const u = 1 / scale; // metres per screen pixel
  const r = rPx * u;
  const sel = records.find((x) => x.id === selectedId);
  return (
    <g className="rt-markers">
      {records.map((rec) => {
        if (rec.id === selectedId) return null;
        const isFound = found.has(rec.id);
        const mine = rec.provenance === "personal";
        return (
          <g
            key={rec.id}
            className={`rt-marker${isFound ? " rt-found" : ""}`}
            data-id={rec.id}
            role="button"
            tabIndex={-1}
            aria-label={`${rec.title}${isFound ? ", found" : ""}`}
            onClick={(e) => (e.stopPropagation(), onSelect(rec.id))}
          >
            <title>{rec.title}</title>
            <circle cx={rec.x} cy={-rec.y} r={r * 2.2} fill="transparent" />
            {mine ? (
              <rect x={rec.x - r} y={-rec.y - r} width={r * 2} height={r * 2} transform={`rotate(45 ${rec.x} ${-rec.y})`} fill={colorOf(rec)} stroke="#130F26" strokeWidth={1.6 * u} />
            ) : (
              <circle cx={rec.x} cy={-rec.y} r={r} fill={colorOf(rec)} stroke="#130F26" strokeWidth={1.6 * u} />
            )}
            {favorites.has(rec.id) && <circle cx={rec.x + r * 0.9} cy={-rec.y - r * 0.9} r={r * 0.5} fill="#FFB36B" stroke="#130F26" strokeWidth={u} />}
          </g>
        );
      })}
      {sel && (
        <g className="rt-marker rt-selected" data-id={sel.id} role="button" tabIndex={-1} aria-label={`${sel.title}, selected`} onClick={(e) => e.stopPropagation()}>
          <circle cx={sel.x} cy={-sel.y} r={r * 2.4} fill="rgba(19,15,38,.35)" stroke="#F4E9DC" strokeWidth={2 * u} />
          <circle cx={sel.x} cy={-sel.y} r={r * 1.25} fill={colorOf(sel)} stroke="#130F26" strokeWidth={2 * u} />
          <text x={sel.x} y={-sel.y - r * 3.4} textAnchor="middle" fontSize={13 * u} className="rt-marker-label">{sel.title}</text>
        </g>
      )}
    </g>
  );
});

/* ---------- details ---------- */

function Details(props: {
  record: MapRecord;
  found: boolean;
  favorite: boolean;
  onFound: () => void;
  onFavorite: () => void;
  onCenter: () => void;
  update: (id: string, fn: (r: MapRecord) => void) => void;
  onDelete: () => void;
  onClose: () => void;
  toast: (m: string) => void;
}) {
  const { record, update } = props;
  const personal = record.provenance === "personal";
  const [tag, setTag] = useState("");
  const cat = categoryById(record.category);
  const pos = `${Math.round(record.x)}, ${Math.round(record.y)}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pos);
      props.toast("Position copied.");
    } catch {
      props.toast(`Position: ${pos}`);
    }
  };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className={`rt-badge ${PROV_TONE[record.provenance]}`}>{record.source === "gtadb" ? "Community · gtadb.org" : PROVENANCE_LABEL[record.provenance]}</span>
        <span className="rt-badge"><i className="rt-swatch" style={{ background: colorOf(record) }} aria-hidden="true" />{cat?.label ?? "My marker"}</span>
        <button className="rt-iconbtn" style={{ marginLeft: "auto" }} aria-label="Close details" onClick={props.onClose}><LuX /></button>
      </div>

      {personal ? (
        <>
          <label className="rt-label" htmlFor="rt-mk-t" style={{ marginTop: 16 }}>Name</label>
          <input id="rt-mk-t" className="rt-input" maxLength={80} value={record.title} onChange={(e) => { const v = cleanText(e.target.value, 80) || "Untitled"; update(record.id, (r) => void (r.title = v)); }} />
          <label className="rt-label" htmlFor="rt-mk-c" style={{ marginTop: 14 }}>Category</label>
          <select id="rt-mk-c" className="rt-select" value={record.category} onChange={(e) => { const v = e.target.value as CategoryId | "personal"; update(record.id, (r) => void (r.category = v)); }}>
            <option value="personal">My markers</option>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <label className="rt-label" htmlFor="rt-mk-n" style={{ marginTop: 14 }}>Notes</label>
          <textarea id="rt-mk-n" className="rt-textarea" style={{ minHeight: 90 }} maxLength={2000} value={record.notes} onChange={(e) => { const v = cleanText(e.target.value, 2000); update(record.id, (r) => void (r.notes = v)); }} />
          <div className="rt-label" style={{ marginTop: 14 }}>Tags</div>
          <div className="rt-pill-row">
            {record.tags.map((t) => (
              <span className="rt-badge" key={t}>
                {t}
                <button className="rt-link" style={{ color: "var(--rt-muted)" }} aria-label={`Remove tag ${t}`} onClick={() => update(record.id, (r) => void (r.tags = r.tags.filter((x) => x !== t)))}><LuX /></button>
              </span>
            ))}
            {!record.tags.length && <span className="rt-hint" style={{ margin: 0 }}>No tags</span>}
          </div>
          {record.tags.length < 12 && (
            <form className="rt-inline-row" onSubmit={(e) => { e.preventDefault(); const t = cleanText(tag.trim(), 24); if (t && !record.tags.includes(t)) update(record.id, (r) => void r.tags.push(t)); setTag(""); }}>
              <label className="rt-sr" htmlFor="rt-mk-tag">Add tag</label>
              <input id="rt-mk-tag" className="rt-input" style={{ height: 36 }} maxLength={24} placeholder="Add a tag" value={tag} onChange={(e) => setTag(e.target.value)} />
              <button className="rt-btn rt-sm" type="submit" disabled={!tag.trim()}>Add</button>
            </form>
          )}
        </>
      ) : (
        <>
          <h3 className="rt-place-title">{record.title}</h3>
          {record.area && <p className="rt-place-area">{record.area}</p>}
          <dl className="rt-place-facts">
            {record.kind && record.kind !== record.title && (<><dt>Type</dt><dd>{record.kind}</dd></>)}
            {record.inspiredBy && (<><dt>Inspired by</dt><dd>{record.inspiredBy}</dd></>)}
            {record.enterable && (<><dt>Inside</dt><dd><LuDoorOpen aria-hidden="true" /> You can go in</dd></>)}
            {record.notes && (<><dt>Notes</dt><dd>{record.notes}</dd></>)}
          </dl>
          {record.tags.length > 0 && <div className="rt-pill-row" style={{ marginTop: 10 }}>{record.tags.map((t) => <span className="rt-badge" key={t}>{t}</span>)}</div>}
        </>
      )}

      <div className="rt-place-pos">
        <span title="In-game position in metres"><span className="rt-sr">Position </span>X {Math.round(record.x).toLocaleString("en-US")} · Y {Math.round(record.y).toLocaleString("en-US")}</span>
        <button className="rt-iconbtn" aria-label="Copy position" onClick={copy}><LuCopy /></button>
        <button className="rt-iconbtn" aria-label="Centre the map here" onClick={props.onCenter}><LuCrosshair /></button>
      </div>

      <div className="rt-place-actions">
        {isTrackable(record) && (
          <button className={`rt-btn rt-sm${props.found ? " rt-sea-btn" : " rt-primary"}`} aria-pressed={props.found} onClick={props.onFound}>
            <LuCheck />{props.found ? "Found" : "Mark as found"}
          </button>
        )}
        <button className="rt-btn rt-sm" aria-pressed={props.favorite} onClick={props.onFavorite}>
          <LuStar style={props.favorite ? { color: "var(--rt-sun)", fill: "var(--rt-sun)" } : undefined} />{props.favorite ? "Favourite" : "Add to favourites"}
        </button>
        {personal && <button className="rt-btn rt-sm rt-danger" onClick={props.onDelete}><LuTrash2 />Delete</button>}
      </div>
      {record.source === "gtadb" && (
        <p className="rt-hint">
          Wrong name or spot? Community data can be fixed on <a href={GTADB} target="_blank" rel="noopener noreferrer">map.gtadb.org</a>, and RipTide picks it up in a later update.
        </p>
      )}
    </div>
  );
}

/* ---------- saved filters ---------- */

function SavedFilters({ s, set, anyFilter }: { s: MapState; set: (fn: (d: MapState) => void) => void; anyFilter: boolean }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <div className="rt-kicker">SAVED FILTERS</div>
        <button
          className="rt-btn rt-sm rt-ghost"
          style={{ marginLeft: "auto" }}
          disabled={!anyFilter || s.savedFilters.length >= 30}
          onClick={() =>
            set((d) =>
              void d.savedFilters.push({
                id: uid(),
                name: d.filter.query.trim() ? `“${d.filter.query.trim().slice(0, 30)}”` : d.filter.region ? d.filter.region.slice(0, 40) : `Filter ${d.savedFilters.length + 1}`,
                ...d.filter,
              }),
            )
          }
        >
          <LuPlus />Save
        </button>
      </div>
      {s.savedFilters.length === 0 ? (
        <p className="rt-hint" style={{ margin: "4px 0 0" }}>Pick filters, then save them for one-click reuse.</p>
      ) : (
        <ul className="rt-mini-list">
          {s.savedFilters.map((f) => (
            <li key={f.id}>
              <button className="rt-link" onClick={() => set((d) => void (d.filter = { hidden: f.hidden, region: f.region, query: f.query, favoritesOnly: f.favoritesOnly, hideFound: f.hideFound }))}>{f.name}</button>
              <button className="rt-iconbtn" aria-label={`Delete saved filter ${f.name}`} onClick={() => set((d) => void (d.savedFilters = d.savedFilters.filter((x) => x.id !== f.id)))}><LuX /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
