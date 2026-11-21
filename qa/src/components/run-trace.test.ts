import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as runTrace from "./run-trace.ts";
import { RunTrace } from "./run-trace.ts";
import type { RunTraceProps } from "./run-trace.ts";
import type { ModelTraceEntry, ToolTraceEntry, TraceEntry } from "../lib/trace/trace-entries.ts";

const OPEN = '<section aria-labelledby="trace-calls"><h2 id="trace-calls">Model and tool calls</h2>';
const CLOSE = "</section>";
const PRE = '<pre class="whitespace-pre-wrap break-words">';
const INCOMPLETE = "<p>This trace is incomplete. It shows only what was stored.</p>";
const NO_CALLS = "<p>No calls were recorded.</p>";

const SCRIPT_PAYLOAD = "<script>alert(1)</script>";
const IMG_PAYLOAD = "<img src=x onerror=alert(1)>";
const SCRIPT_TEXT = "&lt;script&gt;alert(1)&lt;/script&gt;";
const IMG_TEXT = "&lt;img src=x onerror=alert(1)&gt;";

function render(props: RunTraceProps): string {
  return renderToStaticMarkup(createElement(RunTrace, props));
}

function model(entry: Omit<ModelTraceEntry, "kind">): ModelTraceEntry {
  return { kind: "model", ...entry };
}

function tool(entry: Omit<ToolTraceEntry, "kind">): ToolTraceEntry {
  return { kind: "tool", ...entry };
}

function frozen(entries: TraceEntry[]): readonly TraceEntry[] {
  for (const entry of entries) {
    if (entry.kind === "tool") Object.freeze(entry.args);
    Object.freeze(entry);
  }
  return Object.freeze(entries);
}

function listItems(html: string): string[] {
  return [...html.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/g)].map((m) => m[0]);
}

function durations(html: string): string[] {
  return [...html.matchAll(/<p>Duration: ([^<]*)<\/p>/g)].map((m) => m[1]);
}

const consoleError = mock.method(console, "error");

const ACCEPTANCE_ENTRIES = frozen([
  model({
    index: 1,
    id: "m1",
    startedAtMs: 0,
    durationMs: 80,
    output: "model-1-out",
    inputTokens: 10,
    outputTokens: 5,
  }),
  tool({
    index: 2,
    id: "t1",
    startedAtMs: 100,
    durationMs: 50,
    toolName: "read_page",
    args: {},
    resultSummary: "ok page snapshot",
  }),
  tool({
    index: 3,
    id: "t2",
    startedAtMs: 200,
    durationMs: 30,
    toolName: "click_element",
    args: { ref: "e1" },
    resultSummary: "ok clicked",
  }),
  model({
    index: 4,
    id: "m2",
    startedAtMs: 200,
    durationMs: 60,
    output: "model-2-out",
    inputTokens: 20,
    outputTokens: 8,
  }),
  tool({
    index: 5,
    id: "t3",
    startedAtMs: 300,
    durationMs: 40,
    toolName: "fill_field",
    args: { ref: "e2", text: "hi" },
    resultSummary: "ok filled",
  }),
  model({
    index: 6,
    id: "m3",
    startedAtMs: 500,
    durationMs: 80,
    output: "model-3-out",
    inputTokens: 30,
    outputTokens: 12,
  }),
  tool({
    index: 7,
    id: "t4",
    startedAtMs: 600,
    durationMs: 50,
    toolName: "read_page",
    args: {},
    resultSummary: "ok updated page",
  }),
  tool({
    index: 8,
    id: "t5",
    startedAtMs: 700,
    durationMs: 60,
    toolName: "click_element",
    args: { ref: "e3" },
    resultSummary: "error not found",
  }),
  model({
    index: 9,
    id: "m4",
    startedAtMs: 800,
    durationMs: 70,
    output: "model-4-out",
    inputTokens: 40,
    outputTokens: 15,
  }),
  tool({
    index: 10,
    id: "t6",
    startedAtMs: 900,
    durationMs: 50,
    toolName: "press_key",
    args: { key: "Enter" },
    resultSummary: "ok pressed",
  }),
]);

