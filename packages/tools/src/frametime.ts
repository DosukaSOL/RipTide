/**
 * ViceLab frame-time analysis.
 *
 * RipTide does not capture frames itself (that needs a native capture tool).
 * It reads captures from established recorders and computes honest statistics.
 * Supported: PresentMon / OCAT / FrameView CSV, CapFrameX JSON, MangoHud CSV,
 * and a plain list of frame times in milliseconds.
 */

export type CaptureSource = "presentmon" | "capframex" | "mangohud" | "plain";

/**
 * What the frame times measure.
 * - presented: time between the game handing frames to the display pipeline (PresentMon's
 *   MsBetweenPresents, MangoHud's frametime). This is what most tools call "FPS".
 * - displayed: time between frames actually changing on screen (MsBetweenDisplayChange). It
 *   includes frame generation and leaves out frames that never reached the screen.
 */
export type FrameMetric = "presented" | "displayed";

export interface ParsedCapture {
  source: CaptureSource;
  /** Frame times for `metric`. */
  frametimesMs: number[];
  metric: FrameMetric;
  /** Displayed frame times, when the capture also records them next to presented ones. */
  displayedMs?: number[];
  /** Rows that were skipped because they weren't valid frame times. */
  skipped: number;
  /** Rows left out because they came from another process or swap chain. */
  filtered: number;
  /** Plain-language notes about choices made while reading the file. */
  notes: string[];
}

export interface FrameStats {
  frames: number;
  durationS: number;
  /** Frames rendered divided by elapsed time. */
  avgFps: number;
  /** Average FPS across the slowest 1% of frames. */
  low1Fps: number;
  /** Average FPS across the slowest 0.1% of frames. */
  low01Fps: number;
  p50Ms: number;
  p99Ms: number;
  /** Standard deviation of frame times: lower is steadier. */
  stddevMs: number;
  maxMs: number;
}

export const LIMITS = {
  /** Longest single frame we accept, in ms. Anything longer is a pause, not a frame. */
  maxFrameMs: 5000,
  maxFrames: 2_000_000,
  maxBytes: 50 * 1024 * 1024,
  minFrames: 30,
};

export class CaptureError extends Error {}

/** Presented frame-time columns, most specific first. */
const PRESENT_COLUMNS = ["msbetweenpresents", "frametime", "frametime_ms", "frametimems", "ms"];
const DISPLAY_COLUMN = "msbetweendisplaychange";

