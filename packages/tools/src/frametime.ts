/**
 * ViceLab frame-time analysis.
 *
 * RipTide does not capture frames itself (that needs a native capture tool).
 * It reads captures from established recorders and computes honest statistics.
 * Supported: PresentMon / OCAT / FrameView CSV, CapFrameX JSON, MangoHud CSV,
 * and a plain list of frame times in milliseconds.
 */

export type CaptureSource = "presentmon" | "capframex" | "mangohud" | "plain";

export interface ParsedCapture {
  source: CaptureSource;
  frametimesMs: number[];
  /** Rows that were skipped because they weren't valid frame times. */
  skipped: number;
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

const FRAME_COLUMNS = ["msbetweenpresents", "frametime", "frametime_ms", "frametimems", "ms", "msbetweendisplaychange"];

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

function parseCsv(text: string): ParsedCapture {
  const lines = text.split(/\r?\n/);
  // Find the header: the first line that names a frame-time column. MangoHud puts
  // a system-info preamble before it, so we can't assume line one.
  for (let h = 0; h < Math.min(lines.length, 50); h++) {
    const line = lines[h]!;
    const delim = line.includes(";") && !line.includes(",") ? ";" : line.includes("\t") && !line.includes(",") ? "\t" : ",";
    const cols = splitLine(line, delim).map(norm);
    // Prefer the most specific column when several exist.
    let idx = -1;
    for (const want of FRAME_COLUMNS) {
      idx = cols.indexOf(want);
      if (idx >= 0) break;
    }
    if (idx < 0) continue;
    const source: CaptureSource = cols.includes("msbetweenpresents") ? "presentmon" : cols.includes("fps") && cols.includes("frametime") ? "mangohud" : "presentmon";
    const out: number[] = [];
    let skipped = 0;
    for (let i = h + 1; i < lines.length; i++) {
      const l = lines[i]!;
      if (!l.trim()) continue;
      const v = Number(splitLine(l, delim)[idx]?.trim().replace(/^"|"$/g, ""));
      if (validFrame(v)) out.push(v);
      else skipped++;
      if (out.length > LIMITS.maxFrames) throw new CaptureError("This capture has more than 2 million frames. Trim it and try again.");
    }
    return { source, frametimesMs: out, skipped };
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
  return { source: "plain", frametimesMs: out, skipped };
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
    const out: number[] = [];
    let skipped = 0;
    for (const run of runs) {
      const arr = (run as { CaptureData?: { MsBetweenPresents?: unknown } })?.CaptureData?.MsBetweenPresents;
      if (!Array.isArray(arr)) continue;
      for (const v of arr) {
        const n = Number(v);
        if (validFrame(n)) out.push(n);
        else skipped++;
        if (out.length > LIMITS.maxFrames) throw new CaptureError("This capture has more than 2 million frames. Trim it and try again.");
      }
    }
    if (out.length) return { source: "capframex", frametimesMs: out, skipped };
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
}

export interface Recommendation {
  run: RunSummary;
  reason: string;
}

/**
 * Pick the best of the user's runs for a game. Only ever chooses between real
 * measurements; returns null when there isn't enough to compare.
 */
export function recommend(runs: RunSummary[], game: string, priority: Priority, targetFps = 60): Recommendation | null {
  const pool = runs.filter((r) => r.game === game && PRESET_RANK[r.preset] !== undefined);
  if (pool.length < 2) return null;
  const rank = (r: RunSummary) => PRESET_RANK[r.preset]!;
  if (priority === "performance") {
    const best = [...pool].sort((a, b) => b.stats.low1Fps - a.stats.low1Fps)[0]!;
    return { run: best, reason: `Smoothest of your runs: ${best.stats.low1Fps} FPS in the slowest 1% of frames.` };
  }
  const floor = priority === "quality" ? targetFps * 0.75 : targetFps;
  const lowFloor = priority === "quality" ? targetFps * 0.5 : targetFps * 0.75;
  const ok = pool.filter((r) => r.stats.avgFps >= floor && r.stats.low1Fps >= lowFloor);
  if (!ok.length) {
    const best = [...pool].sort((a, b) => b.stats.avgFps - a.stats.avgFps)[0]!;
    return { run: best, reason: `None of your runs reached ${floor} FPS on average. This one came closest.` };
  }
  const best = [...ok].sort((a, b) => rank(b) - rank(a) || b.stats.avgFps - a.stats.avgFps)[0]!;
  return { run: best, reason: `Highest preset that kept ${Math.round(floor)}+ FPS on average with steady lows.` };
}
