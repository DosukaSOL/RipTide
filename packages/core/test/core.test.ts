import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CATALOG_BY_ID } from "../src/catalog";
import { fileURLToPath } from "node:url";
import {
  validateBlueprint,
  effectivePermissions,
  checkCompatibility,
  estimateBudget,
  forecastEconomy,
  gini,
  compileRulebook,
  renderRulesMarkdown,
  renderDiscordEmbed,
  renderDiscordMessages,
  to24h,
  roleCycles,
  resolveLoadOrder,
  FIVEM_CAPABILITIES,
  assessReadiness,
  estimateHosting,
  bestRegion,
  shortCode,
  encodeBlueprint,
  decodeBlueprint,
  diffBlueprints,
  fivemAdapter,
  gta6Adapter,
  buildDockerStack,
  type Blueprint,
} from "../src/index";

const examplePath = fileURLToPath(new URL("../../../examples/neon-coast.riptide.json", import.meta.url));
const raw = JSON.parse(readFileSync(examplePath, "utf8"));
const load = (): Blueprint => {
  const r = validateBlueprint(structuredClone(raw));
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.blueprint;
};

test("example blueprint validates", () => {
  assert.equal(validateBlueprint(raw).ok, true);
});

test("validation catches bad references and job shares", () => {
  const bad = structuredClone(raw);
  bad.roles[1].inherits = "ghost";
  bad.economy.jobs[0].share = 0.9;
  const r = validateBlueprint(bad);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.issues.some((i) => i.path === "roles.1.inherits"));
    assert.ok(r.issues.some((i) => i.path === "economy.jobs"));
  }
});

test("validation rejects bad ids and colors", () => {
  const bad = structuredClone(raw);
  bad.meta.slug = "Bad Slug!";
  bad.roles[0].color = "pink";
  assert.equal(validateBlueprint(bad).ok, false);
});

test("permissions inherit and survive cycles", () => {
  const bp = load();
  const admin = effectivePermissions(bp.roles, "admin");
  assert.ok(admin.has("admin.*") && admin.has("kick") && admin.has("chat.ooc"));
  const loop = [
    { id: "a", name: "A", color: "#000000", inherits: "b", permissions: ["x"] },
    { id: "b", name: "B", color: "#000000", inherits: "a", permissions: ["y"] },
  ];
  assert.deepEqual([...effectivePermissions(loop, "a")].sort(), ["x", "y"]);
});

test("compatibility: example is clean and dependencies load first", () => {
  const bp = load();
  const r = checkCompatibility(bp);
  assert.equal(r.ok, true, JSON.stringify(r.issues));
  const pos = (id: string) => r.loadOrder.indexOf(id);
  assert.ok(pos("oxmysql") < pos("qbox"));
  assert.ok(pos("qbox") < pos("ox-inventory"));
  assert.ok(pos("pma-voice") < pos("lb-phone"));
});

test("compatibility: flags exclusive overlap, missing deps and wrong engine", () => {
  const bp = load();
  bp.mods.push({ id: "esx", enabled: true }, { id: "saltychat", enabled: true }, { id: "nope", enabled: true });
  bp.mods = bp.mods.filter((m) => m.id !== "oxmysql");
  const r = checkCompatibility(bp);
  const codes = r.issues.map((i) => i.code);
  assert.ok(codes.includes("exclusive"));
  assert.ok(codes.includes("missing"));
  assert.ok(codes.includes("unknown"));
  const missing = r.issues.find((i) => i.code === "missing");
  assert.ok(missing?.fix?.add?.length, "suggests a provider");

  const six = load();
  six.engine.target = "gta6";
  assert.ok(checkCompatibility(six).issues.some((i) => i.code === "engine"));
});

test("disabled mods are ignored", () => {
  const bp = load();
  bp.mods.push({ id: "esx", enabled: false });
  assert.equal(checkCompatibility(bp).ok, true);
});

test("budget sums and scales with players", () => {
  const bp = load();
  const small = estimateBudget({ ...bp, meta: { ...bp.meta, maxPlayers: 32 } });
  const big = estimateBudget({ ...bp, meta: { ...bp.meta, maxPlayers: 512 } });
  assert.ok(big.totals.serverMs > small.totals.serverMs);
  assert.equal(small.totals.streamMB, big.totals.streamMB);
  assert.ok(["comfortable", "tight", "over"].includes(small.verdict));
});