function splitLine(line: string, delim: string): string[] {
  if (!line.includes('"')) return line.split(delim);
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (ch === delim && !q) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const norm = (s: string) => s.trim().replace(/^﻿/, "").replace(/^"|"$/g, "").toLowerCase().replace(/[\s()]/g, "");

function validFrame(n: number) {
  return Number.isFinite(n) && n > 0 && n <= LIMITS.maxFrameMs;
}

const cell = (cells: string[], i: number) => (i < 0 ? "" : (cells[i] ?? "").trim().replace(/^"|"$/g, ""));
/** Numbers written with a decimal comma (European locales, ";" separated files) are read too. */
const num = (s: string, delim: string) => Number(delim === ";" ? s.replace(",", ".") : s);

function parseCsv(text: string): ParsedCapture {
  const lines = text.split(/\r?\n/);
  // Find the header: the first line that names a frame-time column. MangoHud puts
  // a system-info preamble before it, so we can't assume line one.
  for (let h = 0; h < Math.min(lines.length, 50); h++) {
    const line = lines[h]!;
    const delim = line.includes(";") && !line.includes(",") ? ";" : line.includes("\t") && !line.includes(",") ? "\t" : ",";
    const cols = splitLine(line, delim).map(norm);
    let present = -1;
    for (const want of PRESENT_COLUMNS) {
      present = cols.indexOf(want);
      if (present >= 0) break;
    }
    const display = cols.indexOf(DISPLAY_COLUMN);
    if (present < 0 && display < 0) continue;
    const source: CaptureSource = cols.includes("msbetweenpresents") || display >= 0 ? "presentmon" : cols.includes("fps") && cols.includes("frametime") ? "mangohud" : "presentmon";
    const notes: string[] = [];

    // PresentMon can record several processes or swap chains in one file (an overlay, a
    // launcher, a second window). Mixing them would double or halve the frame rate, so only
    // the one with the most frames is used.
    const app = cols.indexOf("application");
    const pid = cols.indexOf("processid");
    const swap = cols.indexOf("swapchainaddress");
    const rows: string[][] = [];
    for (let i = h + 1; i < lines.length; i++) {
      const l = lines[i]!;
      if (l.trim()) rows.push(splitLine(l, delim));
      if (rows.length > LIMITS.maxFrames + 1000) throw new CaptureError("This capture has more than 2 million frames. Trim it and try again.");
    }
    let keep: string | null = null;
    let filtered = 0;
    const keyOf = (r: string[]) => `${cell(r, pid)}|${cell(r, swap)}`;
    if (pid >= 0 || swap >= 0) {
      const counts = new Map<string, number>();
      for (const r of rows) counts.set(keyOf(r), (counts.get(keyOf(r)) ?? 0) + 1);
      if (counts.size > 1) {
        keep = [...counts].sort((a, b) => b[1] - a[1])[0]![0];
        filtered = rows.length - counts.get(keep)!;
        const sample = rows.find((r) => keyOf(r) === keep);
        const name = sample ? cell(sample, app) : "";
        notes.push(`This capture has frames from ${counts.size} processes or swap chains. RipTide used the one with the most frames${name ? ` (${name})` : ""} and left out ${filtered} rows from the others.`);
      }
    }

    const out: number[] = [];
    const shown: number[] = [];
    let skipped = 0;
    let notShown = 0;
    const primary = present >= 0 ? present : display;
    for (const r of rows) {
      if (keep !== null && keyOf(r) !== keep) continue;
      const v = num(cell(r, primary), delim);
      if (validFrame(v)) out.push(v);
      else skipped++;
      if (present >= 0 && display >= 0) {
        const d = num(cell(r, display), delim);
        if (validFrame(d)) shown.push(d);
        else if (d === 0) notShown++; // presented but never reached the screen
      }
      if (out.length > LIMITS.maxFrames) throw new CaptureError("This capture has more than 2 million frames. Trim it and try again.");
    }
    const metric: FrameMetric = present >= 0 ? "presented" : "displayed";
    if (metric === "displayed") notes.push("This capture only has displayed frame times (MsBetweenDisplayChange), so the FPS shown is what reached the screen.");
    if (notShown) notes.push(`${notShown} presented frames never reached the screen.`);
    const result: ParsedCapture = { source, frametimesMs: out, metric, skipped, filtered, notes };
    if (shown.length >= LIMITS.minFrames) result.displayedMs = shown;
    return result;
  }
  return parsePlain(text);
}

function parsePlain(text: string): ParsedCapture {
  const out: number[] = [];
  let skipped = 0;
  for (const raw of text.split(/[\r\n]+/)) {
    const t = raw.trim();
    if (!t) continue;
    const v = Number(t.replace(",", "."));
    if (validFrame(v)) out.push(v);
    else skipped++;
    if (out.length > LIMITS.maxFrames) throw new CaptureError("This capture has more than 2 million frames. Trim it and try again.");
  }
  return { source: "plain", frametimesMs: out, metric: "presented", skipped, filtered: 0, notes: [] };
}

function parseJson(text: string): ParsedCapture {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new CaptureError("This file looks like JSON but couldn't be read. Is it complete?");
  }
  const runs = (data as { Runs?: unknown })?.Runs;
  if (Array.isArray(runs)) {
    // Separate runs are separate measurements (often different scenes). They're never joined:
    // the first run with frame times is used, and the note says so.
    const usable = runs.filter((run) => Array.isArray((run as { CaptureData?: { MsBetweenPresents?: unknown } })?.CaptureData?.MsBetweenPresents));
    const first = usable[0] as { CaptureData: { MsBetweenPresents: unknown[]; MsBetweenDisplayChange?: unknown } } | undefined;
    if (first) {
      const out: number[] = [];
      let skipped = 0;
      for (const v of first.CaptureData.MsBetweenPresents) {
        const n = Number(v);
        if (validFrame(n)) out.push(n);
        else skipped++;
        if (out.length > LIMITS.maxFrames) throw new CaptureError("This capture has more than 2 million frames. Trim it and try again.");
      }
      const notes = usable.length > 1 ? [`This file has ${usable.length} runs. RipTide imported the first one; import the others separately so they aren't mixed.`] : [];
      const result: ParsedCapture = { source: "capframex", frametimesMs: out, metric: "presented", skipped, filtered: 0, notes };
      const disp = first.CaptureData.MsBetweenDisplayChange;
      if (Array.isArray(disp)) {
        const shown = disp.map(Number).filter(validFrame);
        if (shown.length >= LIMITS.minFrames) result.displayedMs = shown;
      }
      if (out.length) return result;
    }
  }
  throw new CaptureError("RipTide couldn't find frame times in this JSON. CapFrameX captures are supported.");
}

