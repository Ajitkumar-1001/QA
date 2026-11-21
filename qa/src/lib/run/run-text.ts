/** Run text for the run form and the result page (FR-003, FR-004, FR-028, FR-029). */
import type { CapResult } from "./caps.ts";
import type { Criterion } from "./criteria.ts";
import { STEP_BUDGET } from "./limits.ts";

export const RUN_PHASE_NAMES = ["criteria", "browser", "agent", "evaluating"] as const;

export type RunPhase =
  | { name: "criteria" }
  | { name: "browser" }
  | { name: "agent"; step: number }
  | { name: "evaluating" };

export type RunProgress =
  | { status: "queued"; createdAt: Date; now: Date }
  | { status: "running"; phase: RunPhase }
  | { status: "done" };

export type CapRefusal = Extract<CapResult, { ok: false }>;

function runWord(n: number): string {
  return n === 1 ? "run" : "runs";
}

function utcYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function progressText(progress: RunProgress): string {
  if (progress.status === "done") return "Done.";
  if (progress.status === "queued") {
    const elapsedMs = Math.max(0, progress.now.getTime() - progress.createdAt.getTime());
    const seconds = Math.floor(elapsedMs / 1000);
    if (seconds < 60) return `Queued ${seconds}s ago.`;
    return `Queued ${Math.floor(seconds / 60)} min ago.`;
  }
  const { phase } = progress;
  if (phase.name === "criteria") return "Running: creating criteria.";
  if (phase.name === "browser") return "Running: starting the browser.";
  if (phase.name === "evaluating") return "Running: evaluating.";
  return `Running: agent step ${phase.step} of ${STEP_BUDGET}.`;
}

export function runsUsedText(used: number, cap: number): string {
  return `${used} of ${cap} ${runWord(cap)} used this month.`;
}

export function capRefusalText(refusal: CapRefusal): string {
  if (refusal.reason === "monthly_cap") {
    return `Monthly cap reached: ${refusal.count} of ${refusal.cap} ${runWord(refusal.cap)} used. It resets on ${utcYmd(refusal.resetsAt)} UTC.`;
  }
  if (refusal.count === 1) {
    return "1 run is already in progress, the most allowed at once. Start again when one finishes.";
  }
  return `${refusal.count} runs are already in progress, the most allowed at once. Start again when one finishes.`;
}

export function criterionText(criterion: Criterion): string {
  const { kind, expected } = criterion;
  if (kind === "text_visible") return `Page shows "${expected}"`;
  if (kind === "text_absent") return `Page does not show "${expected}"`;
  return `URL contains "${expected}"`;
}
