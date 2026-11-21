/**
 * Rulebook: write server rules in plain English. Riptide turns the lines it
 * understands into enforceable config, keeps the rest as player-facing
 * guidance, and publishes one consistent rules page plus a Discord post.
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
  /** Short readable description of what Riptide will enforce. */
  effect: string;
}

export interface CompiledRulebook {
  rules: RuleLine[];
  enforced: number;
  guidance: number;
}

const ACTIVITY_WORDS = "pvp|fighting|weapons|guns|vehicles|driving|robberies|robbery|crime|stealing|parking";

type Matcher = (text: string) => Enforcement | null;

const slug = (s: string) => s.trim().toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const singular = (s: string) => s.replace(/(ies)$/, "y").replace(/(?<!s)s$/, "");

function to24h(t: string): string {
  const m = t.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return t.trim();
  let h = Number(m[1]);
  const min = m[2] ?? "00";
  if (m[3] === "pm" && h < 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${min}`;
}

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
    return m ? { kind: "time-window", subject: slug(m[1]!), action: slug(m[2]!), from: to24h(m[3]!), to: to24h(m[4]!) } : null;
  },
  (t) => {
    const m = t.match(/^(?:wait |cooldown of )?(\d+) (minutes?|hours?) (?:cooldown )?(?:between|on|after) (.+)$/i);
    if (!m) return null;
    return { kind: "cooldown", activity: slug(m[3]!), minutes: Number(m[1]) * (m[2]!.startsWith("hour") ? 60 : 1) };
  },
  (t) => {
    const m = t.match(/^restart(?:s)? (?:every day |daily |each day )?at (.+)$/i);
    if (!m) return null;
    const times = m[1]!.split(/,|\band\b/).map((s) => s.trim()).filter(Boolean).map(to24h);
    return times.every((x) => /^\d{2}:\d{2}$/.test(x)) ? { kind: "schedule", action: "restart", times } : null;
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
    for (const m of matchers) {
      enforcement = m(clean);
      if (enforcement) break;
    }
    rules.push({ line: idx + 1, section, text, enforcement, effect: enforcement ? describe(enforcement) : "Shown to players. Staff handle it." });
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
    list.forEach((r, i) => (md += `${i + 1}. ${r.text}${r.enforcement ? " *(automatic)*" : ""}\n`));
  }
  return md;
}

export function renderDiscordEmbed(serverName: string, compiled: CompiledRulebook, color = 0xff4f9a) {
  const sections = new Map<string, RuleLine[]>();
  compiled.rules.forEach((r) => sections.set(r.section, [...(sections.get(r.section) ?? []), r]));
  return {
    embeds: [
      {
        title: `${serverName} rules`,
        color,
        fields: [...sections].slice(0, 25).map(([name, list]) => ({
          name,
          value: list.map((r, i) => `**${i + 1}.** ${r.text}`).join("\n").slice(0, 1024),
        })),
        footer: { text: `${compiled.enforced} rules are enforced automatically` },
      },
    ],
  };
}
