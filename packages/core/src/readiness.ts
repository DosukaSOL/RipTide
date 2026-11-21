import type { Blueprint } from "./blueprint";
import { effectivePermissions } from "./blueprint";
import { checkCompatibility } from "./compatibility";
import { estimateBudget } from "./budget";
import { forecastEconomy, type ForecastOptions } from "./economy";
import { compileRulebook } from "./rules/rulebook";
import { CATALOG_BY_ID } from "./catalog";

export interface ReadinessCheck {
  id: string;
  label: string;
  passed: boolean;
  weight: number;
  hint: string;
  /** Studio section that fixes it. */
  section: "identity" | "rules" | "roles" | "economy" | "mods" | "world" | "access" | "deploy";
}

export interface Readiness {
  score: number;
  checks: ReadinessCheck[];
  blocking: ReadinessCheck[];
}

export function assessReadiness(bp: Blueprint, forecastOpts: Partial<ForecastOptions> = {}): Readiness {
  const compat = checkCompatibility(bp);
  const budget = estimateBudget(bp);
  const forecast = forecastEconomy(bp.economy, { days: 60, members: Math.max(50, bp.meta.maxPlayers * 3), ...forecastOpts });
  const rulebook = compileRulebook(bp.rulebook);
  const provides = new Set(bp.mods.filter((m) => m.enabled).flatMap((m) => CATALOG_BY_ID.get(m.id)?.provides ?? []));
  const hasAdmin = bp.roles.some((r) => effectivePermissions(bp.roles, r.id).has("admin.*"));

  const checks: ReadinessCheck[] = [
    { id: "compat", label: "Mods work together", passed: compat.ok, weight: 20, hint: `${compat.issues.filter((i) => i.level === "error").length} compatibility problems to fix`, section: "mods" },
    { id: "budget", label: "Performance headroom", passed: budget.verdict !== "over", weight: 15, hint: "Remove or swap your heaviest mods", section: "mods" },
    { id: "economy", label: "Economy holds steady", passed: forecast.verdict === "stable", weight: 15, hint: forecast.advice[0] ?? "", section: "economy" },
    { id: "admin", label: "Someone can moderate", passed: hasAdmin, weight: 10, hint: "Give at least one role the admin.* permission", section: "roles" },
    { id: "rules", label: "Rules written", passed: rulebook.rules.length >= 5, weight: 10, hint: "Write at least five rules so players know what's expected", section: "rules" },
    { id: "anticheat", label: "Cheat protection", passed: provides.has("anticheat"), weight: 10, hint: "Add an anti-cheat from Mods", section: "mods" },
    { id: "backups", label: "Backups every day", passed: bp.ops.backups.everyHours <= 24, weight: 8, hint: "Back up at least once every 24 hours", section: "deploy" },
    { id: "access", label: "Join flow set", passed: bp.access.whitelist ? !!bp.access.application?.questions.length : true, weight: 6, hint: "Whitelisted servers need application questions", section: "access" },
    { id: "community", label: "Discord connected", passed: !!bp.meta.discordGuild && provides.has("discord"), weight: 6, hint: "Link your Discord to sync roles and post rules", section: "identity" },
  ];
  const total = checks.reduce((s, c) => s + c.weight, 0);
  const score = Math.round((checks.filter((c) => c.passed).reduce((s, c) => s + c.weight, 0) / total) * 100);
  return { score, checks, blocking: checks.filter((c) => !c.passed && c.weight >= 15) };
}
