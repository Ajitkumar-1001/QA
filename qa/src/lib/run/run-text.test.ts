import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as runText from "./run-text.ts";
import {
  RUN_PHASE_NAMES,
  capRefusalText,
  criterionText,
  progressText,
  runsUsedText,
} from "./run-text.ts";
import type { CapRefusal, RunPhase, RunProgress } from "./run-text.ts";
import { checkRunCaps } from "./caps.ts";
import { CRITERION_KINDS } from "./criteria.ts";
import type { Criterion, CriterionKind, CriterionResult } from "./criteria.ts";
import { STEP_BUDGET } from "./limits.ts";

const CREATED_MS = Date.parse("2026-11-10T12:00:00.000Z");
const DAY_MS = 86_400_000;

function queuedFor(ms: number): RunProgress {
  return { status: "queued", createdAt: new Date(CREATED_MS), now: new Date(CREATED_MS + ms) };
}

function runningText(phase: RunPhase): string {
  return progressText({ status: "running", phase });
}

function refusal(
  reason: CapRefusal["reason"],
  count: number,
  cap: number,
  resetsAt = "2026-12-01T00:00:00.000Z",
): CapRefusal {
  return { ok: false, code: "RATE_LIMITED", reason, count, cap, resetsAt: new Date(resetsAt) };
}

function monthly(count: number, cap: number, resetsAt?: string): string {
  return capRefusalText(refusal("monthly_cap", count, cap, resetsAt));
}

function concurrency(count: number, cap: number): string {
  return capRefusalText(refusal("concurrency_cap", count, cap));
}

test("run-text.ts exports exactly RUN_PHASE_NAMES, capRefusalText, criterionText, progressText and runsUsedText", () => {
  assert.deepEqual(Object.keys(runText).sort(), [
    "RUN_PHASE_NAMES",
    "capRefusalText",
    "criterionText",
    "progressText",
    "runsUsedText",
  ]);
});

// FR-028: the phases of a running run, in the order it passes through them.
test("RUN_PHASE_NAMES is criteria, browser, agent and evaluating, in that order", () => {
  const names: readonly ["criteria", "browser", "agent", "evaluating"] = RUN_PHASE_NAMES;
  const phaseNames: readonly RunPhase["name"][] = names;
  assert.deepEqual(phaseNames, ["criteria", "browser", "agent", "evaluating"]);
});

// FR-028: a queued run shows the time since it was created.
test("a queued run under 60 s shows whole seconds, rounded down", () => {
  const cases: [number, string][] = [
    [0, "Queued 0s ago."],
    [999, "Queued 0s ago."],
    [1_000, "Queued 1s ago."],
    [1_999, "Queued 1s ago."],
    [45_000, "Queued 45s ago."],
    [59_999, "Queued 59s ago."],
  ];
  for (const [ms, text] of cases) assert.equal(progressText(queuedFor(ms)), text, `${ms} ms`);
});

test("a queued run from 60 s shows whole minutes, rounded down", () => {
  const cases: [number, string][] = [
    [60_000, "Queued 1 min ago."],
    [119_999, "Queued 1 min ago."],
    [120_000, "Queued 2 min ago."],
    [240_000, "Queued 4 min ago."],
    [299_999, "Queued 4 min ago."],
    [3_600_000, "Queued 60 min ago."],
    [DAY_MS, "Queued 1440 min ago."],
  ];
  for (const [ms, text] of cases) assert.equal(progressText(queuedFor(ms)), text, `${ms} ms`);
});

// FR-028: the time since creation is measured to the millisecond, whatever the milliseconds of createdAt.
test("a run created at 12:00:00.900 changes text exactly 1 s and 60 s after it", () => {
  const createdAt = new Date("2026-11-10T12:00:00.900Z");
  const at = (iso: string) => progressText({ status: "queued", createdAt, now: new Date(iso) });
  assert.equal(at("2026-11-10T12:00:01.899Z"), "Queued 0s ago.");
  assert.equal(at("2026-11-10T12:00:01.900Z"), "Queued 1s ago.");
  assert.equal(at("2026-11-10T12:01:00.899Z"), "Queued 59s ago.");
  assert.equal(at("2026-11-10T12:01:00.900Z"), "Queued 1 min ago.");
});