const ACCEPTANCE_ITEMS = [
  "<li><h3>Model call</h3><p>Duration: 80 ms</p><p>Tokens: 10 in, 5 out</p><p>Output:</p>" +
    PRE + "model-1-out</pre></li>",
  "<li><h3>Tool call: read_page</h3><p>Duration: 50 ms</p><p>Arguments:</p>" +
    PRE + "{}</pre><p>Result: ok page snapshot</p></li>",
  "<li><h3>Tool call: click_element</h3><p>Duration: 30 ms</p><p>Arguments:</p>" +
    PRE + "{\n  &quot;ref&quot;: &quot;e1&quot;\n}</pre><p>Result: ok clicked</p></li>",
  "<li><h3>Model call</h3><p>Duration: 60 ms</p><p>Tokens: 20 in, 8 out</p><p>Output:</p>" +
    PRE + "model-2-out</pre></li>",
  "<li><h3>Tool call: fill_field</h3><p>Duration: 40 ms</p><p>Arguments:</p>" +
    PRE + "{\n  &quot;ref&quot;: &quot;e2&quot;,\n  &quot;text&quot;: &quot;hi&quot;\n}</pre><p>Result: ok filled</p></li>",
  "<li><h3>Model call</h3><p>Duration: 80 ms</p><p>Tokens: 30 in, 12 out</p><p>Output:</p>" +
    PRE + "model-3-out</pre></li>",
  "<li><h3>Tool call: read_page</h3><p>Duration: 50 ms</p><p>Arguments:</p>" +
    PRE + "{}</pre><p>Result: ok updated page</p></li>",
  "<li><h3>Tool call: click_element</h3><p>Duration: 60 ms</p><p>Arguments:</p>" +
    PRE + "{\n  &quot;ref&quot;: &quot;e3&quot;\n}</pre><p>Result: error not found</p></li>",
  "<li><h3>Model call</h3><p>Duration: 70 ms</p><p>Tokens: 40 in, 15 out</p><p>Output:</p>" +
    PRE + "model-4-out</pre></li>",
  "<li><h3>Tool call: press_key</h3><p>Duration: 50 ms</p><p>Arguments:</p>" +
    PRE + "{\n  &quot;key&quot;: &quot;Enter&quot;\n}</pre><p>Result: ok pressed</p></li>",
];

test("run-trace.ts exports exactly RunTrace", () => {
  assert.deepEqual(Object.keys(runTrace).sort(), ["RunTrace"]);
});

// FR-030: the trace lists every model call and tool call, each with its duration.
test("4 model calls and 6 tool calls render as 10 list items in the given order, each with its duration and details", () => {
  const html = render({ state: "available", entries: ACCEPTANCE_ENTRIES });
  const items = listItems(html);
  assert.equal(items.length, 10);
  assert.equal(items.filter((item) => item.startsWith("<li><h3>Model call</h3>")).length, 4);
  assert.equal(items.filter((item) => item.startsWith("<li><h3>Tool call: ")).length, 6);
  assert.deepEqual(items, ACCEPTANCE_ITEMS);
  assert.equal(html, OPEN + "<ol>" + ACCEPTANCE_ITEMS.join("") + "</ol>" + CLOSE);
});

// FR-031: captured content renders as text, never as HTML.
test("script and img markup in model output appears only as escaped text", () => {
  const entries = frozen([
    model({
      index: 1,
      id: "m-markup",
      startedAtMs: 0,
      durationMs: 12,
      output: "Before " + SCRIPT_PAYLOAD + " middle " + IMG_PAYLOAD + " after",
      inputTokens: 3,
      outputTokens: 4,
    }),
  ]);
  const html = render({ state: "available", entries });
  assert.equal(html.includes("<script"), false);
  assert.equal(html.includes("<img"), false);
  assert.deepEqual(listItems(html), [
    "<li><h3>Model call</h3><p>Duration: 12 ms</p><p>Tokens: 3 in, 4 out</p><p>Output:</p>" +
      PRE + "Before " + SCRIPT_TEXT + " middle " + IMG_TEXT + " after</pre></li>",
  ]);
});

// FR-031: tool arguments are captured content too.
test("script and img markup in tool arguments appears only as escaped text", () => {
  const entries = frozen([
    tool({
      index: 1,
      id: "t-markup",
      startedAtMs: 0,
      durationMs: 7,
      toolName: "fill_field",
      args: { ref: "e2", text: SCRIPT_PAYLOAD + " " + IMG_PAYLOAD },
      resultSummary: "ok filled",
    }),
  ]);
  const html = render({ state: "available", entries });
  assert.equal(html.includes("<script"), false);
  assert.equal(html.includes("<img"), false);
  assert.deepEqual(listItems(html), [
    "<li><h3>Tool call: fill_field</h3><p>Duration: 7 ms</p><p>Arguments:</p>" +
      PRE + "{\n  &quot;ref&quot;: &quot;e2&quot;,\n  &quot;text&quot;: &quot;" +
      SCRIPT_TEXT + " " + IMG_TEXT + "&quot;\n}</pre><p>Result: ok filled</p></li>",
  ]);
});

