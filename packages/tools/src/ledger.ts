import { z } from "zod";
import { uid } from "./ids";
import { PlaceRef } from "./journey";

/**
 * Journal and Garage: records the player keeps for themselves. Everything is typed in or picked
 * by the player. RipTide has no vehicle catalogue, prices or game data, and never invents any.
 */

const Text = (max: number) => z.string().max(max).transform((s) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ""));
const Tag = z.string().min(1).max(24).transform((s) => s.trim().toLowerCase());

/* ---------- Journal ---------- */

export const JournalEntry = z.object({
  id: z.string().max(40),
  profileId: z.string().max(40).default("main"),
  kind: z.enum(["note", "milestone"]).default("note"),
  title: Text(120).default(""),
  body: Text(4000).default(""),
  tags: z.array(Tag).max(12).default([]),
  place: PlaceRef.optional(),
  /** A Today goal this entry is about. */
  goalId: z.string().max(40).optional(),
  createdAt: z.number(),
  editedAt: z.number().optional(),
  revision: z.number().int().min(0).default(0),
});
export type JournalEntry = z.infer<typeof JournalEntry>;

export const JournalState = z.object({
  entries: z.array(JournalEntry).max(5000).default([]),
  /** Deleted entries, kept for 30 days so a mistake can be undone. */
  trash: z.array(JournalEntry.extend({ deletedAt: z.number() })).max(500).default([]),
});
export type JournalState = z.infer<typeof JournalState>;

export const TRASH_DAYS = 30;

export function createEntry(input: { profileId: string; title?: string; body?: string; kind?: JournalEntry["kind"]; tags?: string[]; place?: PlaceRef; goalId?: string }, now = Date.now()): JournalEntry {
  return JournalEntry.parse({ id: uid(), createdAt: now, ...input });
}

/** Moves an entry to the trash. */
export function trashEntry(s: JournalState, id: string, now = Date.now()): void {
  const i = s.entries.findIndex((e) => e.id === id);
  if (i < 0) return;
  const [e] = s.entries.splice(i, 1);
  s.trash.unshift({ ...e!, deletedAt: now });
  s.trash = s.trash.slice(0, 500);
}

/** Brings an entry back from the trash. */
export function restoreEntry(s: JournalState, id: string): void {
  const i = s.trash.findIndex((e) => e.id === id);
  if (i < 0) return;
  const [{ deletedAt: _d, ...e }] = s.trash.splice(i, 1) as [JournalState["trash"][number]];
  s.entries.push(e);
}

/** Drops trash older than 30 days. */
export function purgeTrash(s: JournalState, now = Date.now()): void {
  s.trash = s.trash.filter((e) => now - e.deletedAt < TRASH_DAYS * 86400000);
}

/** Entries matching a search: words in the title, body, place or tags (#tag matches a tag exactly). */
export function searchEntries(entries: JournalEntry[], q: string): JournalEntry[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return entries;
  return entries.filter((e) => {
    const text = `${e.title} ${e.body} ${e.place?.label ?? ""}`.toLowerCase();
    return words.every((w) => (w.startsWith("#") ? e.tags.includes(w.slice(1)) : text.includes(w) || e.tags.some((t) => t.includes(w))));
  });
}

