/**
 * Rulebook: write server rules in plain English. Riptide turns the lines it
 * understands into machine-readable rules (written into the build for a future
 * RipTide server runtime), keeps the rest as player-facing guidance, and
 * publishes one consistent rules page plus a Discord post.
 *
 * Nothing here enforces anything in a game yet: no RipTide server runtime ships
 * today. The UI says "parsed, not yet enforced" for that reason.
 */

export type Enforcement =
  | { kind: "zone-flag"; zone: string; flag: string; value: boolean }
  | { kind: "speed-limit"; zone: string; limit: number; unit: "mph" | "kmh" }
  | { kind: "min-online"; role: string; count: number; activity: string }
  | { kind: "group-cap"; group: string; max: number }
  | { kind: "probation"; action: string; hours: number }
  | { kind: "time-window"; subject: string; action: string; from: string; to: string }
  | { kind: "cooldown"; activity: string; minutes: number }
  | { kind: "schedule"; action: "restart"; times: string[] };

export interface RuleLine {
  line: number;
  section: string;
  text: string;
  enforcement: Enforcement | null;
  /** Short readable description of what the rule means once a runtime enforces it. */
  effect: string;
  /** Set when a line looked like a rule Riptide understands but couldn't be read safely (e.g. "25:99"). */
  warning?: string;
}

export interface CompiledRulebook {
  rules: RuleLine[];
  /** Lines turned into machine-readable rules. Not enforced in-game until a runtime exists. */
  enforced: number;
  guidance: number;
}

const ACTIVITY_WORDS = "pvp|fighting|weapons|guns|vehicles|driving|robberies|robbery|crime|stealing|parking";

/** A matcher returns a rule, null (not this kind of rule), or a reason it recognised the rule but rejected it. */
type Matcher = (text: string) => Enforcement | { invalid: string } | null;

const slug = (s: string) => s.trim().toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const singular = (s: string) => s.replace(/(ies)$/, "y").replace(/(?<!s)s$/, "");

/**
 * "9pm" → "21:00", "12am" → "00:00", "23:59" → "23:59". Returns null for anything that
 * isn't a real clock time: hours 0-23 (1-12 with am/pm), minutes 0-59. "24:00", "25:99"
 * and "11:75" are rejected rather than turned into a schedule.
 */
export function to24h(t: string): string | null {
  const m = t.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? "0");
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    if (m[3] === "pm" && h < 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
  } else if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

const badTime = (raw: string) => ({ invalid: `"${raw.trim()}" isn't a valid time (use 0:00-23:59, or 1-12 with am/pm), so this stays a staff rule.` });