test("economy forecast is deterministic", () => {
  const bp = load();
  const a = forecastEconomy(bp.economy, { seed: 7, days: 20 });
  const b = forecastEconomy(bp.economy, { seed: 7, days: 20 });
  assert.deepEqual(a, b);
  assert.equal(a.days.length, 20);
});

test("economy forecast detects inflation and deflation", () => {
  const bp = load();
  const rich = { ...bp.economy, jobs: bp.economy.jobs.map((j) => ({ ...j, payPerHour: j.payPerHour * 6 })), autopilot: false };
  assert.equal(forecastEconomy(rich, { days: 40 }).verdict, "inflating");
  const poor = { ...bp.economy, jobs: bp.economy.jobs.map((j) => ({ ...j, payPerHour: 50 })), autopilot: false };
  assert.equal(forecastEconomy(poor, { days: 40 }).verdict, "deflating");
});

test("economy never produces NaN or negative balances on zero jobs", () => {
  const bp = load();
  const f = forecastEconomy({ ...bp.economy, jobs: [] }, { days: 10, members: 20 });
  for (const d of f.days) {
    assert.ok(Number.isFinite(d.supply) && d.supply >= 0);
    assert.ok(Number.isFinite(d.gini));
  }
});

test("gini edges", () => {
  assert.equal(gini([]), 0);
  assert.equal(gini([5, 5, 5]), 0);
  assert.ok(gini([0, 0, 0, 100]) > 0.7);
});

test("rulebook compiles the lines it understands", () => {
  const bp = load();
  const c = compileRulebook(bp.rulebook);
  const kinds = c.rules.map((r) => r.enforcement?.kind).filter(Boolean);
  for (const k of ["zone-flag", "probation", "min-online", "group-cap", "speed-limit", "time-window", "schedule", "cooldown"]) {
    assert.ok(kinds.includes(k as never), `expected ${k}`);
  }
  const restart = c.rules.find((r) => r.enforcement?.kind === "schedule")!.enforcement!;
  assert.deepEqual(restart, { kind: "schedule", action: "restart", times: ["06:00", "18:00"] });
  const window = c.rules.find((r) => r.enforcement?.kind === "time-window")!.enforcement!;
  assert.deepEqual(window, { kind: "time-window", subject: "civilians", action: "race", from: "06:00", to: "20:00" });
  const min = c.rules.find((r) => r.enforcement?.kind === "min-online")!.enforcement!;
  assert.deepEqual(min, { kind: "min-online", role: "police", count: 4, activity: "bank-robberies" });
  assert.ok(c.guidance >= 3);
  assert.equal(c.rules[0]!.section, "Respect");
});

