import test from "node:test";
import assert from "node:assert/strict";
import {
  REASON_CODES,
  REASON_TEXT,
  canTransition,
  finishRun,
  type RunState,
} from "./status.ts";

test("only queued->running, running->done and queued->done are allowed", () => {
  assert.equal(canTransition("queued", "running"), true);
  assert.equal(canTransition("running", "done"), true);
  assert.equal(canTransition("queued", "done"), true); // reaper: never_started
  assert.equal(canTransition("done", "running"), false);
  assert.equal(canTransition("done", "done"), false);
  assert.equal(canTransition("running", "queued"), false);
});

// FR-024: a verdict is written once, in running -> done, by the claim holder.
test("finishRun writes the verdict once from running", () => {
  const run: RunState = { status: "running", claimToken: "a" };
  const done = finishRun(run, { claimToken: "a", verdict: "PASS" });
  assert.ok(done.ok);
  assert.equal(done.run.status, "done");
  assert.equal(done.run.verdict, "PASS");
});

test("finishRun refuses a done run, so a late write leaves it unchanged", () => {
  const run: RunState = { status: "done", verdict: "FAIL", claimToken: "a" };
  const late = finishRun(run, { claimToken: "a", verdict: "PASS" });
  assert.equal(late.ok, false);
  assert.deepEqual(run, { status: "done", verdict: "FAIL", claimToken: "a" });
});

test("finishRun refuses an execution that does not hold the claim", () => {
  const run: RunState = { status: "running", claimToken: "a" };
  assert.equal(finishRun(run, { claimToken: "b", verdict: "PASS" }).ok, false);
});

test("INCONCLUSIVE requires a reason code; PASS and FAIL carry none", () => {
  const run: RunState = { status: "running", claimToken: "a" };
  assert.equal(finishRun(run, { claimToken: "a", verdict: "INCONCLUSIVE" }).ok, false);
  assert.equal(
    finishRun(run, { claimToken: "a", verdict: "PASS", reasonCode: "model_error" }).ok,
    false,
  );
  const ok = finishRun(run, { claimToken: "a", verdict: "INCONCLUSIVE", reasonCode: "lease_expired" });
  assert.ok(ok.ok);
  assert.equal(ok.run.reasonCode, "lease_expired");
});

// §20.2: every reason code has its display text.
test("every reason code has display text", () => {
  assert.equal(REASON_CODES.length, 10);
  for (const code of REASON_CODES) assert.ok(REASON_TEXT[code].length > 0);
  assert.equal(REASON_TEXT.criteria_unavailable, "The objective could not be turned into checks.");
});
