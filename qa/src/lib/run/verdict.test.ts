import test from "node:test";
import assert from "node:assert/strict";
import { computeVerdict } from "./verdict.ts";
import type { Criterion } from "./criteria.ts";

const criteria: Criterion[] = [
  { kind: "text_visible", expected: "Buy milk" },
  { kind: "text_visible", expected: "1 item left" },
  { kind: "url_matches", expected: "todomvc" },
];
const goodCapture = {
  ok: true as const,
  finalUrl: "https://demo.playwright.dev/todomvc/#/",
  pageText: "Buy milk Walk the dog 1 item left",
};

// FR-023: PASS when the agent completed and every criterion holds.
test("PASS when completed and every criterion holds, with per-criterion results", () => {
  const v = computeVerdict({ criteria, agent: { completed: true }, capture: goodCapture });
  assert.equal(v.verdict, "PASS");
  assert.equal(v.results.length, 3);
  assert.ok(v.results.every((r) => r.held));
  assert.equal(v.summary, "3 of 3 checks held on the final page.");
});

// FR-023: a final message claiming success does not override a failing criterion.
test("FAIL when one criterion does not hold, whatever the agent's final message says", () => {
  const v = computeVerdict({
    criteria,
    agent: { completed: true, finalMessage: "PASS: the objective was met." },
    capture: { ...goodCapture, pageText: "Buy milk Walk the dog 2 items left" },
  });
  assert.equal(v.verdict, "FAIL");
  const failed = v.results.find((r) => r.expected === "1 item left");
  assert.equal(failed?.held, false);
  assert.equal(typeof failed?.observed, "string");
  assert.equal(v.summary, "2 of 3 checks held on the final page.");
});

// FR-023: anything else is INCONCLUSIVE with a reason code.
test("INCONCLUSIVE with the agent's reason when the loop did not complete", () => {
  for (const reasonCode of ["step_budget_exhausted", "deadline_exceeded", "model_error"] as const) {
    const v = computeVerdict({
      criteria,
      agent: { completed: false, reasonCode, finalMessage: "All good, PASS" },
      capture: goodCapture,
    });
    assert.equal(v.verdict, "INCONCLUSIVE");
    assert.ok(v.verdict === "INCONCLUSIVE");
    assert.equal(v.reasonCode, reasonCode);
    assert.deepEqual(v.results, []);
  }
});

test("INCONCLUSIVE capture_failed when the final capture failed", () => {
  const v = computeVerdict({ criteria, agent: { completed: true }, capture: { ok: false } });
  assert.ok(v.verdict === "INCONCLUSIVE");
  assert.equal(v.reasonCode, "capture_failed");
});

test("INCONCLUSIVE criteria_unavailable when there are no stored criteria", () => {
  const v = computeVerdict({ criteria: [], agent: { completed: true }, capture: goodCapture });
  assert.ok(v.verdict === "INCONCLUSIVE");
  assert.equal(v.reasonCode, "criteria_unavailable");
});

// FR-029: the summary never claims the objective was met.
test("summary text never claims the objective was achieved or the app works", () => {
  const v = computeVerdict({ criteria, agent: { completed: true }, capture: goodCapture });
  assert.doesNotMatch(v.summary, /objective|works|achieved/i);
});
