import { useMemo, useRef, useState, type MouseEvent } from "react";
import { LuImage, LuTrash2, LuUpload, LuX } from "react-icons/lu";
import { alignError, solveAffine, searchRecords, type AlignPoint, type MapRecord } from "@riptide/tools";
import { deleteImageFile, readMapImage, saveImageFile, useMapImage } from "../mapimage";
import { useMapData } from "../mapdata";
import { useToolsData } from "../data";

const ZOOMS = [1, 2, 4];
/** Rockstar's launch post, which points to the official printable map of Leonida. */
const ROCKSTAR_MAP = "https://www.rockstargames.com/newswire/article/39akk424a9oo53/grand-theft-auto-vi-now-available";

/** Settings panel: pick your own map image, line it up with known places, or remove it. */
export function MapImagePanel() {
  const { meta, setMeta, url, missing } = useMapImage();
  const { setSettings } = useToolsData();
  const data = useMapData();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [zoom, setZoom] = useState(1);
  const [place, setPlace] = useState<MapRecord | null>(null);
  const [q, setQ] = useState("");
  const pool = data.places?.records ?? [];
  const results = useMemo(() => (q.trim() ? searchRecords(pool, q, 6) : []), [pool, q]);
  const matrix = meta ? solveAffine(meta.points) : null;
  const err = matrix && meta ? alignError(matrix, meta.points) : 0;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMsg("");
    const r = await readMapImage(file);
    if (!r.ok) {
      setBusy(false);
      return setMsg(r.error);
    }
    try {
      await saveImageFile(r.blob);
      setMeta(() => r.meta);
      setSettings((d) => void (d.basemap = "custom"));
      setMsg(`Using ${r.meta.name} (${r.meta.width} × ${r.meta.height}). It's stretched over the whole map; line it up below if it isn't a full, square map.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't save the image on this device.");
    }
    setBusy(false);
  };

  const remove = async () => {
    try {
      await deleteImageFile();
    } catch {
      /* already gone */
    }
    setMeta(() => null);
    setSettings((d) => void (d.basemap === "custom" && (d.basemap = "official")));
    setMsg("Image removed from this device.");
  };

  const onImageClick = (e: MouseEvent<HTMLImageElement>) => {
    if (!meta || !place) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * meta.width;
    const py = ((e.clientY - r.top) / r.height) * meta.height;
    const pt: AlignPoint = { placeId: place.id, label: place.title, x: place.x, y: place.y, px: Math.round(px * 10) / 10, py: Math.round(py * 10) / 10 };
    setMeta((d) => {
      if (!d) return d;
      d.points = [...d.points.filter((p) => p.placeId !== pt.placeId), pt].slice(-12);
      if (solveAffine(d.points)) d.mode = "points";
      return d;
    });
    setPlace(null);
    setQ("");
  };

  return (
    <div className="rt-mapimg">
      <div className="rt-setting" style={{ borderBottom: 0 }}>
        <div className="rt-setting-text">
          Your own map image
          <small>
            Use a map image you have on this device. It stays here: it's never uploaded, and it isn't part of backups. Rockstar offers a printable map of Leonida on the{" "}
            <a href={ROCKSTAR_MAP} target="_blank" rel="noopener noreferrer">official Grand Theft Auto VI site</a>.
          </small>
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
        <button className="rt-btn rt-sm" disabled={busy} onClick={() => input.current?.click()}><LuUpload />{meta ? "Replace" : "Choose image"}</button>
      </div>
      {msg && <p className="rt-hint" role="status">{msg}</p>}
      {meta && (
        <>
          {missing && <p className="rt-hint" role="alert">The image file is missing from this device's storage. Choose it again.</p>}
          <div className="rt-mapimg-head">
            <span className="rt-badge"><LuImage />{meta.name}</span>
            <span className="rt-hint" style={{ margin: 0 }}>{meta.width} × {meta.height}</span>
            <button className="rt-btn rt-sm rt-ghost rt-danger" onClick={remove}><LuTrash2 />Remove</button>
          </div>
          <div className="rt-label" style={{ marginTop: 14 }}>Line it up</div>
          <div className="rt-pill-row" role="group" aria-label="How the image is placed">
            <button className={`rt-td-chip${meta.mode === "fit" ? " rt-on" : ""}`} aria-pressed={meta.mode === "fit"} onClick={() => setMeta((d) => d && ((d.mode = "fit"), d))}>Whole map</button>
            <button className={`rt-td-chip${meta.mode === "points" ? " rt-on" : ""}`} aria-pressed={meta.mode === "points"} disabled={!matrix} onClick={() => setMeta((d) => d && ((d.mode = "points"), d))}>By places ({meta.points.length})</button>
          </div>
          <p className="rt-hint">
            Whole map stretches the image over the full map square, which suits the full official map. Otherwise pick a place, click where it is on your image, and repeat for at least three places spread apart.
          </p>
          <div className="rt-mapimg-pick">
            <div className="rt-search" style={{ flex: 1 }}>
              <label className="rt-sr" htmlFor="rt-mi-q">Place to line up</label>
              <input id="rt-mi-q" className="rt-input" placeholder={place ? `Now click ${place.title} on your image` : "Find a place, like Y Vice City"} value={place ? "" : q} onChange={(e) => { setPlace(null); setQ(e.target.value); }} />
            </div>
            {place && <button className="rt-btn rt-sm rt-ghost" onClick={() => setPlace(null)}><LuX />Cancel</button>}
            <label className="rt-sr" htmlFor="rt-mi-zoom">Image zoom</label>
            <select id="rt-mi-zoom" className="rt-select" style={{ width: 90, height: 40 }} value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
              {ZOOMS.map((z) => <option key={z} value={z}>{z}×</option>)}
            </select>
          </div>
          {results.length > 0 && !place && (
            <ul className="rt-mapimg-results" role="listbox" aria-label="Places">
              {results.map((r) => (
                <li key={r.id}><button role="option" aria-selected="false" onClick={() => { setPlace(r); setQ(""); }}>{r.title}<span>{r.area || r.region}</span></button></li>
              ))}
            </ul>
          )}
          {url && (
            <div className={`rt-mapimg-view${place ? " rt-aiming" : ""}`}>
              <div className="rt-mapimg-canvas" style={{ width: `${zoom * 100}%` }}>
                <img src={url} alt={place ? `Your map image. Click where ${place.title} is.` : "Your map image"} onClick={onImageClick} draggable={false} />
                {meta.points.map((p, i) => (
                  <span key={p.placeId} className="rt-mapimg-pin" style={{ left: `${(p.px / meta.width) * 100}%`, top: `${(p.py / meta.height) * 100}%` }} title={p.label}>{i + 1}</span>
                ))}
              </div>
            </div>
          )}
          {meta.points.length > 0 && (
            <ol className="rt-mapimg-points">
              {meta.points.map((p, i) => (
                <li key={p.placeId}>
                  <span className="rt-td-n" aria-hidden="true">{i + 1}</span>
                  <span style={{ flex: 1 }}>{p.label}</span>
                  <button className="rt-iconbtn" aria-label={`Remove ${p.label}`} onClick={() => setMeta((d) => { if (!d) return d; d.points = d.points.filter((x) => x.placeId !== p.placeId); if (!solveAffine(d.points)) d.mode = "fit"; return d; })}><LuX /></button>
                </li>
              ))}
            </ol>
          )}
          {meta.points.length > 0 && meta.points.length < 3 && <p className="rt-hint">{3 - meta.points.length} more place{meta.points.length === 2 ? "" : "s"} to line it up.</p>}
          {meta.points.length >= 3 && !matrix && <p className="rt-hint" role="alert">These places are in a line. Add one off to the side.</p>}
          {matrix && (
            <p className={`rt-hint rt-fit ${err < 60 ? "rt-good" : err < 250 ? "" : "rt-bad"}`} role="status">
              Fit: places land about {Math.round(err)} m from where they should{err < 60 ? ". That's a close match." : err < 250 ? ". Good enough to find things; add places to improve it." : ". Check the points, or add more spread out."}
            </p>
          )}
          <div className="rt-setting" style={{ borderBottom: 0 }}>
            <div className="rt-setting-text">Image strength<small>Fade the image so markers stand out</small></div>
            <label className="rt-sr" htmlFor="rt-mi-op">Image strength</label>
            <input id="rt-mi-op" type="range" min={0.2} max={1} step={0.05} value={meta.opacity} onChange={(e) => { const v = Number(e.target.value); setMeta((d) => d && ((d.opacity = v), d)); }} />
          </div>
        </>
      )}
    </div>
  );
}
