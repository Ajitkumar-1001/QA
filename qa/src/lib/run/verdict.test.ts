import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as verdictModule from "./verdict.ts";
import { computeVerdict } from "./verdict.ts";
import type { VerdictInput, VerdictResult } from "./verdict.ts";
import { evaluateCriterion } from "./criteria.ts";
import type { Criterion } from "./criteria.ts";
import { REASON_CODES, REASON_TEXT } from "./status.ts";

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
  assert.equal(v.summary, "PASS. All 3 checks held on the final page.");
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
  assert.equal(v.summary, "FAIL. 1 of 3 checks did not hold on the final page.");
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

const holds: Criterion[] = [
  ...criteria,
  { kind: "text_absent", expected: "2 items left" },
  { kind: "text_visible", expected: "Walk the dog" },
];
const fails: Criterion[] = [
  { kind: "text_visible", expected: "2 items left" },
  { kind: "text_absent", expected: "Buy milk" },
  { kind: "url_matches", expected: "/active" },
];

function completedRun(list: readonly Criterion[]): VerdictResult {
  return computeVerdict({ criteria: list, agent: { completed: true }, capture: goodCapture });
}

test("verdict.ts exports only computeVerdict", () => {
  assert.deepEqual(Object.keys(verdictModule), ["computeVerdict"]);
});

// FR-023: PASS and FAIL keep the evaluated criteria, in criteria order, and carry no reason code.
test("PASS and FAIL return every evaluated criterion in order and no reason code", () => {
  const pass = completedRun(holds);
  assert.deepEqual(pass, {
    verdict: "PASS",
    results: holds.map((c) => evaluateCriterion(c, goodCapture)),
    summary: pass.summary,
  });

  const mixed = [fails[0], holds[0], fails[1], holds[1], fails[2]];
  const fail = completedRun(mixed);
  assert.deepEqual(fail, {
    verdict: "FAIL",
    results: mixed.map((c) => evaluateCriterion(c, goodCapture)),
    summary: fail.summary,
  });
  assert.deepEqual(
    fail.results.map((r) => r.held),
    [false, true, false, true, false],
  );
});

// FR-023: a loop that did not complete wins over a failed capture, and a failed capture over missing criteria.
test("the reason code is the agent's first, then capture_failed, then criteria_unavailable", () => {
  const agentFirst = computeVerdict({
    criteria: [],
    agent: { completed: false, reasonCode: "model_error" },
    capture: { ok: false },
  });
  assert.ok(agentFirst.verdict === "INCONCLUSIVE");
  assert.equal(agentFirst.reasonCode, "model_error");
  assert.deepEqual(agentFirst.results, []);

  const captureNext = computeVerdict({ criteria: [], agent: { completed: true }, capture: { ok: false } });
  assert.ok(captureNext.verdict === "INCONCLUSIVE");
  assert.equal(captureNext.reasonCode, "capture_failed");
  assert.deepEqual(captureNext.results, []);

  const criteriaLast = computeVerdict({ criteria: [], agent: { completed: true }, capture: goodCapture });
  assert.ok(criteriaLast.verdict === "INCONCLUSIVE");
  assert.equal(criteriaLast.reasonCode, "criteria_unavailable");
  assert.deepEqual(criteriaLast.results, []);
});

// FR-029: the PASS text says how many checks held, with "check" when there is one criterion.
test("PASS says the 1 check held for one criterion and all N checks held for 2 to 5", () => {
  const summaries = [
    "PASS. The 1 check held on the final page.",
    "PASS. All 2 checks held on the final page.",
    "PASS. All 3 checks held on the final page.",
    "PASS. All 4 checks held on the final page.",
    "PASS. All 5 checks held on the final page.",
  ];
  for (const [i, summary] of summaries.entries()) {
    const v = completedRun(holds.slice(0, i + 1));
    assert.equal(v.verdict, "PASS");
    assert.equal(v.summary, summary);
  }
});

// FR-029: the FAIL text counts the checks that did not hold; "check" only when there is one criterion.
test("FAIL says k of N checks did not hold, where k counts the checks that did not hold", () => {
  const cases: [Criterion[], string][] = [
    [[fails[0]], "FAIL. 1 of 1 check did not hold on the final page."],
    [[holds[0], fails[0]], "FAIL. 1 of 2 checks did not hold on the final page."],
    [[fails[1], fails[2]], "FAIL. 2 of 2 checks did not hold on the final page."],
    [[fails[0], holds[0], holds[1]], "FAIL. 1 of 3 checks did not hold on the final page."],
    [[holds[0], holds[1], fails[2]], "FAIL. 1 of 3 checks did not hold on the final page."],
    [[holds[0], fails[0], fails[1]], "FAIL. 2 of 3 checks did not hold on the final page."],
    [[fails[0], fails[1], fails[2]], "FAIL. 3 of 3 checks did not hold on the final page."],
    [[holds[0], holds[1], holds[2], holds[3], fails[1]], "FAIL. 1 of 5 checks did not hold on the final page."],
    [[fails[0], fails[1], holds[4], fails[2], fails[0]], "FAIL. 4 of 5 checks did not hold on the final page."],
  ];
  for (const [list, summary] of cases) {
    const v = completedRun(list);
    assert.equal(v.verdict, "FAIL");
    assert.equal(v.summary, summary);
  }
});