test("rulebook output pages", () => {
  const bp = load();
  const c = compileRulebook(bp.rulebook);
  const md = renderRulesMarkdown(bp.meta.name, c);
  assert.match(md, /## Driving/);
  const embed = renderDiscordEmbed(bp.meta.name, c);
  assert.ok(embed.embeds[0]!.fields.every((f) => f.value.length <= 1024));
});

test("rulebook handles junk input safely", () => {
  const c = compileRulebook("\n\n#\n- \n<script>alert(1)</script>\n" + "a".repeat(10000));
  assert.ok(c.rules.every((r) => r.enforcement === null));
});

test("readiness scores the example highly", () => {
  const r = assessReadiness(load());
  assert.ok(r.score >= 80, `score ${r.score}: ${JSON.stringify(r.checks.filter((c) => !c.passed))}`);
});

test("hosting estimate and region pick", () => {
  const bp = load();
  const h = estimateHosting(bp);
  assert.ok(h.monthlyUsd > 0 && h.vcpu >= 2);
  const best = bestRegion([{ lat: 40.7, lon: -74 }, { lat: 42.3, lon: -71 }]);
  assert.equal(best[0]!.region.id, "us-mia");
});

test("share codes round-trip and are stable", () => {
  const bp = load();
  assert.match(shortCode(bp), /^RT-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  assert.equal(shortCode(bp), shortCode(load()));
  const enc = encodeBlueprint(bp);
  assert.deepEqual(validateBlueprint(decodeBlueprint(enc)).ok, true);
  assert.throws(() => decodeBlueprint(enc.slice(0, -6)));
  assert.throws(() => decodeBlueprint("hello"));
});

test("diff finds keyed changes", () => {
  const a = load();
  const b = load();
  b.meta.maxPlayers = 200;
  b.mods = b.mods.filter((m) => m.id !== "lb-phone");
  b.roles.push({ id: "vip", name: "VIP", color: "#FFFFFF", permissions: [] });
  const d = diffBlueprints(a, b);
  assert.ok(d.some((c) => c.path === "meta.maxPlayers" && c.kind === "changed"));
  assert.ok(d.some((c) => c.path === "mods[lb-phone]" && c.kind === "removed"));
  assert.ok(d.some((c) => c.path === "roles[vip]" && c.kind === "added"));
  assert.deepEqual(diffBlueprints(a, load()), []);
});

test("fivem adapter writes ordered cfg with secrets as placeholders", () => {
  const bp = load();
  const out = fivemAdapter.build(bp);
  const cfg = out.files.find((f) => f.path === "server.cfg")!.contents;
  assert.match(cfg, /sv_maxclients 128/);
  assert.match(cfg, /\{\{secret:CFX_LICENSE_KEY\}\}/);
  assert.ok(cfg.indexOf("ensure oxmysql") < cfg.indexOf("ensure qbox"));
  assert.match(cfg, /add_principal group.admin group.mod/);
});

test("fivem adapter escapes quotes in names", () => {
  const bp = load();
  bp.meta.name = 'Evil" ; quit';
  const cfg = fivemAdapter.build(bp).files[0]!.contents;
  assert.ok(!cfg.includes('Evil"'));
});

test("schema blocks config injection through text fields", () => {
  for (const mutate of [
    (b: any) => (b.meta.name = "Nice\nquit"),
    (b: any) => (b.meta.tagline = "x\rexec evil.cfg"),
    (b: any) => b.meta.tags.push('a"b'),
    (b: any) => b.roles[0].permissions.push("chat\nadd_ace builtin.everyone command allow"),
    (b: any) => (b.engine.build = "3258\nquit"),
    (b: any) => (b.meta.language = "en\n"),
  ]) {
    const bad = structuredClone(raw);
    mutate(bad);
    assert.equal(validateBlueprint(bad).ok, false);
  }
});

test("fivem adapter neutralises injection even without validation", () => {
  const bp = load();
  bp.meta.name = "A\nquit";
  bp.roles[0]!.permissions.push("x\nadd_ace builtin.everyone command allow");
  bp.engine.build = "1\nquit";
  const cfg = fivemAdapter.build(bp).files[0]!.contents;
  assert.ok(!/^quit/m.test(cfg));
  assert.ok(!/^add_ace builtin/m.test(cfg));
});

test("gta6 adapter waits and bundles", () => {
  const out = gta6Adapter.build(load());
  assert.equal(gta6Adapter.status, "waiting");
  assert.ok(out.files.some((f) => f.path === "bundle/blueprint.json"));
});

test("docker stack never contains real secrets", () => {
  const out = buildDockerStack(load());
  const all = out.files.map((f) => f.contents).join("\n");
  assert.match(all, /\$\{CFX_LICENSE_KEY\}/);
  assert.ok(!/cfxk_[A-Za-z0-9]/.test(all));
  assert.match(all, /127\.0\.0\.1:40120:40120/, "admin panel is not exposed publicly");
  assert.match(all, /DB_PASSWORD=\n/, "no default database password");
});

/* ---------- audit fixes: honest output and stricter validation ---------- */

test("fivem build: every file the server is told to load exists, and no runtime is claimed", () => {
  const out = fivemAdapter.build(load());
  const paths = new Set(out.files.map((f) => f.path));
  const cfg = out.files.find((f) => f.path === "server.cfg")!.contents;
  // Nothing references a resource or script that isn't in the build or the catalog.
  assert.ok(!/ensure riptide-runtime/.test(cfg));
  for (const f of out.files.filter((x) => x.path.endsWith("fxmanifest.lua"))) {
    const dir = f.path.replace(/fxmanifest\.lua$/, "");
    for (const m of f.contents.matchAll(/(?:server_script|client_script|shared_script)s?\s+'([^']+)'/g)) {
      assert.ok(paths.has(dir + m[1]), `${f.path} loads ${m[1]}, which isn't in the build`);
    }
  }
  for (const m of cfg.matchAll(/^ensure (\S+)/gm)) assert.ok(CATALOG_BY_ID.has(m[1]!), `ensure ${m[1]} isn't a catalog mod`);
  assert.equal(fivemAdapter.status, "config");
  assert.ok(out.notes.some((n) => /Configuration only/.test(n)));
  const ref = JSON.parse(out.files.find((f) => f.path === "riptide/blueprint-config.json")!.contents);
  assert.match(ref.note, /Reference only/);
  assert.ok(FIVEM_CAPABILITIES.some((c) => c.section === "rulebook" && c.support === "ignored"));
});

test("fivem build leaves out mods that aren't released", () => {
  const bp = load();
  bp.mods.push({ id: "riptide-voice", enabled: true } as never);
  const cfg = fivemAdapter.build(bp).files[0]!.contents;
  assert.ok(!/ensure riptide-voice/.test(cfg));
  const compat = checkCompatibility(bp);
  assert.ok(compat.issues.some((i) => i.code === "planned" && /isn't released yet/.test(i.message)));
});

test("clock times: real times only", () => {
  const ok: [string, string][] = [["00:00", "00:00"], ["12am", "00:00"], ["12pm", "12:00"], ["9pm", "21:00"], ["6", "06:00"], ["23:59", "23:59"], ["1:05 am", "01:05"]];
  for (const [i, o] of ok) assert.equal(to24h(i), o, i);
  for (const bad of ["24:00", "25:99", "99:99", "11:75", "0am", "13pm", "7:5", "noon", ""]) assert.equal(to24h(bad), null, bad);
});

test("rulebook: invalid times never become schedules", () => {
  const c = compileRulebook("- Restart at 25:99\n- Restarts daily at 6am and 99:99\n- Civilians can't race between 6am and 11:75\n- Restart at 6am and 6pm");
  assert.equal(c.rules[0]!.enforcement, null);
  assert.match(c.rules[0]!.warning!, /25:99/);
  assert.equal(c.rules[1]!.enforcement, null);
  assert.match(c.rules[1]!.warning!, /99:99/);
  assert.equal(c.rules[2]!.enforcement, null);
  assert.match(c.rules[2]!.warning!, /11:75/);
  assert.deepEqual(c.rules[3]!.enforcement, { kind: "schedule", action: "restart", times: ["06:00", "18:00"] });
  assert.equal(c.enforced, 1);
});

test("rules page makes no enforcement claims", () => {
  const bp = load();
  const md = renderRulesMarkdown(bp.meta.name, compileRulebook(bp.rulebook));
  assert.ok(!/automatic/i.test(md));
  const first = renderDiscordEmbed(bp.meta.name, compileRulebook(bp.rulebook));
  assert.ok(!JSON.stringify(first).match(/enforced automatically/));
});

test("discord: long rulebooks are split, never cut off", () => {
  const sections = Array.from({ length: 30 }, (_, s) => `# Section ${s}\n` + Array.from({ length: 40 }, (_, i) => `- Rule ${s}.${i} ${"is quite a long rule ".repeat(3)}`).join("\n")).join("\n");
  const c = compileRulebook(sections);
  const messages = renderDiscordMessages("Test", c);
  const embeds = messages.flatMap((m) => m.embeds);
  const allText = embeds.flatMap((e) => e.fields.map((f) => f.value)).join("\n");
  for (const r of c.rules) assert.ok(allText.includes(r.text), `missing: ${r.text}`);
  for (const m of messages) assert.ok(m.embeds.length <= 10);
  for (const e of embeds) {
    assert.ok(e.fields.length <= 25);
    assert.ok(e.fields.every((f) => f.value.length <= 1024 && f.name.length <= 256));
    assert.ok(e.title.length + e.fields.reduce((n, f) => n + f.name.length + f.value.length, 0) <= 6000);
  }
  assert.ok(messages.length > 1);
});

test("roles: loops and duplicate ids are rejected with the exact chain", () => {
  const withRoles = (roles: unknown[]) => {
    const b = structuredClone(raw);
    b.roles = roles.map((r) => ({ color: "#3df2d0", ...(r as object) }));
    b.access.queuePriority = [];
    return validateBlueprint(b);
  };
  const r1 = withRoles([{ id: "a", name: "A", permissions: [], inherits: "b" }, { id: "b", name: "B", permissions: [], inherits: "a" }]);
  assert.equal(r1.ok, false);
  assert.ok(!r1.ok && r1.issues.some((i) => /a → b → a/.test(i.message)));
  const r2 = withRoles([{ id: "a", name: "A", permissions: [], inherits: "a" }]);
  assert.ok(!r2.ok && r2.issues.some((i) => /a → a/.test(i.message)));
  const r3 = withRoles([{ id: "a", name: "A", permissions: [] }, { id: "a", name: "A2", permissions: [] }]);
  assert.ok(!r3.ok && r3.issues.some((i) => /Two roles use the id "a"/.test(i.message)));
  const r4 = withRoles([{ id: "a", name: "A", permissions: [] }, { id: "b", name: "B", permissions: [], inherits: "a" }, { id: "c", name: "C", permissions: [], inherits: "a" }]);
  assert.equal(r4.ok, true, JSON.stringify(!r4.ok && r4.issues));
  assert.deepEqual(roleCycles([{ id: "x", name: "X", permissions: [], inherits: "y" }, { id: "y", name: "Y", permissions: [], inherits: "z" }, { id: "z", name: "Z", permissions: [], inherits: "y" }] as never), [["y", "z"]]);
});

test("fivem build refuses a Blueprint with a role loop", () => {
  const bp = load();
  bp.roles = [{ id: "a", name: "A", permissions: [], inherits: "b" }, { id: "b", name: "B", permissions: [], inherits: "a" }] as never;
  assert.throws(() => fivemAdapter.build(bp), /loop/);
});

test("load order: one provider per need, so two providers don't make a false loop", () => {
  const mk = (id: string, provides: string[], requires: string[]) => ({ id, name: id, category: "x", summary: "", provides, requires, engines: ["fivem"], cost: { serverMs: 0, clientMB: 0, streamMB: 0, downloadMB: 0 }, status: "ready", author: "t" }) as never;
  // b and c both provide "radio"; c also needs "phone", which only b gives. Depending on every
  // radio provider would make b wait for c and c wait for b.
  const items = [mk("a", ["phone-app"], ["radio"]), mk("b", ["radio", "phone"], []), mk("c", ["radio"], ["phone"])];
  const { order, cycle } = resolveLoadOrder(items);
  assert.deepEqual(cycle, []);
  assert.ok(order.indexOf("b") < order.indexOf("a"));
  assert.ok(order.indexOf("b") < order.indexOf("c"));
});

test("docker stack says it's an example", () => {
  const out = buildDockerStack(load());
  assert.match(out.files[0]!.contents, /EXAMPLE ONLY/);
  assert.ok(out.notes.some((n) => /Example only/.test(n)));
});

/* ---------- one status manifest ---------- */
import { renderIntegrationsDoc, CAPABILITIES } from "../src/capabilities";

test("docs/INTEGRATIONS.md is generated from the capability list and up to date", () => {
  const onDisk = readFileSync(new URL("../../../docs/INTEGRATIONS.md", import.meta.url), "utf8");
  assert.equal(onDisk, renderIntegrationsDoc(), "Run `npm run docs:status` after changing packages/core/src/capabilities.ts");
});

test("nothing claims to work 'Today' unless the manifest says it's implemented", () => {
  const doc = readFileSync(new URL("../../../docs/INTEGRATIONS.md", import.meta.url), "utf8");
  assert.doesNotMatch(doc, /\|\s*Today\b/);
  // Things the audit found overstated stay honest.
  const find = (area: string) => CAPABILITIES.flatMap((s) => s.items).find((c) => c.area === area)!;
  assert.equal(find("Enforcing rules in-game").status, "future");
  assert.equal(find("Hosting").status, "simulated");
  assert.equal(find("Self-hosting").status, "experimental");
  assert.equal(find("GTA VI adapter").status, "waiting-for-permission");
  assert.notEqual(find("Time and weather").status, "implemented");
});

test("deploy preflight really checks and builds, and stops at the first failure", async () => {
  const { deployPreflight } = await import("../src/preflight");
  const good = deployPreflight(load());
  assert.ok(good.ok);
  assert.ok(good.ok && good.started > 0 && good.started <= good.enabled);
  assert.ok(good.ok && /^ensure /m.test(good.serverCfg));
  const invalid = structuredClone(raw);
  invalid.meta.maxPlayers = 99999;
  const bad = deployPreflight(invalid);
  assert.equal(bad.ok, false);
  assert.ok(!bad.ok && bad.stage === "check" && /maxPlayers/.test(bad.message));
  const loop = structuredClone(raw);
  loop.roles = [{ id: "a", name: "A", color: "#3df2d0", permissions: [], inherits: "b" }, { id: "b", name: "B", color: "#3df2d0", permissions: [], inherits: "a" }];
  loop.access.queuePriority = [];
  const r = deployPreflight(loop);
  assert.ok(!r.ok && r.stage === "check" && /loop/.test(r.message));
});