// FR-031: a result summary quotes captured page text.
test("script and img markup in a result summary appears only as escaped text", () => {
  const entries = frozen([
    tool({
      index: 1,
      id: "t-summary",
      startedAtMs: 0,
      durationMs: 3,
      toolName: "read_page",
      args: {},
      resultSummary: "ok " + SCRIPT_PAYLOAD + " " + IMG_PAYLOAD,
    }),
  ]);
  const html = render({ state: "available", entries });
  assert.equal(html.includes("<script"), false);
  assert.equal(html.includes("<img"), false);
  assert.deepEqual(listItems(html), [
    "<li><h3>Tool call: read_page</h3><p>Duration: 3 ms</p><p>Arguments:</p>" +
      PRE + "{}</pre><p>Result: ok " + SCRIPT_TEXT + " " + IMG_TEXT + "</p></li>",
  ]);
});

// FR-030: before the run starts there is no trace to list.
test("not_started renders only the heading and No trace yet.", () => {
  assert.equal(render({ state: "not_started" }), OPEN + "<p>No trace yet.</p>" + CLOSE);
});

// FR-030: an incomplete trace says so above whatever was stored.
test("incomplete renders the incomplete notice, then the entries in the given order", () => {
  assert.equal(
    render({ state: "incomplete", entries: ACCEPTANCE_ENTRIES }),
    OPEN + INCOMPLETE + "<ol>" + ACCEPTANCE_ITEMS.join("") + "</ol>" + CLOSE,
  );
});

test("zero entries render No calls were recorded. instead of a list, after the notice when the trace is incomplete", () => {
  const entries = frozen([]);
  assert.equal(render({ state: "available", entries }), OPEN + NO_CALLS + CLOSE);
  assert.equal(render({ state: "incomplete", entries }), OPEN + INCOMPLETE + NO_CALLS + CLOSE);
});

test("one entry renders a one-item list, not the empty message, whether the trace is available or incomplete", () => {
  const entries = frozen([
    model({
      index: 1,
      id: "m-only",
      startedAtMs: 0,
      durationMs: 1,
      output: "only call",
      inputTokens: 1,
      outputTokens: 1,
    }),
  ]);
  const item =
    "<li><h3>Model call</h3><p>Duration: 1 ms</p><p>Tokens: 1 in, 1 out</p><p>Output:</p>" +
    PRE + "only call</pre></li>";
  assert.equal(render({ state: "available", entries }), OPEN + "<ol>" + item + "</ol>" + CLOSE);
  assert.equal(
    render({ state: "incomplete", entries }),
    OPEN + INCOMPLETE + "<ol>" + item + "</ol>" + CLOSE,
  );
});

// FR-030: each call shows its duration in whole milliseconds.
test("durations are rounded to the nearest whole millisecond, halves up, in model and tool calls alike", () => {
  const modelAndToolMs: [number, number][] = [
    [0, 7],
    [0.4, 2.4],
    [0.5, 2.5],
    [99.5, 1499.5],
    [1234.4, 1000.49],
    [0.49999999999999994, 0.49999999999999994],
    [239999.6, 123456.5],
  ];
  const entries: TraceEntry[] = [];
  modelAndToolMs.forEach(([modelMs, toolMs], i) => {
    entries.push(
      model({
        index: 2 * i + 1,
        id: "m-" + i,
        startedAtMs: 2000 * i,
        durationMs: modelMs,
        output: "out",
        inputTokens: 1,
        outputTokens: 2,
      }),
      tool({
        index: 2 * i + 2,
        id: "t-" + i,
        startedAtMs: 2000 * i + 1000,
        durationMs: toolMs,
        toolName: "read_page",
        args: {},
        resultSummary: "ok",
      }),
    );
  });
  const html = render({ state: "available", entries: frozen(entries) });
  assert.deepEqual(durations(html), [
    "0 ms",
    "7 ms",
    "0 ms",
    "2 ms",
    "1 ms",
    "3 ms",
    "100 ms",
    "1500 ms",
    "1234 ms",
    "1000 ms",
    "0 ms",
    "0 ms",
    "240000 ms",
    "123457 ms",
  ]);
});