// FR-028: the time since creation never goes below 0, for example under clock skew.
test("a queued run whose createdAt is after now shows 0s", () => {
  for (const ms of [-1, -999, -1_000, -60_000, -DAY_MS]) {
    assert.equal(progressText(queuedFor(ms)), "Queued 0s ago.", `${ms} ms`);
  }
});

// FR-028: now comes from the caller, so the text never depends on the clock.
test("a queued run is measured to the now it is given, in the past or the future", () => {
  for (const iso of ["2001-02-03T04:05:06.007Z", "2099-12-31T23:59:00.000Z"]) {
    const createdAt = new Date(iso);
    const now = new Date(createdAt.getTime() + 45_000);
    assert.equal(progressText({ status: "queued", createdAt, now }), "Queued 45s ago.", iso);
  }
});

test("progressText leaves createdAt and now unchanged, also when now is before createdAt", () => {
  const cases: [number, string][] = [
    [150_000, "Queued 2 min ago."],
    [-60_000, "Queued 0s ago."],
  ];
  for (const [ms, text] of cases) {
    const progress = queuedFor(ms);
    const before = structuredClone(progress);
    assert.equal(progressText(progress), text, `${ms} ms`);
    assert.deepEqual(progress, before, `${ms} ms`);
  }
});

// FR-028: a running run shows its current phase.
test("a running run shows creating criteria, starting the browser or evaluating", () => {
  assert.equal(runningText({ name: "criteria" }), "Running: creating criteria.");
  assert.equal(runningText({ name: "browser" }), "Running: starting the browser.");
  assert.equal(runningText({ name: "evaluating" }), "Running: evaluating.");
});

// FR-018, FR-028: the agent phase shows step n of N, where N is the host's step budget and n is shown as given.
test("the agent phase shows the step, as given, of STEP_BUDGET", () => {
  assert.equal(runningText({ name: "agent", step: 2 }), "Running: agent step 2 of 5.");
  for (let step = 1; step <= STEP_BUDGET; step++) {
    assert.equal(runningText({ name: "agent", step }), `Running: agent step ${step} of ${STEP_BUDGET}.`);
  }
  for (const step of [0, STEP_BUDGET + 1]) {
    assert.equal(runningText({ name: "agent", step }), `Running: agent step ${step} of ${STEP_BUDGET}.`);
  }
});

// FR-028: a finished run shows that it is done.
test("a done run shows Done.", () => {
  assert.equal(progressText({ status: "done" }), "Done.");
});

// FR-003: the run form shows the runs used this month against the cap.
test("runsUsedText shows used of cap runs used this month", () => {
  const cases: [number, number, string][] = [
    [3, 100, "3 of 100 runs used this month."],
    [0, 100, "0 of 100 runs used this month."],
    [1, 100, "1 of 100 runs used this month."],
    [100, 100, "100 of 100 runs used this month."],
    [2, 2, "2 of 2 runs used this month."],
    [0, 0, "0 of 0 runs used this month."],
    [1000, 1000, "1000 of 1000 runs used this month."],
  ];
  for (const [used, cap, text] of cases) assert.equal(runsUsedText(used, cap), text);
});

test("runsUsedText says run when the cap is 1, whatever the count", () => {
  assert.equal(runsUsedText(0, 1), "0 of 1 run used this month.");
  assert.equal(runsUsedText(1, 1), "1 of 1 run used this month.");
  assert.equal(runsUsedText(2, 1), "2 of 1 run used this month.");
});

// FR-003: a refusal at the monthly cap gives the count and the date the cap resets.
test("a monthly cap refusal gives the count, the cap and the reset date", () => {
  const now = new Date("2026-11-09T23:30:00.000Z");
  const r = checkRunCaps({ runsInWindow: 100, activeRuns: 0, monthlyCap: 100, concurrencyCap: 2, now });
  assert.ok(!r.ok);
  assert.equal(capRefusalText(r), "Monthly cap reached: 100 of 100 runs used. It resets on 2026-12-01 UTC.");

  const yearEnd = new Date("2026-12-31T23:59:59.000Z");
  const r2 = checkRunCaps({ runsInWindow: 3, activeRuns: 0, monthlyCap: 3, concurrencyCap: 2, now: yearEnd });
  assert.ok(!r2.ok);
  assert.equal(capRefusalText(r2), "Monthly cap reached: 3 of 3 runs used. It resets on 2027-01-01 UTC.");
});

