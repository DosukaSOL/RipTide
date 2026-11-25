import { z } from "zod";
import { uid } from "./ids";
import { MAP_ID } from "./map";
import { dist, formatDistance, orderStops, pathLength, ROUTE_METHOD, type Pt } from "./routes";

/**
 * Today: goals a player sets themselves, sessions to work through them, and routes between
 * places. Everything is entered by the player. RipTide never reads the game, never marks
 * anything done on its own, and never invents objectives, rewards or travel times.
 *
 * Goals point at places with a PlaceRef: the place's stable id plus its coordinates in map
 * metres, so they don't depend on the map background, and survive if the place data changes.
 */

const Text = (max: number) => z.string().max(max).transform((s) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ""));

export const PlaceRef = z.object({
  /** Map record id (community place or personal marker). */
  placeId: z.string().max(80),
  /** Name when it was added, shown if the place is no longer in the data. */
  label: Text(120),
  x: z.number().finite(),
  y: z.number().finite(),
  map: z.string().max(40).default(MAP_ID),
});
export type PlaceRef = z.infer<typeof PlaceRef>;

export const GOAL_TYPES = [
  { id: "discover", label: "Discover", minutes: 10 },
  { id: "cleanup", label: "Clean up", minutes: 15 },
  { id: "vehicle", label: "Vehicle hunt", minutes: 20 },
  { id: "quest", label: "Mission or task", minutes: 30 },
  { id: "photo", label: "Photo", minutes: 10 },
  { id: "other", label: "Other", minutes: 15 },
] as const;
export type GoalType = (typeof GOAL_TYPES)[number]["id"];
export const GoalTypeEnum = z.enum(GOAL_TYPES.map((t) => t.id) as [GoalType, ...GoalType[]]);
export const goalType = (id: string) => GOAL_TYPES.find((t) => t.id === id) ?? GOAL_TYPES[GOAL_TYPES.length - 1]!;

export const Objective = z.object({
  id: z.string().max(40),
  /** The map playthrough this goal belongs to. */
  profileId: z.string().max(40).default("main"),
  title: Text(120),
  type: GoalTypeEnum.default("other"),
  place: PlaceRef.optional(),
  priority: z.enum(["high", "normal", "low"]).default("normal"),
  /** The player's own estimate, in minutes. */
  estimateMin: z.number().int().min(1).max(600).optional(),
  status: z.enum(["planned", "in-progress", "done"]).default("planned"),
  notes: Text(1000).default(""),
  createdAt: z.number(),
  completedAt: z.number().optional(),
  revision: z.number().int().min(0).default(0),
});
export type Objective = z.infer<typeof Objective>;

export const Session = z.object({
  id: z.string().max(40),
  profileId: z.string().max(40).default("main"),
  budgetMin: z.number().int().min(5).max(720),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  /** Goals queued for this session, in order. */
  queue: z.array(z.string().max(40)).max(50).default([]),
  /** Goals ticked off during this session. */
  completed: z.array(z.string().max(40)).max(50).default([]),
  notes: Text(2000).default(""),
  revision: z.number().int().min(0).default(0),
});
export type Session = z.infer<typeof Session>;

export const Route = z.object({
  id: z.string().max(40),
  profileId: z.string().max(40).default("main"),
  name: Text(80),
  stops: z.array(PlaceRef).max(60).default([]),
  /** Distances are straight lines between stops: no road data exists. */
  method: z.literal(ROUTE_METHOD).default(ROUTE_METHOD),
  map: z.string().max(40).default(MAP_ID),
  createdAt: z.number(),
  revision: z.number().int().min(0).default(0),
});
export type Route = z.infer<typeof Route>;

export const JourneyState = z.object({
  objectives: z.array(Objective).max(1000).default([]),
  sessions: z.array(Session).max(200).default([]),
  routes: z.array(Route).max(100).default([]),
  activeSessionId: z.string().max(40).default(""),
  /** Route drawn on the map, if any. */
  shownRouteId: z.string().max(40).default(""),
  /** Planner choices, remembered between visits. */
  plan: z
    .object({
      budgetMin: z.number().int().min(5).max(720).default(60),
      focus: z.array(GoalTypeEnum).max(6).default([]),
    })
    .default({}),
});
export type JourneyState = z.infer<typeof JourneyState>;

export function createObjective(input: { title: string; type?: GoalType; place?: PlaceRef; priority?: Objective["priority"]; estimateMin?: number; profileId: string }, now = Date.now()): Objective {
  return Objective.parse({ id: uid(), createdAt: now, ...input, title: input.title.trim().slice(0, 120) || "Untitled goal" });
}

/** A place on the map as a PlaceRef. */
export const placeRef = (r: { id: string; title: string; x: number; y: number }): PlaceRef => PlaceRef.parse({ placeId: r.id, label: r.title, x: r.x, y: r.y });

/** Goal type for a map category: a sensible default the player can change. */
export function typeForCategory(category: string): GoalType {
  if (category === "garages") return "vehicle";
  if (category === "collectibles") return "cleanup";
  return "discover";
}