// FR-030: the time order comes from the entries as given.
test("entries render in the order given, not re-sorted by index, start time, duration, id or kind, and are left unchanged", () => {
  const entries = frozen([
    tool({
      index: 3,
      id: "c-tool",
      startedAtMs: 600,
      durationMs: 20,
      toolName: "click_element",
      args: { ref: "e7" },
      resultSummary: "ok clicked",
    }),
    model({
      index: 1,
      id: "a-model",
      startedAtMs: 0,
      durationMs: 300,
      output: "first thought",
      inputTokens: 11,
      outputTokens: 7,
    }),
    tool({
      index: 4,
      id: "d-tool",
      startedAtMs: 900,
      durationMs: 5,
      toolName: "press_key",
      args: { key: "Tab" },
      resultSummary: "ok pressed",
    }),
    model({
      index: 2,
      id: "b-model",
      startedAtMs: 300,
      durationMs: 90,
      output: "second thought",
      inputTokens: 13,
      outputTokens: 9,
    }),
  ]);
  const before = structuredClone(entries);
  const html = render({ state: "available", entries });
  assert.deepEqual(listItems(html), [
    "<li><h3>Tool call: click_element</h3><p>Duration: 20 ms</p><p>Arguments:</p>" +
      PRE + "{\n  &quot;ref&quot;: &quot;e7&quot;\n}</pre><p>Result: ok clicked</p></li>",
    "<li><h3>Model call</h3><p>Duration: 300 ms</p><p>Tokens: 11 in, 7 out</p><p>Output:</p>" +
      PRE + "first thought</pre></li>",
    "<li><h3>Tool call: press_key</h3><p>Duration: 5 ms</p><p>Arguments:</p>" +
      PRE + "{\n  &quot;key&quot;: &quot;Tab&quot;\n}</pre><p>Result: ok pressed</p></li>",
    "<li><h3>Model call</h3><p>Duration: 90 ms</p><p>Tokens: 13 in, 9 out</p><p>Output:</p>" +
      PRE + "second thought</pre></li>",
  ]);
  assert.deepEqual(entries, before);
});

// FR-030: a tool call shows its validated arguments.
test("tool arguments render as JSON indented by two spaces, with the keys in the order given", () => {
  const entries = frozen([
    tool({
      index: 1,
      id: "t-fill",
      startedAtMs: 0,
      durationMs: 9,
      toolName: "fill_field",
      args: { text: "Buy milk", ref: "e2" },
      resultSummary: "ok filled",
    }),
    tool({
      index: 2,
      id: "t-read",
      startedAtMs: 10,
      durationMs: 4,
      toolName: "read_page",
      args: {},
      resultSummary: "ok",
    }),
  ]);
  assert.deepEqual(listItems(render({ state: "available", entries })), [
    "<li><h3>Tool call: fill_field</h3><p>Duration: 9 ms</p><p>Arguments:</p>" +
      PRE + "{\n  &quot;text&quot;: &quot;Buy milk&quot;,\n  &quot;ref&quot;: &quot;e2&quot;\n}</pre><p>Result: ok filled</p></li>",
    "<li><h3>Tool call: read_page</h3><p>Duration: 4 ms</p><p>Arguments:</p>" +
      PRE + "{}</pre><p>Result: ok</p></li>",
  ]);
});

// FR-030: a model call shows its output and its token counts.
test("model output keeps its whitespace and line breaks, empty output renders an empty block, and token counts print as plain integers", () => {
  const entries = frozen([
    model({
      index: 1,
      id: "m-lines",
      startedAtMs: 0,
      durationMs: 1500,
      output: "line one\n  indented\n\nline three",
      inputTokens: 12000,
      outputTokens: 0,
    }),
    model({
      index: 2,
      id: "m-empty",
      startedAtMs: 1500,
      durationMs: 2,
      output: "",
      inputTokens: 0,
      outputTokens: 1,
    }),
  ]);
  assert.deepEqual(listItems(render({ state: "available", entries })), [
    "<li><h3>Model call</h3><p>Duration: 1500 ms</p><p>Tokens: 12000 in, 0 out</p><p>Output:</p>" +
      PRE + "line one\n  indented\n\nline three</pre></li>",
    "<li><h3>Model call</h3><p>Duration: 2 ms</p><p>Tokens: 0 in, 1 out</p><p>Output:</p>" +
      PRE + "</pre></li>",
  ]);
});

