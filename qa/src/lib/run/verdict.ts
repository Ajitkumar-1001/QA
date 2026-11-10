/**
 * Verdict computation (PRD v2 FR-023, FR-029). Host code decides the verdict
 * from the stored criteria and the final capture. No model output is used.
 */
import { evaluateCriterion } from "./criteria.ts";
import type { Criterion, CriterionResult, FinalCapture } from "./criteria.ts";
import type { ReasonCode } from "./status.ts";

export type AgentOutcome =
  | { completed: true; finalMessage?: string }
  | { completed: false; reasonCode: ReasonCode; finalMessage?: string };

export type CaptureOutcome = ({ ok: true } & FinalCapture) | { ok: false };

export type VerdictInput = {
  criteria: readonly Criterion[];
  agent: AgentOutcome;
  capture: CaptureOutcome;
};

export type VerdictResult =
  | { verdict: "PASS" | "FAIL"; results: CriterionResult[]; summary: string }
  | { verdict: "INCONCLUSIVE"; reasonCode: ReasonCode; results: CriterionResult[]; summary: string };

function inconclusive(reasonCode: ReasonCode): VerdictResult {
  return { verdict: "INCONCLUSIVE", reasonCode, results: [], summary: "No verdict was reached." };
}

export function computeVerdict(input: VerdictInput): VerdictResult {
  // The agent's final message is deliberately ignored here.
  if (!input.agent.completed) return inconclusive(input.agent.reasonCode);
  if (!input.capture.ok) return inconclusive("capture_failed");
  if (input.criteria.length === 0) return inconclusive("criteria_unavailable");

  const capture = input.capture;
  const results = input.criteria.map((c) => evaluateCriterion(c, capture));
  const held = results.filter((r) => r.held).length;
  return {
    verdict: held === results.length ? "PASS" : "FAIL",
    results,
    summary: `${held} of ${results.length} checks held on the final page.`,
  };
}
