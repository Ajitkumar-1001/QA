import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Children, createElement, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { checkRunCaps } from "../lib/run/caps.ts";
import type { CapRefusal } from "../lib/run/run-text.ts";
import * as runFormModule from "./run-form.ts";
import { RunForm } from "./run-form.ts";
import type { RunFormProps } from "./run-form.ts";
import * as startButtonModule from "./start-button.ts";
import { StartButton } from "./start-button.ts";
import type { StartButtonProps } from "./start-button.ts";

const TARGET_URL = "https://demo.playwright.dev/todomvc";
const OBJECTIVE = 'add two todos, complete one, and confirm the counter reads "1 item left"';
const OBJECTIVE_TEXT = "add two todos, complete one, and confirm the counter reads &quot;1 item left&quot;";
const SCRIPT = "<script>alert(1)</script>";
const SCRIPT_TEXT = "&lt;script&gt;alert(1)&lt;/script&gt;";
const NOW = new Date("2026-11-18T15:30:00.000Z");

function noAction(): void {}

function props(overrides: Partial<RunFormProps> = {}): RunFormProps {
  return { targetUrl: TARGET_URL, objective: OBJECTIVE, runsUsed: 3, monthlyCap: 100, action: noAction, ...overrides };
}

function capRefusal(runsInWindow: number, activeRuns: number, monthlyCap = 100, concurrencyCap = 2, now = NOW): CapRefusal {
  const result = checkRunCaps({ runsInWindow, activeRuns, monthlyCap, concurrencyCap, now });
  assert.ok(!result.ok);
  return result;
}

function refusal(reason: CapRefusal["reason"], count: number, cap: number, resetsAt: string): CapRefusal {
  return { ok: false, code: "RATE_LIMITED", reason, count, cap, resetsAt: new Date(resetsAt) };
}

function formHtml(p: RunFormProps): string {
  const html = renderToStaticMarkup(createElement(RunForm, p));
  const end = html.indexOf("</form>");
  assert.ok(html.startsWith("<form") && end !== -1, html);
  return html.slice(0, end + "</form>".length);
}

type View = {
  markup: string;
  alerts: { tag: string; text: string }[];
  buttons: { type: string | undefined; disabled: boolean }[];
};

