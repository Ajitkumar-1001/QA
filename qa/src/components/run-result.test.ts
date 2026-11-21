import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as runResultModule from "./run-result.ts";
import { RunResult } from "./run-result.ts";
import type { ResultEvidence, ResultScreenshot, RunResultProps } from "./run-result.ts";
import { CapturedText } from "./captured-text.ts";
import { PAGE_TEXT_MAX_BYTES } from "../lib/agent/untrusted.ts";
import { CONSOLE_LOG_MAX_ENTRIES, NETWORK_LOG_MAX_ENTRIES } from "../lib/evidence/capture.ts";
import type { CaptureTruncation, ConsoleEntry, NetworkEntry } from "../lib/evidence/capture.ts";
import type { Criterion } from "../lib/run/criteria.ts";
import type { RunMeasurements } from "../lib/run/measurements.ts";
import type { RunPhase } from "../lib/run/run-text.ts";
import { REASON_CODES } from "../lib/run/status.ts";
import type { ReasonCode } from "../lib/run/status.ts";
import { computeVerdict } from "../lib/run/verdict.ts";
import type { VerdictResult } from "../lib/run/verdict.ts";

type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const FINAL_URL = "https://demo.playwright.dev/todomvc/#/";
const PAGE_TEXT = "Buy milk Walk the dog 1 item left";
const MODEL_ID = "test-model-2026-01-01";
const SCREENSHOT: ResultScreenshot = { src: "data:image/png;base64,iVBORw0KGgo=", width: 1280, height: 720 };
const SCREENSHOT_IMG =
  '<img src="data:image/png;base64,iVBORw0KGgo=" width="1280" height="720" alt="Screenshot of the final page" class="h-auto max-w-full"/>';
const CONSOLE_LOG: readonly ConsoleEntry[] = [
  { level: "log", text: "Loaded 2 todos" },
  { level: "warning", text: "Slow response from /api/todos" },
];
const NETWORK_LOG: readonly NetworkEntry[] = [
  { method: "GET", url: "https://demo.playwright.dev/todomvc/", status: 200 },
  { method: "GET", url: "https://demo.playwright.dev/todomvc/missing.js", status: 404 },
  { method: "POST", url: "https://demo.playwright.dev/api/todos", status: null },
];
const NO_TRUNCATION: CaptureTruncation = { pageText: false, consoleDropped: 0, networkDropped: 0 };
const FULL_EVIDENCE: ResultEvidence = {
  finalUrl: FINAL_URL,
  screenshot: SCREENSHOT,
  pageText: PAGE_TEXT,
  consoleLog: CONSOLE_LOG,
  networkLog: NETWORK_LOG,
  truncated: NO_TRUNCATION,
};
const CRITERIA: Criterion[] = [
  { kind: "text_visible", expected: "Buy milk" },
  { kind: "text_absent", expected: "2 items left" },
  { kind: "url_matches", expected: "todomvc" },
];
const FULL_MEASUREMENTS: RunMeasurements = {
  modelId: MODEL_ID,
  sandboxStartMs: 1234.4,
  browserInstallMs: 8999.5,
  stepDurationsMs: [3000, 2500.5, 4100.4],
  modelCalls: [
    { kind: "criteria", inputTokens: 1200, outputTokens: 80 },
    { kind: "agent", inputTokens: 3400, outputTokens: 150 },
    { kind: "agent", inputTokens: 5100, outputTokens: 210 },
    { kind: "agent", inputTokens: 12000, outputTokens: 95 },
  ],
  sandboxActiveCpuMs: 49000.6,
  totalDurationMs: 61000,
};
const SPARSE_MEASUREMENTS: RunMeasurements = { modelId: MODEL_ID, stepDurationsMs: [], modelCalls: [] };
const SPARSE_ROWS = [
  "<dt>Model</dt><dd>test-model-2026-01-01</dd>",
  "<dt>Sandbox start</dt><dd>not recorded</dd>",
  "<dt>Browser install</dt><dd>not recorded</dd>",
  "<dt>Agent steps</dt><dd>not recorded</dd>",
  "<dt>Model calls</dt><dd>not recorded</dd>",
  "<dt>Total tokens</dt><dd>0 in, 0 out</dd>",
  "<dt>Total duration</dt><dd>not recorded</dd>",
];
const NO_EVIDENCE = "<p>No evidence was captured.</p>";
const NO_MEASUREMENTS = "<p>No measurements were recorded.</p>";
const DEADLINE_HEADING = "INCONCLUSIVE. No verdict: The run reached its time limit.";
const SCRIPT = "<script>alert(1)</script>";
const IMG = "<img src=x onerror=alert(1)>";

function verdictFor(criteria: readonly Criterion[], pageText = PAGE_TEXT): VerdictResult {
  return computeVerdict({ criteria, agent: { completed: true }, capture: { ok: true, finalUrl: FINAL_URL, pageText } });
}

