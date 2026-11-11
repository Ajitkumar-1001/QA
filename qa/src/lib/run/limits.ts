/**
 * Host-enforced run limits (FR-018, FR-019).
 * Pure checks: the caller supplies claim time, clock, and step count.
 */
import type { ReasonCode } from "./status.ts";

/** Run deadline measured from the claim. */
export const RUN_DEADLINE_MS = 240_000;

/** Max agent-loop model calls. One step is one model call plus its tool calls. */
export const STEP_BUDGET = 5;

/** Timeout for the criteria model call. */
export const CRITERIA_CALL_TIMEOUT_MS = 30_000;

/** Timeout for each agent model call. */
export const AGENT_CALL_TIMEOUT_MS = 45_000;

export type LoopLimitInput = {
  claimedAt: Date;
  now: Date;
  stepsUsed: number;
  /** True when the agent has already sent its final message. */
  agentCompleted: boolean;
};

export type LoopLimitResult =
  | { decision: "continue" }
  | { decision: "completed" }
  | {
      decision: "stop";
      reasonCode: Extract<ReasonCode, "deadline_exceeded" | "step_budget_exhausted">;
    };

/**
 * Whether the agent loop may make another model call, or must stop for a
 * host limit. A completed agent is not a limit stop. Deadline wins over budget.
 */
export function checkLoopLimits(input: LoopLimitInput): LoopLimitResult {
  if (input.agentCompleted) return { decision: "completed" };

  const elapsed = input.now.getTime() - input.claimedAt.getTime();
  if (elapsed >= RUN_DEADLINE_MS) {
    return { decision: "stop", reasonCode: "deadline_exceeded" };
  }
  if (input.stepsUsed >= STEP_BUDGET) {
    return { decision: "stop", reasonCode: "step_budget_exhausted" };
  }
  return { decision: "continue" };
}

export type ModelCallTimeouts = {
  agentTimeoutMs: number;
  criteriaTimeoutMs: number;
};

/** Timeouts for the next model call, clamped to time left on the run deadline. */
export function modelCallTimeouts(claimedAt: Date, now: Date): ModelCallTimeouts {
  const remaining = Math.max(0, claimedAt.getTime() + RUN_DEADLINE_MS - now.getTime());
  return {
    agentTimeoutMs: Math.min(AGENT_CALL_TIMEOUT_MS, remaining),
    criteriaTimeoutMs: Math.min(CRITERIA_CALL_TIMEOUT_MS, remaining),
  };
}

export type ModelCallKind = "agent" | "criteria";

/** Map a timed-out or errored model call to its INCONCLUSIVE reason. */
export function modelCallFailureReason(
  kind: ModelCallKind,
): Extract<ReasonCode, "model_error" | "criteria_unavailable"> {
  return kind === "agent" ? "model_error" : "criteria_unavailable";
}
