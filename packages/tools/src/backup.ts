import type { z } from "zod";

/**
 * Backups of everything RipTide Tools keeps on a device, and restoring them safely.
 *
 * A restore is checked completely before anything changes: the file must be a RipTide backup,
 * every included part must pass its checksum and its schema, and only then is anything written.
 * If a write fails halfway (storage full, say), everything already written is put back the way
 * it was, so a failed restore never leaves a mix of old and new data.
 */

export const BACKUP_FORMAT = "riptide-tools-backup";
export const BACKUP_VERSION = 2;
/** Larger files are refused before reading. */
export const BACKUP_MAX_BYTES = 40 * 1024 * 1024;

export interface BackupPart {
  key: string;
  label: string;
  schema: z.ZodTypeAny;
}

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** FNV-1a over UTF-16 code units: catches truncated or hand-edited parts. Not a security check. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  parts: Record<string, { label: string; checksum: string; data: unknown }>;
}

/** Everything stored under the given parts, readable or not, as one backup file. */
export function createBackup(parts: BackupPart[], store: Pick<KeyValueStore, "get">, now = new Date()): { file: BackupFile; skipped: string[] } {
  const file: BackupFile = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), parts: {} };
  const skipped: string[] = [];
  for (const p of parts) {
    let raw: string | null = null;
    try {
      raw = store.get(p.key);
    } catch {
      skipped.push(p.label);
      continue;
    }
    if (raw === null) continue;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      skipped.push(p.label); // damaged on this device: say so instead of exporting garbage
      continue;
    }
    const text = JSON.stringify(data);
    file.parts[p.key] = { label: p.label, checksum: checksum(text), data };
  }
  return { file, skipped };
}

export type RestoreItem =
  | { key: string; label: string; status: "replace" | "same"; text: string }
  | { key: string; label: string; status: "invalid"; error: string };

export type RestorePlan =
  | { ok: false; error: string; items: RestoreItem[] }
  | { ok: true; items: RestoreItem[]; unknown: string[]; exportedAt: string | null };

const summarise = (issues: z.ZodIssue[]) =>
  issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "(top)"}: ${i.message}`)
    .join("; ");

/**
 * Check a backup file without changing anything. Reads version 2 files (with checksums) and
 * version 1 files (from earlier previews, without them). Every part must validate, or nothing
 * is restored.
 */
export function planRestore(text: string, parts: BackupPart[], store: Pick<KeyValueStore, "get">): RestorePlan {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file isn't valid JSON.", items: [] };
  }
  if (typeof doc !== "object" || doc === null || (doc as { format?: unknown }).format !== BACKUP_FORMAT) {
    return { ok: false, error: "This isn't a RipTide backup file.", items: [] };
  }
  const d = doc as Record<string, unknown>;
  const version = typeof d.version === "number" ? d.version : 1;
  if (version > BACKUP_VERSION) return { ok: false, error: "This backup is from a newer version of RipTide. Update the app, then restore it.", items: [] };

  // Version 1: parts at the top level, no checksums. Version 2: under "parts", with checksums.
  const entries = new Map<string, { data: unknown; checksum?: string }>();
  if (version >= 2) {
    const ps = d.parts;
    if (typeof ps !== "object" || ps === null) return { ok: false, error: "This backup file is damaged (no parts).", items: [] };
    for (const [k, v] of Object.entries(ps as Record<string, unknown>)) {
      if (typeof v === "object" && v !== null && "data" in v) entries.set(k, { data: (v as { data: unknown }).data, checksum: String((v as { checksum?: unknown }).checksum ?? "") });
    }
  } else {
    for (const [k, v] of Object.entries(d)) if (!["format", "version", "exportedAt"].includes(k)) entries.set(k, { data: v });
  }

  const known = new Map(parts.map((p) => [p.key, p]));
  const items: RestoreItem[] = [];
  for (const [key, e] of entries) {
    const part = known.get(key);
    if (!part) continue;
    const text = JSON.stringify(e.data);
    if (e.checksum !== undefined && e.checksum !== checksum(text)) {
      items.push({ key, label: part.label, status: "invalid", error: "Checksum doesn't match: this part was changed or cut off." });
      continue;
    }
    const r = part.schema.safeParse(e.data);
    if (!r.success) {
      items.push({ key, label: part.label, status: "invalid", error: summarise(r.error.issues) });
      continue;
    }
    // Store what the backup contains, not the parsed result: each tool migrates its own data on load.
    let current: string | null = null;
    try {
      current = store.get(key);
    } catch {
      /* treat as different */
    }
    items.push({ key, label: part.label, status: current === text ? "same" : "replace", text });
  }
  const unknown = [...entries.keys()].filter((k) => !known.has(k));
  const exportedAt = typeof d.exportedAt === "string" ? d.exportedAt : null;
  if (!items.length) return { ok: false, error: "This backup doesn't contain anything RipTide can restore.", items };
  const bad = items.filter((i) => i.status === "invalid");
  if (bad.length) return { ok: false, error: `Nothing was restored: ${bad.map((b) => b.label).join(", ")} ${bad.length === 1 ? "isn't" : "aren't"} valid.`, items };
  return { ok: true, items, unknown, exportedAt };
}

/**
 * Write a checked plan. All or nothing: if any write fails, every part already written is put
 * back to what it was before, and the error is returned.
 */
export function applyRestore(plan: Extract<RestorePlan, { ok: true }>, store: KeyValueStore): { ok: true; restored: number } | { ok: false; error: string } {
  const todo = plan.items.filter((i): i is Extract<RestoreItem, { text: string }> => i.status === "replace");
  const before = new Map<string, string | null>();
  for (const i of todo) {
    try {
      before.set(i.key, store.get(i.key));
    } catch {
      return { ok: false, error: "Couldn't read the current data, so nothing was restored." };
    }
  }
  const written: string[] = [];
  try {
    for (const i of todo) {
      store.set(i.key, i.text);
      written.push(i.key);
    }
  } catch {
    for (const k of written.reverse()) {
      const prev = before.get(k) ?? null;
      try {
        if (prev === null) store.remove(k);
        else store.set(k, prev);
      } catch {
        /* best effort: the previous value was smaller, so this normally succeeds */
      }
    }
    return { ok: false, error: "This device ran out of storage space while restoring, so nothing was changed." };
  }
  return { ok: true, restored: todo.length };
}