function inconclusive(reasonCode: ReasonCode): VerdictResult {
  return computeVerdict({
    criteria: CRITERIA,
    agent: { completed: false, reasonCode },
    capture: { ok: true, finalUrl: FINAL_URL, pageText: PAGE_TEXT },
  });
}

function done(verdict: VerdictResult, evidence: ResultEvidence, measurements?: RunMeasurements): RunResultProps {
  return measurements === undefined
    ? { status: "done", verdict, evidence }
    : { status: "done", verdict, evidence, measurements };
}

function render(props: RunResultProps): string {
  return renderToStaticMarkup(createElement(RunResult, props));
}

function normalized(html: string): string {
  return html.replace(
    /<([a-z][a-z0-9]*)((?: [a-z-]+="[^"]*")*)(\/?)>/g,
    (_tag: string, name: string, attributes: string, end: string) =>
      `<${name}${(attributes.match(/ [a-z-]+="[^"]*"/g) ?? []).sort().join("")}${end}>`,
  );
}

function assertView(props: RunResultProps, expected: string): void {
  assert.equal(normalized(render(props)), normalized(expected));
}

function captured(kind: "page_text" | "console" | "network", content: unknown): string {
  return renderToStaticMarkup(createElement(CapturedText, { kind, content }));
}

function section(id: string, title: string, body: string): string {
  return `<section aria-labelledby="${id}"><h3 id="${id}">${title}</h3>${body}</section>`;
}

function checks(...items: string[]): string {
  return section("result-checks", "Checks", `<ul>${items.join("")}</ul>`);
}

function check(text: string, observed: string): string {
  return `<li><p>${text}</p><p>Observed: ${observed}</p></li>`;
}

function doneView(heading: string, checksHtml: string, evidenceHtml: string, measurementsHtml: string): string {
  return [
    "<div><p>Done.</p>",
    `<h2>${heading}</h2>`,
    checksHtml,
    section("result-evidence", "Evidence", evidenceHtml),
    section("result-measurements", "Measurements", measurementsHtml),
    "</div>",
  ].join("");
}

function assertEvidence(evidence: ResultEvidence, parts: string[]): void {
  assertView(done(inconclusive("deadline_exceeded"), evidence), doneView(DEADLINE_HEADING, "", parts.join(""), NO_MEASUREMENTS));
}

function assertMeasurements(measurements: RunMeasurements, rows: string[]): void {
  assertView(
    done(inconclusive("deadline_exceeded"), {}, measurements),
    doneView(DEADLINE_HEADING, "", NO_EVIDENCE, `<dl>${rows.join("")}</dl>`),
  );
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function occurrences(html: string, text: string): number {
  return html.split(text).length - 1;
}

test("run-result.ts exports only RunResult, and its prop types are exactly the specified ones", () => {
  assert.deepEqual(Object.keys(runResultModule), ["RunResult"]);
  const exact: [
    Same<ResultScreenshot, { src: string; width: number; height: number }>,
    Same<
      ResultEvidence,
      {
        finalUrl?: string;
        pageText?: string;
        consoleLog?: readonly ConsoleEntry[];
        networkLog?: readonly NetworkEntry[];
        screenshot?: ResultScreenshot;
        truncated?: CaptureTruncation;
      }
    >,
    Same<
      RunResultProps,
      | { status: "queued"; createdAt: Date; now: Date }
      | { status: "running"; phase: RunPhase }
      | { status: "done"; verdict: VerdictResult; evidence: ResultEvidence; measurements?: RunMeasurements }
    >,
    Same<typeof RunResult, (props: RunResultProps) => ReactElement>,
  ] = [true, true, true, true];
  assert.deepEqual(exact, [true, true, true, true]);
});

// FR-028: a queued run shows only the time since it was created, measured to the now it is given.
test("a queued run shows only Queued with the time from createdAt to the given now", () => {
  const cases: [string, string, string][] = [
    ["2026-11-10T12:00:00.000Z", "2026-11-10T12:00:45.000Z", "Queued 45s ago."],
    ["2026-11-10T12:00:00.000Z", "2026-11-10T12:02:30.000Z", "Queued 2 min ago."],
    ["2001-02-03T04:05:06.007Z", "2001-02-03T04:05:51.007Z", "Queued 45s ago."],
  ];
  for (const [createdAt, now, text] of cases) {
    assertView({ status: "queued", createdAt: new Date(createdAt), now: new Date(now) }, `<div><p>${text}</p></div>`);
  }
});

// FR-028: a running run shows only its current phase.
test("a running run shows only its current phase", () => {
  const cases: [RunPhase, string][] = [
    [{ name: "criteria" }, "Running: creating criteria."],
    [{ name: "browser" }, "Running: starting the browser."],
    [{ name: "agent", step: 2 }, "Running: agent step 2 of 5."],
    [{ name: "agent", step: 5 }, "Running: agent step 5 of 5."],
    [{ name: "evaluating" }, "Running: evaluating."],
  ];
  for (const [phase, text] of cases) {
    assertView({ status: "running", phase }, `<div><p>${text}</p></div>`);
  }
});

// FR-026, FR-028, FR-029: a done PASS run shows Done., the summary, each check, the evidence and the measurements, in that order.
test("a done PASS run shows Done., the PASS summary, every check as held with its observed value, the evidence and the measurements", () => {
  assertView(
    done(verdictFor(CRITERIA), FULL_EVIDENCE, FULL_MEASUREMENTS),
    [
      "<div>",
      "<p>Done.</p>",
      "<h2>PASS. All 3 checks held on the final page.</h2>",
      '<section aria-labelledby="result-checks"><h3 id="result-checks">Checks</h3><ul>',
      "<li><p>Page shows &quot;Buy milk&quot;: held</p><p>Observed: found &quot;Buy milk&quot;</p></li>",
      "<li><p>Page does not show &quot;2 items left&quot;: held</p>",
      "<p>Observed: not found in page text: Buy milk Walk the dog 1 item left</p></li>",
      "<li><p>URL contains &quot;todomvc&quot;: held</p><p>Observed: https://demo.playwright.dev/todomvc/#/</p></li>",
      "</ul></section>",
      '<section aria-labelledby="result-evidence"><h3 id="result-evidence">Evidence</h3>',
      "<p>Final URL: https://demo.playwright.dev/todomvc/#/</p>",
      SCREENSHOT_IMG,
      captured("page_text", PAGE_TEXT),
      captured("console", CONSOLE_LOG),
      captured("network", NETWORK_LOG),
      "</section>",
      '<section aria-labelledby="result-measurements"><h3 id="result-measurements">Measurements</h3><dl>',
      "<dt>Model</dt><dd>test-model-2026-01-01</dd>",
      "<dt>Sandbox start</dt><dd>1234 ms</dd>",
      "<dt>Browser install</dt><dd>9000 ms</dd>",
      "<dt>Agent steps</dt><dd>Step 1: 3000 ms</dd><dd>Step 2: 2501 ms</dd><dd>Step 3: 4100 ms</dd>",
      "<dt>Model calls</dt><dd>Criteria call: 1200 in, 80 out</dd><dd>Agent call: 3400 in, 150 out</dd>",
      "<dd>Agent call: 5100 in, 210 out</dd><dd>Agent call: 12000 in, 95 out</dd>",
      "<dt>Total tokens</dt><dd>21700 in, 535 out</dd>",
      "<dt>Total duration</dt><dd>61000 ms</dd>",
      "<dt>Sandbox active CPU</dt><dd>49001 ms</dd>",
      "</dl></section>",
      "</div>",
    ].join(""),
  );
});

// FR-028, FR-029: a FAIL shows its summary, and the check that did not hold as not held with its observed value.
test("a done FAIL run shows the FAIL summary and the check that did not hold as not held with its observed value", () => {
  assertView(
    done(verdictFor(CRITERIA, "Buy milk Walk the dog 2 items left"), { finalUrl: FINAL_URL }),
    doneView(
      "FAIL. 1 of 3 checks did not hold on the final page.",
      checks(
        check("Page shows &quot;Buy milk&quot;: held", "found &quot;Buy milk&quot;"),
        check("Page does not show &quot;2 items left&quot;: not held", "found &quot;2 items left&quot;"),
        check("URL contains &quot;todomvc&quot;: held", FINAL_URL),
      ),
      `<p>Final URL: ${FINAL_URL}</p>`,
      NO_MEASUREMENTS,
    ),
  );
});

// FR-028: every check is listed in the order of the results, each held or not held as its result says.
test("checks follow the order of the results, each with its own held or not held and observed value", () => {
  const verdict = verdictFor([
    { kind: "text_visible", expected: "3 items left" },
    { kind: "url_matches", expected: "todomvc" },
    { kind: "text_absent", expected: "Buy milk" },
  ]);
  assertView(
    done(verdict, {}),
    doneView(
      "FAIL. 2 of 3 checks did not hold on the final page.",
      checks(
        check("Page shows &quot;3 items left&quot;: not held", `not found in page text: ${PAGE_TEXT}`),
        check("URL contains &quot;todomvc&quot;: held", FINAL_URL),
        check("Page does not show &quot;Buy milk&quot;: not held", "found &quot;Buy milk&quot;"),
      ),
      NO_EVIDENCE,
      NO_MEASUREMENTS,
    ),
  );
});

// FR-029: the heading is the verdict's own summary, which says check for a single criterion.
test("the heading is the verdict summary for a single criterion that held or did not hold", () => {
  assertView(
    done(verdictFor([CRITERIA[2]]), {}),
    doneView(
      "PASS. The 1 check held on the final page.",
      checks(check("URL contains &quot;todomvc&quot;: held", FINAL_URL)),
      NO_EVIDENCE,
      NO_MEASUREMENTS,
    ),
  );
  assertView(
    done(verdictFor([{ kind: "text_visible", expected: "3 items left" }]), {}),
    doneView(
      "FAIL. 1 of 1 check did not hold on the final page.",
      checks(check("Page shows &quot;3 items left&quot;: not held", `not found in page text: ${PAGE_TEXT}`)),
      NO_EVIDENCE,
      NO_MEASUREMENTS,
    ),
  );
});

// FR-029: the heading is the summary the verdict carries, never one rebuilt from its results or reason code.
test("the heading is the verdict's stored summary exactly as given, for PASS, FAIL and INCONCLUSIVE", () => {
  const cases: [VerdictResult, string][] = [
    [
      {
        verdict: "PASS",
        results: [{ kind: "url_matches", expected: "todomvc", held: true, observed: FINAL_URL }],
        summary: "Stored PASS summary.",
      },
      checks(check("URL contains &quot;todomvc&quot;: held", FINAL_URL)),
    ],
    [
      {
        verdict: "FAIL",
        results: [{ kind: "text_visible", expected: "3 items left", held: false, observed: `not found in page text: ${PAGE_TEXT}` }],
        summary: "Stored FAIL summary.",
      },
      checks(check("Page shows &quot;3 items left&quot;: not held", `not found in page text: ${PAGE_TEXT}`)),
    ],
    [{ verdict: "INCONCLUSIVE", reasonCode: "lease_expired", results: [], summary: "Stored INCONCLUSIVE summary." }, ""],
  ];
  for (const [verdict, checksHtml] of cases) {
    assertView(done(verdict, {}), doneView(verdict.summary, checksHtml, NO_EVIDENCE, NO_MEASUREMENTS));
  }
});

// FR-028: an INCONCLUSIVE run shows its reason text and whatever evidence was captured, with no Checks section.
test("a done INCONCLUSIVE run shows the reason in its heading, no Checks section and whatever evidence was captured", () => {
  const verdict = computeVerdict({ criteria: CRITERIA, agent: { completed: true }, capture: { ok: false } });
  assertView(
    done(verdict, { consoleLog: CONSOLE_LOG, networkLog: NETWORK_LOG }, {
      modelId: MODEL_ID,
      sandboxStartMs: 950,
      browserInstallMs: 8200,
      stepDurationsMs: [4100.2],
      modelCalls: [
        { kind: "criteria", inputTokens: 900, outputTokens: 40 },
        { kind: "agent", inputTokens: 2600, outputTokens: 120 },
      ],
    }),
    doneView(
      "INCONCLUSIVE. No verdict: The final page could not be captured.",
      "",
      captured("console", CONSOLE_LOG) + captured("network", NETWORK_LOG),
      [
        "<dl>",
        "<dt>Model</dt><dd>test-model-2026-01-01</dd>",
        "<dt>Sandbox start</dt><dd>950 ms</dd>",
        "<dt>Browser install</dt><dd>8200 ms</dd>",
        "<dt>Agent steps</dt><dd>Step 1: 4100 ms</dd>",
        "<dt>Model calls</dt><dd>Criteria call: 900 in, 40 out</dd><dd>Agent call: 2600 in, 120 out</dd>",
        "<dt>Total tokens</dt><dd>3500 in, 160 out</dd>",
        "<dt>Total duration</dt><dd>not recorded</dd>",
        "</dl>",
      ].join(""),
    ),
  );
});

// FR-028: the Checks section depends only on whether the verdict has results.
test("an INCONCLUSIVE verdict that carries results lists them as checks", () => {
  const verdict: VerdictResult = {
    verdict: "INCONCLUSIVE",
    reasonCode: "step_budget_exhausted",
    results: [{ kind: "url_matches", expected: "todomvc", held: true, observed: FINAL_URL }],
    summary: "INCONCLUSIVE. No verdict: The agent used all of its steps before finishing.",
  };
  assertView(
    done(verdict, {}),
    doneView(
      "INCONCLUSIVE. No verdict: The agent used all of its steps before finishing.",
      checks(check("URL contains &quot;todomvc&quot;: held", FINAL_URL)),
      NO_EVIDENCE,
      NO_MEASUREMENTS,
    ),
  );
});

// FR-028: every INCONCLUSIVE reason is followed by the Evidence and Measurements sections, with whatever they were given.
test("every INCONCLUSIVE reason shows its summary, then the evidence and the measurements it is given", () => {
  for (const code of REASON_CODES) {
    const verdict = inconclusive(code);
    assertView(
      done(verdict, { finalUrl: FINAL_URL }, SPARSE_MEASUREMENTS),
      doneView(verdict.summary, "", `<p>Final URL: ${FINAL_URL}</p>`, `<dl>${SPARSE_ROWS.join("")}</dl>`),
    );
  }
});

// FR-028, FR-031: each evidence part is shown alone when it is the only one, the final URL as text and never as a link.
test("each evidence part is shown on its own when it is the only part present, and the final URL is not a link", () => {
  const cases: [ResultEvidence, string][] = [
    [{ finalUrl: FINAL_URL }, `<p>Final URL: ${FINAL_URL}</p>`],
    [{ screenshot: SCREENSHOT }, SCREENSHOT_IMG],
    [{ pageText: PAGE_TEXT }, captured("page_text", PAGE_TEXT)],
    [{ consoleLog: CONSOLE_LOG }, captured("console", CONSOLE_LOG)],
    [{ networkLog: NETWORK_LOG }, captured("network", NETWORK_LOG)],
  ];
  for (const [evidence, part] of cases) assertEvidence(evidence, [part]);
  assert.doesNotMatch(render(done(inconclusive("deadline_exceeded"), FULL_EVIDENCE)), /<a\b/);
});

// FR-028: the screenshot is an image with the given source, width and height.
test("the screenshot is an img with the given source, width and height, the fixed alt text and classes", () => {
  assertEvidence({ screenshot: { src: "data:image/png;base64,AAAA", width: 390, height: 844 } }, [
    '<img src="data:image/png;base64,AAAA" width="390" height="844" alt="Screenshot of the final page" class="h-auto max-w-full"/>',
  ]);
});

// FR-028: a screenshot source that is a URL rather than a data: URI is used as given.
test("a screenshot whose source is a URL is an img with that source, and is not a link", () => {
  // For a URL source, renderToStaticMarkup puts React's own preload <link> before the root <div>, so only the img is compared.
  const html = render(
    done(inconclusive("deadline_exceeded"), { screenshot: { src: "/api/runs/run-1/screenshot", width: 1280, height: 720 } }),
  );
  const img =
    '<img src="/api/runs/run-1/screenshot" width="1280" height="720" alt="Screenshot of the final page" class="h-auto max-w-full"/>';
  assert.equal(occurrences(normalized(html), normalized(img)), 1);
  assert.doesNotMatch(html, /<a\b/);
});

// FR-028: a note follows each part that was cut or had entries dropped.
test("a note follows the page text when it was cut, and each log when entries were dropped", () => {
  assertEvidence({ ...FULL_EVIDENCE, truncated: { pageText: true, consoleDropped: 7, networkDropped: 1 } }, [
    `<p>Final URL: ${FINAL_URL}</p>`,
    SCREENSHOT_IMG,
    captured("page_text", PAGE_TEXT),
    "<p>Page text was cut to its size limit.</p>",
    captured("console", CONSOLE_LOG),
    "<p>7 console entries were dropped.</p>",
    captured("network", NETWORK_LOG),
    "<p>1 network entry was dropped.</p>",
  ]);
  assertEvidence({ ...FULL_EVIDENCE, truncated: { pageText: false, consoleDropped: 1, networkDropped: 500 } }, [
    `<p>Final URL: ${FINAL_URL}</p>`,
    SCREENSHOT_IMG,
    captured("page_text", PAGE_TEXT),
    captured("console", CONSOLE_LOG),
    "<p>1 console entry was dropped.</p>",
    captured("network", NETWORK_LOG),
    "<p>500 network entries were dropped.</p>",
  ]);
});

// FR-028: a drop note appears only when the count is above 0, and says entry when it is 1.
test("drop notes appear only above 0, with entry for 1 and entries for any other count", () => {
  const cases: [number, string, string][] = [
    [-1, "", ""],
    [0, "", ""],
    [1, "<p>1 console entry was dropped.</p>", "<p>1 network entry was dropped.</p>"],
    [2, "<p>2 console entries were dropped.</p>", "<p>2 network entries were dropped.</p>"],
    [1500, "<p>1500 console entries were dropped.</p>", "<p>1500 network entries were dropped.</p>"],
  ];
  for (const [count, consoleNote, networkNote] of cases) {
    assertEvidence(
      {
        consoleLog: CONSOLE_LOG,
        networkLog: NETWORK_LOG,
        truncated: { pageText: false, consoleDropped: count, networkDropped: count },
      },
      [captured("console", CONSOLE_LOG), consoleNote, captured("network", NETWORK_LOG), networkNote],
    );
  }
});

// FR-028: a truncation note appears only with the part it describes.
test("a truncation note appears only with its own part", () => {
  const truncated: CaptureTruncation = { pageText: true, consoleDropped: 3, networkDropped: 2 };
  assertEvidence({ finalUrl: FINAL_URL, screenshot: SCREENSHOT, truncated }, [`<p>Final URL: ${FINAL_URL}</p>`, SCREENSHOT_IMG]);
  assertEvidence({ pageText: PAGE_TEXT, truncated }, [
    captured("page_text", PAGE_TEXT),
    "<p>Page text was cut to its size limit.</p>",
  ]);
  assertEvidence({ consoleLog: CONSOLE_LOG, truncated }, [
    captured("console", CONSOLE_LOG),
    "<p>3 console entries were dropped.</p>",
  ]);
  assertEvidence({ networkLog: NETWORK_LOG, truncated }, [
    captured("network", NETWORK_LOG),
    "<p>2 network entries were dropped.</p>",
  ]);
});

// FR-028: with no evidence part present, the Evidence section says so and nothing else.
test("No evidence was captured. is all the Evidence section holds when no part is present, even with a truncation record", () => {
  assertEvidence({}, [NO_EVIDENCE]);
  assertEvidence({ truncated: { pageText: true, consoleDropped: 3, networkDropped: 1 } }, [NO_EVIDENCE]);
});

// FR-028: an evidence key set to undefined is not present.
test("evidence keys set to undefined are not present, alone or beside a part that is", () => {
  const unset: ResultEvidence = {
    finalUrl: undefined,
    screenshot: undefined,
    pageText: undefined,
    consoleLog: undefined,
    networkLog: undefined,
    truncated: undefined,
  };
  assertEvidence(unset, [NO_EVIDENCE]);
  assertEvidence({ ...unset, finalUrl: FINAL_URL }, [`<p>Final URL: ${FINAL_URL}</p>`]);
  assertEvidence({ ...unset, networkLog: NETWORK_LOG }, [captured("network", NETWORK_LOG)]);
});

// FR-028: a part that was captured empty is still present.
test("an empty final URL, page text, console log or network log is present and shown, alone or together", () => {
  const cases: [ResultEvidence, string][] = [
    [{ finalUrl: "" }, "<p>Final URL: </p>"],
    [{ pageText: "" }, captured("page_text", "")],
    [{ consoleLog: [] }, captured("console", [])],
    [{ networkLog: [] }, captured("network", [])],
  ];
  for (const [evidence, part] of cases) assertEvidence(evidence, [part]);
  assertEvidence(
    { finalUrl: "", pageText: "", consoleLog: [], networkLog: [] },
    cases.map(([, part]) => part),
  );
});

// FR-028: the view shows each part in full; the capture limits are applied before the evidence is stored.
test("evidence at the capture limits is shown in full, with nothing cut or dropped by the view", () => {
  const pageText = "a".repeat(PAGE_TEXT_MAX_BYTES);
  const consoleLog: ConsoleEntry[] = Array.from({ length: CONSOLE_LOG_MAX_ENTRIES }, (_, i) => ({
    level: "log",
    text: `entry ${i + 1}`,
  }));
  const networkLog: NetworkEntry[] = Array.from({ length: NETWORK_LOG_MAX_ENTRIES }, (_, i) => ({
    method: "GET",
    url: `https://demo.playwright.dev/todomvc/asset-${i + 1}.js`,
    status: 200,
  }));
  assertEvidence({ pageText }, [captured("page_text", pageText)]);
  assertEvidence({ consoleLog }, [captured("console", consoleLog)]);
  assertEvidence({ networkLog }, [captured("network", networkLog)]);
});

// FR-026: without measurements, the Measurements section says so; with them, every item is listed, missing values as not recorded.
test("measurements list every item, with not recorded for each missing value, or say none were recorded", () => {
  assertView(
    done(inconclusive("deadline_exceeded"), {}),
    doneView(DEADLINE_HEADING, "", NO_EVIDENCE, NO_MEASUREMENTS),
  );
  assertMeasurements(SPARSE_MEASUREMENTS, SPARSE_ROWS);
  assertMeasurements(
    {
      modelId: MODEL_ID,
      stepDurationsMs: [],
      modelCalls: [{ kind: "criteria", inputTokens: 900, outputTokens: 40 }],
      totalDurationMs: 15000,
    },
    [
      "<dt>Model</dt><dd>test-model-2026-01-01</dd>",
      "<dt>Sandbox start</dt><dd>not recorded</dd>",
      "<dt>Browser install</dt><dd>not recorded</dd>",
      "<dt>Agent steps</dt><dd>not recorded</dd>",
      "<dt>Model calls</dt><dd>Criteria call: 900 in, 40 out</dd>",
      "<dt>Total tokens</dt><dd>900 in, 40 out</dd>",
      "<dt>Total duration</dt><dd>15000 ms</dd>",
    ],
  );
});

// FR-026: measurements, or a measured value, set to undefined count as not recorded.
test("measurements set to undefined say none were recorded, and a value set to undefined is not recorded", () => {
  assertView(
    { status: "done", verdict: inconclusive("deadline_exceeded"), evidence: {}, measurements: undefined },
    doneView(DEADLINE_HEADING, "", NO_EVIDENCE, NO_MEASUREMENTS),
  );
  assertMeasurements(
    {
      ...SPARSE_MEASUREMENTS,
      sandboxStartMs: undefined,
      browserInstallMs: undefined,
      sandboxActiveCpuMs: undefined,
      totalDurationMs: undefined,
    },
    SPARSE_ROWS,
  );
});

// FR-026: a measured 0 is a value, not a missing one.
test("a measured 0 shows as 0 ms or 0 tokens, and a sandbox active CPU of 0 is listed", () => {
  assertMeasurements(
    {
      modelId: MODEL_ID,
      sandboxStartMs: 0,
      browserInstallMs: 0,
      stepDurationsMs: [0],
      modelCalls: [{ kind: "agent", inputTokens: 0, outputTokens: 0 }],
      sandboxActiveCpuMs: 0,
      totalDurationMs: 0,
    },
    [
      "<dt>Model</dt><dd>test-model-2026-01-01</dd>",
      "<dt>Sandbox start</dt><dd>0 ms</dd>",
      "<dt>Browser install</dt><dd>0 ms</dd>",
      "<dt>Agent steps</dt><dd>Step 1: 0 ms</dd>",
      "<dt>Model calls</dt><dd>Agent call: 0 in, 0 out</dd>",
      "<dt>Total tokens</dt><dd>0 in, 0 out</dd>",
      "<dt>Total duration</dt><dd>0 ms</dd>",
      "<dt>Sandbox active CPU</dt><dd>0 ms</dd>",
    ],
  );
});

// FR-026: durations are whole milliseconds, rounded to the nearest, with no separators.
test("durations are rounded to the nearest whole millisecond and shown without separators", () => {
  assertMeasurements(
    {
      modelId: MODEL_ID,
      sandboxStartMs: 0.4,
      browserInstallMs: 0.5,
      stepDurationsMs: [1234.4, 1234.5, 1234.6],
      modelCalls: [],
      sandboxActiveCpuMs: 99999.4,
      totalDurationMs: 120000.5,
    },
    [
      "<dt>Model</dt><dd>test-model-2026-01-01</dd>",
      "<dt>Sandbox start</dt><dd>0 ms</dd>",
      "<dt>Browser install</dt><dd>1 ms</dd>",
      "<dt>Agent steps</dt><dd>Step 1: 1234 ms</dd><dd>Step 2: 1235 ms</dd><dd>Step 3: 1235 ms</dd>",
      "<dt>Model calls</dt><dd>not recorded</dd>",
      "<dt>Total tokens</dt><dd>0 in, 0 out</dd>",
      "<dt>Total duration</dt><dd>120001 ms</dd>",
      "<dt>Sandbox active CPU</dt><dd>99999 ms</dd>",
    ],
  );
});

// FR-026: model calls keep the order they were made in, and the totals add up every call.
test("model calls are listed in the order given, each with its kind and token counts, and totals sum every call", () => {
  assertMeasurements(
    {
      modelId: MODEL_ID,
      stepDurationsMs: [5000],
      modelCalls: [
        { kind: "agent", inputTokens: 3400, outputTokens: 150 },
        { kind: "criteria", inputTokens: 1200, outputTokens: 80 },
        { kind: "agent", inputTokens: 12000, outputTokens: 1050 },
      ],
    },
    [
      "<dt>Model</dt><dd>test-model-2026-01-01</dd>",
      "<dt>Sandbox start</dt><dd>not recorded</dd>",
      "<dt>Browser install</dt><dd>not recorded</dd>",
      "<dt>Agent steps</dt><dd>Step 1: 5000 ms</dd>",
      "<dt>Model calls</dt><dd>Agent call: 3400 in, 150 out</dd><dd>Criteria call: 1200 in, 80 out</dd>",
      "<dd>Agent call: 12000 in, 1050 out</dd>",
      "<dt>Total tokens</dt><dd>16600 in, 1280 out</dd>",
      "<dt>Total duration</dt><dd>not recorded</dd>",
    ],
  );
});

// FR-031: captured content, observed values and criterion text render as literal text and never as HTML.
test("script and img markup in the final URL, page text, logs, observed values and checks appears only as escaped text", () => {
  const hostileUrl = `https://demo.playwright.dev/todomvc/?q=${SCRIPT}${IMG}`;
  const verdict = computeVerdict({
    criteria: [
      { kind: "text_visible", expected: SCRIPT },
      { kind: "url_matches", expected: "/active" },
    ],
    agent: { completed: true },
    capture: { ok: true, finalUrl: hostileUrl, pageText: `${SCRIPT} ${IMG}` },
  });
  const html = render(
    done(verdict, {
      finalUrl: hostileUrl,
      screenshot: SCREENSHOT,
      pageText: `${SCRIPT} ${IMG}`,
      consoleLog: [
        { level: "error", text: SCRIPT },
        { level: "log", text: IMG },
      ],
      networkLog: [
        { method: "GET", url: SCRIPT, status: 200 },
        { method: "GET", url: IMG, status: null },
      ],
    }),
  );
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<img\b[^>]*\bonerror\b/i);
  assert.equal(occurrences(html, "<img"), 1);
  assert.equal(occurrences(html, "&lt;script&gt;alert(1)&lt;/script&gt;"), 7);
  assert.equal(occurrences(html, "&lt;img src=x onerror=alert(1)&gt;"), 5);
});

// FR-029: no wording the view adds says the objective was met or the app works.
test("the view adds no text containing objective, works, achieved or success", () => {
  const views: RunResultProps[] = [
    { status: "queued", createdAt: new Date("2026-11-10T12:00:00.000Z"), now: new Date("2026-11-10T12:00:45.000Z") },
    { status: "queued", createdAt: new Date("2026-11-10T12:00:00.000Z"), now: new Date("2026-11-10T12:02:30.000Z") },
    { status: "running", phase: { name: "criteria" } },
    { status: "running", phase: { name: "browser" } },
    { status: "running", phase: { name: "agent", step: 1 } },
    { status: "running", phase: { name: "evaluating" } },
    done(
      verdictFor(CRITERIA),
      { ...FULL_EVIDENCE, truncated: { pageText: true, consoleDropped: 1, networkDropped: 1 } },
      FULL_MEASUREMENTS,
    ),
    done(
      verdictFor(CRITERIA, "Buy milk Walk the dog 2 items left"),
      { ...FULL_EVIDENCE, truncated: { pageText: true, consoleDropped: 2, networkDropped: 2 } },
      { modelId: MODEL_ID, stepDurationsMs: [], modelCalls: [] },
    ),
    ...REASON_CODES.filter((code) => code !== "criteria_unavailable").map((code) => done(inconclusive(code), {})),
  ];
  for (const props of views) {
    const text = render(props).replace(/<[^>]*>/g, " ");
    assert.doesNotMatch(text, /objective|works|achieved|success/i, text);
  }
});

// FR-029: text the view is given is shown as it is, even when it uses those words.
test("given summaries, checks, observed values and evidence are shown unchanged, even when they say objective, works, achieved or success", () => {
  const claim = "Success! The objective was achieved and the app works.";
  assertView(
    done(
      computeVerdict({
        criteria: [],
        agent: { completed: true },
        capture: { ok: true, finalUrl: FINAL_URL, pageText: claim },
      }),
      { pageText: claim },
    ),
    doneView(
      "INCONCLUSIVE. No verdict: The objective could not be turned into checks.",
      "",
      captured("page_text", claim),
      NO_MEASUREMENTS,
    ),
  );
  assertView(
    done(verdictFor([{ kind: "text_absent", expected: claim }], claim), {
      finalUrl: "https://demo.playwright.dev/success/works",
      consoleLog: [{ level: "info", text: claim }],
    }),
    doneView(
      "FAIL. 1 of 1 check did not hold on the final page.",
      checks(check(`Page does not show &quot;${claim}&quot;: not held`, `found &quot;${claim}&quot;`)),
      "<p>Final URL: https://demo.playwright.dev/success/works</p>" + captured("console", [{ level: "info", text: claim }]),
      NO_MEASUREMENTS,
    ),
  );
});

// FR-028: rendering never changes the props it is given.
test("RunResult leaves its props unchanged", () => {
  const all: RunResultProps[] = [
    { status: "queued", createdAt: new Date("2026-11-10T12:00:00.000Z"), now: new Date("2026-11-10T12:00:45.000Z") },
    { status: "running", phase: { name: "agent", step: 3 } },
    done(
      verdictFor([CRITERIA[2], { kind: "text_visible", expected: "3 items left" }, CRITERIA[0]]),
      { ...FULL_EVIDENCE, truncated: { pageText: true, consoleDropped: 2, networkDropped: 1 } },
      FULL_MEASUREMENTS,
    ),
    done(inconclusive("deadline_exceeded"), { pageText: PAGE_TEXT }),
    done(verdictFor(CRITERIA), {}, SPARSE_MEASUREMENTS),
  ];
  for (const original of all) {
    const props = deepFreeze(structuredClone(original));
    const before = structuredClone(props);
    render(props);
    assert.deepEqual(props, before);
  }
});

// FR-028: the view is rendered on the server and ships no client code.
test("run-result.ts is not a client component", () => {
  const code = readFileSync(new URL("./run-result.ts", import.meta.url), "utf8").replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    "",
  );
  assert.doesNotMatch(code, /["']use client["']/);
});