// FR-030: a model call shows all of its output, exactly as given.
test("model output renders in full with its leading and trailing whitespace, and large token counts print in full", () => {
  const long = "word ".repeat(400) + "end";
  const entries = frozen([
    model({
      index: 1,
      id: "m-long",
      startedAtMs: 0,
      durationMs: 4,
      output: long,
      inputTokens: 1234567,
      outputTokens: 250000,
    }),
    model({
      index: 2,
      id: "m-edges",
      startedAtMs: 10,
      durationMs: 4,
      output: "  indented first line\nlast line\n",
      inputTokens: 1,
      outputTokens: 1,
    }),
  ]);
  assert.deepEqual(listItems(render({ state: "available", entries })), [
    "<li><h3>Model call</h3><p>Duration: 4 ms</p><p>Tokens: 1234567 in, 250000 out</p><p>Output:</p>" +
      PRE + long + "</pre></li>",
    "<li><h3>Model call</h3><p>Duration: 4 ms</p><p>Tokens: 1 in, 1 out</p><p>Output:</p>" +
      PRE + "  indented first line\nlast line\n</pre></li>",
  ]);
});

// FR-030: a tool call shows its validated arguments in full.
test("tool arguments render in full as JSON, with quotes, backslashes and line breaks escaped", () => {
  const longText = "a".repeat(200);
  const entries = frozen([
    tool({
      index: 1,
      id: "t-escapes",
      startedAtMs: 0,
      durationMs: 6,
      toolName: "fill_field",
      args: { ref: "e2", text: 'say "hi" \\ now\nnext' },
      resultSummary: "ok filled",
    }),
    tool({
      index: 2,
      id: "t-long-text",
      startedAtMs: 10,
      durationMs: 6,
      toolName: "fill_field",
      args: { ref: "e3", text: longText },
      resultSummary: "ok filled",
    }),
  ]);
  assert.deepEqual(listItems(render({ state: "available", entries })), [
    "<li><h3>Tool call: fill_field</h3><p>Duration: 6 ms</p><p>Arguments:</p>" +
      PRE + "{\n  &quot;ref&quot;: &quot;e2&quot;,\n  &quot;text&quot;: &quot;say \\&quot;hi\\&quot; \\\\ now\\nnext&quot;\n}</pre><p>Result: ok filled</p></li>",
    "<li><h3>Tool call: fill_field</h3><p>Duration: 6 ms</p><p>Arguments:</p>" +
      PRE + "{\n  &quot;ref&quot;: &quot;e3&quot;,\n  &quot;text&quot;: &quot;" + longText + "&quot;\n}</pre><p>Result: ok filled</p></li>",
  ]);
});

// FR-030: a tool call shows its whole result summary.
test("the longest result summary renders in full", () => {
  const summary = "error " + "x".repeat(200) + "…";
  const entries = frozen([
    tool({
      index: 1,
      id: "t-long-summary",
      startedAtMs: 0,
      durationMs: 8,
      toolName: "read_page",
      args: {},
      resultSummary: summary,
    }),
  ]);
  assert.deepEqual(listItems(render({ state: "available", entries })), [
    "<li><h3>Tool call: read_page</h3><p>Duration: 8 ms</p><p>Arguments:</p>" +
      PRE + "{}</pre><p>Result: " + summary + "</p></li>",
  ]);
});

// FR-030: the trace lists every call, however many there are.
test("a trace of 101 calls renders all 101 entries in the given order", () => {
  const entries: TraceEntry[] = [];
  for (let i = 0; i < 101; i++) {
    entries.push(
      model({
        index: i + 1,
        id: "m-" + i,
        startedAtMs: 10 * i,
        durationMs: 1,
        output: "call " + i,
        inputTokens: 1,
        outputTokens: 1,
      }),
    );
  }
  const items = listItems(render({ state: "available", entries: frozen(entries) }));
  assert.equal(items.length, 101);
  assert.deepEqual(
    items.map((item) => item.slice(item.indexOf(PRE) + PRE.length, item.indexOf("</pre>"))),
    entries.map((_, i) => "call " + i),
  );
});

test("RunTraceProps requires entries for available and incomplete, and takes none for not_started", () => {
  // @ts-expect-error available needs entries
  const availableMissing: RunTraceProps = { state: "available" };
  // @ts-expect-error incomplete needs entries
  const incompleteMissing: RunTraceProps = { state: "incomplete" };
  // @ts-expect-error not_started takes no entries
  const notStartedExtra: RunTraceProps = { state: "not_started", entries: [] };
  assert.ok(availableMissing && incompleteMissing && notStartedExtra);
});

test("rendering logged no React warnings", () => {
  assert.equal(consoleError.mock.callCount(), 0);
});