function view(html: string): View {
  const alerts: View["alerts"] = [];
  const buttons: View["buttons"] = [];
  for (const [, tag, attributes, text] of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>([^<]*)/g)) {
    const attrs = new Map(Array.from(attributes.matchAll(/([^\s=/]+)(?:="([^"]*)")?/g), ([, name, value]) => [name, value]));
    if (attrs.get("role") === "alert") alerts.push({ tag, text });
    if (tag === "button") buttons.push({ type: attrs.get("type"), disabled: attrs.has("disabled") });
  }
  return { markup: html.replace(/<([a-z][a-z0-9]*)\b[^>]*>/g, "<$1>"), alerts, buttons };
}

function formView(p: RunFormProps): View {
  return view(formHtml(p));
}

function markup(parts: { used: string; alert?: string; url?: string; objective?: string }): string {
  const { used, alert, url = TARGET_URL, objective = OBJECTIVE_TEXT } = parts;
  const alertMarkup = alert === undefined ? "" : `<p>${alert}</p>`;
  return `<form><dl><dt>Target URL</dt><dd>${url}</dd><dt>Objective</dt><dd>${objective}</dd></dl><p>${used}</p>${alertMarkup}<button>Start</button></form>`;
}

function formElement(p: RunFormProps): ReactElement<{ action?: unknown; children?: ReactNode }> {
  const rendered: ReactElement[] = [];
  function Capture(): ReactElement {
    const element = RunForm(p);
    rendered.push(element);
    return element;
  }
  renderToStaticMarkup(createElement(Capture));
  assert.equal(rendered.length, 1);
  return rendered[0] as ReactElement<{ action?: unknown; children?: ReactNode }>;
}

function source(file: string): string {
  return readFileSync(new URL(file, import.meta.url), "utf8");
}

function code(file: string): string {
  return source(file).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
}

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

test("start-button.ts exports only StartButton and run-form.ts exports only RunForm", () => {
  assert.deepEqual(Object.keys(startButtonModule), ["StartButton"]);
  assert.deepEqual(Object.keys(runFormModule), ["RunForm"]);
});

test("RunFormProps and StartButtonProps have exactly the fields and types of the interface", () => {
  type InterfaceRunFormProps = {
    targetUrl: string;
    objective: string;
    runsUsed: number;
    monthlyCap: number;
    refusal?: CapRefusal;
    action: (formData: FormData) => void | Promise<void>;
  };
  const runFormFields: Same<RunFormProps, InterfaceRunFormProps> = true;
  const runFormKeys: Same<keyof RunFormProps, keyof InterfaceRunFormProps> = true;
  const startButtonFields: Same<StartButtonProps, { disabled: boolean }> = true;
  const startButtonKeys: Same<keyof StartButtonProps, "disabled"> = true;
  const components: [(props: RunFormProps) => ReactElement, (props: StartButtonProps) => ReactElement] = [
    RunForm,
    StartButton,
  ];
  assert.deepEqual([runFormFields, runFormKeys, startButtonFields, startButtonKeys], [true, true, true, true]);
  assert.deepEqual(components, [RunForm, StartButton]);
});

// FR-002, FR-003: ready, the form shows the target URL and the objective as text, the runs used against the cap, and Start.
test("with no refusal the form shows the target URL, the objective, the runs used and an enabled Start button", () => {
  const ready: View = {
    markup:
      "<form><dl><dt>Target URL</dt><dd>https://demo.playwright.dev/todomvc</dd>" +
      "<dt>Objective</dt><dd>add two todos, complete one, and confirm the counter reads &quot;1 item left&quot;</dd></dl>" +
      "<p>3 of 100 runs used this month.</p><button>Start</button></form>",
    alerts: [],
    buttons: [{ type: "submit", disabled: false }],
  };
  assert.deepEqual(formView(props()), ready);
  assert.deepEqual(formView(props({ refusal: undefined })), ready);
});

// FR-002: the target URL and the objective cannot be edited, and Start is the form's only control.
test("the form has no input, textarea, select or editable text, and Start is its only button", () => {
  for (const r of [undefined, capRefusal(100, 0), capRefusal(5, 2)]) {
    const html = formHtml(props({ refusal: r }));
    assert.doesNotMatch(html, /<(?:input|textarea|select)\b|contenteditable/i);
    assert.equal(html.match(/<button\b/g)?.length, 1);
  }
});

test("the form submits to the action it is given and never calls it while rendering", () => {
  let calls = 0;
  const action = (): void => {
    calls += 1;
  };
  for (const r of [undefined, capRefusal(100, 0), capRefusal(5, 2)]) {
    const p = props({ refusal: r, action });
    const form = formElement(p);
    assert.equal(form.type, "form");
    assert.equal(form.props.action, action);
    assert.match(formHtml(p), /^<form\b[^>]*\saction="/);
  }
  assert.equal(calls, 0);
});

// FR-003: the form shows the runs used this month against the monthly cap, as given, also above the cap.
test("the form shows runsUsed of monthlyCap runs used this month as given, with run when the cap is 1", () => {
  const cases: [number, number, string][] = [
    [3, 100, "3 of 100 runs used this month."],
    [0, 100, "0 of 100 runs used this month."],
    [99, 100, "99 of 100 runs used this month."],
    [100, 100, "100 of 100 runs used this month."],
    [101, 100, "101 of 100 runs used this month."],
    [0, 1, "0 of 1 run used this month."],
    [1, 1, "1 of 1 run used this month."],
    [0, 0, "0 of 0 runs used this month."],
  ];
  for (const [runsUsed, monthlyCap, used] of cases) {
    assert.equal(formView(props({ runsUsed, monthlyCap })).markup, markup({ used }), used);
  }
});

// FR-003: without a refusal from the page, Start stays enabled and no alert is shown, whatever the runs used.
test("with no refusal Start is enabled and no alert is shown, also at and above the monthly cap", () => {
  for (const runsUsed of [99, 100, 101]) {
    const v = formView(props({ runsUsed, monthlyCap: 100 }));
    assert.deepEqual(v.alerts, [], `${runsUsed}`);
    assert.deepEqual(v.buttons, [{ type: "submit", disabled: false }], `${runsUsed}`);
  }
});

// FR-003: at the monthly cap the form gives the count and the reset date, and Start is disabled.
test("a monthly cap refusal is shown as an alert after the runs used, and Start is disabled", () => {
  const alert = "Monthly cap reached: 100 of 100 runs used. It resets on 2026-12-01 UTC.";
  assert.deepEqual(formView(props({ runsUsed: 100, refusal: capRefusal(100, 0) })), {
    markup: markup({ used: "100 of 100 runs used this month.", alert }),
    alerts: [{ tag: "p", text: alert }],
    buttons: [{ type: "submit", disabled: true }],
  });
});

// FR-003: the alert gives the refusal's own count, cap and reset date, with run when the cap is 1.
test("the monthly cap alert takes its count, cap and reset date from the refusal", () => {
  const cases: [CapRefusal, string][] = [
    [capRefusal(1, 0, 1), "Monthly cap reached: 1 of 1 run used. It resets on 2026-12-01 UTC."],
    [
      capRefusal(3, 0, 3, 2, new Date("2026-12-31T23:59:59.000Z")),
      "Monthly cap reached: 3 of 3 runs used. It resets on 2027-01-01 UTC.",
    ],
    [
      refusal("monthly_cap", 120, 120, "2027-03-01T00:00:00.000Z"),
      "Monthly cap reached: 120 of 120 runs used. It resets on 2027-03-01 UTC.",
    ],
    [capRefusal(101, 0), "Monthly cap reached: 101 of 100 runs used. It resets on 2026-12-01 UTC."],
  ];
  for (const [r, alert] of cases) {
    assert.deepEqual(formView(props({ runsUsed: 99, monthlyCap: 100, refusal: r })), {
      markup: markup({ used: "99 of 100 runs used this month.", alert }),
      alerts: [{ tag: "p", text: alert }],
      buttons: [{ type: "submit", disabled: true }],
    });
  }
});

// FR-003: the reset date is the UTC calendar date, whatever the machine's time zone.
test("the monthly cap alert gives the UTC reset date, also in a time zone west of UTC", () => {
  const saved = process.env.TZ;
  process.env.TZ = "Pacific/Honolulu";
  try {
    const alert = "Monthly cap reached: 100 of 100 runs used. It resets on 2026-12-01 UTC.";
    assert.deepEqual(formView(props({ runsUsed: 100, refusal: capRefusal(100, 0) })).alerts, [{ tag: "p", text: alert }]);
  } finally {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  }
});

// FR-004: when too many runs are in progress the refusal says how many, and Start stays enabled to try again.
test("a concurrency cap refusal is shown as an alert after the runs used, and Start stays enabled", () => {
  const alert = "2 runs are already in progress, the most allowed at once. Start again when one finishes.";
  assert.deepEqual(formView(props({ runsUsed: 5, refusal: capRefusal(5, 2) })), {
    markup: markup({ used: "5 of 100 runs used this month.", alert }),
    alerts: [{ tag: "p", text: alert }],
    buttons: [{ type: "submit", disabled: false }],
  });
});

// FR-004: the alert gives the refusal's own count of runs in progress, with "1 run is" for one run.
test("the concurrency cap alert takes its count from the refusal, with 1 run is for one run", () => {
  const cases: [CapRefusal, string][] = [
    [capRefusal(5, 1, 100, 1), "1 run is already in progress, the most allowed at once. Start again when one finishes."],
    [
      refusal("concurrency_cap", 8, 8, "2026-12-01T00:00:00.000Z"),
      "8 runs are already in progress, the most allowed at once. Start again when one finishes.",
    ],
    [capRefusal(5, 3), "3 runs are already in progress, the most allowed at once. Start again when one finishes."],
  ];
  for (const [r, alert] of cases) {
    assert.deepEqual(formView(props({ runsUsed: 5, refusal: r })), {
      markup: markup({ used: "5 of 100 runs used this month.", alert }),
      alerts: [{ tag: "p", text: alert }],
      buttons: [{ type: "submit", disabled: false }],
    });
  }
});

// FR-002, FR-031: the target URL and the objective appear as literal text, never as markup.
test("script markup in the target URL or the objective appears only as escaped text", () => {
  const cases: [Partial<RunFormProps>, string, string][] = [
    [{ targetUrl: `${TARGET_URL}/#${SCRIPT}` }, `${TARGET_URL}/#${SCRIPT_TEXT}`, OBJECTIVE_TEXT],
    [{ objective: SCRIPT }, TARGET_URL, SCRIPT_TEXT],
    [
      { targetUrl: SCRIPT, objective: `${SCRIPT} <img src=x onerror=alert(1)> & 'quoted'` },
      SCRIPT_TEXT,
      `${SCRIPT_TEXT} &lt;img src=x onerror=alert(1)&gt; &amp; &#x27;quoted&#x27;`,
    ],
  ];
  for (const [overrides, url, objective] of cases) {
    const p = props(overrides);
    assert.equal(renderToStaticMarkup(createElement(RunForm, p)).includes(SCRIPT), false);
    const html = formHtml(p);
    assert.doesNotMatch(html, /<script|<img/);
    assert.equal(view(html).markup, markup({ used: "3 of 100 runs used this month.", url, objective }));
  }
});

// FR-002: a long target URL and a long objective are shown in full.
test("a long target URL and a long objective are shown in full", () => {
  const url = `${TARGET_URL}/#/${"completed/active/".repeat(10)}all`;
  const objective = `add three todos, ${"then check the counter and the footer, ".repeat(8)}and stop`;
  assert.equal(
    formView(props({ targetUrl: url, objective })).markup,
    markup({ used: "3 of 100 runs used this month.", url, objective }),
  );
});

// FR-003: StartButton is a submit button labelled Start, disabled exactly when it is told to be.
test("StartButton renders a submit button labelled Start, disabled exactly when disabled is true", () => {
  for (const disabled of [false, true]) {
    assert.deepEqual(view(renderToStaticMarkup(createElement(StartButton, { disabled }))), {
      markup: "<button>Start</button>",
      alerts: [],
      buttons: [{ type: "submit", disabled }],
    });
  }
});

// FR-003, FR-004: the form ends with StartButton, which a monthly cap refusal disables whatever its count and a concurrency refusal does not.
test("RunForm ends with StartButton, disabled only for a monthly cap refusal, whatever its count", () => {
  const cases: [CapRefusal | undefined, boolean][] = [
    [undefined, false],
    [capRefusal(100, 0), true],
    [refusal("monthly_cap", 99, 100, "2026-12-01T00:00:00.000Z"), true],
    [capRefusal(5, 2), false],
  ];
  for (const [r, disabled] of cases) {
    const last = Children.toArray(formElement(props({ refusal: r })).props.children).at(-1);
    assert.ok(isValidElement(last));
    assert.equal(last.type, StartButton);
    assert.deepEqual(last.props, { disabled });
  }
});

// FR-003, FR-004: showing a refusal leaves it, and the form's other props, unchanged.
test("RunForm leaves its props and the refusal unchanged", () => {
  for (const r of [capRefusal(100, 0), capRefusal(5, 2)]) {
    const p = Object.freeze(props({ runsUsed: 100, refusal: Object.freeze(r) }));
    const before = structuredClone({ ...p, action: null });
    renderToStaticMarkup(createElement(RunForm, p));
    formElement(p);
    assert.deepEqual({ ...p, action: null }, before);
  }
});

test('start-button.ts begins with the "use client" directive, and run-form.ts has none and uses nothing from react-dom', () => {
  assert.equal(source("./start-button.ts").split("\n")[0], '"use client";');
  const runForm = code("./run-form.ts");
  assert.doesNotMatch(runForm, /["']use client["']/);
  assert.doesNotMatch(runForm, /\buseFormStatus\b|from\s*["']react-dom["']/);
});

test("StartButton reads pending from useFormStatus in react-dom, and pending disables it and selects the Starting label", () => {
  const startButton = code("./start-button.ts");
  assert.match(startButton, /\bimport\s*\{[^}]*\buseFormStatus\b[^}]*\}\s*from\s*["']react-dom["']/);
  assert.match(startButton, /\buseFormStatus\s*\(\s*\)/);
  assert.match(startButton, /\bdisabled\s*\|\|\s*(?:\w+\.)?pending\b|\bpending\s*\|\|\s*disabled\b/);
  assert.match(startButton, /\bpending\s*\?\s*["'`]Starting(?:\u2026|\\u2026)["'`]\s*:\s*["'`]Start["'`]/);
});
