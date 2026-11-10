import test from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_CALL_TIMEOUT_MS,
  CRITERIA_CALL_TIMEOUT_MS,
  RUN_DEADLINE_MS,
  STEP_BUDGET,
  checkLoopLimits,
  modelCallFailureReason,
  modelCallTimeouts,
} from "./limits.ts";

const claimedAt = new Date("2026-11-10T12:00:00.000Z");

function at(msFromClaim: number): Date {
  return new Date(claimedAt.getTime() + msFromClaim);
}

// FR-019: step budget — 4 used may continue; 5 used must stop.
test("step budget boundary: 4 used may continue, 5 used is exhausted", () => {
  assert.deepEqual(
    checkLoopLimits({ claimedAt, now: at(0), stepsUsed: 4, agentCompleted: false }),
    { decision: "continue" },
  );
  assert.deepEqual(
    checkLoopLimits({ claimedAt, now: at(0), stepsUsed: STEP_BUDGET, agentCompleted: false }),
    { decision: "stop", reasonCode: "step_budget_exhausted" },
  );
});

// FR-019: deadline measured from the claim; exactly 240s is exceeded.
test("deadline boundary at exactly 240s", () => {
  assert.deepEqual(
    checkLoopLimits({
      claimedAt,
      now: at(RUN_DEADLINE_MS - 1),
      stepsUsed: 0,
      agentCompleted: false,
    }),
    { decision: "continue" },
  );
  assert.deepEqual(
    checkLoopLimits({
      claimedAt,
      now: at(RUN_DEADLINE_MS),
      stepsUsed: 0,
      agentCompleted: false,
    }),
    { decision: "stop", reasonCode: "deadline_exceeded" },
  );
});

test("deadline wins when both deadline and step budget are exceeded", () => {
  assert.deepEqual(
    checkLoopLimits({
      claimedAt,
      now: at(RUN_DEADLINE_MS),
      stepsUsed: STEP_BUDGET,
      agentCompleted: false,
    }),
    { decision: "stop", reasonCode: "deadline_exceeded" },
  );
});

test("completed agent is not a limit stop", () => {
  assert.deepEqual(
    checkLoopLimits({
      claimedAt,
      now: at(RUN_DEADLINE_MS),
      stepsUsed: STEP_BUDGET,
      agentCompleted: true,
    }),
    { decision: "completed" },
  );
});

test("model-call timeouts clamp to remaining deadline and never go negative", () => {
  assert.deepEqual(modelCallTimeouts(claimedAt, at(0)), {
    agentTimeoutMs: AGENT_CALL_TIMEOUT_MS,
    criteriaTimeoutMs: CRITERIA_CALL_TIMEOUT_MS,
  });

  // 40s left: agent uses remaining; criteria stays at its 30s cap.
  assert.deepEqual(modelCallTimeouts(claimedAt, at(RUN_DEADLINE_MS - 40_000)), {
    agentTimeoutMs: 40_000,
    criteriaTimeoutMs: CRITERIA_CALL_TIMEOUT_MS,
  });

  // 10s left: both clamp to remaining.
  assert.deepEqual(modelCallTimeouts(claimedAt, at(RUN_DEADLINE_MS - 10_000)), {
    agentTimeoutMs: 10_000,
    criteriaTimeoutMs: 10_000,
  });

  // At or past the deadline: zero, never negative.
  assert.deepEqual(modelCallTimeouts(claimedAt, at(RUN_DEADLINE_MS)), {
    agentTimeoutMs: 0,
    criteriaTimeoutMs: 0,
  });
  assert.deepEqual(modelCallTimeouts(claimedAt, at(RUN_DEADLINE_MS + 5_000)), {
    agentTimeoutMs: 0,
    criteriaTimeoutMs: 0,
  });
});

// FR-018 / FR-011: timed-out or errored calls map to fixed reason codes.
test("maps timed-out or errored model calls to reason codes", () => {
  assert.equal(modelCallFailureReason("agent"), "model_error");
  assert.equal(modelCallFailureReason("criteria"), "criteria_unavailable");
});
