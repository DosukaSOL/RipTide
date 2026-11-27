import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import {
  validateBlueprint,
  checkCompatibility,
  forecastEconomy,
  compileRulebook,
  renderRulesMarkdown,
  assessReadiness,
  shortCode,
  encodeBlueprint,
  decodeBlueprint,
  diffBlueprints,
  summarizeChange,
  ADAPTERS,
  type Blueprint,
} from "@riptide/core";
import starterBlueprint from "../../../examples/neon-coast.riptide.json";

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const pink = paint("38;2;255;79;154");
const sea = paint("38;2;61;242;208");
const sun = paint("38;2;255;179;107");
const dim = paint("2");
const bold = paint("1");

const HELP = `${pink("riptide")} ${dim("— design a server once, deploy it anywhere")}

${bold("Usage")}
  riptide init [name]            Start a new Blueprint in this folder
  riptide check [file]           Validate, check mods and readiness
  riptide forecast [file]        Simulate 60 days of your economy
  riptide rules [file]           Show which rules Riptide can read
  riptide build [file] [--target fivem|gta6] [--out dir]
  riptide share [file]           Print a share code
  riptide import <code> [file]   Turn a share code into a Blueprint
  riptide diff <a> <b>           Compare two Blueprints

The file defaults to the only *.riptide.json in the current folder.
`;

function fail(msg: string): never {
  console.error(`${pink("✗")} ${msg}`);
  process.exit(1);
}

function findBlueprint(arg?: string): string {
  if (arg) return resolve(arg);
  const files = readdirSync(process.cwd()).filter((f: string) => f.endsWith(".riptide.json"));
  if (files.length === 1) return resolve(files[0]!);
  if (!files.length) fail("No Blueprint here. Run `riptide init` to make one.");
  fail(`Found ${files.length} Blueprints. Say which one: riptide check ${files[0]}`);
}

function load(path: string): Blueprint {
  if (!existsSync(path)) fail(`Can't find ${path}`);
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    fail(`${path} isn't valid JSON: ${(e as Error).message}`);
  }
  const r = validateBlueprint(json);
  if (!r.ok) {
    console.error(`${pink("✗")} ${path} has ${r.issues.length} problem${r.issues.length > 1 ? "s" : ""}:`);
    r.issues.forEach((i) => console.error(`  ${dim(i.path || "(root)")}  ${i.message}`));
    process.exit(1);
  }
  return r.blueprint;
}

/** Keep generated files inside the output folder, whatever paths an adapter returns. */
function safeJoin(root: string, rel: string): string {
  const full = resolve(root, rel);
  const r = relative(root, full);
  if (r.startsWith("..") || isAbsolute(r)) fail(`Refusing to write outside ${root}: ${rel}`);
  return full;
}

const bar = (v: number, w = 24) => {
  const n = Math.max(0, Math.min(w, Math.round(v * w)));
  const fill = v > 1 ? pink : v > 0.8 ? sun : sea;
  return fill("━".repeat(n)) + dim((tty ? "━" : "─").repeat(w - n));
};

const [cmd, ...args] = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};