// FR-028, FR-029: INCONCLUSIVE says there is no verdict and gives the reason text.
test("INCONCLUSIVE says No verdict followed by the reason text, for every reason code", () => {
  for (const reasonCode of REASON_CODES) {
    const expected: VerdictResult = {
      verdict: "INCONCLUSIVE",
      reasonCode,
      results: [],
      summary: `INCONCLUSIVE. No verdict: ${REASON_TEXT[reasonCode]}`,
    };
    assert.deepEqual(
      computeVerdict({ criteria, agent: { completed: false, reasonCode }, capture: goodCapture }),
      expected,
    );
  }
});

// FR-028, FR-029: the reason text ends the sentence, with one period.
test("INCONCLUSIVE text for a time limit, a failed capture and missing criteria", () => {
  assert.equal(
    computeVerdict({
      criteria,
      agent: { completed: false, reasonCode: "deadline_exceeded" },
      capture: goodCapture,
    }).summary,
    "INCONCLUSIVE. No verdict: The run reached its time limit.",
  );
  assert.deepEqual(computeVerdict({ criteria, agent: { completed: true }, capture: { ok: false } }), {
    verdict: "INCONCLUSIVE",
    reasonCode: "capture_failed",
    results: [],
    summary: "INCONCLUSIVE. No verdict: The final page could not be captured.",
  });
  assert.deepEqual(computeVerdict({ criteria: [], agent: { completed: true }, capture: goodCapture }), {
    verdict: "INCONCLUSIVE",
    reasonCode: "criteria_unavailable",
    results: [],
    summary: "INCONCLUSIVE. No verdict: The objective could not be turned into checks.",
  });
});

// FR-023, FR-029: the summary never repeats the agent's final message.
test("the summary is the same whatever the agent's final message claims", () => {
  const claim = "Success! The objective was achieved and the app works.";
  assert.equal(
    computeVerdict({ criteria, agent: { completed: true, finalMessage: claim }, capture: goodCapture }).summary,
    "PASS. All 3 checks held on the final page.",
  );
  assert.equal(
    computeVerdict({ criteria: [fails[0]], agent: { completed: true, finalMessage: claim }, capture: goodCapture })
      .summary,
    "FAIL. 1 of 1 check did not hold on the final page.",
  );
  assert.equal(
    computeVerdict({
      criteria,
      agent: { completed: false, reasonCode: "step_budget_exhausted", finalMessage: claim },
      capture: goodCapture,
    }).summary,
    "INCONCLUSIVE. No verdict: The agent used all of its steps before finishing.",
  );
});

// FR-029: no summary says the objective was met or the app works.
test("no summary says works, achieved or success, and only criteria_unavailable mentions the objective", () => {
  const summaries: { summary: string; namesObjective: boolean }[] = [];
  for (let n = 1; n <= holds.length; n++) {
    summaries.push({ summary: completedRun(holds.slice(0, n)).summary, namesObjective: false });
    summaries.push({ summary: completedRun([...holds.slice(1, n), fails[0]]).summary, namesObjective: false });
    summaries.push({ summary: completedRun(Array.from({ length: n }, () => fails[1])).summary, namesObjective: false });
  }
  for (const reasonCode of REASON_CODES) {
    const v = computeVerdict({ criteria, agent: { completed: false, reasonCode }, capture: goodCapture });
    summaries.push({ summary: v.summary, namesObjective: reasonCode === "criteria_unavailable" });
  }
  summaries.push({
    summary: computeVerdict({ criteria, agent: { completed: true }, capture: { ok: false } }).summary,
    namesObjective: false,
  });
  summaries.push({ summary: completedRun([]).summary, namesObjective: true });

  for (const { summary, namesObjective } of summaries) {
    assert.doesNotMatch(summary, /works|achieved|success/i);
    if (namesObjective) assert.match(summary, /objective/i);
    else assert.doesNotMatch(summary, /objective/i);
  }
});

// FR-023: computing a verdict leaves its input unchanged.
test("computeVerdict does not change its input", () => {
  const input: VerdictInput = {
    criteria: Object.freeze([fails[0], holds[0], holds[1]].map((c) => Object.freeze({ ...c }))),
    agent: Object.freeze({ completed: true, finalMessage: "Done." }),
    capture: Object.freeze({ ...goodCapture }),
  };
  const before = structuredClone(input);
  computeVerdict(input);
  assert.deepEqual(input, before);
});

// FR-023: each verdict has its own results array, so changing one never changes another.
test("two verdicts never share a results array", () => {
  const inputs: VerdictInput[] = [
    { criteria: [], agent: { completed: true }, capture: goodCapture },
    { criteria, agent: { completed: true }, capture: { ok: false } },
    { criteria, agent: { completed: false, reasonCode: "model_error" }, capture: goodCapture },
    { criteria, agent: { completed: true }, capture: goodCapture },
    { criteria: fails, agent: { completed: true }, capture: goodCapture },
  ];
  for (const input of inputs) {
    assert.notStrictEqual(computeVerdict(input).results, computeVerdict(input).results);
  }
});

// FR-028: the INCONCLUSIVE summary takes its reason text from status.ts.
test("the INCONCLUSIVE summary uses REASON_TEXT imported from status.ts", () => {
  const code = readFileSync(new URL("./verdict.ts", import.meta.url), "utf8").replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    "",
  );
  assert.match(code, /\bimport\s*\{[^}]*\bREASON_TEXT\b[^}]*\}\s*from\s*["']\.\/status\.ts["']/);
});