test("a monthly cap refusal says runs unless the cap is 1", () => {
  assert.equal(monthly(2, 2), "Monthly cap reached: 2 of 2 runs used. It resets on 2026-12-01 UTC.");
  assert.equal(monthly(0, 0), "Monthly cap reached: 0 of 0 runs used. It resets on 2026-12-01 UTC.");
  assert.equal(monthly(1, 0), "Monthly cap reached: 1 of 0 runs used. It resets on 2026-12-01 UTC.");
  assert.equal(monthly(1000, 1000), "Monthly cap reached: 1000 of 1000 runs used. It resets on 2026-12-01 UTC.");
  assert.equal(monthly(1, 1), "Monthly cap reached: 1 of 1 run used. It resets on 2026-12-01 UTC.");
  assert.equal(monthly(2, 1), "Monthly cap reached: 2 of 1 run used. It resets on 2026-12-01 UTC.");
});

// FR-003: the reset date is the UTC calendar date of resetsAt, as YYYY-MM-DD.
test("the reset date is resetsAt's UTC date as YYYY-MM-DD, with zero-padded month and day", () => {
  const cases: [string, string][] = [
    ["2027-01-01T00:00:00.000Z", "2027-01-01"],
    ["2027-03-01T00:00:00.000Z", "2027-03-01"],
    ["2026-01-01T00:00:00.000Z", "2026-01-01"],
    ["2026-12-31T23:59:59.999Z", "2026-12-31"],
    ["2099-12-01T00:00:00.000Z", "2099-12-01"],
  ];
  for (const [resetsAt, date] of cases) {
    assert.equal(
      monthly(100, 100, resetsAt),
      `Monthly cap reached: 100 of 100 runs used. It resets on ${date} UTC.`,
    );
  }
});

// FR-003: the reset date does not depend on the server's time zone.
test("the reset date is the UTC date west and east of UTC", () => {
  const savedTz = process.env.TZ;
  try {
    process.env.TZ = "America/Los_Angeles";
    assert.equal(
      monthly(100, 100, "2026-12-01T00:00:00.000Z"),
      "Monthly cap reached: 100 of 100 runs used. It resets on 2026-12-01 UTC.",
    );
    process.env.TZ = "Asia/Tokyo";
    assert.equal(
      monthly(100, 100, "2026-12-31T23:30:00.000Z"),
      "Monthly cap reached: 100 of 100 runs used. It resets on 2026-12-31 UTC.",
    );
  } finally {
    if (savedTz === undefined) delete process.env.TZ;
    else process.env.TZ = savedTz;
  }
});

// FR-004: a refusal at the concurrency cap gives the number of runs in progress.
test("a concurrency cap refusal gives the number of runs in progress", () => {
  const now = new Date("2026-11-09T23:30:00.000Z");
  const r = checkRunCaps({ runsInWindow: 5, activeRuns: 2, monthlyCap: 100, concurrencyCap: 2, now });
  assert.ok(!r.ok);
  assert.equal(
    capRefusalText(r),
    "2 runs are already in progress, the most allowed at once. Start again when one finishes.",
  );
  assert.equal(
    concurrency(8, 8),
    "8 runs are already in progress, the most allowed at once. Start again when one finishes.",
  );
  assert.equal(
    concurrency(3, 2),
    "3 runs are already in progress, the most allowed at once. Start again when one finishes.",
  );
  assert.equal(
    concurrency(0, 0),
    "0 runs are already in progress, the most allowed at once. Start again when one finishes.",
  );
});

test("a concurrency cap refusal says 1 run is when the count is 1, whatever the cap", () => {
  const one = "1 run is already in progress, the most allowed at once. Start again when one finishes.";
  assert.equal(concurrency(1, 1), one);
  assert.equal(concurrency(1, 2), one);
  assert.equal(
    concurrency(2, 1),
    "2 runs are already in progress, the most allowed at once. Start again when one finishes.",
  );
});

test("capRefusalText leaves the refusal unchanged", () => {
  for (const reason of ["monthly_cap", "concurrency_cap"] as const) {
    const r = refusal(reason, 2, 2, "2026-12-31T23:59:59.999Z");
    const before = structuredClone(r);
    capRefusalText(r);
    assert.deepEqual(r, before);
  }
});