switch (cmd) {
  case "init": {
    const name = (args[0] ?? "My Server").replace(/[\u0000-\u001f\u007f"]/g, "").slice(0, 48).trim() || "My Server";
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "server";
    const file = `${slug}.riptide.json`;
    if (existsSync(file)) fail(`${file} already exists.`);
    const starter = structuredClone(starterBlueprint) as Record<string, any>;
    delete starter.$schema;
    starter.meta = { ...starter.meta, name, slug, discordGuild: undefined };
    writeFileSync(file, JSON.stringify(starter, null, 2) + "\n");
    console.log(`${sea("✓")} Created ${bold(file)} from the Neon Coast starter. Open it in Riptide Studio or run ${pink("riptide check")}.`);
    break;
  }
  case "check": {
    const bp = load(findBlueprint(args[0]));
    const compat = checkCompatibility(bp);
    const ready = assessReadiness(bp);
    console.log(`\n${bold(bp.meta.name)} ${dim(`${bp.meta.maxPlayers} slots, ${bp.mods.filter((m) => m.enabled).length} mods, ${bp.engine.target}`)}\n`);
    if (compat.issues.length) {
      compat.issues.forEach((i) => console.log(`  ${i.level === "error" ? pink("✗") : i.level === "warning" ? sun("!") : dim("i")} ${i.message}${i.fix ? dim(`  fix: ${i.fix.label}`) : ""}`));
      console.log();
    }
    ready.checks.forEach((c) => console.log(`  ${c.passed ? sea("✓") : pink("✗")} ${c.label}${c.passed ? "" : dim(`  ${c.hint}`)}`));
    console.log(`\n  Ready to launch: ${ready.score >= 80 ? sea(`${ready.score}/100`) : sun(`${ready.score}/100`)}\n`);
    process.exit(compat.ok ? 0 : 1);
  }
  case "forecast": {
    const bp = load(findBlueprint(args[0]));
    const f = forecastEconomy(bp.economy, { members: Math.max(50, bp.meta.maxPlayers * 3) });
    const max = Math.max(...f.days.map((d) => d.p90), 1);
    const sym = bp.economy.currency.symbol;
    console.log(`\n${bold("Median wallet over 60 days")} ${dim("(p90 in grey)")}\n`);
    for (const d of f.days.filter((_, i) => i % 5 === 0 || i === f.days.length - 1)) {
      const m = Math.round((d.median / max) * 40);
      const p = Math.round((d.p90 / max) * 40);
      console.log(`  ${dim(String(d.day).padStart(3))}  ${sea("█".repeat(m))}${dim("░".repeat(Math.max(0, p - m)))} ${sym}${d.median.toLocaleString("en-US")}`);
    }
    const tone = f.verdict === "stable" ? sea : f.verdict === "inflating" ? sun : pink;
    console.log(`\n  ${tone(f.verdict)}  ${dim(`${(f.drift * 100).toFixed(2)}% a day`)}`);
    f.advice.forEach((a) => console.log(`  • ${a}`));
    console.log();
    break;
  }
  case "rules": {
    const bp = load(findBlueprint(args[0]));
    const c = compileRulebook(bp.rulebook);
    c.rules.forEach((r) => console.log(`  ${r.enforcement ? sea("⚙") : r.warning ? sun("!") : dim("¶")} ${r.text}\n    ${dim(r.warning ?? r.effect)}`));
    console.log(`\n  ${c.enforced} parsed (not enforced in-game yet: no server runtime ships today), ${c.guidance} for staff\n`);
    break;
  }
  case "build": {
    const target = (flag("target") ?? "fivem") as "fivem" | "gta6";
    const outDir = resolve(flag("out") ?? "dist");
    const bp = load(findBlueprint(args[0]));
    if (!["fivem", "gta6"].includes(target)) fail(`Unknown target "${target}". Use fivem or gta6.`);
    let result;
    try {
      result = ADAPTERS[target].build(bp);
    } catch (e) {
      fail((e as Error).message);
    }
    if (target === "fivem") {
      const rules = renderRulesMarkdown(bp.meta.name, compileRulebook(bp.rulebook));
      result.files.push({ path: "RULES.md", contents: rules });
    }
    for (const f of result.files) {
      const p = safeJoin(outDir, f.path);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, f.contents);
      console.log(`  ${sea("+")} ${relative(process.cwd(), p)}`);
    }
    result.notes.forEach((n) => console.log(`  ${sun("!")} ${n}`));
    break;
  }
  case "share": {
    const bp = load(findBlueprint(args[0]));
    console.log(`\n  ${pink(shortCode(bp))}\n\n${dim(encodeBlueprint(bp))}\n`);
    break;
  }
  case "import": {
    if (!args[0]) fail("Paste a share code: riptide import riptide:1:...");
    let data: unknown;
    try {
      data = decodeBlueprint(args[0]);
    } catch (e) {
      fail((e as Error).message);
    }
    const r = validateBlueprint(data);
    if (!r.ok) fail("That share code doesn't contain a valid Blueprint.");
    const file = args[1] ?? `${r.blueprint.meta.slug}.riptide.json`;
    if (existsSync(file)) fail(`${file} already exists.`);
    writeFileSync(file, JSON.stringify(r.blueprint, null, 2) + "\n");
    console.log(`${sea("✓")} Saved ${bold(file)}`);
    break;
  }
  case "diff": {
    if (args.length < 2) fail("Give two files: riptide diff old.riptide.json new.riptide.json");
    const changes = diffBlueprints(load(resolve(args[0]!)), load(resolve(args[1]!)));
    if (!changes.length) console.log(dim("  No changes."));
    changes.forEach((c) => console.log(`  ${c.kind === "added" ? sea("+") : c.kind === "removed" ? pink("-") : sun("~")} ${summarizeChange(c)}`));
    break;
  }
  default:
    console.log(HELP);
    if (cmd && !["help", "--help", "-h"].includes(cmd)) process.exit(1);
}
