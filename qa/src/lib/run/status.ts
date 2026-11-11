/**
 * Run status, verdict and reason codes.
 * The one place that defines the allowed status transitions.
 */

export const RUN_STATUSES = ["queued", "running", "done"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const VERDICTS = ["PASS", "FAIL", "INCONCLUSIVE"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const REASON_CODES = [
  "criteria_unavailable",
  "sandbox_failed",
  "target_unreachable",
  "model_error",
  "step_budget_exhausted",
  "deadline_exceeded",
  "capture_failed",
  "lease_expired",
  "never_started",
  "internal_error",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export const REASON_TEXT: Record<ReasonCode, string> = {
  criteria_unavailable: "The objective could not be turned into checks.",
  sandbox_failed: "The browser sandbox could not start or stopped responding.",
  target_unreachable: "The target page could not be opened.",
  model_error: "A model call failed or timed out.",
  step_budget_exhausted: "The agent used all of its steps before finishing.",
  deadline_exceeded: "The run reached its time limit.",
  capture_failed: "The final page could not be captured.",
  lease_expired: "The run stopped unexpectedly and was closed.",
  never_started: "The run was accepted but never started.",
  internal_error: "An internal error ended the run.",
};

const TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  // queued -> done is the reaper closing a run that never started (FR-025).
  queued: ["running", "done"],
  running: ["done"],
  // A done run never changes (FR-024).
  done: [],
};

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export type RunState = {
  status: RunStatus;
  claimToken?: string;
  verdict?: Verdict;
  reasonCode?: ReasonCode;
};

export type FinishInput = {
  claimToken: string;
  verdict: Verdict;
  reasonCode?: ReasonCode;
};

export type FinishResult =
  | { ok: true; run: RunState }
  | { ok: false; error: "not_running" | "not_claim_holder" | "invalid_reason" };

/**
 * Write a run's verdict once, in the transition running -> done, by the
 * execution that holds the claim (FR-024). Never mutates its input.
 */
export function finishRun(run: RunState, input: FinishInput): FinishResult {
  if (run.status !== "running" || !canTransition(run.status, "done")) {
    return { ok: false, error: "not_running" };
  }
  if (run.claimToken === undefined || run.claimToken !== input.claimToken) {
    return { ok: false, error: "not_claim_holder" };
  }
  const isInconclusive = input.verdict === "INCONCLUSIVE";
  if (isInconclusive !== (input.reasonCode !== undefined)) {
    return { ok: false, error: "invalid_reason" };
  }
  return {
    ok: true,
    run: {
      ...run,
      status: "done",
      verdict: input.verdict,
      ...(input.reasonCode !== undefined ? { reasonCode: input.reasonCode } : {}),
    },
  };
}