// FR-028: each criterion is shown as what was checked.
test("criterionText describes each criterion kind", () => {
  const texts: Record<CriterionKind, string> = {
    text_visible: 'Page shows "1 item left"',
    text_absent: 'Page does not show "1 item left"',
    url_matches: 'URL contains "1 item left"',
  };
  for (const kind of CRITERION_KINDS) {
    assert.equal(criterionText({ kind, expected: "1 item left" }), texts[kind]);
  }
  assert.equal(criterionText({ kind: "text_visible", expected: "Buy milk" }), 'Page shows "Buy milk"');
  assert.equal(criterionText({ kind: "text_absent", expected: "2 items left" }), 'Page does not show "2 items left"');
  assert.equal(criterionText({ kind: "url_matches", expected: "todomvc" }), 'URL contains "todomvc"');
});

// FR-028, FR-029, FR-031: expected is inserted as given, at any length and whatever words it holds; it is escaped only when rendered as text.
test("criterionText inserts expected unchanged, without escaping, trimming, cutting or filtering it", () => {
  const raw = '  Say "hi" \\ $& $$ <script>alert(1)</script> &amp;  a\nb ';
  const claim = "Checkout works: the objective was achieved. SUCCESS!";
  for (const expected of [raw, claim, "x".repeat(200), "x".repeat(201)]) {
    assert.equal(criterionText({ kind: "text_visible", expected }), `Page shows "${expected}"`);
    assert.equal(criterionText({ kind: "text_absent", expected }), `Page does not show "${expected}"`);
    assert.equal(criterionText({ kind: "url_matches", expected }), `URL contains "${expected}"`);
  }
});

// FR-028: a stored result shows what was checked; its observed value is shown apart from it.
test("criterionText of a stored result gives only what was checked and leaves it unchanged", () => {
  const result: CriterionResult = Object.freeze({
    kind: "url_matches",
    expected: "todomvc",
    held: false,
    observed: "https://example.com/",
  });
  assert.equal(criterionText(result), 'URL contains "todomvc"');
  const criterion: Criterion = Object.freeze({ kind: "text_absent", expected: "2 items left" });
  assert.equal(criterionText(criterion), 'Page does not show "2 items left"');
  assert.deepEqual(criterion, { kind: "text_absent", expected: "2 items left" });
});

// FR-029: the wording run-text.ts adds never says the objective was met or the app works.
test("the wording run-text.ts adds never says objective, works, achieved or success", () => {
  const texts = [
    ...[0, 45_000, 60_000, 3_600_000, -1].map((ms) => progressText(queuedFor(ms))),
    runningText({ name: "criteria" }),
    runningText({ name: "browser" }),
    ...[1, 2, STEP_BUDGET].map((step) => runningText({ name: "agent", step })),
    runningText({ name: "evaluating" }),
    progressText({ status: "done" }),
    runsUsedText(3, 100),
    runsUsedText(0, 1),
    monthly(100, 100),
    monthly(1, 1),
    concurrency(2, 2),
    concurrency(1, 1),
    ...CRITERION_KINDS.map((kind) => criterionText({ kind, expected: "1 item left" })),
  ];
  for (const text of texts) assert.doesNotMatch(text, /objective|works|achieved|success/i, text);
});

function runTextCode(): string {
  return readFileSync(new URL("./run-text.ts", import.meta.url), "utf8").replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    "",
  );
}

// FR-028: now always comes from the caller.
test("run-text.ts never reads the clock", () => {
  const code = runTextCode();
  assert.doesNotMatch(code, /\bDate\s*\.\s*now\b/);
  assert.doesNotMatch(code, /\bnew\s+Date\s*(?:\(\s*\))?(?!\s*\()/);
  assert.doesNotMatch(code, /(?<![\w$.])(?<!\bnew\s+)Date\s*\(/);
  assert.doesNotMatch(code, /\bperformance\s*\.\s*now\b|\bprocess\s*\.\s*hrtime\b|\bTemporal\s*\.\s*Now\b/);
});

// FR-018, FR-028: the step budget shown is the one the host enforces.
test("run-text.ts takes STEP_BUDGET from limits.ts", () => {
  assert.match(runTextCode(), /\bimport\s*\{[^}]*\bSTEP_BUDGET\b[^}]*\}\s*from\s*["']\.\/limits\.ts["']/);
});
