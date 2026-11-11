import test from "node:test";
import assert from "node:assert/strict";
import {
  CRITERION_KINDS,
  evaluateCriterion,
  parseCriteriaOutput,
} from "./criteria.ts";

// FR-010: valid output yields 1 to 5 criteria of allowed kinds.
test("parseCriteriaOutput accepts 1 to 5 criteria of the M0 kinds", () => {
  const result = parseCriteriaOutput({
    checkable: true,
    criteria: [
      { kind: "text_visible", expected: "1 item left" },
      { kind: "text_absent", expected: "2 items left" },
      { kind: "url_matches", expected: "todomvc" },
    ],
  });
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.equal(result.criteria.length, 3);
  assert.deepEqual(CRITERION_KINDS, ["text_visible", "text_absent", "url_matches"]);
});

// FR-011 (c): output that fails the schema is criteria_unavailable.
test("parseCriteriaOutput rejects malformed output as criteria_unavailable", () => {
  const malformed: unknown[] = [
    null,
    "PASS",
    {},
    { checkable: true, criteria: [] },
    {
      checkable: true,
      criteria: Array.from({ length: 6 }, () => ({ kind: "text_visible", expected: "x" })),
    },
    { checkable: true, criteria: [{ kind: "element_checked", expected: "Buy milk" }] },
    { checkable: true, criteria: [{ kind: "text_visible", expected: "" }] },
    { checkable: true, criteria: [{ kind: "text_visible", expected: "x".repeat(201) }] },
    { checkable: true, criteria: [{ kind: "text_visible", expected: "x", verdict: "PASS" }] },
  ];
  for (const raw of malformed) {
    const result = parseCriteriaOutput(raw);
    assert.equal(result.ok, false, JSON.stringify(raw));
    assert.ok(!result.ok);
    assert.equal(result.reasonCode, "criteria_unavailable");
  }
});

// FR-011 (d): "not checkable" ends criteria_unavailable and keeps the stated reason.
test("parseCriteriaOutput keeps the stated reason when the objective is not checkable", () => {
  const result = parseCriteriaOutput({ checkable: false, reason: "No visible outcome named." });
  assert.ok(!result.ok);
  assert.equal(result.reasonCode, "criteria_unavailable");
  assert.equal(result.statedReason, "No visible outcome named.");
});

const capture = {
  finalUrl: "https://demo.playwright.dev/todomvc/#/",
  pageText: "todos\n  Buy milk\n\tWalk the dog\n1   item\nleft",
};

// text_visible holds on exact characters after whitespace is collapsed.
test("text_visible collapses whitespace and matches exact characters", () => {
  const held = evaluateCriterion({ kind: "text_visible", expected: "1 item left" }, capture);
  assert.equal(held.held, true);
  const wrongCase = evaluateCriterion({ kind: "text_visible", expected: "1 Item left" }, capture);
  assert.equal(wrongCase.held, false);
  assert.equal(typeof wrongCase.observed, "string");
});

test("text_absent holds only when the text does not occur", () => {
  assert.equal(evaluateCriterion({ kind: "text_absent", expected: "2 items left" }, capture).held, true);
  assert.equal(evaluateCriterion({ kind: "text_absent", expected: "Buy  milk" }, capture).held, false);
});

test("url_matches holds when the final URL contains the expected string", () => {
  const held = evaluateCriterion({ kind: "url_matches", expected: "/todomvc/" }, capture);
  assert.equal(held.held, true);
  assert.equal(held.observed, capture.finalUrl);
  assert.equal(evaluateCriterion({ kind: "url_matches", expected: "/active" }, capture).held, false);
});