const matchers: Matcher[] = [
  (t) => {
    const m = t.match(new RegExp(`^no (${ACTIVITY_WORDS}) (?:in|at|inside|around) (.+)$`, "i"));
    return m ? { kind: "zone-flag", zone: slug(m[2]!), flag: singular(m[1]!.toLowerCase()), value: false } : null;
  },
  (t) => {
    const m = t.match(/speed limit (?:is |of )?(\d+)\s*(mph|kmh|km\/h)? (?:in|on|around) (.+)$/i);
    if (!m) return null;
    const unit = m[2] && m[2].toLowerCase() !== "mph" ? "kmh" : "mph";
    return { kind: "speed-limit", zone: slug(m[3]!), limit: Number(m[1]), unit };
  },
  (t) => {
    const m =
      t.match(/^(?:the )?(\w+?)s? (?:need|needs|require|requires) at least (\d+) (?:\w+ )?online (?:before|for) (.+)$/i) ??
      t.match(/^at least (\d+) (\w+?)s? must be online (?:before|for) (.+)$/i);
    if (!m) return null;
    const [role, count] = /^\d+$/.test(m[1]!) ? [m[2]!, m[1]!] : [m[1]!, m[2]!];
    return { kind: "min-online", role: slug(singular(role)), count: Number(count), activity: slug(m[3]!) };
  },
  (t) => {
    const m = t.match(/^max(?:imum)? (?:of )?(\d+) (?:members|people|players) (?:per|in a|in each) (\w+)$/i);
    return m ? { kind: "group-cap", group: slug(m[2]!), max: Number(m[1]) } : null;
  },
  (t) => {
    const m = t.match(/^new players (?:can't|cannot|can not|may not) (.+?) for (?:the first |their first )?(\d+) (hours?|days?)$/i);
    if (!m) return null;
    const hours = Number(m[2]) * (m[3]!.startsWith("day") ? 24 : 1);
    return { kind: "probation", action: slug(m[1]!), hours };
  },
  (t) => {
    const m = t.match(/^(?:the )?(.+?) (?:can't|cannot|can not|may not) (.+?) (?:between|from) ([\d:]+\s*(?:am|pm)?) (?:and|to|-) ([\d:]+\s*(?:am|pm)?)$/i);
    if (!m) return null;
    const from = to24h(m[3]!);
    const to = to24h(m[4]!);
    if (!from) return badTime(m[3]!);
    if (!to) return badTime(m[4]!);
    return { kind: "time-window", subject: slug(m[1]!), action: slug(m[2]!), from, to };
  },
  (t) => {
    const m = t.match(/^(?:wait |cooldown of )?(\d+) (minutes?|hours?) (?:cooldown )?(?:between|on|after) (.+)$/i);
    if (!m) return null;
    return { kind: "cooldown", activity: slug(m[3]!), minutes: Number(m[1]) * (m[2]!.startsWith("hour") ? 60 : 1) };
  },
  (t) => {
    const m = t.match(/^restart(?:s)? (?:every day |daily |each day )?at (.+)$/i);
    if (!m) return null;
    const raw = m[1]!.split(/,|\band\b/).map((s) => s.trim()).filter(Boolean);
    if (!raw.length) return null;
    const times: string[] = [];
    for (const r of raw) {
      const t24 = to24h(r);
      if (!t24) return badTime(r);
      times.push(t24);
    }
    return { kind: "schedule", action: "restart", times: [...new Set(times)].sort() };
  },
];

export function describe(e: Enforcement): string {
  switch (e.kind) {
    case "zone-flag":
      return `Turns off ${e.flag} in zone "${e.zone}"`;
    case "speed-limit":
      return `Flags drivers over ${e.limit} ${e.unit} in "${e.zone}"`;
    case "min-online":
      return `Blocks ${e.activity.replace(/-/g, " ")} until ${e.count} ${e.role} players are online`;
    case "group-cap":
      return `Caps each ${e.group} at ${e.max} members`;
    case "probation":
      return `New players can't ${e.action.replace(/-/g, " ")} for ${e.hours}h of playtime`;
    case "time-window":
      return `${cap(e.subject.replace(/-/g, " "))} can't ${e.action.replace(/-/g, " ")} from ${e.from} to ${e.to}`;
    case "cooldown":
      return `${e.minutes} min cooldown on ${e.activity.replace(/-/g, " ")}`;
    case "schedule":
      return `Restarts at ${e.times.join(", ")}`;
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function compileRulebook(source: string): CompiledRulebook {
  const rules: RuleLine[] = [];
  let section = "General";
  source.split(/\r?\n/).forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) return;
    if (line.startsWith("#")) {
      section = line.replace(/^#+\s*/, "") || section;
      return;
    }
    const text = line.replace(/^[-*•]\s*/, "").replace(/^\d+[.)]\s*/, "");
    const clean = text.replace(/[.!]+$/, "");
    let enforcement: Enforcement | null = null;
    let warning: string | undefined;
    for (const m of matchers) {
      const r = m(clean);
      if (!r) continue;
      if ("invalid" in r) warning = r.invalid;
      else enforcement = r;
      break;
    }
    rules.push({ line: idx + 1, section, text, enforcement, effect: enforcement ? describe(enforcement) : "Shown to players. Staff handle it.", ...(warning ? { warning } : {}) });
  });
  const enforced = rules.filter((r) => r.enforcement).length;
  return { rules, enforced, guidance: rules.length - enforced };
}

/** The public rules page, grouped by section and numbered per section. */
export function renderRulesMarkdown(serverName: string, compiled: CompiledRulebook): string {
  const sections = new Map<string, RuleLine[]>();
  compiled.rules.forEach((r) => sections.set(r.section, [...(sections.get(r.section) ?? []), r]));
  let md = `# ${serverName} rules\n`;
  for (const [name, list] of sections) {
    md += `\n## ${name}\n\n`;
    list.forEach((r, i) => (md += `${i + 1}. ${r.text}\n`));
  }
  return md;
}

const FIELD_MAX = 1024;
const EMBED_FIELDS = 25;
const EMBED_CHARS = 5500; // Discord allows 6000 per embed; keep room for the title
const MESSAGE_EMBEDS = 10;

/**
 * Discord messages for the rules. Long sections are split into "(continued)" fields
 * instead of being cut off, and fields are spread over as many embeds and messages
 * as Discord's limits need. Every rule appears exactly once.
 */
export function renderDiscordMessages(serverName: string, compiled: CompiledRulebook, color = 0xff4f9a) {
  const sections = new Map<string, RuleLine[]>();
  compiled.rules.forEach((r) => sections.set(r.section, [...(sections.get(r.section) ?? []), r]));
  const fields: { name: string; value: string }[] = [];
  for (const [name, list] of sections) {
    let value = "";
    let part = 0;
    const flush = () => {
      if (!value) return;
      fields.push({ name: (part++ ? `${name} (continued)` : name).slice(0, 256), value });
      value = "";
    };
    list.forEach((r, i) => {
      let line = `**${i + 1}.** ${r.text}`;
      if (line.length > FIELD_MAX) line = `${line.slice(0, FIELD_MAX - 1)}…`; // a single rule longer than a field
      if (value && value.length + 1 + line.length > FIELD_MAX) flush();
      value = value ? `${value}\n${line}` : line;
    });
    flush();
  }
  const embeds: { title: string; color: number; fields: { name: string; value: string }[] }[] = [];
  let cur: (typeof embeds)[number] | null = null;
  let chars = 0;
  for (const f of fields) {
    const size = f.name.length + f.value.length;
    if (!cur || cur.fields.length >= EMBED_FIELDS || chars + size > EMBED_CHARS) {
      cur = { title: embeds.length ? `${serverName} rules (continued)` : `${serverName} rules`, color, fields: [] };
      embeds.push(cur);
      chars = cur.title.length;
    }
    cur.fields.push(f);
    chars += size;
  }
  if (!embeds.length) embeds.push({ title: `${serverName} rules`, color, fields: [] });
  const messages: { embeds: typeof embeds }[] = [];
  for (let i = 0; i < embeds.length; i += MESSAGE_EMBEDS) messages.push({ embeds: embeds.slice(i, i + MESSAGE_EMBEDS) });
  return messages;
}

/** The first Discord message. Kept for existing callers; use renderDiscordMessages to post everything. */
export function renderDiscordEmbed(serverName: string, compiled: CompiledRulebook, color = 0xff4f9a) {
  return renderDiscordMessages(serverName, compiled, color)[0]!;
}