/** Parse a capture file's text. Throws CaptureError with a readable message. */
export function parseCapture(text: string, filename = ""): ParsedCapture {
  if (text.length > LIMITS.maxBytes) throw new CaptureError("This file is larger than 50 MB. Trim the capture and try again.");
  const trimmed = text.trimStart();
  const result = trimmed.startsWith("{") || /\.json$/i.test(filename) ? parseJson(text) : parseCsv(text);
  if (result.frametimesMs.length < LIMITS.minFrames) {
    throw new CaptureError(`Only ${result.frametimesMs.length} usable frames found. Record at least a few seconds of gameplay.`);
  }
  return result;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i]!;
}

/** Mean FPS across the slowest `fraction` of frames (e.g. 0.01 for 1% lows). */
function lowFps(sortedDesc: number[], fraction: number): number {
  const n = Math.max(1, Math.floor(sortedDesc.length * fraction));
  let sum = 0;
  for (let i = 0; i < n; i++) sum += sortedDesc[i]!;
  return 1000 / (sum / n);
}

export function computeStats(ft: number[]): FrameStats {
  if (!ft.length) throw new CaptureError("No frames to analyse.");
  let total = 0;
  let max = 0;
  for (const v of ft) {
    total += v;
    if (v > max) max = v;
  }
  const mean = total / ft.length;
  let varSum = 0;
  for (const v of ft) varSum += (v - mean) ** 2;
  const asc = [...ft].sort((a, b) => a - b);
  const desc = [...asc].reverse();
  const r = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
  return {
    frames: ft.length,
    durationS: r(total / 1000, 2),
    avgFps: r((ft.length * 1000) / total),
    low1Fps: r(lowFps(desc, 0.01)),
    low01Fps: r(lowFps(desc, 0.001)),
    p50Ms: r(percentile(asc, 50), 2),
    p99Ms: r(percentile(asc, 99), 2),
    stddevMs: r(Math.sqrt(varSum / ft.length), 2),
    maxMs: r(max, 2),
  };
}

/** Reduce a long series to at most `buckets` points for charting, keeping spikes visible. */
export function downsample(ft: number[], buckets = 1200): { t: number; avg: number; max: number }[] {
  const out: { t: number; avg: number; max: number }[] = [];
  const size = Math.max(1, Math.ceil(ft.length / buckets));
  let elapsed = 0;
  for (let i = 0; i < ft.length; i += size) {
    let sum = 0;
    let max = 0;
    const end = Math.min(ft.length, i + size);
    for (let j = i; j < end; j++) {
      sum += ft[j]!;
      if (ft[j]! > max) max = ft[j]!;
    }
    elapsed += sum;
    out.push({ t: elapsed / 1000, avg: sum / (end - i), max });
  }
  return out;
}

// ---------- Recommendations from the user's own runs ----------

export type Priority = "balanced" | "performance" | "quality";
export const PRESET_RANK: Record<string, number> = { low: 1, medium: 2, high: 3, ultra: 4 };

