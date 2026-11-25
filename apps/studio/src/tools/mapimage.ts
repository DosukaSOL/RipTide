import { useEffect, useState } from "react";
import { KEYS, MAP_IMAGE_MAX_BYTES, MapImage } from "@riptide/tools";
import { usePersisted } from "./persist";

/**
 * Your own map image. The file is kept in this device's IndexedDB (the browser's, or the desktop
 * app's own storage) and is never uploaded or sent anywhere. Its details and alignment are kept
 * under riptide.mapimage.v1 like other settings.
 */

const DB = "riptide-local";
const STORE = "files";
const FILE = "map-image";

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("This device's storage isn't available."));
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error ?? new Error("Couldn't save the image on this device."));
      t.onabort = () => reject(t.error ?? new Error("Couldn't save the image on this device. It may be full."));
    });
  } finally {
    d.close();
  }
}

export const saveImageFile = (blob: Blob) => tx("readwrite", (s) => s.put(blob, FILE));
export const loadImageFile = () => tx<Blob | undefined>("readonly", (s) => s.get(FILE) as IDBRequest<Blob | undefined>);
export const deleteImageFile = () => tx("readwrite", (s) => s.delete(FILE));

/** Image type from the file's first bytes, never from its name. SVG and anything else is refused. */
export async function sniffImage(file: Blob): Promise<MapImage["type"] | null> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

/** Checks a picked file and returns what to store, or a readable reason it can't be used. */
export async function readMapImage(file: File): Promise<{ ok: true; blob: Blob; meta: MapImage } | { ok: false; error: string }> {
  if (file.size > MAP_IMAGE_MAX_BYTES) return { ok: false, error: `That image is larger than ${MAP_IMAGE_MAX_BYTES / 1024 / 1024} MB.` };
  const type = await sniffImage(file);
  if (!type) return { ok: false, error: "That isn't a PNG, JPEG or WebP image." };
  const blob = new Blob([file], { type });
  let width = 0;
  let height = 0;
  try {
    const bmp = await createImageBitmap(blob);
    width = bmp.width;
    height = bmp.height;
    bmp.close();
  } catch {
    return { ok: false, error: "That image couldn't be opened. It may be damaged." };
  }
  if (width > 20000 || height > 20000 || width * height > 200_000_000) return { ok: false, error: "That image is too large to show smoothly (over 20,000 pixels on a side or 200 megapixels)." };
  const meta = MapImage.parse({ name: file.name.slice(0, 200) || "Map image", type, width, height, bytes: file.size, addedAt: Date.now() });
  return { ok: true, blob, meta };
}

const none = () => null as MapImage | null;
const MaybeImage = MapImage.nullable();

/** The image's details and a local object URL for drawing it. Follows changes made in other windows. */
export function useMapImage() {
  const [meta, setMeta, error] = usePersisted(KEYS.mapImage, MaybeImage, none);
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const stamp = meta?.addedAt ?? 0;
  useEffect(() => {
    if (!stamp) {
      setUrl(null);
      return;
    }
    let alive = true;
    let made: string | null = null;
    loadImageFile().then(
      (blob) => {
        if (!alive) return;
        if (!blob) return setMissing(true);
        made = URL.createObjectURL(blob);
        setMissing(false);
        setUrl(made);
      },
      () => alive && setMissing(true),
    );
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [stamp]);
  return { meta, setMeta, url, missing, error };
}
