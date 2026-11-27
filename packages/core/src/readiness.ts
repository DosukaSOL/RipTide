import type { Blueprint } from "./blueprint";
import { effectivePermissions } from "./blueprint";
import { checkCompatibility } from "./compatibility";
import { forecastEconomy, type ForecastOptions } from "./economy";
import { compileRulebook } from "./rules/rulebook";

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
  const forecast = forecastEconomy(bp.economy, { days: 60, members: Math.max(50, bp.meta.maxPlayers * 3), ...forecastOpts });
  const rulebook = compileRulebook(bp.rulebook);
  const hasAdmin = bp.roles.some((r) => effectivePermissions(bp.roles, r.id).has("admin.*"));

  const checks: ReadinessCheck[] = [
    { id: "compat", label: "Mods work together", passed: compat.ok, weight: 20, hint: `${compat.issues.filter((i) => i.level === "error").length} compatibility problems to fix`, section: "mods" },
    { id: "economy", label: "Economy holds steady", passed: forecast.verdict === "stable", weight: 15, hint: forecast.advice[0] ?? "", section: "economy" },
    { id: "admin", label: "Someone can moderate", passed: hasAdmin, weight: 10, hint: "Give at least one role the admin.* permission", section: "roles" },
    { id: "rules", label: "Rules written", passed: rulebook.rules.length >= 5, weight: 10, hint: "Write at least five rules so players know what's expected", section: "rules" },
    { id: "access", label: "Join flow set", passed: bp.access.whitelist ? !!bp.access.application?.questions.length : true, weight: 6, hint: "Whitelisted servers need application questions", section: "access" },
  ];
  const total = checks.reduce((s, c) => s + c.weight, 0);
  const score = Math.round((checks.filter((c) => c.passed).reduce((s, c) => s + c.weight, 0) / total) * 100);
  return { score, checks, blocking: checks.filter((c) => !c.passed && c.weight >= 15) };
}