/** Tags in use, most used first. */
export function tagCounts(entries: JournalEntry[]): [string, number][] {
  const n = new Map<string, number>();
  for (const e of entries) for (const t of e.tags) n.set(t, (n.get(t) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** The journal as Markdown, for keeping or sharing outside RipTide. */
export function journalMarkdown(entries: JournalEntry[], title = "RipTide journal"): string {
  const out = [`# ${title}`, ""];
  for (const e of [...entries].sort((a, b) => b.createdAt - a.createdAt)) {
    const date = new Date(e.createdAt).toISOString().slice(0, 10);
    out.push(`## ${date}${e.kind === "milestone" ? " · Milestone" : ""}${e.title ? ` · ${e.title}` : ""}`, "");
    if (e.place) out.push(`Place: ${e.place.label}`, "");
    if (e.body) out.push(e.body, "");
    if (e.tags.length) out.push(e.tags.map((t) => `#${t}`).join(" "), "");
  }
  return out.join("\n");
}

/* ---------- Garage ---------- */

export const Vehicle = z.object({
  id: z.string().max(40),
  profileId: z.string().max(40).default("main"),
  name: Text(80),
  ownership: z.enum(["owned", "wanted", "sold"]).default("wanted"),
  /** Where it's kept or where to find it. */
  place: PlaceRef.optional(),
  mods: z.array(Text(60)).max(30).default([]),
  /** What the player paid or expects to pay, in their own numbers. */
  price: z.number().int().min(0).max(1e12).optional(),
  notes: Text(1000).default(""),
  favourite: z.boolean().default(false),
  createdAt: z.number(),
  revision: z.number().int().min(0).default(0),
});
export type Vehicle = z.infer<typeof Vehicle>;

export const Property = z.object({
  id: z.string().max(40),
  profileId: z.string().max(40).default("main"),
  name: Text(80),
  kind: z.enum(["home", "garage", "business", "other"]).default("home"),
  owned: z.boolean().default(false),
  place: PlaceRef.optional(),
  price: z.number().int().min(0).max(1e12).optional(),
  /** Vehicle spaces, if the player wants to track them. */
  spaces: z.number().int().min(0).max(500).optional(),
  notes: Text(1000).default(""),
  createdAt: z.number(),
  revision: z.number().int().min(0).default(0),
});
export type Property = z.infer<typeof Property>;

export const SavingsGoal = z.object({
  id: z.string().max(40),
  profileId: z.string().max(40).default("main"),
  name: Text(80),
  target: z.number().int().min(1).max(1e12),
  saved: z.number().int().min(0).max(1e12).default(0),
  /** What it's for, if it's a vehicle or property in the garage. */
  forId: z.string().max(40).optional(),
  createdAt: z.number(),
  revision: z.number().int().min(0).default(0),
});
export type SavingsGoal = z.infer<typeof SavingsGoal>;

export const GarageState = z.object({
  vehicles: z.array(Vehicle).max(2000).default([]),
  properties: z.array(Property).max(500).default([]),
  savings: z.array(SavingsGoal).max(200).default([]),
});
export type GarageState = z.infer<typeof GarageState>;

export const newVehicle = (input: Omit<z.input<typeof Vehicle>, "id" | "createdAt">, now = Date.now()) => Vehicle.parse({ id: uid(), createdAt: now, ...input });
export const newProperty = (input: Omit<z.input<typeof Property>, "id" | "createdAt">, now = Date.now()) => Property.parse({ id: uid(), createdAt: now, ...input });
export const newSavings = (input: Omit<z.input<typeof SavingsGoal>, "id" | "createdAt">, now = Date.now()) => SavingsGoal.parse({ id: uid(), createdAt: now, ...input });

/** Totals for the garage summary, from the player's own numbers only. */
export function garageTotals(g: GarageState, profileId: string) {
  const v = g.vehicles.filter((x) => x.profileId === profileId);
  const p = g.properties.filter((x) => x.profileId === profileId);
  const spaces = p.filter((x) => x.owned).reduce((s, x) => s + (x.spaces ?? 0), 0);
  const owned = v.filter((x) => x.ownership === "owned").length;
  return {
    owned,
    wanted: v.filter((x) => x.ownership === "wanted").length,
    wantedCost: v.filter((x) => x.ownership === "wanted").reduce((s, x) => s + (x.price ?? 0), 0),
    unpriced: v.filter((x) => x.ownership === "wanted" && x.price === undefined).length,
    spaces,
    /** Only meaningful when the player has entered spaces for their properties. */
    spacesLeft: spaces ? spaces - owned : undefined,
  };
}

/** Parses a typed amount like "1,250,000", "1.25m" or "250k". */
export function parseAmount(text: string): number | null {
  const m = text.trim().toLowerCase().replace(/[$,\s_]/g, "").match(/^(\d+(?:\.\d+)?)([km]?)$/);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] === "m" ? 1e6 : m[2] === "k" ? 1e3 : 1);
  return Number.isFinite(n) && n <= 1e12 ? Math.round(n) : null;
}

export const formatAmount = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