export interface RunSummary {
  id: string;
  game: string;
  preset: string;
  stats: Pick<FrameStats, "avgFps" | "low1Fps">;
  /** The hardware profile the run was made on. Runs on different hardware are never compared. */
  hardwareId?: string;
  /** The test scene. Runs of different scenes are never compared. */
  scene?: string;
  /** Screen resolution, from the hardware profile. */
  resolution?: string;
  metric?: FrameMetric;
}

export interface Recommendation {
  run: RunSummary;
  reason: string;
  /** "low" when the runs can't be confirmed comparable, or each preset was measured once. */
  confidence: "low" | "ok";
  /** Why confidence is low, in plain language. */
  caveats: string[];
  /** Runs of this game left out because they were made on other hardware, scenes or resolutions. */
  excluded: number;
  /** The runs that were compared. */
  compared: string[];
}

/** Runs are only comparable when the hardware, scene, resolution and frame metric match. */
export function comparisonKey(r: RunSummary): string {
  return [r.hardwareId ?? "", (r.scene ?? "").trim().toLowerCase(), (r.resolution ?? "").trim().toLowerCase(), r.metric ?? "presented"].join("|");
}

/**
 * Pick the best of the user's runs for a game. Only ever chooses between real measurements that
 * can be compared: same hardware profile, scene, resolution and frame metric. A 1080p run is
 * never recommended against a 4K one. Returns null when no comparable set has two presets.
 */
export function recommend(runs: RunSummary[], game: string, priority: Priority, targetFps = 60): Recommendation | null {
  const all = runs.filter((r) => r.game === game && PRESET_RANK[r.preset] !== undefined);
  const groups = new Map<string, RunSummary[]>();
  for (const r of all) groups.set(comparisonKey(r), [...(groups.get(comparisonKey(r)) ?? []), r]);
  // The comparable set with the most presets measured, then the most runs.
  const presetsIn = (g: RunSummary[]) => new Set(g.map((r) => r.preset)).size;
  const best = [...groups.values()].filter((g) => presetsIn(g) >= 2).sort((a, b) => presetsIn(b) - presetsIn(a) || b.length - a.length)[0];
  if (!best) return null;
  const pool = best;
  const caveats: string[] = [];
  const sample = pool[0]!;
  if (!sample.hardwareId) caveats.push("These runs have no hardware profile, so RipTide can't confirm they were made on the same PC.");
  if (!sample.scene?.trim()) caveats.push("These runs don't name a test scene, so RipTide can't confirm they tested the same place.");
  const perPreset = new Map<string, number>();
  pool.forEach((r) => perPreset.set(r.preset, (perPreset.get(r.preset) ?? 0) + 1));
  if ([...perPreset.values()].some((n) => n < 2)) caveats.push("Some presets were measured only once. Repeat each run to rule out a one-off.");
  const base = { confidence: caveats.length ? ("low" as const) : ("ok" as const), caveats, excluded: all.length - pool.length, compared: pool.map((r) => r.id) };

  const rank = (r: RunSummary) => PRESET_RANK[r.preset]!;
  if (priority === "performance") {
    const top = [...pool].sort((a, b) => b.stats.low1Fps - a.stats.low1Fps)[0]!;
    return { run: top, reason: `Smoothest of your comparable runs: ${top.stats.low1Fps} FPS in the slowest 1% of frames.`, ...base };
  }
  const floor = priority === "quality" ? targetFps * 0.75 : targetFps;
  const lowFloor = priority === "quality" ? targetFps * 0.5 : targetFps * 0.75;
  const ok = pool.filter((r) => r.stats.avgFps >= floor && r.stats.low1Fps >= lowFloor);
  if (!ok.length) {
    const top = [...pool].sort((a, b) => b.stats.avgFps - a.stats.avgFps)[0]!;
    return { run: top, reason: `None of your comparable runs reached ${floor} FPS on average. This one came closest.`, ...base };
  }
  const top = [...ok].sort((a, b) => rank(b) - rank(a) || b.stats.avgFps - a.stats.avgFps)[0]!;
  return { run: top, reason: `Highest preset that kept ${Math.round(floor)}+ FPS on average with steady lows.`, ...base };
}
