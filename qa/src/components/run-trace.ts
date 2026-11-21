/** Trace view (FR-030, FR-031). */
import { createElement, type ReactElement } from "react";
import type { TraceEntry } from "../lib/trace/trace-entries.ts";

export type RunTraceProps =
  | { state: "not_started" }
  | { state: "available"; entries: readonly TraceEntry[] }
  | { state: "incomplete"; entries: readonly TraceEntry[] };

function renderEntry(entry: TraceEntry): ReactElement {
  const duration = Math.round(entry.durationMs);
  if (entry.kind === "model") {
    return createElement(
      "li",
      { key: entry.id },
      createElement("h3", null, "Model call"),
      createElement("p", null, `Duration: ${duration} ms`),
      createElement(
        "p",
        null,
        `Tokens: ${entry.inputTokens} in, ${entry.outputTokens} out`,
      ),
      createElement("p", null, "Output:"),
      createElement(
        "pre",
        { className: "whitespace-pre-wrap break-words" },
        entry.output,
      ),
    );
  }
  return createElement(
    "li",
    { key: entry.id },
    createElement("h3", null, `Tool call: ${entry.toolName}`),
    createElement("p", null, `Duration: ${duration} ms`),
    createElement("p", null, "Arguments:"),
    createElement(
      "pre",
      { className: "whitespace-pre-wrap break-words" },
      JSON.stringify(entry.args, null, 2),
    ),
    createElement("p", null, `Result: ${entry.resultSummary}`),
  );
}

export function RunTrace(props: RunTraceProps): ReactElement {
  const children: ReactElement[] = [
    createElement("h2", { id: "trace-calls" }, "Model and tool calls"),
  ];

  if (props.state === "not_started") {
    children.push(createElement("p", null, "No trace yet."));
  } else {
    if (props.state === "incomplete") {
      children.push(
        createElement(
          "p",
          null,
          "This trace is incomplete. It shows only what was stored.",
        ),
      );
    }
    if (props.entries.length === 0) {
      children.push(createElement("p", null, "No calls were recorded."));
    } else {
      children.push(
        createElement("ol", null, ...props.entries.map(renderEntry)),
      );
    }
  }

  return createElement(
    "section",
    { "aria-labelledby": "trace-calls" },
    ...children,
  );
}