export interface Suggestion {
  objective: Objective;
  minutes: number;
  /** Where the minutes come from: the player's estimate, or RipTide's rough default for the type. */
  minutesFrom: "yours" | "rough";
  reasons: string[];
  /** Straight-line metres from the previous stop with a place, when both have one. */
  legM?: number;
}

export interface Plan {
  picks: Suggestion[];
  totalMin: number;
  /** Open goals that didn't fit in the time. */
  leftOut: number;
  /** Straight-line length through the picks that have places, in order. */
  routeM: number;
}

const PRIORITY = { high: 3, normal: 2, low: 1 } as const;

/**
 * Picks open goals for a time budget, highest value first, then orders the ones with places to
 * shorten the straight-line path. Deterministic for the same input. Never adds a goal the player
 * didn't create, and gives the reason for each pick.
 */
export function suggest(objectives: Objective[], opts: { profileId: string; budgetMin: number; focus?: GoalType[]; from?: Pt; fromLabel?: string; found?: ReadonlySet<string> }): Plan {
  const focus = new Set(opts.focus ?? []);
  const open = objectives.filter((o) => o.profileId === opts.profileId && o.status !== "done");
  const score = (o: Objective) => PRIORITY[o.priority] * 100 + (focus.has(o.type) ? 60 : 0) + (o.status === "in-progress" ? 40 : 0);
  const ranked = [...open].sort((a, b) => score(b) - score(a) || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const minutes = (o: Objective) => o.estimateMin ?? goalType(o.type).minutes;

  const chosen: Objective[] = [];
  let total = 0;
  for (const o of ranked) {
    const m = minutes(o);
    if (total + m <= opts.budgetMin || chosen.length === 0) {
      chosen.push(o);
      total += m;
    }
  }

  // Order goals with places along a short straight-line path; goals without places go last.
  const placed = chosen.filter((o) => o.place);
  const unplaced = chosen.filter((o) => !o.place);
  const order = orderStops(placed.map((o) => o.place!), { start: opts.from });
  const ordered = [...order.map((i) => placed[i]!), ...unplaced];

  let prev: Pt | undefined = opts.from;
  const picks = ordered.map((o): Suggestion => {
    const reasons: string[] = [];
    if (o.priority === "high") reasons.push("High priority");
    if (focus.has(o.type)) reasons.push(`You chose ${goalType(o.type).label.toLowerCase()}`);
    if (o.status === "in-progress") reasons.push("Already started");
    let legM: number | undefined;
    if (o.place && prev) {
      legM = dist(prev, o.place);
      reasons.push(`${formatDistance(legM)} in a straight line from ${prev === opts.from ? opts.fromLabel ?? "where you started" : "the previous stop"}`);
    }
    if (o.place && opts.found?.has(o.place.placeId)) reasons.push("This place is marked found on the map");
    if (!reasons.length) reasons.push("Your oldest open goal");
    if (o.place) prev = o.place;
    return { objective: o, minutes: minutes(o), minutesFrom: o.estimateMin ? "yours" : "rough", reasons, legM };
  });

  return {
    picks,
    totalMin: total,
    leftOut: open.length - chosen.length,
    routeM: pathLength(ordered.filter((o) => o.place).map((o) => o.place!), opts.from),
  };
}

/** Where the last finished goal with a place was: a sensible start for the next session. */
export function lastFinishedPlace(objectives: Objective[], profileId: string): PlaceRef | undefined {
  let best: Objective | undefined;
  for (const o of objectives) if (o.profileId === profileId && o.status === "done" && o.place && (o.completedAt ?? 0) > (best?.completedAt ?? -1)) best = o;
  return best?.place;
}

/** Summary shown when a session ends. Counts only what the player ticked off. */
export function debrief(session: Session, objectives: Objective[], now = Date.now()) {
  const byId = new Map(objectives.map((o) => [o.id, o]));
  const done = session.completed.map((id) => byId.get(id)).filter((o): o is Objective => !!o);
  const open = session.queue.filter((id) => !session.completed.includes(id)).map((id) => byId.get(id)).filter((o): o is Objective => !!o && o.status !== "done");
  const minutes = Math.max(0, Math.round(((session.endedAt ?? now) - session.startedAt) / 60000));
  return { done, open, minutes, overBudget: minutes > session.budgetMin };
}

/** A route's stops in a shorter straight-line order. */
export function optimiseRoute(route: Route): Route {
  const order = orderStops(route.stops);
  return { ...route, stops: order.map((i) => route.stops[i]!), revision: route.revision + 1 };
}

/** The portable file for a route: RipTide's own JSON (no GPX: there's no real-world coordinate system). */
export function exportRoute(route: Route): string {
  return JSON.stringify(
    {
      format: "riptide-route",
      schema: 1,
      name: route.name,
      map: route.map,
      method: route.method,
      units: "map metres",
      stops: route.stops.map((s) => ({ id: s.placeId, name: s.label, x: Math.round(s.x * 10) / 10, y: Math.round(s.y * 10) / 10 })),
      straightLineMetres: Math.round(pathLength(route.stops)),
    },
    null,
    2,
  );
}
