import { z } from "zod";
import { uid } from "./ids";

/**
 * Heist Ops plans. Mission-agnostic on purpose: no GTA VI Online missions,
 * rewards, coordinates or mechanics are assumed. Crews fill in their own.
 */

const Text = (max: number) => z.string().max(max).transform((s) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ""));
const Id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);

export const PhaseStatus = z.enum(["not-started", "in-progress", "done"]);
export type PhaseStatus = z.infer<typeof PhaseStatus>;

export const Plan = z.object({
  schema: z.literal(1),
  id: Id,
  name: Text(80),
  description: Text(400),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  roles: z.array(z.object({ id: Id, name: Text(40), assignee: Text(40) })).max(16),
  phases: z
    .array(
      z.object({
        id: Id,
        title: Text(60),
        summary: Text(160),
        status: PhaseStatus,
        checklist: z.array(z.object({ id: Id, text: Text(160), done: z.boolean() })).max(40),
      }),
    )
    .max(12),
  notes: Text(8000),
});
export type Plan = z.infer<typeof Plan>;

export interface Template {
  id: string;
  name: string;
  summary: string;
  build: () => Omit<Plan, "id" | "createdAt" | "updatedAt" | "schema">;
}

export const TEMPLATES: Template[] = [
  {
    id: "crew-four",
    name: "Four-phase crew plan",
    summary: "Briefing, preparation, execution and debrief with four roles.",
    build: () => ({
      name: "Untitled operation",
      description: "A flexible crew template. Edit everything to fit the mission.",
      roles: ["Leader", "Driver", "Support", "Recon"].map((name) => ({ id: uid(), name, assignee: "" })),
      phases: [
        ["Briefing", "Agree on objectives, roles and approach"],
        ["Preparation", "Confirm equipment, vehicles and route"],
        ["Execution", "Follow your shared phase checklist"],
        ["Debrief", "Capture notes and results for next time"],
      ].map(([title, summary]) => ({ id: uid(), title: title!, summary: summary!, status: "not-started" as const, checklist: [] })),
      notes: "",
    }),
  },
  {
    id: "blank",
    name: "Blank plan",
    summary: "One phase, no roles. Build it your way.",
    build: () => ({
      name: "Untitled operation",
      description: "",
      roles: [],
      phases: [{ id: uid(), title: "Phase 1", summary: "", status: "not-started" as const, checklist: [] }],
      notes: "",
    }),
  },
];

export function createPlan(templateId = "crew-four", now = Date.now()): Plan {
  const t = TEMPLATES.find((x) => x.id === templateId) ?? TEMPLATES[0]!;
  return { schema: 1, id: uid(), createdAt: now, updatedAt: now, ...t.build() };
}

export function nextStatus(s: PhaseStatus): PhaseStatus {
  return s === "not-started" ? "in-progress" : s === "in-progress" ? "done" : "not-started";
}

export function progress(plan: Plan) {
  const assigned = plan.roles.filter((r) => r.assignee.trim()).length;
  const done = plan.phases.filter((p) => p.status === "done").length;
  const items = plan.phases.flatMap((p) => p.checklist);
  return {
    assigned,
    roles: plan.roles.length,
    phasesDone: done,
    phases: plan.phases.length,
    checklistDone: items.filter((i) => i.done).length,
    checklist: items.length,
  };
}

/** Validate a plan someone shared. Gives it a fresh id so it never overwrites a local plan. */
export function importPlan(input: unknown, now = Date.now()): Plan {
  const parsed = Plan.safeParse(input);
  if (!parsed.success) throw new Error("This isn't a valid Heist Ops plan file.");
  return { ...parsed.data, id: uid(), updatedAt: now };
}

export function exportPlan(plan: Plan): string {
  return JSON.stringify({ format: "riptide-heist-plan", ...plan }, null, 2);
}

export function parsePlanFile(text: string, now = Date.now()): Plan {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file couldn't be read as a plan.");
  }
  const { format, ...rest } = (data ?? {}) as Record<string, unknown>;
  if (format !== "riptide-heist-plan") throw new Error("This isn't a Heist Ops plan file.");
  return importPlan(rest, now);
}
